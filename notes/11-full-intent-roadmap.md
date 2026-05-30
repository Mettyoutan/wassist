# WAssist — Full Intent Implementation Roadmap
> Dibuat: 29 Mei 2026. Target: post-MVP, setelah Jalur 1/2/6/7 stabil dan demo berjalan.

---

## Status Saat Ini

| Intent | Status | Jalur |
|---|---|---|
| `order_new` | ✅ MVP | 1 |
| `browse` | ✅ MVP | 2 |
| `order_status` | ✅ MVP | 6 |
| `low_confidence` | ✅ MVP | 7 |
| `repeat_last` | ❌ Cut → low_confidence | 3 |
| `cancel_order` | ❌ Cut → low_confidence | 5 |
| `modify_order` | ❌ Cut → low_confidence | 4 |

Urutan implementasi yang direkomendasikan: `cancel_order` → `repeat_last` → `modify_order`.
Alasan: cancel dan repeat tidak butuh schema baru. modify_order butuh breaking change di schema.

---

## Prerequisites Sebelum Mulai

1. Semua Jalur MVP (1/2/6/7) sudah live dan stabil di demo
2. State machine session sudah proven tidak ada race condition
3. Test manual: order → payment → fulfilled flow sudah bekerja end-to-end
4. Midtrans cancel API sudah dipahami (untuk cancel_order state AWAITING_PAYMENT)

---

## Perubahan Context Prompt (Non-Breaking, Bisa Dilakukan Sekarang)

### Update `buildCustomerIntentPrompt`

Tambah `store_name` dan `store_category` ke user turn. Ini konteks yang membantu Gemini
menginterpret kata ambigu — "size M" di toko fashion beda semantiknya dengan toko furniture.

```typescript
// lib/intent-parser.ts
// Signature ini konsisten dengan 03-ai-llm.md.
// ProductForPrompt: { name: string; price: number } — tanpa stock/UUID (lihat 03-ai-llm.md)
// PromptContext sudah include current_order — lihat export di 03-ai-llm.md

import type { ProductForPrompt, PromptContext } from "@/lib/intent-parser";

export function buildCustomerIntentPrompt(
  message: string,
  products: ProductForPrompt[],
  context: PromptContext
): string {
  // Format: "1. Kaos Oversize Polos — Rp85.000"
  // HARUS konsisten dengan urutan produk di getActiveProducts() (ORDER BY name ASC)
  // agar product_index yang direturn Gemini tepat sasaran.
  const productList = products
    .map((p, i) => `${i + 1}. ${p.name} — Rp${p.price.toLocaleString("id-ID")}`)
    .join("\n");

  const currentOrderBlock = context.current_order && context.current_order.length > 0
    ? `\nORDER AKTIF CUSTOMER SAAT INI:\n${context.current_order
        .map(i => `- ${i.name} x${i.qty}${i.size ? ` (${i.size})` : ""}`)
        .join("\n")}`
    : "";

  return `TOKO: ${context.store_name} (${context.store_category})

PRODUK TERSEDIA:
${productList}${currentOrderBlock}

PESAN CUSTOMER: "${message}"`;
}
```

> **Catatan `modification.product_name` vs `items.product_index`:**
> `items` pakai `product_index` (integer) karena customer baru order → Gemini harus map ke produk DB.
> `modification` pakai `product_name` (string) karena context `current_order` sudah berisi nama produk →
> Gemini cukup echo-back nama yang sudah ada, tidak perlu mapping ke katalog baru.
> Handler `handleModifyOrder` pakai fuzzy match nama, bukan index.

**Kenapa `current_order` di user turn, bukan systemInstruction?**
`systemInstruction` di-set saat model init — static untuk semua call. `current_order` berubah
per session/customer, jadi harus di user turn. Hanya diisi jika session state = `awaiting_confirmation`
(customer sedang punya order pending yang mungkin ingin dimodifikasi).

---

## Jalur 5 — `cancel_order`

### Dua Skenario Cancel

```
Skenario A — Cancel order pending (belum dibayar):
  Session state: awaiting_confirmation atau awaiting_payment
  Action: clear session + UPDATE orders SET status = 'CANCELLED' (jika sudah di DB)
          + void/cancel Midtrans transaction jika sudah dibuat

Skenario B — Cancel order yang sudah placed tapi belum diproses owner:
  Session state: idle (tidak ada order aktif di session)
  Action: cari order terakhir dengan status PAID atau AWAITING_PAYMENT
          + UPDATE status = 'CANCELLED'
          + refund via Midtrans API (jika sudah PAID) — kompleks, skip MVP+
```

Untuk implementasi awal: **Skenario A saja**. Skenario B butuh Midtrans refund API yang
menambah complexity tanpa demo value yang signifikan.

### Schema Changes — `cancel_order`

**Tidak ada.** `cancel_order` tidak butuh `items` dari parser.
Handler cukup tahu intent = `cancel_order`, lalu cek session state sendiri.

### Webhook Handler Update

```typescript
// Di webhook handler, tambah di switch statement setelah case "order_status":
case "cancel_order":
  return handleCancelOrder(tenant, senderPhone, session);
```

### Handler: `lib/handlers/cancel-order.ts`

```typescript
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { clearSession } from "@/lib/session";
import type { Session } from "@/lib/session";

export async function handleCancelOrder(
  tenant: { id: string },
  senderPhone: string,
  session: Session
): Promise<void> {
  // Skenario A1: ada order pending di session (belum di-DB)
  if (session.state === "awaiting_confirmation") {
    clearSession(senderPhone, tenant.id);
    await sendWhatsAppMessage(
      senderPhone,
      "Pesanan dibatalkan ya kak 👍 Ketik *menu* kalau mau lihat katalog lagi."
    );
    return;
  }

  // Skenario A2: sudah di DB tapi belum dibayar
  if (session.state === "awaiting_payment" && session.current_order_id) {
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("id", session.current_order_id)
      .eq("tenant_id", tenant.id)
      .eq("status", "AWAITING_PAYMENT"); // guard: jangan cancel yang sudah PAID

    clearSession(senderPhone, tenant.id);

    if (error) {
      await sendWhatsAppMessage(
        senderPhone,
        "Maaf, ada kendala membatalkan pesanan. Coba lagi atau hubungi toko ya kak 🙏"
      );
      return;
    }

    // TODO (post-MVP): void Midtrans transaction via API
    // await voidMidtransTransaction(session.current_order_id);

    await sendWhatsAppMessage(
      senderPhone,
      "✅ Pesanan dibatalkan. Pembayaran tidak jadi diproses ya kak.\nKetik *menu* kalau mau order lagi 😊"
    );
    return;
  }

  // Tidak ada order aktif di session
  await sendWhatsAppMessage(
    senderPhone,
    "Kamu tidak punya pesanan aktif yang bisa dibatalkan kak 😊\nKetik *menu* untuk lihat katalog."
  );
}
```

### Edge Cases `cancel_order`

- Customer cancel padahal belum pernah order → "tidak ada pesanan aktif"
- Customer cancel setelah status PAID → **jangan diproses**, balas "pesanan sudah dibayar, hubungi toko untuk pembatalan manual"
- Race condition: payment webhook datang saat customer baru cancel → guard `.eq("status", "AWAITING_PAYMENT")` mencegah cancel order yang sudah PAID

---

## Jalur 3 — `repeat_last`

### Flow

```
Customer: "yang biasa kak" / "order yang kemarin lagi"
        │
        ▼ intent: repeat_last
        │
        ▼ handleRepeatLast()
  step 1: Cari order terakhir customer yang selesai (PAID/FULFILLED/DONE)
          SELECT o.*, oi.product_id, oi.qty, oi.size, oi.notes, p.name, p.price
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          JOIN products p ON p.id = oi.product_id
          WHERE o.customer_user_id = $1 AND o.tenant_id = $2
            AND o.status IN ('PAID','FULFILLED','DONE')
          ORDER BY o.created_at DESC
          LIMIT 1  ← ambil satu order saja, lalu semua item-nya

  step 2: Jika tidak ada order sebelumnya:
          → balas "Kamu belum pernah order sebelumnya kak 😊 Ketik *menu* untuk lihat katalog."

  step 3: Validasi stok + harga terbaru (harga bisa berubah sejak order lama)
          → Untuk setiap item: cek product masih aktif, stok cukup, ambil harga terbaru

  step 4: Kirim ringkasan "order ulang" + minta konfirmasi
          Tampilkan harga TERBARU (bukan harga lama saat order pertama)
```

### Schema Changes — `repeat_last`

**Tidak ada.** Parser hanya perlu tahu intent = `repeat_last`. Items diambil dari DB history,
bukan dari pesan customer.

### Handler: `lib/handlers/repeat-last.ts`

```typescript
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { setSession } from "@/lib/session";
import { orderConfirmationMessage } from "@/lib/response-templates";

export async function handleRepeatLast(
  tenant: { id: string },
  senderPhone: string
): Promise<void> {
  // 1. Cari user
  const { data: user } = await supabaseAdmin
    .from("users").select("id")
    .eq("tenant_id", tenant.id).eq("phone", senderPhone).single();

  if (!user) {
    await sendWhatsAppMessage(senderPhone,
      "Kamu belum pernah order sebelumnya kak 😊 Ketik *menu* untuk lihat katalog."
    );
    return;
  }

  // 2. Cari order terakhir yang selesai
  const { data: lastOrder } = await supabaseAdmin
    .from("orders")
    .select(`
      id,
      order_items (
        qty, size, notes,
        products ( id, name, price, stock, unit, is_active )
      )
    `)
    .eq("tenant_id", tenant.id)
    .eq("customer_user_id", user.id)
    .in("status", ["PAID", "FULFILLED", "DONE"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastOrder || !lastOrder.order_items?.length) {
    await sendWhatsAppMessage(senderPhone,
      "Belum ada riwayat order selesai kak 😊 Yuk order sekarang, ketik *menu* untuk lihat katalog!"
    );
    return;
  }

  // 3. Validasi stok + harga terbaru
  const validatedItems: Array<{
    product_id: string;
    name: string;
    qty: number;
    size: string;
    notes: string;
    price: number;
    subtotal: number;
  }> = [];

  const unavailableItems: string[] = [];

  for (const item of lastOrder.order_items) {
    const product = item.products;
    if (!product.is_active) {
      unavailableItems.push(product.name);
      continue;
    }
    if (product.stock < item.qty) {
      unavailableItems.push(`${product.name} (stok hanya ${product.stock} ${product.unit})`);
      continue;
    }
    validatedItems.push({
      product_id: product.id,
      name: product.name,
      qty: item.qty,
      unit: product.unit,     // snapshot satuan saat order
      size: item.size ?? "",
      notes: item.notes ?? "",
      price: product.price,   // harga TERBARU, bukan harga lama
      subtotal: product.price * item.qty,
    });
  }

  if (validatedItems.length === 0) {
    await sendWhatsAppMessage(senderPhone,
      "Sayang sekali, produk dari orderan kemarin sudah tidak tersedia 😔\nKetik *menu* untuk lihat koleksi terbaru ya kak!"
    );
    return;
  }

  const total = validatedItems.reduce((s, i) => s + i.subtotal, 0);

  // 4. Kirim ringkasan + konfirmasi
  let message = orderConfirmationMessage(validatedItems, total);

  // Tambah note kalau ada item yang tidak tersedia
  if (unavailableItems.length > 0) {
    message += `\n\n⚠️ _Beberapa produk dari order sebelumnya tidak tersedia: ${unavailableItems.join(", ")}_`;
  }

  await sendWhatsAppMessage(senderPhone, message);

  setSession(senderPhone, tenant.id, {
    state: "awaiting_confirmation",
    pending_order: { items: validatedItems, total },
    retry_count: 0,
  });
}
```

### Edge Cases `repeat_last`

- Tidak ada order sebelumnya → balas "belum pernah order"
- Semua item dari order lama tidak tersedia lagi → balas "produk tidak tersedia"
- Sebagian item tidak tersedia → order item yang masih tersedia, info ke customer
- Harga berubah → SELALU tampilkan harga terbaru, bukan harga lama (hindari dispute)
- Stock berkurang → jika stock < qty yang dipesan dulu, skip item tersebut

---

## Jalur 4 — `modify_order`

Ini yang paling kompleks. Butuh **breaking change di schema**.

### Constraint Penting

`modify_order` HANYA valid jika ada order pending di session (`state = "awaiting_confirmation"`).
Jika tidak ada order aktif → balas "tidak ada pesanan yang bisa diubah" dan JANGAN proses sebagai modify.

Cek session state **sebelum** panggil Gemini. Kalau tidak ada active order, tidak perlu parsing.

### Breaking Schema Change: Tambah `modification` Field

#### Update `responseSchema` di `parserModel` (`lib/gemini.ts`)

```typescript
responseSchema: {
  type: SchemaType.OBJECT,
  properties: {
    intent: {
      type: SchemaType.STRING,
      enum: ["order_new","browse","repeat_last","order_status","modify_order","cancel_order","low_confidence"],
    },
    items: {
      // Tetap sama — hanya untuk order_new
      // product_index: INTEGER (nomor urut dari PRODUK TERSEDIA), bukan nama/UUID
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          product_index: { type: SchemaType.INTEGER }, // 1-based index dari daftar produk
          qty:           { type: SchemaType.NUMBER },  // NUMBER bukan INTEGER: support 2.5 kg, 0.5 L
          size:          { type: SchemaType.STRING },
          notes:         { type: SchemaType.STRING },
        },
        required: ["product_index", "qty"],
      },
    },
    // BARU: hanya diisi jika intent = modify_order
    modification: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          enum: ["add_qty", "set_qty", "change_size", "remove_item"],
        },
        product_name: { type: SchemaType.STRING },
        qty:          { type: SchemaType.INTEGER },  // untuk add_qty dan set_qty
        size:         { type: SchemaType.STRING },   // untuk change_size
      },
      required: ["action", "product_name"],
    },
    confidence: { type: SchemaType.NUMBER },
  },
  required: ["intent", "confidence"],
},
```

#### Update `ParsedIntentSchema` di Zod (`lib/intent-parser.ts`)

```typescript
const ModificationSchema = z.object({
  action: z.enum(["add_qty", "set_qty", "change_size", "remove_item"]),
  product_name: z.string(),
  qty: z.number().positive().optional(), // tidak .int() — support desimal untuk kg/L
  size: z.string().optional(),
});

export const ParsedIntentSchema = z.object({
  intent: z.enum([
    "order_new", "browse", "repeat_last",
    "modify_order", "cancel_order", "order_status", "low_confidence",
  ]),
  items: z.array(OrderItemSchema).default([]),
  modification: ModificationSchema.optional(),   // BARU
  confidence: z.number().min(0).max(1),
});
```

#### Update `systemInstruction` — Tambah Aturan `modification`

```
- modification  : isi HANYA jika intent = modify_order. Intent lain → omit field ini.
                  action "add_qty"    : tambah jumlah. qty = jumlah yang ditambahkan (bukan total baru).
                                        Ex: "tambahin 1 kaos" → action: add_qty, qty: 1
                  action "set_qty"    : ubah jumlah menjadi. qty = jumlah total yang diinginkan.
                                        Ex: "kaosnya jadi 3 aja" → action: set_qty, qty: 3
                  action "change_size": ubah ukuran. size = ukuran baru.
                                        Ex: "ganti ukurannya jadi L" → action: change_size, size: "L"
                  action "remove_item": hapus produk dari order.
                                        Ex: "celana cargonya dihapus aja" → action: remove_item
                  product_name: nama produk yang ingin dimodifikasi, sesuai order aktif customer.
```

#### Update User Prompt — Tambah `current_order` Context

```typescript
// Untuk modify_order, user turn harus include order aktif customer saat ini
// Tanpa ini, Gemini tidak tahu "tambahin 1" itu produk apa.
// Kirim current_order hanya jika session.state === "awaiting_confirmation"

// Signature lengkap ada di bagian "Perubahan Context Prompt" di atas.
// current_order field key adalah `name` (bukan `product_name`) — sesuai PromptContext di 03-ai-llm.md.
// import type { ProductForPrompt, PromptContext } from "@/lib/intent-parser";
```

### Flow `modify_order`

```
Customer: "tambahin 1 kaos oversize lagi kak"
        │
        ▼ Cek session state DULU (sebelum Gemini)
        │
        ├─ session.state !== "awaiting_confirmation"?
        │    → balas "Tidak ada pesanan aktif yang bisa diubah.
        │              Ketik *menu* untuk order baru."
        │    return (tidak panggil Gemini)
        │
        ▼ session.state === "awaiting_confirmation"
        │
        ▼ Gemini parse dengan current_order context
  {
    intent: "modify_order",
    modification: { action: "add_qty", product_name: "Kaos Oversize Polos", qty: 1 },
    confidence: 0.93
  }
        │
        ▼ handleModifyOrder()
  step 1: Cari item di session.pending_order yang match product_name
  step 2: Validasi aksi:
          - add_qty: stok cukup untuk tambahan qty?
          - set_qty: qty baru valid (> 0)? stok cukup?
          - change_size: product ada variant size tersebut?
          - remove_item: setelah dihapus, masih ada minimal 1 item?
  step 3: Apply modifikasi ke session.pending_order
  step 4: Recalculate total
  step 5: Kirim ringkasan order yang sudah diupdate + minta konfirmasi ulang
```

### Handler: `lib/handlers/modify-order.ts`

```typescript
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { setSession, getSession } from "@/lib/session";
import { orderConfirmationMessage } from "@/lib/response-templates";
import { getActiveProducts } from "@/lib/db/products";
import type { ParsedIntent } from "@/lib/intent-parser";
import type { Session } from "@/lib/session";

export async function handleModifyOrder(
  tenant: { id: string },
  senderPhone: string,
  session: Session,
  parsed: ParsedIntent
): Promise<void> {
  // Guard: harus ada order pending
  if (session.state !== "awaiting_confirmation" || !session.pending_order) {
    await sendWhatsAppMessage(senderPhone,
      "Tidak ada pesanan aktif yang bisa diubah kak 😊\nKetik *menu* untuk order baru."
    );
    return;
  }

  const mod = parsed.modification;
  if (!mod) {
    // Seharusnya tidak terjadi kalau Gemini benar, tapi guard tetap perlu
    await sendWhatsAppMessage(senderPhone,
      "Maaf, saya kurang paham mau ubah apa 😅 Coba sebutkan lebih jelas ya kak."
    );
    return;
  }

  const items = [...session.pending_order.items]; // shallow copy
  const products = await getActiveProducts(tenant.id);

  // Fuzzy match nama produk ke items pending
  const itemIndex = items.findIndex(i =>
    i.name.toLowerCase().includes(mod.product_name.toLowerCase()) ||
    mod.product_name.toLowerCase().includes(i.name.toLowerCase())
  );

  if (itemIndex === -1) {
    await sendWhatsAppMessage(senderPhone,
      `Produk "${mod.product_name}" tidak ada di pesananmu kak 🤔\nCek lagi ya, atau ketik *batal* untuk batalkan pesanan.`
    );
    return;
  }

  const product = products.find(p => p.name === items[itemIndex].name);
  if (!product) {
    await sendWhatsAppMessage(senderPhone,
      "Produk tersebut sudah tidak tersedia 😔"
    );
    return;
  }

  switch (mod.action) {
    case "add_qty": {
      const newQty = items[itemIndex].qty + (mod.qty ?? 1);
      if (product.stock < newQty) {
        await sendWhatsAppMessage(senderPhone,
          `Stok ${product.name} hanya tersisa ${product.stock} ${product.unit} kak 😔`
        );
        return;
      }
      items[itemIndex] = {
        ...items[itemIndex],
        qty: newQty,
        subtotal: product.price * newQty,
      };
      break;
    }

    case "set_qty": {
      const newQty = mod.qty ?? 1;
      if (newQty <= 0) {
        // set_qty ke 0 = remove semantically, arahkan ke remove_item
        await sendWhatsAppMessage(senderPhone,
          `Kalau mau hapus ${product.name} dari pesanan, balas "hapus ${product.name}" ya kak.`
        );
        return;
      }
      if (product.stock < newQty) {
        await sendWhatsAppMessage(senderPhone,
          `Stok ${product.name} hanya tersisa ${product.stock} ${product.unit} kak 😔`
        );
        return;
      }
      items[itemIndex] = {
        ...items[itemIndex],
        qty: newQty,
        subtotal: product.price * newQty,
      };
      break;
    }

    case "change_size": {
      items[itemIndex] = {
        ...items[itemIndex],
        size: mod.size ?? "",
      };
      break;
    }

    case "remove_item": {
      if (items.length === 1) {
        // Tidak boleh remove item terakhir — arahkan ke cancel
        await sendWhatsAppMessage(senderPhone,
          `${product.name} adalah satu-satunya item di pesananmu.\nKalau mau batalkan seluruh pesanan, balas *batal* ya kak.`
        );
        return;
      }
      items.splice(itemIndex, 1);
      break;
    }
  }

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  // Update session dengan order yang sudah dimodifikasi
  setSession(senderPhone, tenant.id, {
    ...session,
    pending_order: { items, total },
  });

  // Kirim ringkasan updated + konfirmasi ulang
  const summary = orderConfirmationMessage(items, total);
  await sendWhatsAppMessage(senderPhone,
    `✅ Pesanan diupdate ya kak!\n\n${summary}`
  );
}
```

### Edge Cases `modify_order`

- Tidak ada active session → block sebelum Gemini (tidak perlu parsing)
- Produk tidak ditemukan di pending items → informasi ke customer
- add_qty / set_qty melebihi stok → tolak dengan info stok tersisa
- set_qty = 0 → arahkan ke cancel/remove_item dengan pesan jelas
- remove_item satu-satunya item → arahkan ke cancel_order
- change_size: tidak ada validasi variant size (fashion sederhana) — notes saja

---

## Webhook Handler — Semua Intent Aktif

Setelah semua handler siap, update switch statement di `app/api/webhook/wa/route.ts`:

```typescript
// app/api/webhook/wa/route.ts (bagian customer flow)

// ─── Cek state dulu, SEBELUM Gemini ───────────────────────
if (session.state === "awaiting_confirmation") {
  const text = message.text.body.toLowerCase().trim();

  // Cek apakah customer mau modifikasi (bukan konfirmasi ya/batal)
  // Pakai CONFIRM_KEYWORDS / CANCEL_KEYWORDS dari lib/constants/confirmation-keywords.ts
  // Daftar lengkap ada di notes/05-order-flow.md — covers formal, slang, gaul WA.
  const isConfirm = CONFIRM_KEYWORDS.has(text);
  const isCancel  = CANCEL_KEYWORDS.has(text);

  if (isConfirm) return processOrderConfirmation(tenant, senderPhone, session);
  if (isCancel)  return handleCancelOrder(tenant, senderPhone, session);

  // Bukan ya/batal → mungkin mau modify. Kirim ke Gemini dengan current_order context.
  // (jatuh ke flow parsing di bawah)
}

if (session.state === "awaiting_payment") {
  return resendPaymentLink(session, senderPhone);
}

// ─── Customer flow: parse intent ──────────────────────────
const products = await getActiveProducts(tenant.id);

const currentOrderContext = session.state === "awaiting_confirmation" && session.pending_order
  ? session.pending_order.items.map(i => ({
      name: i.name,   // key "name", bukan "product_name" — sesuai PromptContext.current_order
      qty: i.qty,
      size: i.size,
    }))
  : undefined;

const parsed = await parseCustomerMessage(message.text.body, products, {
  store_name: tenant.name,
  store_category: tenant.category ?? "toko online",
  current_order: currentOrderContext,
});

switch (parsed.intent) {
  case "browse":        return handleBrowseIntent(tenant, senderPhone, session);
  case "order_new":     return handleOrder(tenant, senderPhone, parsed, session);
  case "order_status":  return handleStatusIntent(tenant, senderPhone);
  case "repeat_last":   return handleRepeatLast(tenant, senderPhone);
  case "cancel_order":  return handleCancelOrder(tenant, senderPhone, session);
  case "modify_order":  return handleModifyOrder(tenant, senderPhone, session, parsed);
  case "low_confidence":return handleHandoff(tenant, senderPhone, session);
}
```

**Kenapa `modify_order` tidak di-block sebelum Gemini?**
Karena di `awaiting_confirmation` state, customer bisa bilang "ya", "batal", atau "tambahin 1".
Kita tidak bisa tahu mana sebelum parsing. Tapi kita tetap kasih context `current_order` ke Gemini
supaya ia tahu what's in the cart saat parsing.

---

## Urutan Implementasi

```
Fase 1 (prerequisites):
  [ ] Semua jalur MVP stabil, tidak ada bug
  [ ] Tenant schema punya kolom `name` dan `category`
  [ ] Session type sudah punya `current_order_id` field yang reliable

Fase 2 — cancel_order (est. 2-3 jam):
  [ ] Buat lib/handlers/cancel-order.ts
  [ ] Update webhook switch: tambah case "cancel_order"
  [ ] Update prompt context (store_name, store_category) di buildCustomerIntentPrompt
  [ ] Test: customer cancel saat awaiting_confirmation
  [ ] Test: customer cancel saat awaiting_payment
  [ ] Test: customer cancel padahal tidak ada order aktif

Fase 3 — repeat_last (est. 3-4 jam):
  [ ] Buat lib/handlers/repeat-last.ts
  [ ] Update webhook switch: tambah case "repeat_last"
  [ ] Test: repeat order dengan semua produk tersedia
  [ ] Test: repeat order dengan sebagian produk tidak tersedia
  [ ] Test: repeat order tanpa riwayat order sebelumnya
  [ ] Test: harga produk berubah sejak order lama (tampilkan harga terbaru)

Fase 4 — modify_order (est. 4-6 jam, ada breaking change):
  [ ] Update responseSchema: tambah `modification` field
  [ ] Update ParsedIntentSchema + ModificationSchema di Zod
  [ ] Update systemInstruction: tambah aturan `modification`
  [ ] Update buildCustomerIntentPrompt: tambah current_order context
  [ ] Update parseCustomerMessage signature (terima context object)
  [ ] Buat lib/handlers/modify-order.ts
  [ ] Update webhook handler: kirim current_order ke parser, handle modify_order case
  [ ] Test: add_qty — tambah qty item yang ada
  [ ] Test: set_qty — ubah qty ke angka tertentu
  [ ] Test: change_size — ubah ukuran
  [ ] Test: remove_item — hapus item (bukan item terakhir)
  [ ] Test: remove_item pada item terakhir → arahkan ke cancel
  [ ] Test: modify saat tidak ada active order
  [ ] Test: product name typo di modify request
```

---

## Catatan Penting untuk Demo

Saat semua intent aktif, **happy path demo bisa diperpanjang**:

```
Demo flow optimal (90 detik):
1. Customer lihat katalog (browse)           → WA Catalog muncul visual
2. Customer order dari teks (order_new)      → Gemini parse, ringkasan muncul
3. Customer minta ubah ukuran (modify_order) → Bot update pesanan real-time  ← WOW MOMENT BARU
4. Customer konfirmasi → QRIS link muncul    ← WOW MOMENT LAMA
5. Pembayaran → "Terima kasih!" auto         ← WOW MOMENT LAMA
```

Step 3 adalah demo value terbesar dari full intent — menunjukkan bahwa bot memahami
percakapan multi-turn, bukan hanya satu pesan. Ini langsung menjawab "AI-nya seberapa canggih?"
dari juri.

---

## File yang Perlu Dimodifikasi saat Implement Full Intent

| File | Perubahan |
|---|---|
| `lib/gemini.ts` | responseSchema: tambah `modification` field |
| `lib/intent-parser.ts` | ParsedIntentSchema + ModificationSchema + buildCustomerIntentPrompt signature |
| `app/api/webhook/wa/route.ts` | Switch statement: tambah 3 case + update parser call dengan context |
| `lib/handlers/cancel-order.ts` | **NEW** |
| `lib/handlers/repeat-last.ts` | **NEW** |
| `lib/handlers/modify-order.ts` | **NEW** |
| `lib/session.ts` | Pastikan Session type punya field yang dibutuhkan |
| DB schema | Pastikan `tenants` punya kolom `name` dan `category` |
