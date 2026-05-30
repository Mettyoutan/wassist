import { NextRequest, NextResponse }    from "next/server";
import { supabaseAdmin, getActiveProducts } from "@/lib/db";
import { getSession,
         clearSession }                  from "@/lib/session";
import { parseCustomerMessage }          from "@/lib/intent-parser";
import { sendWhatsAppMessage }           from "@/lib/whatsapp";
import { CONFIRM_KEYWORDS,
         CANCEL_KEYWORDS }               from "@/lib/constants/confirmation-keywords";
import { handleBrowseIntent }            from "@/lib/handlers/browse";
import { handleStatusIntent }            from "@/lib/handlers/status";
import { handleHandoffIntent }           from "@/lib/handlers/handoff";
import { handleCartOrder }               from "@/lib/handlers/cart-order";
import { handleOwnerCommand }            from "@/lib/handlers/owner";
import type { DbTenant }                 from "@/lib/types/db";
import type { WAWebhookBody, WAMessage,
              WATextMessage,
              WAOrderMessage }           from "@/lib/types/whatsapp";

// ─── GET: Webhook verification dari Meta ─────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST: Semua pesan masuk dari Meta ───────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body  = (await request.json()) as WAWebhookBody;
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // Status update (delivered/read) — abaikan
    if (!value?.messages?.length) {
      return NextResponse.json({ status: "ok" });
    }

    const phoneNumberId: string = value.metadata.phone_number_id;
    const message: WAMessage    = value.messages[0];
    const senderPhone: string   = message.from;

    // ── Lookup tenant ────────────────────────────────────────────────────────
    const { data: tenantRaw } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("wa_business_phone_id", phoneNumberId)
      .eq("status", "ACTIVE")
      .single();

    if (!tenantRaw) {
      console.warn("[Webhook] Tenant not found:", phoneNumberId);
      return NextResponse.json({ status: "ok" });
    }
    const tenant = tenantRaw as DbTenant;

    // ── Upsert customer ──────────────────────────────────────────────────────
    await supabaseAdmin
      .from("users")
      .upsert(
        { tenant_id: tenant.id, phone: senderPhone, name: senderPhone, role: "CUSTOMER" },
        { onConflict: "tenant_id,phone" }
      );

    // ── Cart order dari WA Catalog (tidak butuh state check atau Gemini) ─────
    if (message.type === "order") {
      await handleCartOrder(tenant, senderPhone, message as WAOrderMessage);
      return NextResponse.json({ status: "ok" });
    }

    // ── Hanya proses teks selanjutnya ─────────────────────────────────────
    if (message.type !== "text") {
      await sendWhatsAppMessage(
        senderPhone,
        "Maaf, saya hanya bisa terima pesan teks ya kak 😊"
      );
      return NextResponse.json({ status: "ok" });
    }

    const textMsg    = message as WATextMessage;
    const msgText    = textMsg.text.body;
    const session    = getSession(tenant.id, senderPhone);

    // ── STATE MACHINE — cek dulu sebelum Gemini ──────────────────────────────
    if (session.state === "awaiting_confirmation") {
      const normalized = msgText.toLowerCase().trim();

      if (CONFIRM_KEYWORDS.has(normalized)) {
        // TODO: implementasi processOrderConfirmation (lib/handlers/order.ts)
        // Sementara: acknowledge dulu, handler akan diimplementasi terpisah
        await sendWhatsAppMessage(senderPhone, "Memproses pesananmu ya kak... ⏳");
        return NextResponse.json({ status: "ok" });
      }

      if (CANCEL_KEYWORDS.has(normalized)) {
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(
          senderPhone,
          "Pesanan dibatalkan ya kak 👍 Ketik *menu* kalau mau lihat katalog lagi."
        );
        return NextResponse.json({ status: "ok" });
      }

      // Bukan confirm/cancel → minta klarifikasi
      await sendWhatsAppMessage(
        senderPhone,
        "Balas *ya* untuk konfirmasi atau *batal* untuk membatalkan pesanan ya kak 😊"
      );
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_payment") {
      await sendWhatsAppMessage(
        senderPhone,
        "Pesananmu masih menunggu pembayaran ya kak 💳 Silakan scan QR yang sudah dikirim."
      );
      return NextResponse.json({ status: "ok" });
    }

    // ── OWNER vs CUSTOMER ────────────────────────────────────────────────────
    if (tenant.owner_phone === senderPhone) {
      await handleOwnerCommand(tenant, senderPhone, msgText);
      return NextResponse.json({ status: "ok" });
    }

    // ── CUSTOMER INTENT PARSING ──────────────────────────────────────────────
    const products = await getActiveProducts(tenant.id);

    const parsed = await parseCustomerMessage(msgText, products, {
      store_name:     tenant.name,
      store_category: tenant.category ?? "toko online",
    });

    // ── INTENT ROUTER ────────────────────────────────────────────────────────
    switch (parsed.intent) {
      case "browse":
        await handleBrowseIntent(tenant, senderPhone, session);
        break;

      case "order_new":
        // TODO: implementasi handleOrderIntent (lib/handlers/order.ts)
        // Sementara: fallback ke handoff agar tidak silent fail
        await handleHandoffIntent(tenant, senderPhone);
        break;

      case "order_status":
        await handleStatusIntent(tenant, senderPhone);
        break;

      // Jalur cut MVP + low confidence → handoff
      case "repeat_last":
      case "modify_order":
      case "cancel_order":
      case "low_confidence":
      default:
        await handleHandoffIntent(tenant, senderPhone);
        break;
    }

  } catch (err) {
    // JANGAN return non-200 → Meta akan retry → potensi order duplikat
    console.error("[Webhook] Unhandled error:", err);
  }

  return NextResponse.json({ status: "ok" }); // selalu 200
}
