import { NextRequest, NextResponse }    from "next/server";
import { getTenantByWaPhoneId,
         upsertCustomer,
         getActiveProducts,
         updateOrderStatus }             from "@/server/db";
import { getSession,
         clearSession,
         cleanupExpiredSessions }        from "@/lib/session";
import { parseCustomerMessage }          from "@/lib/ai/customer-parser";
import { sendWhatsAppMessage }           from "@/lib/whatsapp";
import { parseConfirmationIntent }        from "@/lib/ai/confirmation-parser";
import { greetingMessage,
         cancelOrderMessage,
         confirmationPendingMessage,
         modifyOrderInConfirmationMessage,
         modifyOrderHandoffMessage }    from "@/lib/response-template";
import { handleBrowseIntent }            from "@/lib/handlers/browse";
import { handleStatusIntent }            from "@/lib/handlers/status";
import { handleHandoffIntent }           from "@/lib/handlers/handoff";
import { handleOrderIntent }            from "@/lib/handlers/order-new";
import { handleClarificationAnswer }   from "@/lib/handlers/clarification";
import { processOrderConfirmation }    from "@/lib/handlers/confirm-order";
import { handleCartOrder }               from "@/lib/handlers/cart-order";
import { handleOwnerCommand }            from "@/lib/handlers/owner";
import { handleRepeatLastIntent }        from "@/lib/handlers/repeat-last";
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

// Cleanup setiap 50 request — cegah memory leak tanpa overhead per-request
let _reqCount = 0;

// ─── POST: Semua pesan masuk dari Meta ───────────────────────────────────────
export async function POST(request: NextRequest) {
  if (++_reqCount % 50 === 0) cleanupExpiredSessions();
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
    const tenant = await getTenantByWaPhoneId(phoneNumberId);

    if (!tenant) {
      console.warn("[Webhook] Tenant not found:", phoneNumberId);
      return NextResponse.json({ status: "ok" });
    }

    // ── Upsert customer ──────────────────────────────────────────────────────
    await upsertCustomer(tenant.id, senderPhone);

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

    // Get WA message
    const textMsg    = message as WATextMessage;
    const msgText    = textMsg.text.body;

    // Get current session
    const session    = getSession(tenant.id, senderPhone);

    // ── STATE MACHINE — cek dulu sebelum Gemini ──────────────────────────────
    if (session.state === "awaiting_confirmation") {
      const signal = await parseConfirmationIntent(msgText);

      if (signal === "confirm") {
        try {
          await processOrderConfirmation(tenant, senderPhone, session);
        } catch (err) {
          console.error("[Webhook] processOrderConfirmation failed:", err);
          await sendWhatsAppMessage(senderPhone, "Terjadi kesalahan saat memproses pesanan kak 🙏 Coba lagi ya.");
        }
        return NextResponse.json({ status: "ok" });
      }

      if (signal === "cancel") {
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(
          senderPhone,
          "Pesanan dibatalkan ya kak 👍 Ketik *menu* kalau mau lihat katalog lagi."
        );
        return NextResponse.json({ status: "ok" });
      }

      // signal === "ambiguous" → coba parse sebagai tambah item ke pesanan aktif
      const productsForAdd = await getActiveProducts(tenant.id);
      const parsedAdd = await parseCustomerMessage(msgText, productsForAdd, {
        store_name:     tenant.name,
        store_category: tenant.category ?? "toko online",
        current_order:  session.pending_order?.items.map(i => ({
          name: i.name, qty: i.qty, size: i.size,
        })),
      });
      if (parsedAdd.intent === "order_new" && parsedAdd.items.length > 0) {
        await handleOrderIntent(
          tenant, senderPhone, productsForAdd, parsedAdd.items,
          session.pending_order?.items ?? []
        );
      } else if (parsedAdd.intent === "modify_order") {
        await sendWhatsAppMessage(senderPhone, modifyOrderInConfirmationMessage());
      } else {
        await sendWhatsAppMessage(senderPhone, confirmationPendingMessage());
      }
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_clarification") {
      await handleClarificationAnswer(tenant, senderPhone, msgText, session);
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_payment") {
      const signal = await parseConfirmationIntent(msgText);
      if (signal === "cancel") {
        if (session.current_order_id) {
          try {
            await updateOrderStatus(session.current_order_id, "CANCELLED");
          } catch (err) {
            console.error("[Webhook] cancel order in awaiting_payment failed:", err);
          }
        }
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(senderPhone, "Pesanan dibatalkan ya kak 👍 Ketik *menu* kalau mau lihat katalog lagi.");
        return NextResponse.json({ status: "ok" });
      }
      await sendWhatsAppMessage(
        senderPhone,
        "Pesananmu masih menunggu pembayaran ya kak 💳 Silakan scan QR yang sudah dikirim."
      );
      return NextResponse.json({ status: "ok" });
    }

    // ── OWNER vs CUSTOMER ────────────────────────────────────────────────────
    if (tenant.owner_phone === senderPhone) {
      await handleOwnerCommand(tenant, senderPhone, msgText, session);
      return NextResponse.json({ status: "ok" });
    }

    // ── CUSTOMER INTENT PARSING ──────────────────────────────────────────────
    const products = await getActiveProducts(tenant.id);

    const parsed = await parseCustomerMessage(msgText, products, {
      store_name:     tenant.name,
      store_category: tenant.category ?? "toko online",
      current_order:  session.pending_order?.items.map(i => ({
        name: i.name, qty: i.qty, size: i.size,
      })),
    });

    // ── INTENT ROUTER ────────────────────────────────────────────────────────
    switch (parsed.intent) {
      case "greeting":
        await sendWhatsAppMessage(senderPhone, greetingMessage(tenant.name));
        break;

      case "browse":
        await handleBrowseIntent(tenant, senderPhone, session);
        break;

      case "order_new":
        await handleOrderIntent(tenant, senderPhone, products, parsed.items);
        break;

      case "order_status":
        await handleStatusIntent(tenant, senderPhone);
        break;

      case "repeat_last":
        await handleRepeatLastIntent(tenant, senderPhone, session);
        break;

      case "cancel_order":
        await sendWhatsAppMessage(senderPhone, cancelOrderMessage());
        break;

      case "modify_order":
        await sendWhatsAppMessage(senderPhone, modifyOrderHandoffMessage());
        await sendWhatsAppMessage(
          tenant.owner_phone,
          `⚠️ ${senderPhone} ingin modifikasi pesanan — perlu penanganan manual.`
        );
        break;

      // low confidence → generic handoff
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
