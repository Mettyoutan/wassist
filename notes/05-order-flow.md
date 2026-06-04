# WAssist — /Order Flow
> Jalur MVP yang dibangun: 1, 2, 6, 7. Jalur 3/4/5 di-cut → fallback ke low_confidence.
> Implementasi payment (Midtrans, QR image) ada di `notes/07-payment.md`.

---

## 0. TypeScript Types

Buat file-file ini dulu sebelum mulai handler apapun.

### `lib/types/session.ts`

```typescript
export type SessionState =
  | "idle"
  | "awaiting_confirmation"
  | "awaiting_payment";

// Snapshot data produk saat customer order.
// Bukan referensi ke DB — harga bisa berubah setelah order dibuat.
export type PendingOrderItem = {
  product_id: string;   // UUID dari DB — untuk INSERT order_items
  name:       string;   // snapshot nama produk
  qty:        number;   // bisa desimal untuk produk berat/volume (2.5, 0.5) — TypeScript number handles both
  unit:       string;   // snapshot satuan saat order ("pcs", "kg", "L", dll) — untuk display konfirmasi
  size:       string;   // "" jika tidak ada (non-fashion, atau belum disebutkan)
  notes:      string;   // "" jika tidak ada
  price:      number;   // snapshot harga per unit (integer Rupiah)
  subtotal:   number;   // price × qty — pre-calculated
};

export type PendingOrder = {
  items: PendingOrderItem[];
  total: number;  // sum of subtotal
};

export type Session = {
  state:             SessionState;
  pending_order?:    PendingOrder;  // hanya saat awaiting_confirmation
  current_order_id?: string;        // UUID order di DB, hanya saat awaiting_payment
  retry_count:       number;        // 0 → minta klarifikasi, 1 → handoff
  last_updated:      number;        // Date.now() — untuk TTL check
};
```

### `lib/types/index.ts` — Barrel re-export

```typescript
// Satu entry point untuk semua types — import dari "@/lib/types" saja
export type {
  WAWebhookBody, WAEntry, WAChange, WAChangeValue, WAMetadata,
  WAMessage, WATextMessage, WAOrderMessage, WAOrderItem,
  WAAudioMessage, WAImageMessage, WAUnknownMessage,
  WAStatus, SendMessageResult,
} from "./whatsapp";

export type { Tenant }                                         from "./tenant";
export type { Session, SessionState, PendingOrder, PendingOrderItem } from "./session";
export type { DbTenant, DbProduct, DbOrder, DbOrderItem, DbUser }     from "./db";
```

---

## 1. State Machine Session

```
                    ┌─────────────────────────────────────────┐
                    │           SESSION STATES                 │
                    │                                          │
  START ──────────▶ idle                                       │
                    │                                          │
     "lihat katalog"│                      "browse"            │
                    ├──────────────────────────────────────────▶ (selesai, kembali idle)
                    │
     "kaos oversize 2"
                    │
                    ▼
            [Gemini parse → order_new]
                    │
                    ▼
          awaiting_confirmation  ◀─────────── (modify_order — post-MVP)
                    │
          CONFIRM_KEYWORDS? ──▶ processOrderConfirmation()
                    │                       │
          CANCEL_KEYWORDS? ──▶ clearSession()│
                    │                       │
                    │                       ▼
                    │               awaiting_payment
                    │                       │
                    │            QRIS dibayar (Midtrans callback)
                    │                       │
                    │                       ▼
                    └───────────────────── idle (clearSession)
```

**Aturan state machine:**
1. Cek `session.state` DULU di webhook handler — sebelum apapun termasuk Gemini
2. `awaiting_confirmation` → cek CONFIRM/CANCEL keywords → jika tidak match: MVP tanya ulang, post-MVP kirim ke Gemini
3. `awaiting_payment` → reminder resend link, tidak proses intent baru
4. `idle` → parse intent via Gemini, route ke handler

---

## 2. Ringkasan Semua Jalur

| Jalur | Intent | Status MVP | File handler |
|---|---|---|---|
| **1** | `order_new` — order via teks natural | ✅ Wajib | `lib/handlers/order.ts` |
| **1b** | Cart order dari WA Catalog | ✅ Wajib | `lib/handlers/cart-order.ts` |
| **2** | `browse` — tampilkan WA Catalog | ✅ Wajib | `lib/handlers/browse.ts` |
| 3 | `repeat_last` — order ulang | ❌ Cut | `lib/handlers/repeat-last.ts` (post-MVP) |
| 4 | `modify_order` — ubah order aktif | ❌ Cut | `lib/handlers/modify-order.ts` (post-MVP) |
| 5 | `cancel_order` — batalkan order | ❌ Cut | `lib/handlers/cancel-order.ts` (post-MVP) |
| **6** | `order_status` — cek status | ✅ Wajib | `lib/handlers/status.ts` |
| **7** | `low_confidence` — human handoff | ✅ Wajib | `lib/handlers/handoff.ts` |

---

## 3. Confirmation Keywords

Buat file ini sebelum webhook handler — di-import dari sana.

### `lib/constants/confirmation-keywords.ts`

```typescript
// Normalize dulu: text.toLowerCase().trim() sebelum .has()
// Pakai Set (bukan Array) — O(1) lookup vs O(n) untuk Array.includes()

export const CONFIRM_KEYWORDS = new Set([
  // Formal
  "ya", "iya", "yaa", "iyaa",
  // Bahasa Inggris
  "ok", "oke", "okay", "oks", "yes", "yep", "yap", "yup",
  // Slang / gaul WA
  "gas", "gaskeun", "gass",
  "sip", "siap", "siipp", "sippp",
  "mantap", "mantapp", "mantab",
  "deal", "acc", "setuju", "sepakat",
  "oke sip", "oke gas", "oke deh", "oke aja",
  "lanjut", "lanjutkan", "lanjutin", "lanjut kak", "lanjutt",
  "boleh", "boleh kak", "boleh dong",
  "ayo", "hayuk", "yuk", "yok",
  "jadi", "jadi kak",
  "udah", "udah kak",
  "push", "go", "go kak",
]);

export const CANCEL_KEYWORDS = new Set([
  // Formal
  "batal", "batalkan", "dibatalkan",
  // Negasi Indonesia
  "tidak", "gak", "ga", "nggak", "enggak", "ngga",
  "gakk", "gaklah", "nggakk", "enggaklah", "ndak", "tak",
  // Bahasa Inggris
  "cancel", "no", "nope", "stop",
  // Kombinasi gaul
  "gak jadi", "ga jadi", "nggak jadi", "enggak jadi",
  "gak mau", "ga mau", "nggak mau",
  "batal aja", "cancel aja",
  "gak deh", "ga deh", "gak ah", "ga ah",
  "tidak jadi", "hapus", "jangan",
]);
```

---

## 4. Webhook Entry Point

Ini adalah `app/api/webhook/wa/route.ts` — tempat semua pesan masuk diproses.
Baca dari atas ke bawah — urutannya penting.

```typescript
// app/api/webhook/wa/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }             from "@/lib/db";
import { getSession, setSession,
         clearSession }              from "@/lib/session";
import { parseCustomerMessage }      from "@/lib/intent-parser";
import { getProductsForPrompt }      from "@/lib/product-cache";
import { sendWhatsAppMessage }       from "@/lib/whatsapp";
import { CONFIRM_KEYWORDS,
         CANCEL_KEYWORDS }           from "@/lib/constants/confirmation-keywords";
import { handleBrowseIntent }        from "@/lib/handlers/browse";
import { handleOrderIntent }         from "@/lib/handlers/order";
import { handleCartOrder }           from "@/lib/handlers/cart-order";
import { handleStatusIntent }        from "@/lib/handlers/status";
import { handleHandoff }             from "@/lib/handlers/handoff";
import { processOrderConfirmation }  from "@/lib/handlers/order";
import type { WAWebhookBody, WAMessage, WATextMessage, WAOrderMessage } from "@/lib/types";

// ─── GET: Webhook verification dari Meta ────────────────────────────────────
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

// ─── POST: Semua pesan masuk dari Meta ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Parse body
    const rawBody = await request.text();
    const sig = request.headers.get("x-hub-signature-256") ?? "";
    if (!verifyHmacSignature(rawBody, sig)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as WAWebhookBody;
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // Bisa berisi status update (delivered/read) — tidak perlu diproses
    if (!value?.messages?.length) {
      return NextResponse.json({ status: "ok" });
    }

    const phoneNumberId: string  = value.metadata.phone_number_id;
    const message: WAMessage     = value.messages[0];
    const senderPhone: string    = message.from;

    // 2. Identifikasi tenant dari phone_number_id
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("wa_business_phone_id", phoneNumberId)
      .eq("status", "active")
      .single();

    if (!tenant) {
      console.warn("[Webhook] Tenant not found for phone_number_id:", phoneNumberId);
      return NextResponse.json({ status: "ok" });
    }

    // 3. Upsert customer (auto-create jika pertama kali chat)
    await supabaseAdmin
      .from("users")
      .upsert(
        { tenant_id: tenant.id, phone: senderPhone, role: "customer" },
        { onConflict: "tenant_id,phone" }
      );

    // 4. Cart order dari WA Catalog — tidak butuh state check atau Gemini
    if (message.type === "order") {
      await handleCartOrder(tenant, senderPhone, message as WAOrderMessage);
      return NextResponse.json({ status: "ok" });
    }

    // 5. Hanya proses pesan teks selanjutnya
    if (message.type !== "text") {
      await sendWhatsAppMessage(senderPhone,
        "Maaf, saya hanya bisa terima pesan teks ya kak 😊"
      );
      return NextResponse.json({ status: "ok" });
    }

    const textMsg = message as WATextMessage;
    const session = getSession(senderPhone, tenant.id);

    // ── 6. STATE MACHINE CHECK ── sebelum Gemini ──────────────────────────
    if (session.state === "awaiting_confirmation") {
      const text = textMsg.text.body.toLowerCase().trim();

      if (CONFIRM_KEYWORDS.has(text)) {
        await processOrderConfirmation(tenant, senderPhone, session);
        return NextResponse.json({ status: "ok" });
      }

      if (CANCEL_KEYWORDS.has(text)) {
        clearSession(senderPhone, tenant.id);
        await sendWhatsAppMessage(senderPhone,
          "Pesanan dibatalkan ya kak 👍 Ketik *menu* kalau mau lihat katalog lagi."
        );
        return NextResponse.json({ status: "ok" });
      }

      // Tidak match → MVP: tanya ulang
      // Post-MVP: jatuh ke intent parser (modify_order) — lihat notes/11-full-intent-roadmap.md
      await sendWhatsAppMessage(senderPhone,
        "Balas *ya* untuk konfirmasi atau *batal* untuk membatalkan pesanan."
      );
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_payment") {
      // Customer chat saat menunggu bayar — kirim ulang link
      await sendWhatsAppMessage(senderPhone,
        `Pesananmu masih menunggu pembayaran ya kak 💳\n${tenant.meta_catalog_id ?? "Hubungi toko jika ada kendala."}`
      );
      return NextResponse.json({ status: "ok" });
    }

    // ── 7. OWNER vs CUSTOMER CHECK ────────────────────────────────────────
    const isOwner = tenant.owner_phone === senderPhone;

    if (isOwner) {
      await handleOwnerCommand(tenant, senderPhone, textMsg.text.body);
      return NextResponse.json({ status: "ok" });
    }

    // ── 8. CUSTOMER INTENT PARSING ────────────────────────────────────────
    const products = await getProductsForPrompt(tenant.id);

    const parsed = await parseCustomerMessage(textMsg.text.body, products, {
      store_name:     tenant.name,
      store_category: tenant.category ?? "toko online",
      // current_order hanya dikirim saat awaiting_confirmation (post-MVP: modify_order)
      // Saat ini session.state === "idle" jadi tidak ada pending order
    });

    // ── 9. INTENT ROUTER ──────────────────────────────────────────────────
    switch (parsed.intent) {
      case "browse":
        await handleBrowseIntent(tenant, senderPhone);
        break;

      case "order_new":
        await handleOrderIntent(tenant, senderPhone, parsed, products, session);
        break;

      case "order_status":
        await handleStatusIntent(tenant, senderPhone);
        break;

      // Jalur 3/4/5 cut di MVP — Gemini return low_confidence untuk ini
      // Switch tetap ditulis lengkap agar tidak perlu refactor post-MVP
      case "repeat_last":
      case "modify_order":
      case "cancel_order":
      case "low_confidence":
      default:
        await handleHandoff(tenant, senderPhone, session);
        break;
    }

  } catch (err) {
    // JANGAN return non-200 → Meta akan retry → order duplikat
    console.error("[Webhook] Unhandled error:", err);
  }

  return NextResponse.json({ status: "ok" }); // selalu 200
}
```

---

## 5. Jalur 2 — Browse (`lib/handlers/browse.ts`)

**Wow Moment #1** — WA Catalog visual muncul native di WA, tidak ada link eksternal.

```
Customer: "kak mau lihat katalog dulu"
        │
        ▼ intent: browse
        │
handleBrowseIntent()
  → jika catalog sudah setup: kirim catalog_message → Meta serve katalog
  → jika belum: kirim daftar teks dari product cache
        │
        ▼ (jika customer add to cart dari catalog)
  message.type === "order" → handleCartOrder() (Jalur 1b)
```

**Kenapa tidak ada DB fetch saat browse?** Bot hanya kirim `catalog_message` ke Meta. Meta yang serve tampilan katalog ke customer. Tidak ada query DB sama sekali.

```typescript
// lib/handlers/browse.ts
import { sendCatalogMessage, sendWhatsAppMessage } from "@/lib/whatsapp";
import { getProductsForPrompt }                    from "@/lib/product-cache";
import type { Tenant }                             from "@/lib/types";

export async function handleBrowseIntent(
  tenant: Tenant,
  senderPhone: string
): Promise<void> {
  const catalogId = tenant.meta_catalog_id ?? process.env.META_CATALOG_ID;

  if (catalogId) {
    // Happy path: kirim catalog_message → tidak ada DB fetch
    await sendCatalogMessage(
      senderPhone,
      catalogId,
      `Ini koleksi ${tenant.name} 🛍️ Tap produk untuk order!`
    );
    return;
  }

  // Fallback: catalog belum setup, kirim teks dari product cache
  const products = await getProductsForPrompt(tenant.id);
  const list = products
    .map(p => `• ${p.name} — Rp${p.price.toLocaleString("id-ID")}`)
    .join("\n");

  await sendWhatsAppMessage(
    senderPhone,
    `Halo! Ini koleksi ${tenant.name}:\n\n${list}\n\nBalas nama produk + jumlah untuk order ya kak.\nContoh: *Kaos Oversize 2*`
  );
}
```

---

## 6. Jalur 1 — Order via Teks Natural (`lib/handlers/order.ts`)

**Wow Moment #2**.

```
Customer: "kaos oversize 2 sama celana cargo 1"
        │
        ▼ Gemini parse → intent: order_new
  items: [
    { product_index: 3, qty: 2, size: "", notes: "" },
    { product_index: 5, qty: 1, size: "", notes: "" },
  ]
        │
        ▼ Map product_index → product object
  products[2] = { id, name: "Kaos Oversize Polos", price: 85000, stock: 50 }
  products[4] = { id, name: "Celana Cargo Panjang", price: 150000, stock: 20 }
  (product_index 1-based → array index: index - 1)
        │
        ▼ Validasi stok setiap item
  → jika stock < qty: balas "Maaf, stok X hanya N unit" dan stop
        │
        ▼ Hitung total
  total = (85000 × 2) + (150000 × 1) = 320000
        │
        ▼ Kirim ringkasan konfirmasi
  "Oke kak! Ini pesanannya ya:
   • Kaos Oversize Polos x2 = Rp170.000
   • Celana Cargo Panjang x1 = Rp150.000

   Total: Rp320.000

   Mau lanjut bayar? Balas ya atau batal 😊"
        │
        ▼ Simpan ke session
  state: "awaiting_confirmation"
  pending_order: { items: [...], total: 320000 }
```

```typescript
// lib/handlers/order.ts
import { supabaseAdmin }           from "@/lib/db";
import { sendWhatsAppMessage }     from "@/lib/whatsapp";
import { setSession }              from "@/lib/session";
import { orderConfirmationMessage } from "@/lib/response-templates";
import type { Tenant }             from "@/lib/types";
import type { ParsedIntent, ProductForPrompt } from "@/lib/intent-parser";
import type { Session, PendingOrderItem }      from "@/lib/types/session";
import type { DbProduct }          from "@/lib/types/db";

export async function handleOrderIntent(
  tenant: Tenant,
  senderPhone: string,
  parsed: ParsedIntent,
  products: ProductForPrompt[], // array SAMA yang dikirim ke Gemini prompt
  session: Session
): Promise<void> {
  const resolvedItems: PendingOrderItem[] = [];
  const errors: string[] = [];

  for (const item of parsed.items) {
    // 1-based index → 0-based array
    const product = products[item.product_index - 1];

    // Guard: out of range
    if (!product) {
      console.error(`[Order] product_index ${item.product_index} out of range (max: ${products.length})`);
      continue;
    }

    // Lookup DB untuk id + stock + unit terbaru (product cache hanya punya name + price + unit)
    const { data: dbProduct } = await supabaseAdmin
      .from("products")
      .select("id, stock, unit")
      .eq("tenant_id", tenant.id)
      .eq("name", product.name)
      .eq("is_active", true)
      .single<Pick<DbProduct, "id" | "stock" | "unit">>();

    if (!dbProduct) {
      errors.push(`${product.name} (tidak tersedia)`);
      continue;
    }

    if (dbProduct.stock < item.qty) {
      errors.push(`${product.name} (stok hanya ${dbProduct.stock} ${dbProduct.unit})`);
      continue;
    }

    resolvedItems.push({
      product_id: dbProduct.id,
      name:       product.name,
      qty:        item.qty,
      unit:       dbProduct.unit,   // snapshot satuan saat order
      size:       item.size ?? "",
      notes:      item.notes ?? "",
      price:      product.price,
      subtotal:   product.price * item.qty,
    });
  }

  // Tidak ada item yang valid
  if (resolvedItems.length === 0) {
    await sendWhatsAppMessage(senderPhone,
      `Maaf, produk tidak tersedia: ${errors.join(", ")} 😔\nKetik *menu* untuk lihat koleksi kami.`
    );
    return;
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);
  let msg = orderConfirmationMessage(resolvedItems, total);

  // Tambah warning kalau ada item yang di-skip
  if (errors.length > 0) {
    msg += `\n\n⚠️ _Tidak bisa diproses: ${errors.join(", ")}_`;
  }

  await sendWhatsAppMessage(senderPhone, msg);

  setSession(senderPhone, tenant.id, {
    ...session,
    state:         "awaiting_confirmation",
    pending_order: { items: resolvedItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });
}
```

> **Catatan `processOrderConfirmation`:** Dipanggil dari webhook handler saat customer balas "ya". Implementasi lengkapnya (INSERT order, Midtrans Core API, kirim QR image) ada di **`notes/07-payment.md`**.

---

## 7. Jalur 1b — Cart Order (`lib/handlers/cart-order.ts`)

Ketika customer order dari WA Catalog (tap produk → Add to Cart), Meta kirim `message.type === "order"` — **tidak perlu Gemini** sama sekali. Data sudah structured.

**Penting:** `item_price` dari Meta bisa stale. Selalu re-fetch harga dari DB by `meta_retailer_id`.

```typescript
// lib/handlers/cart-order.ts
import { supabaseAdmin }            from "@/lib/db";
import { sendWhatsAppMessage }      from "@/lib/whatsapp";
import { setSession }               from "@/lib/session";
import { orderConfirmationMessage } from "@/lib/response-templates";
import type { Tenant }              from "@/lib/types";
import type { WAOrderMessage, WAOrderItem } from "@/lib/types/whatsapp";
import type { PendingOrderItem, Session }   from "@/lib/types/session";
import type { DbProduct }           from "@/lib/types/db";

export async function handleCartOrder(
  tenant: Tenant,
  senderPhone: string,
  message: WAOrderMessage
): Promise<void> {
  const cartItems: WAOrderItem[] = message.order.product_items;
  const resolvedItems: PendingOrderItem[] = [];
  const failedItems: string[] = [];

  for (const cartItem of cartItems) {
    // Re-fetch harga + stok + unit terbaru — JANGAN pakai cartItem.item_price (bisa stale)
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock, unit")
      .eq("tenant_id", tenant.id)
      .eq("meta_retailer_id", cartItem.product_retailer_id)
      .eq("is_active", true)
      .single<Pick<DbProduct, "id" | "name" | "price" | "stock" | "unit">>();

    if (!product) {
      failedItems.push(cartItem.product_retailer_id);
      continue;
    }

    if (product.stock < cartItem.quantity) {
      failedItems.push(`${product.name} (stok hanya ${product.stock} ${product.unit})`);
      continue;
    }

    resolvedItems.push({
      product_id: product.id,
      name:       product.name,
      qty:        cartItem.quantity,
      unit:       product.unit,   // snapshot satuan saat order
      size:       "",  // WA Catalog tidak support size variant
      notes:      "",
      price:      product.price,
      subtotal:   product.price * cartItem.quantity,
    });
  }

  if (resolvedItems.length === 0) {
    await sendWhatsAppMessage(senderPhone,
      `Maaf, semua produk yang kamu pilih tidak tersedia 😔\nKetik *menu* untuk lihat koleksi terbaru.`
    );
    return;
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);
  let msg = orderConfirmationMessage(resolvedItems, total);

  if (failedItems.length > 0) {
    msg += `\n\n⚠️ _Produk tidak tersedia: ${failedItems.join(", ")}_`;
  }

  await sendWhatsAppMessage(senderPhone, msg);

  setSession(senderPhone, tenant.id, {
    state:         "awaiting_confirmation",
    pending_order: { items: resolvedItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });
}
```

---

## 8. Jalur 6 — Order Status (`lib/handlers/status.ts`)

```
Customer: "pesananku udah dikirim belum kak?"
        │
        ▼ intent: order_status
        │
handleStatusIntent()
  → lookup user by phone
  → ambil order terakhir
  → balas status sesuai state
```

```typescript
// lib/handlers/status.ts
import { supabaseAdmin }       from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import type { Tenant }         from "@/lib/types";
import type { DbOrder }        from "@/lib/types/db";

export async function handleStatusIntent(
  tenant: Tenant,
  senderPhone: string
): Promise<void> {
  const { data: user } = await supabaseAdmin
    .from("users").select("id")
    .eq("tenant_id", tenant.id).eq("phone", senderPhone)
    .single();

  if (!user) {
    await sendWhatsAppMessage(senderPhone,
      "Kamu belum punya pesanan nih kak 😊 Ketik *menu* untuk lihat koleksi kami."
    );
    return;
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, midtrans_payment_url")
    .eq("tenant_id", tenant.id)
    .eq("customer_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<Pick<DbOrder, "id" | "status" | "midtrans_payment_url">>();

  // Record<DbOrder["status"], string> memaksa semua 7 status tercakup
  // TypeScript akan error saat compile jika ada status yang terlewat
  const statusMessages: Record<DbOrder["status"], string> = {
    PENDING:           "Pesananmu masih menunggu konfirmasi 🕐",
    CONFIRMED:         "Pesananmu sudah dikonfirmasi, segera lanjut bayar ya kak!",
    AWAITING_PAYMENT:  `Pesananmu menunggu pembayaran.\n💳 ${order?.midtrans_payment_url ?? "Hubungi toko untuk link pembayaran."}`,
    PAID:              "Pembayaran sudah kami terima! Sedang diproses kak 🎉",
    FULFILLED:         "Pesananmu sedang dalam pengiriman 🚚",
    DONE:              "Pesananmu sudah selesai. Terima kasih ya kak! 💚",
    CANCELLED:         "Pesananmu sudah dibatalkan.",
  };

  const msg = order
    ? `📦 *Status Order #${order.id.slice(-6).toUpperCase()}*\n\n${statusMessages[order.status]}`
    : "Kamu belum punya pesanan aktif kak 😊 Ketik *menu* untuk lihat koleksi kami.";

  await sendWhatsAppMessage(senderPhone, msg);
}
```

---

## 9. Jalur 7 — Human Handoff (`lib/handlers/handoff.ts`)

Triggered saat `confidence < 0.70` atau intent tidak dikenali. Memberi 1x kesempatan klarifikasi, lalu eskalasi ke owner.

```
Customer: "ada diskon ga kak?"
        │
        ▼ confidence: 0.45 → intent: low_confidence
        │
        ▼ retry_count === 0
  Bot: "Maaf, saya kurang paham 😅 Bisa diulangi lebih jelas?
        Atau ketik *menu* untuk lihat katalog kami."
  session.retry_count = 1
        │
        ▼ (customer kirim lagi, masih low_confidence)
        │
        ▼ retry_count === 1
  Bot: "Maaf, saya belum bisa bantu untuk ini.
        Saya hubungkan ke pemilik toko ya 🙏"
  → INSERT ai_conversations dengan flag needs_handoff = true
  → Notif WA ke owner
  clearSession()
```

```typescript
// lib/handlers/handoff.ts
import { supabaseAdmin }       from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { setSession,
         clearSession }        from "@/lib/session";
import type { Tenant }         from "@/lib/types";
import type { Session }        from "@/lib/types/session";

export async function handleHandoff(
  tenant: Tenant,
  senderPhone: string,
  session: Session
): Promise<void> {
  if (session.retry_count === 0) {
    // Beri 1 kesempatan klarifikasi
    await sendWhatsAppMessage(senderPhone,
      "Maaf, saya kurang paham 😅 Bisa diulangi lebih jelas?\nAtau ketik *menu* untuk lihat katalog kami."
    );
    setSession(senderPhone, tenant.id, {
      ...session,
      retry_count: 1,
      last_updated: Date.now(),
    });
    return;
  }

  // Retry ke-2 masih tidak paham → eskalasi ke owner
  await sendWhatsAppMessage(senderPhone,
    "Maaf, saya belum bisa bantu untuk ini 🙏\nSaya hubungkan ke pemilik toko ya, sebentar lagi dibalas!"
  );

  // Catat di DB untuk Handoff Queue di dashboard
  await supabaseAdmin.from("ai_conversations").insert({
    tenant_id:    tenant.id,
    user_phone:   senderPhone,
    messages_json: [],  // isi dengan history jika ada
    intent:       "low_confidence",
    model_used:   "gemini-2.0-flash",
  });

  // Notif owner
  await sendWhatsAppMessage(tenant.owner_phone,
    `⚠️ *Ada customer yang butuh bantuan manual*\n\nNomor: ${senderPhone}\n\nBalas customer langsung di WA: https://wa.me/${senderPhone}`
  );

  clearSession(senderPhone, tenant.id);
}
```

---

## 10. Response Templates (`lib/response-templates.ts`)

Semua respons customer dari template — bukan Gemini-generated. Ini menjamin data finansial selalu exact.

```typescript
// lib/response-templates.ts

/** Ringkasan order sebelum konfirmasi */
export function orderConfirmationMessage(
  items: Array<{ name: string; qty: number; unit: string; size?: string; subtotal: number }>,
  total: number
): string {
  const itemLines = items
    .map(i => {
      const sizeLabel = i.size ? ` (${i.size})` : "";
      // Format: "• Kaos Oversize Polos (L) 2 pcs = Rp170.000"
      //         "• Daging Sapi 2.5 kg = Rp375.000"
      // Tidak pakai "x" prefix karena "x2.5 kg" kurang natural
      return `• ${i.name}${sizeLabel} ${i.qty} ${i.unit} = Rp${i.subtotal.toLocaleString("id-ID")}`;
    })
    .join("\n");

  return `Oke kak! Ini pesanannya ya:\n\n${itemLines}\n\n*Total: Rp${total.toLocaleString("id-ID")}*\n\nMau lanjut bayar? Balas *ya* atau *batal* 😊`;
}

/** Caption untuk pesan gambar QR — muncul di bawah gambar QRIS di WA */
export function qrisImageCaption(
  orderId: string,
  total: number,
  expiryMinutes: number
): string {
  return [
    `💳 *Pembayaran QRIS*`,
    ``,
    `📋 Order #${orderId.slice(-6).toUpperCase()}`,
    `💰 Total: *Rp${total.toLocaleString("id-ID")}*`,
    ``,
    `⏱ QR berlaku ${expiryMinutes} menit`,
    ``,
    `Scan QR di atas dengan e-wallet atau mobile banking kamu.`,
    `Setelah bayar, kami konfirmasi otomatis 🎉`,
  ].join("\n");
}

/** Fallback jika kirim QR image gagal */
export function paymentLinkMessage(total: number, url: string): string {
  return `💳 *Selesaikan Pembayaran*\n\nTotal: Rp${total.toLocaleString("id-ID")}\nBayar via QRIS → ${url}\n\n_Link berlaku 15 menit_`;
}

/** Notif pembayaran berhasil */
export function paymentSuccessMessage(orderId: string, total: number): string {
  return `✅ *Pembayaran Diterima!*\n\nOrder #${orderId.slice(-6).toUpperCase()} sedang diproses ya kak 🎉\nTotal: Rp${total.toLocaleString("id-ID")}\n\nNanti kami kabari kalau sudah dikirim!`;
}

/** Notif ke owner saat order baru masuk */
export function ownerNewOrderMessage(
  orderId: string,
  customerPhone: string,
  total: number,
  appUrl: string
): string {
  return `🛍️ *Order Baru Masuk!*\n\nOrder #${orderId.slice(-6).toUpperCase()}\nCustomer: ${customerPhone}\nTotal: *Rp${total.toLocaleString("id-ID")}*\n\nLihat dashboard → ${appUrl}/dashboard`;
}
```

---

## 11. Session Store (`lib/session.ts`)

```typescript
// lib/session.ts
// In-memory store — aman karena --max-instances=1 di Cloud Run
// Jika nanti scale ke multi-instance → ganti dengan Redis (Upstash)

import type { Session } from "@/lib/types/session";

const sessionStore = new Map<string, Session>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 menit

function sessionKey(phone: string, tenantId: string): string {
  return `${phone}:${tenantId}`;
}

/** Get session. Jika tidak ada atau expired → return fresh idle session. */
export function getSession(phone: string, tenantId: string): Session {
  const key     = sessionKey(phone, tenantId);
  const session = sessionStore.get(key);

  if (!session || Date.now() - session.last_updated > SESSION_TTL_MS) {
    return { state: "idle", retry_count: 0, last_updated: Date.now() };
  }
  return session;
}

/** Simpan atau update session. `last_updated` selalu diperbarui otomatis. */
export function setSession(
  phone: string,
  tenantId: string,
  session: Session
): void {
  sessionStore.set(sessionKey(phone, tenantId), {
    ...session,
    last_updated: Date.now(),
  });
}

/** Hapus session — panggil setelah order selesai atau dibatalkan. */
export function clearSession(phone: string, tenantId: string): void {
  sessionStore.delete(sessionKey(phone, tenantId));
}

/** Cleanup sessions expired. Panggil dari setInterval setiap 30 menit. */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let count = 0;
  for (const [key, session] of sessionStore.entries()) {
    if (now - session.last_updated > SESSION_TTL_MS) {
      sessionStore.delete(key);
      count++;
    }
  }
  return count;
}
```

> **Kapan panggil `cleanupExpiredSessions`?** Di `app/api/webhook/wa/route.ts`, bisa panggil sesekali dengan probabilitas kecil: `if (Math.random() < 0.01) cleanupExpiredSessions()`. Untuk demo tidak wajib — leak memory kecil tidak bermasalah di scale ratusan session.
