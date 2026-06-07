# CLAUDE.md — WAssist Project Context
> Last updated: 8 Juni 2026

---

## Apa Ini

WAssist adalah platform otomasi pemesanan berbasis WhatsApp untuk UMKM Indonesia.
Customer chat ke nomor WA bisnis → bot AI (Gemini) proses pesanan → generate QRIS → notif owner.
**Hackathon:** Gunadarma Code Week 2.0, deadline submit **11 Juni 2026**. Target WAssist selesai: **8 Juni 2026** (buffer 3 hari).
**Demo tenant:** Toko Olshop Mbak Rina (fashion store, 16 produk, `tenant_id: 3b0a38de-811c-40b5-af83-c866e198da12`, `owner_phone: 6287715781238` ← nomor personal owner, format DB tanpa `+`, verified ✅).

---

## Dashboard Auth Strategy

**Opsi A — AKTIF sekarang (hackathon demo mode)**
Semua API route `/api/dashboard/*`, `/api/orders`, `/api/products` membaca `process.env.DEMO_TENANT_ID` langsung. Tidak ada JWT, tidak ada login. Cukup untuk demo single-tenant.

**Opsi B — TODO post-hackathon**
Magic link auth via `jose` JWT. File stub sudah ada: `app/api/auth/magic-link/route.ts` (returns 501).
Alur: `POST /api/auth/magic-link` → kirim WA link ke owner → owner buka link → set JWT cookie → dashboard terautentikasi.
Jangan hapus `JWT_SECRET` dari `.env.local`.

---

## Stack Final (JANGAN GANTI tanpa alasan kuat)

| Layer | Teknologi | Constraint |
|---|---|---|
| Framework | Next.js 16 App Router (monorepo) | API routes + React dalam satu project |
| AI — Customer Parser | `gemini-3.1-flash-lite` + `responseSchema` | Temperature 0.1, structured JSON output |
| AI — Owner Parser | `gemini-3.1-flash-lite` + `responseSchema` | Temperature 0.1, structured JSON output |
| AI — Owner Generator | `gemini-3.1-flash-lite` | Temperature 0.4, free-form narasi |
| Database | PostgreSQL via Supabase | `supabaseAdmin` dengan service role key |
| Session | In-memory `Map` di Node.js | **Bukan Redis** — `--max-instances=1` di Cloud Run |
| Payment | Midtrans **Core API** (bukan Snap) | Core API return `qr_string` untuk QR image |
| WA API | Meta WhatsApp Cloud API v19.0 | |
| Deploy | Google Cloud Run, `asia-southeast1` | `--min-instances=1 --max-instances=1` |

---

## Environment Variables

```env
# .env.local

# Meta WhatsApp Cloud API
META_PHONE_NUMBER_ID=1130913063438393   # Meta Phone Number ID (BUKAN nomor HP biasa)
META_ACCESS_TOKEN=EAAxxxxx              # Permanent token dari Meta App Dashboard
META_VERIFY_TOKEN=wassist_verify_2026   # Harus sama dengan yang di-set di Meta Webhook config
META_CATALOG_ID=                        # Opsional — untuk WA Catalog

# Google Gemini
GEMINI_API_KEY=AIzaSy...

# Supabase — URL TANPA trailing /rest/v1/
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx        # JANGAN expose ke frontend
NEXT_PUBLIC_STORAGE_BUCKET=product-images  # Supabase Storage bucket (harus public)

# Midtrans Sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
MIDTRANS_IS_PRODUCTION=false

# Auth
JWT_SECRET=random-secret-min-32-chars
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Dashboard Auth (Opsi A — Demo Mode)
DEMO_TENANT_ID=3b0a38de-811c-40b5-af83-c866e198da12  # tenant demo Mbak Rina
```

---

## Struktur Folder (STRICT — jangan ubah tanpa diskusi)

```
wassist/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── webhook/
│   │   │   ├── wa/route.ts           ← ENTRY POINT semua pesan WA
│   │   │   └── midtrans/route.ts     ← payment callback dari Midtrans
│   │   ├── orders/
│   │   │   ├── route.ts              ← GET list orders (dashboard)
│   │   │   └── [id]/route.ts         ← GET detail order
│   │   ├── products/route.ts
│   │   └── dashboard/
│   │       ├── kpi/route.ts          ← omzet, order count, AOV
│   │       └── handoff/route.ts      ← list percakapan needs manual reply (stub [])
│   ├── dashboard/                    ← React UI untuk owner
│   └── ...
├── components/
│   └── dashboard/                    ← KPICard, OrderTable, StatusBadge, dll
├── server/                           # Server-only code (no React)
│   └── db/                           ← SEMUA database queries ada di sini
│       ├── client.ts                 ← supabaseAdmin (createClient)
│       ├── products.ts               ← getActiveProducts, getProductByName,
│       │                                getProductByRetailerId, updateProductPrice,
│       │                                updateProductStock, setProductReorderPoint,
│       │                                setProductActive, decrementProductStock,
│       │                                getProductsByTenantAll, getProductsStockStatus
│       ├── orders.ts                 ← createOrder, updateOrderMidtrans, updateOrderStatus,
│       │                                getOrderByMidtransId, getLatestOrderByCustomer,
│       │                                getOrderItemsByOrderId, getLastCompletedOrderWithItems,
│       │                                deleteOrder, getLatestActiveOrderWithItems,
│       │                                getLatestOrderByStatus, getOrderById
│       ├── users.ts                  ← upsertCustomer, getUserIdByPhone, getUserById,
│       │                                getUserWithAddress, updateUserLastAddress
│       ├── tenants.ts                ← getTenantByWaPhoneId, setStoreStatus, getTenantById
│       ├── analytics.ts              ← queryRevenueData, RevenueData type, parsePeriod
│       └── index.ts                  ← re-export semua → import dari @/server/db
├── lib/                              # Pure utilities — NO DB queries di sini
│   ├── ai/
│   │   ├── models.ts                 ← customerParserModel, ownerParserModel, generatorModel,
│   │   │                                confirmationParserModel, clarificationParserModel
│   │   ├── customer-parser.ts        ← parseCustomerMessage, buildCustomerIntentPrompt
│   │   └── confirmation-parser.ts    ← parseConfirmationIntent, parseClarificationInput
│   ├── handlers/
│   │   ├── browse.ts                 ← handleBrowseIntent()
│   │   ├── cart-order.ts             ← handleCartOrder() dari WA Catalog
│   │   ├── status.ts                 ← handleStatusIntent()
│   │   ├── handoff.ts                ← handleHandoffIntent()
│   │   ├── owner.ts                  ← handleOwnerCommand() dispatcher
│   │   ├── order-new.ts              ← handleOrderIntent() — slot-filling, guard toko tutup
│   │   ├── clarification.ts          ← handleClarificationAnswer() — jawaban varian/qty
│   │   ├── confirm-order.ts          ← processOrderConfirmation() — Midtrans QRIS + WA
│   │   ├── repeat-last.ts            ← handleRepeatLastIntent() — re-order pesanan terakhir
│   │   ├── cancel-order.ts           ← post-MVP
│   │   └── modify-order.ts           ← post-MVP
│   ├── owner/
│   │   ├── parser.ts                 ← parseOwnerCommand() via ownerParserModel
│   │   └── generator.ts              ← generateRevenueResponse() via generatorModel
│   ├── types/
│   │   ├── db.ts                     ← DbTenant, DbProduct, DbOrder, DbOrderItem, DbUser
│   │   ├── session.ts                ← Session, PendingOrder, PendingOrderItem, PendingOwnerAction
│   │   ├── whatsapp.ts               ← WA webhook types
│   │   ├── tenant.ts
│   │   └── index.ts                  ← barrel re-export
│   ├── session.ts                    ← in-memory session store (Map, TTL 30 menit),
│   │                                    peekExpiredSession
│   ├── whatsapp.ts                   ← sendWhatsAppMessage, sendCatalogMessage,
│   │                                    uploadWhatsAppMedia, sendWhatsAppImageMessage
│   ├── midtrans.ts                   ← createQrisPayment, verifyMidtransSignature,
│   │                                    getMidtransQrString
│   ├── response-template.ts          ← orderConfirmationMessage, dll
│   └── utils.ts
├── scripts/
│   ├── test-intent.ts
│   ├── delete-demo.sql        ← hapus semua data demo (jalankan SEBELUM seed)
│   └── seed-demo.sql          ← seed data demo Olshop Mbak Rina (DO $$ block)
└── next.config.ts                    ← WAJIB: output: "standalone"
```

---

## Database Schema (Lengkap)

> Semua kolom `id` menggunakan `DEFAULT gen_random_uuid()` — jangan pass `id` manual saat INSERT kecuali ada alasan khusus (contoh: tenant demo harus fix untuk match `DEMO_TENANT_ID`).

### `tenants`
```sql
CREATE TABLE tenants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  owner_phone         TEXT NOT NULL UNIQUE,        -- format: 628xxx (tanpa +)
  wa_business_phone_id TEXT,                       -- Meta Phone Number ID
  plan                TEXT NOT NULL DEFAULT 'TRIAL'
                      CHECK (plan IN ('TRIAL','STARTER','PRO','BUSINESS')),
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  is_open             BOOLEAN NOT NULL DEFAULT true,
  closed_until        TIMESTAMPTZ,
  category            TEXT NOT NULL DEFAULT 'toko online',
  meta_catalog_id     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `users`
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  phone       TEXT NOT NULL,                        -- format: 628xxx
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('OWNER','CUSTOMER')),
  last_seen    TIMESTAMPTZ DEFAULT now(),
  last_address TEXT,                                -- alamat pengiriman terakhir, nullable
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)                         -- constraint: users_tenant_id_phone_key ✅ verified
);
```

### `products`
```sql
CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  name             TEXT NOT NULL,
  description      TEXT,
  price            INTEGER NOT NULL,               -- Rupiah bulat, BUKAN float
  stock            NUMERIC NOT NULL DEFAULT 0,     -- NUMERIC: support 2.5 kg, 0.5 L
  unit             TEXT NOT NULL DEFAULT 'pcs',
  category         TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  image_url        TEXT,
  meta_retailer_id TEXT,                           -- slug Meta Catalog, IMMUTABLE setelah di-set
  reorder_point    NUMERIC NOT NULL DEFAULT 5,     -- alert stok menipis
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `orders`
```sql
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  customer_user_id    UUID NOT NULL REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','CONFIRMED','AWAITING_PAYMENT',
                                        'PAID','FULFILLED','DONE','CANCELLED')),
  total_amount        INTEGER NOT NULL DEFAULT 0,  -- Rupiah bulat
  payment_method      TEXT DEFAULT 'QRIS',
  payment_status      TEXT NOT NULL DEFAULT 'UNPAID'
                      CHECK (payment_status IN ('UNPAID','PAID','REFUNDED','FAILED')),
  midtrans_id         TEXT,                        -- format WA-XXXXXXXX-xxxx
  midtrans_payment_url TEXT,                       -- fallback URL jika QR gagal dikirim
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `order_items`
```sql
CREATE TABLE order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id),
  product_id     UUID NOT NULL REFERENCES products(id),
  qty            NUMERIC NOT NULL CHECK (qty > 0),  -- NUMERIC bukan INTEGER
  price_at_order INTEGER NOT NULL,                  -- SNAPSHOT harga saat order
  unit           TEXT NOT NULL DEFAULT 'pcs',       -- snapshot satuan
  size           TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `wa_sessions` *(tidak dipakai aktif — session pakai in-memory Map)*
```sql
CREATE TABLE wa_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL UNIQUE,
  tenant_id    UUID NOT NULL UNIQUE REFERENCES tenants(id),
  state        TEXT NOT NULL DEFAULT 'IDLE',
  context_json JSONB NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `ai_conversations` *(logging only, belum dipakai)*
```sql
CREATE TABLE ai_conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  user_phone   TEXT NOT NULL,
  messages_json JSONB NOT NULL DEFAULT '[]',
  intent       TEXT,
  model_used   TEXT,
  confidence   FLOAT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Status Flow Orders
```
PENDING → AWAITING_PAYMENT → PAID → FULFILLED → DONE
                                  ↘ CANCELLED (dari PENDING saja)
```

### Aturan INSERT Seed / Test Data
- **Jangan pass kolom `id`** kecuali tenant demo (harus match `DEMO_TENANT_ID`)
- **Seed script: jangan pakai `ON CONFLICT (tenant_id, phone)`** — seed harus DELETE dulu agar idempotent (lihat `scripts/delete-demo.sql` + `scripts/seed-demo.sql`)
- **Aplikasi (`upsertCustomer`)**: constraint `users_tenant_id_phone_key` UNIQUE ada di DB → `onConflict: "tenant_id,phone"` aman dipakai
- Gunakan `DO $$ DECLARE ... BEGIN ... END $$` + `RETURNING id INTO v_xxx` untuk cross-referencing FK

### TypeScript Types (`lib/types/db.ts`)
```typescript
export type DbProduct = Tables<"products">;
export type DbOrder = Omit<Tables<"orders">, "status" | "payment_status"> & {
  status: "PENDING" | "CONFIRMED" | "AWAITING_PAYMENT" | "PAID" | "FULFILLED" | "DONE" | "CANCELLED";
  payment_status: "UNPAID" | "PAID" | "REFUNDED" | "FAILED";
};
```

---

## AI/LLM Architecture — 5 Model Gemini

### Lima Model, Lima Tujuan (semua di `lib/ai/models.ts`)

| | `customerParserModel` | `ownerParserModel` | `generatorModel` | `confirmationParserModel` | `clarificationParserModel` |
|---|---|---|---|---|---|
| Dipakai | Parse pesan customer | Parse perintah owner | Narasi analytics owner | Deteksi confirm/cancel | Parse jawaban clarification |
| Output | `ParsedIntent` (JSON schema) | `OwnerCommand` (JSON schema) | Free-form teks | `signal` enum | `choices[]` + `cancel` |
| Temperature | 0.1 | 0.1 | 0.4 | 0.1 | 0.1 |
| File | `lib/ai/customer-parser.ts` | `lib/owner/parser.ts` | `lib/owner/generator.ts` | `lib/ai/confirmation-parser.ts` | `lib/ai/confirmation-parser.ts` |

> ⚠️ Verifikasi nama model di https://aistudio.google.com SEBELUM coding. String `gemini-3.1-flash-lite` valid per Mei 2026.

### Customer Intent — 8 Intent (`lib/ai/customer-parser.ts`)
```
order_new       → customer ingin pesan produk baru
browse          → ingin lihat katalog
order_status    → tanya status pesanan
greeting        → sapaan tanpa intent belanja → template sambutan
repeat_last     → ✅ handleRepeatLastIntent() — re-order pesanan terakhir
cancel_order    → ✅ cancelOrderMessage() template — info cara batal
modify_order    → post-MVP → handoff ke owner
low_confidence  → tidak jelas / di luar konteks → handoff ke owner
```

> ⚠️ Perubahan intent WAJIB update 3 tempat sekaligus:
> 1. `lib/ai/models.ts` — `systemInstruction` + `responseSchema.enum`
> 2. `lib/ai/customer-parser.ts` — `ParsedIntentSchema` Zod enum
> 3. `app/api/webhook/wa/route.ts` — `case` baru di switch

### Owner Command — 15 Action (`lib/owner/parser.ts`)
```
get_revenue        → omzet / laporan → queryRevenueData + Gemini narasi
get_orders         → daftar order aktif (PENDING/AWAITING_PAYMENT/PAID/FULFILLED)
get_stock          → cek stok
update_price       ← BUTUH KONFIRMASI
update_stock       ← BUTUH KONFIRMASI
set_reorder_point  ← BUTUH KONFIRMASI
deactivate_product ← BUTUH KONFIRMASI
activate_product   ← BUTUH KONFIRMASI
open_store         → langsung, tanpa konfirmasi
close_store        → langsung, tanpa konfirmasi
mark_fulfilled     → order PAID → FULFILLED, notif customer 🚚
mark_done          → order FULFILLED → DONE, notif customer ✅
mark_paid          → konfirmasi bayar manual (AWAITING_PAYMENT → PAID), notif customer 💰
help               → daftar perintah
unknown            → fallback
```

### `responseSchema` — Aturan qty
```typescript
// JANGAN PAKAI INTEGER — support desimal untuk kg, L, dll
qty: { type: SchemaType.NUMBER }  // bukan SchemaType.INTEGER
// Zod: z.number().positive()      // bukan .int()
```

### Kenapa `product_index` bukan `product_name`?
- LLM lebih reliable return angka terurut daripada reproduce nama persis
- Menghilangkan kebutuhan fuzzy matching di handler

### FORMAT WAJIB Product List di Prompt
```typescript
// "1. Kaos Oversize Polos — Rp85.000/pcs"
// Unit wajib ditampilkan agar Gemini tahu kapan qty boleh desimal
.map((p, i) => `${i + 1}. ${p.name} — Rp${p.price.toLocaleString("id-ID")}/${p.unit}`)
```

---

## Session State Machine

### `lib/types/session.ts`
```typescript
export type SessionState =
  | "idle"
  | "awaiting_confirmation"         // customer konfirmasi order
  | "awaiting_address"              // bot sudah tanya alamat, nunggu customer balas
  | "awaiting_payment"              // customer sedang bayar QRIS
  | "awaiting_clarification"        // bot nunggu jawaban klarifikasi (varian/qty)
  | "awaiting_owner_confirmation";  // owner konfirmasi mutasi

export type PendingOwnerAction = {
  action:       "update_price" | "update_stock" | "set_reorder_point"
                | "deactivate_product" | "activate_product";
  product_id:   string;
  product_name: string;
  product_unit: string;
  new_value?:   number;  // nilai absolut baru
  delta?:       number;  // perubahan relatif stok (±) — mutually exclusive dengan new_value
};

// Slot-filling: diisi saat bot nunggu customer pilih varian atau isi jumlah
export type PendingClarification = {
  kind:         "variant" | "quantity";
  candidates:   Array<{ product_id: string; name: string; price: number; unit: string; stock: number }>;
  qty?:         number;          // diketahui (kasus variant)
  integer_only: boolean;         // unit diskret → qty harus bulat
  max_stock?:   number;          // batas qty (kasus out-of-stock)
  size:         string;
  notes:        string;
  resolved:     PendingOrderItem[]; // item sudah resolved sebelum klarifikasi ini
  retry_count:  number;          // jawaban gagal; ≥2 → arahkan katalog
};

export type Session = {
  state:                   SessionState;
  pending_order?:          PendingOrder;
  current_order_id?:       string;
  pending_saved_address?:  string;               // alamat tersimpan — set saat awaiting_address
  pending_owner_action?:   PendingOwnerAction;
  pending_clarification?:  PendingClarification; // hanya saat awaiting_clarification
  retry_count:             number;
  last_updated:            number;  // Date.now() — TTL 30 menit
};
```

### Urutan Check di Webhook (JANGAN DIUBAH)
```
1. State machine check DULU — sebelum Gemini
   awaiting_confirmation  → parseConfirmationIntent() → confirm → awaiting_address; cancel/ambiguous
   awaiting_address       → terima teks alamat → processOrderConfirmation(address)
   awaiting_clarification → handleClarificationAnswer() (parseClarificationInput di dalam)
   awaiting_payment       → QR resend keywords check; cancel → CANCELLED; else reminder
2. Owner vs Customer check (tenant.owner_phone === senderPhone)
3. Owner → handleOwnerCommand() (punya state machine sendiri, parseConfirmationIntent untuk confirm)
4. Customer → parseCustomerMessage() → intent router
```

### parseConfirmationIntent — Ganti CONFIRM_KEYWORDS/CANCEL_KEYWORDS
```typescript
// lib/ai/confirmation-parser.ts
// JANGAN pakai Set keyword matching — sudah DIHAPUS
// Signature: parseConfirmationIntent(text, context?: "customer" | "owner")
// Default context = "customer" (customer callers tidak perlu pass arg kedua)
// Owner caller WAJIB pass "owner" agar PENTING rule (product name → ambiguous) tidak berlaku
const signal = await parseConfirmationIntent(msgText);            // customer
const signal = await parseConfirmationIntent(text, "owner");     // owner mutation confirm
// signal: "confirm" | "cancel" | "ambiguous"
// Handle bahasa informal, typo, slang Indonesia via Gemini

// Untuk clarification (varian/qty):
// candidates = array objek dengan minimal field `name: string`
// Return: choices[] = [{index: number, qty?: number}], cancel: boolean
// Customer bisa jawab dengan angka, nama produk, atau multi-select sekaligus
const { choices, cancel } = await parseClarificationInput(
  msgText, kind, candidates, integerOnly, maxStock
);
// ClarificationChoice type di-export dari lib/ai/confirmation-parser.ts
```

---

## Payment Flow — Core API (BUKAN Snap)

### Kenapa Core API?
- Snap: return `redirect_url` → customer harus buka browser
- Core API: return `qr_string` → PNG → kirim langsung di WA

### Alur `processOrderConfirmation()` (di `lib/handlers/confirm-order.ts` — ✅ DONE)
```
1. getUserIdByPhone()             → userId
2. createQrisPayment({ totalAmount, customerPhone }) → { midtransId, paymentUrl, qrString }
   ← FAST-FAIL sebelum createOrder: tidak ada orphan order jika Midtrans gagal
   ← paymentUrl SELALU kosong untuk QRIS Core API (bukan Snap) — tidak ada redirect_url
   ← qrString = raw QRIS data string dari response Midtrans
3. createOrder(tenantId, userId, items, total) → orderId
4. updateOrderMidtrans(orderId, midtransId, paymentUrl)
5. QRCode.toBuffer(qrString) → Buffer PNG lokal (npm package `qrcode`)
   ← Generate lokal, bukan fetch dari Midtrans URL (URL sering return corrupt 1.7KB image)
6. uploadWhatsAppMedia(buffer, "image/png") → media_id
7. sendWhatsAppImageMessage(...) → cek result.success
   ← Jika success: TIDAK kirim teks lagi (hindari duplicate)
   ← Jika false: fallback ke paymentLinkMessage (teks + catatan "scan QR yang sudah dikirim")
8. sendWhatsAppMessage(owner_phone, notif)
9. setSession → awaiting_payment + current_order_id
```

### Sandbox QR — TIDAK bisa di-scan dengan app nyata
- `qr_string` sandbox berisi merchant ID sandbox — tidak terdaftar di jaringan QRIS produksi
- Real payment app (GoPay, OVO, DANA) → reject "merchant tidak ditemukan"
- **Cara simulate pembayaran sandbox:** buka `https://simulator.sandbox.midtrans.com/qris/index`
  → masukkan `order_id` (format `WA-XXXXXXXX-xxxx`) → klik Approve
  → Midtrans kirim callback ke `/api/webhook/midtrans` → order status → PAID ✅
- Untuk demo: scan QR tunjukkan ke juri bahwa QR muncul, lalu buka simulator untuk trigger PAID

### Midtrans Callback (`app/api/webhook/midtrans/route.ts`)
- Selalu return 200 — Midtrans retry jika dapat non-2xx
- Lookup via `getOrderByMidtransId()` (bukan internal id)
- Setelah PAID: `updateOrderStatus()` + `decrementProductStock()` per item

---

## Handler Patterns

### `handleOrderIntent` — Mapping `product_index`
```typescript
// lib/handlers/order-new.ts
import { getProductByName, createOrder } from "@/server/db";

for (const item of parsed.items) {
  const cached = products[item.product_index - 1]; // 1-based → 0-based
  if (!cached) continue;

  const db = await getProductByName(tenant.id, cached.name); // re-fetch: stok + harga terkini
  if (!db || db.stock < item.qty) { errors.push(...); continue; }

  resolvedItems.push({
    product_id: db.id, name: cached.name,
    qty: item.qty, unit: db.unit,        // unit dari DB
    size: item.size ?? "", notes: item.notes ?? "",
    price: db.price, subtotal: db.price * item.qty, // price dari DB, bukan cache
  });
}
```

### `handleCartOrder` — item_price SELALU STALE
```typescript
// JANGAN pakai cartItem.item_price — stale
const product = await getProductByRetailerId(tenant.id, cartItem.product_retailer_id);
```

---

## MVP Scope

| Jalur | Status | File |
|---|---|---|
| Cart dari WA Catalog | ✅ | `lib/handlers/cart-order.ts` |
| browse | ✅ | `lib/handlers/browse.ts` |
| order_status | ✅ | `lib/handlers/status.ts` |
| greeting | ✅ | `lib/response-template.ts` → `greetingMessage()` |
| handoff | ✅ | `lib/handlers/handoff.ts` |
| Owner commands (15 action) | ✅ | `lib/handlers/owner.ts` |
| order_new + slot-filling klarifikasi | ✅ | `lib/handlers/order-new.ts`, `lib/handlers/clarification.ts` |
| Payment QRIS end-to-end | ✅ | `lib/handlers/confirm-order.ts`, `lib/midtrans.ts` |
| Midtrans callback webhook | ✅ | `app/api/webhook/midtrans/route.ts` |
| Dashboard: home + orders + products + analytics | ✅ | `app/dashboard/`, `components/dashboard/` |
| All API routes (kpi, orders, products) | ✅ | `app/api/dashboard/`, `app/api/orders/` |
| cancel_order | ✅ | `lib/response-template.ts` → `cancelOrderMessage()` |
| repeat_last | ✅ | `lib/handlers/repeat-last.ts` → `handleRepeatLastIntent()` |
| Shipping address slot-filling | ✅ | `awaiting_address` state, `orders.notes` |
| Saved address (returning customer) | ✅ | `users.last_address`, `getUserWithAddress`, `addressConfirmMessage` |
| mark_paid owner command | ✅ | `lib/handlers/owner.ts` + stock decrement |
| Low-stock WA alert after PAID | ✅ | `app/api/webhook/midtrans/route.ts` |
| QR resend (awaiting_payment) | ✅ | `app/api/webhook/wa/route.ts` + `getMidtransQrString` |
| Session expiry UX message | ✅ | `lib/session.ts` → `peekExpiredSession` |
| Concurrent order guard | ✅ | `case "order_new"` guard in `app/api/webhook/wa/route.ts` |
| modify_order | ❌ post-MVP → handoff | — |

---

## Dashboard UI Design System

> Detail lengkap ada di `design.md`. Section ini hanya keputusan final yang harus dipatuhi.

### Warna Brand (WA-inspired)
```css
--color-primary:   #075E54   /* WA dark green — navbar, active state */
--color-accent:    #25D366   /* WA green — CTA, success badge */
--color-blue:      #00669E   /* info, link */
--color-warning:   #F59E0B   /* pending status */
--color-danger:    #EF4444   /* error, stok habis */
--color-bg:        #F0F2F5   /* background (WA chat bg feel) */
--color-surface:   #FFFFFF   /* card surface */
```

### Navigasi
- **Bottom navigation bar** — 4 tab (Beranda, Pesanan, Produk, Analitik) — navigasi utama
- **Hamburger drawer** — tetap ada untuk secondary items (settings, account, logout)
- Navbar title harus **dinamis per halaman** (bukan hardcoded "Beranda")
- `padding-bottom: 72px` di main content agar tidak tertutup bottom nav

### Komponen Rules
- `StatusBadge` "selesai" → green (`--color-accent`), bukan Bootstrap `bg-primary`
- `StatusBadge` "pending" → amber (`--color-warning`)
- `StatusBadge` "diproses" → blue (`--color-blue`)
- `KPICard` background → `--color-bg` (#F0F2F5)
- Font sizes: 12px label, 13px body, 14px subheading, 18px KPI value, 24px heading

### Halaman Stub (harus ada agar tidak 404)
- `/dashboard/settings` — stub "Segera Hadir"
- `/dashboard/account` — stub info tenant

---

## Remaining Items (per 7 Juni 2026)

### Critical — demo blocker
- [ ] Cloud Run deploy + update Meta Developer Console webhook URL
- [ ] End-to-end test bot dari WA real device setelah deploy
- [ ] Jalankan `scripts/delete-demo.sql` + `scripts/seed-demo.sql` di Supabase sebelum demo

### Fitur Baru (per 8 Juni 2026 sesi 1) ✅
- ✅ Multi-select clarification: customer bisa pilih beberapa varian sekaligus (`"kulot dan palazzo masing-masing 1"`)
- ✅ Natural language clarification: customer bisa sebut nama produk bukan hanya angka
- ✅ Dropped items feedback: item stok habis di multi-select → customer dapat notif nama produk yang dilewati
- ✅ Quantity mode fix: `choices[0].qty` tidak fallback ke `index` (silent wrong-qty bug)
- ✅ `clarificationOutOfStockMessage()` template baru di `lib/response-template.ts`
- ✅ `get_orders` owner command (15th action) — `getActiveOrdersForOwner()` DB function
- ✅ `parsePaymentStateIntent()` — fungsi terpisah untuk state `awaiting_payment` (bukan reuse confirmationParser)
- ✅ `confirmationPendingMessage()` tampil ringkasan order (items + total)
- ✅ `awaitingPaymentReminderMessage()` tampil order ID + total (fetch dari DB)
- ✅ `cancel_order` intent actually cancels AWAITING_PAYMENT order (bukan hanya info)
- ✅ Browse hardcoded "Olshop Kak Nina" → `${tenant.name}` dynamic
- ✅ Multi-item order loss bug fix: `resolvedItems` (post-loop) bukan `clarification.resolved` snapshot
- ✅ Owner confirmation bleeding fix: `parseConfirmationIntent(text, "owner")` — context param
- ✅ `handoffCustomerMessage()` + `handoffOwnerAlertMessage()` templates (move hardcode dari handoff.ts)
- ✅ `modifyOrderInConfirmationMessage()` + `modifyOrderHandoffMessage()` templates

### Fitur Baru (per 7 Juni 2026 sesi 2) ✅
- ✅ `confirmationParser` fix: pesan dengan nama produk/kata "tambah" → selalu `ambiguous` (bukan `confirm`)
- ✅ Saved address: `users.last_address` column + `getUserWithAddress` + `updateUserLastAddress`
- ✅ Session field `pending_saved_address?: string` → clear saat transisi ke `awaiting_payment`
- ✅ `addressConfirmMessage(savedAddress)` template (include opsi *batal*)
- ✅ `awaiting_address` handler: returning customer → konfirmasi saved address; first-time → minta baru
- ✅ Address persisted fire-and-forget; skip write jika tidak berubah

### Bug Fixes (per 8 Juni 2026 sesi 2) ✅
- ✅ `awaiting_address` first-time customer cancel path — `parseConfirmationIntent` di else branch sebelum terima teks sebagai alamat
- ✅ `mark_paid` + Midtrans PAID callback: `clearSession(tenant.id, customer.phone)` setelah notif customer → cegah cancel PAID order
- ✅ `peekExpiredSession`: `return` setelah `sessionExpiredMessage` → cegah double response
- ✅ `upsertCustomer` skip untuk `tenant.owner_phone === senderPhone` → cegah role OWNER jadi CUSTOMER di DB
- ✅ Midtrans expire/cancel: `clearSession` + kirim `orderExpiredMessage()` ke customer
- ✅ `storeClosedMessage`: format ISO timestamp ke bahasa Indonesia via `toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })`
- ✅ `repeat_last` qty truncation: track `adjustedItemNotes` → tampil via `orderConfirmationMessage` param ke-4
- ✅ `missing_qty`/`invalid_qty` else branch di `order-new.ts`: item ke-2+ masuk `notFoundNames` bukan silent drop
- ✅ Hardcoded WA strings di `owner.ts` + `midtrans/route.ts` → extract ke `response-template.ts`

### Bug & Architecture — SELESAI ✅
- ✅ Architecture violations: inline `supabaseAdmin` di routes/handlers → extract ke `server/db/`
- ✅ `activate_product` bug: fetch all products incl. inactive
- ✅ `processOrderConfirmation` try-catch
- ✅ Partial stock decrement per-item catch
- ✅ `repeat_last` intent: full handler + DB function
- ✅ `cancel_order` intent: dedicated template
- ✅ Midtrans sandbox key wrong → fix `.env.local` dengan key dari dashboard.sandbox.midtrans.com
- ✅ Orphan order jika Midtrans fail → reorder: `createQrisPayment` sebelum `createOrder`
- ✅ `qrSent = true` unconditional → cek `result.success` dari `sendWhatsAppImageMessage`
- ✅ Midtrans QR image URL butuh auth → tambah `Authorization: Basic` header di fetch
- ✅ `uploadWhatsAppMedia` pakai Web API FormData → ganti npm `form-data` package
- ✅ `paymentLinkMessage` leading whitespace + empty URL → fix template literal + guard URL kosong
- ✅ `awaiting_confirmation` fallback message → `confirmationPendingMessage()` template
- ✅ Keyword matching (CONFIRM/CANCEL_KEYWORDS, extractNumber) → replaced dengan AI (`parseConfirmationIntent`, `parseClarificationInput`)
- ✅ Memory leak: `cleanupExpiredSessions()` tidak pernah dipanggil → counter-based cleanup setiap 50 request
- ✅ Orphan order rollback: `deleteOrder()` saat `updateOrderMidtrans` gagal setelah `createOrder`
- ✅ Session ordering: `setSession(awaiting_payment)` dipindah sebelum notif owner (fire-and-forget)
- ✅ `handleStatusIntent`: tampil items + total, skip CANCELLED
- ✅ Shipping address slot-filling: `awaiting_address` state, store di `orders.notes`
- ✅ `mark_paid` owner command: manual payment confirmation + stock decrement
- ✅ Low-stock WA alert setelah Midtrans PAID callback
- ✅ QR resend: customer `awaiting_payment` bisa minta kirim ulang QR
- ✅ Session expiry UX: `peekExpiredSession` + `sessionExpiredMessage`
- ✅ Concurrent order guard: blokir `order_new` jika ada AWAITING_PAYMENT
- ✅ `deleteOrder` cascade items dulu (fix FK violation)
- ✅ Extract hardcoded cancel strings ke `orderCancelledMessage()` template

### Dashboard UI — SELESAI ✅
- ✅ Bottom navigation bar + dynamic navbar title
- ✅ `design.md` + `globals.css` fix
- ✅ `StatusBadge` color fix, `KPICard` bg fix
- ✅ Stub pages: `/dashboard/settings`, `/dashboard/account`
- ✅ `/dashboard/orders` error state + retry button

### Nice-to-have
- [ ] Toast notifications untuk aksi (finish order)
- [ ] Empty states saat data kosong
- [ ] `GET /api/orders/[id]` — masih 501
- [ ] Upload product images ke Supabase Storage
- [ ] KPI `change` prop (perbandingan periode)

### Post-Hackathon
- Auth Opsi B: magic link JWT via `jose`
- Meta Catalog full setup
- Redis session (sekarang in-memory Map)

---

## Prinsip Kode Berkelanjutan (Sustainable Codebase)

### Layer Separation — Aturan Wajib

Setiap layer punya satu tanggung jawab. **Jangan campur.**

| Layer | Lokasi | Boleh | Tidak Boleh |
|---|---|---|---|
| **DB queries** | `server/db/*.ts` | `supabaseAdmin.*`, return typed rows | Logic bisnis, formatting |
| **Business logic** | `lib/handlers/*.ts`, `lib/owner/*.ts` | Import dari `@/server/db`, kirim WA | `supabaseAdmin.*` langsung |
| **API routes** | `app/api/**` | Orchestrate handlers, return JSON | DB query langsung, business logic |
| **AI/LLM** | `lib/ai/*.ts`, `lib/owner/*.ts` | Model calls, Zod parse | DB calls, WA send |
| **Templates** | `lib/response-template.ts` | Pure string functions | Import apapun selain tipe |

**Aturan check:** Jika kamu menulis `supabaseAdmin.from(...)` di luar `server/db/`, itu salah.
**Cara benar:** Buat fungsi baru di `server/db/`, export dari `server/db/index.ts`, import via `@/server/db`.

### Menambah Fungsi DB Baru

1. Tulis fungsi di file relevan di `server/db/` (bukan file baru kecuali domain benar-benar baru)
2. Return type eksplisit — jangan `any`, jangan rely pada inference Supabase yang lebar
3. Export dari `server/db/index.ts`
4. Import di handler via `@/server/db` (bukan path langsung ke `server/db/orders.ts` dll)

```typescript
// ✅ Benar
// server/db/tenants.ts
export async function getTenantById(
  tenantId: string
): Promise<{ name: string; owner_phone: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants").select("name, owner_phone").eq("id", tenantId).single();
  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getTenantById:", error.message);
    return null;
  }
  return data;
}
// server/db/index.ts — tambahkan export
export { getTenantById } from "./tenants";

// app/api/*/route.ts atau lib/handlers/*.ts
import { getTenantById } from "@/server/db";  // ✅ bukan "@/server/db/tenants"
```

### Error Handling — Standar

```typescript
// Handler: tangani error + kirim feedback ke customer
try {
  await riskyOperation();
} catch (err) {
  console.error("[Handler/context] Error:", err);
  await sendWhatsAppMessage(senderPhone, "Terjadi kesalahan, coba lagi ya kak 🙏");
  return;
}

// DB read: log + return null (jangan throw)
if (error) {
  if (error.code !== "PGRST116") console.error("[DB] functionName:", error.message);
  return null;
}

// DB mutation kritis (createOrder, updateOrderMidtrans): throw — agar caller bisa handle
if (error) throw new Error(`[DB] createOrder: ${error.message}`);
```

### Response Templates

Semua string pesan WA → `lib/response-template.ts`. **Tidak boleh** ada string pesan hardcoded di handler atau route.

```typescript
// ❌ Salah — hardcode di handler
await sendWhatsAppMessage(phone, "Pesananmu dibatalkan ya kak 👍 Ketik *menu* ...");

// ✅ Benar — fungsi di lib/response-template.ts
export function cancelledMessage(): string { return "Pesananmu dibatalkan ya kak 👍 ..."; }
// Lalu di handler:
await sendWhatsAppMessage(phone, cancelledMessage());
```

### Menambah Intent Baru

Wajib update **3 tempat sekaligus**:
1. `lib/ai/models.ts` — `systemInstruction` + `responseSchema.enum`
2. `lib/ai/customer-parser.ts` — `ParsedIntentSchema` Zod enum
3. `app/api/webhook/wa/route.ts` — tambah `case` di switch

Wajib tambah **handler file** di `lib/handlers/` (satu file per intent besar).

---

## Anti-Patterns — Jangan Lakukan Ini

```
❌ supabaseAdmin.from(...) di luar server/db/ → buat fungsi di server/db/, export dari index.ts
❌ Import DB queries dari @/lib/db → pakai @/server/db
❌ Import langsung dari server/db/orders.ts → import dari @/server/db (via index.ts)
❌ String pesan WA hardcode di handler → pakai fungsi dari lib/response-template.ts
❌ product_name di responseSchema → pakai product_index (integer)
❌ SchemaType.INTEGER untuk qty → pakai SchemaType.NUMBER
❌ Zod .int() untuk qty → pakai .positive() saja
❌ Midtrans Snap API → pakai Core API
❌ Web API FormData untuk upload media → pakai npm package form-data
❌ Redis untuk session → in-memory Map + --max-instances=1
❌ product.price untuk order total → pakai price_at_order (snapshot)
❌ item_price dari Meta Cart payload → stale, re-fetch dari DB
❌ "50x" untuk sold quantity → pakai "${sold} ${unit}"
❌ SUM(qty) tanpa unit → rank top produk by revenue (Rupiah) bukan qty
❌ ORDER BY random di getActiveProducts → wajib ORDER BY name ASC
❌ NEXT_PUBLIC_SUPABASE_URL dengan trailing /rest/v1/ → hanya base URL
❌ META_PHONE_NUMBER_ID berisi nomor HP → isi Meta Phone Number ID dari dashboard
❌ Update intent di customer-parser.ts saja → WAJIB update models.ts (systemInstruction + enum) sekaligus
❌ Tambah fungsi DB baru tanpa export di server/db/index.ts → handler tidak bisa import
❌ Pass kolom `id` di seed/test INSERT → biarkan DB generate via DEFAULT gen_random_uuid()
❌ ON CONFLICT (tenant_id, phone) di SEED SCRIPT → seed harus DELETE dulu; tapi di upsertCustomer (aplikasi) ini VALID karena constraint ada
❌ Web API FormData + Blob untuk uploadWhatsAppMedia → pakai npm `form-data` + `form.getBuffer()` + `form.getHeaders()`
❌ sendWhatsAppImageMessage return diabaikan → WAJIB cek `result.success`; fungsi tidak throw, hanya return { success: false }
❌ fetch(midtrans_qr_url) untuk QR image → URL Midtrans return corrupt ~1.7KB; pakai `qr_string` dari response + npm `qrcode` generate PNG lokal
❌ Scan QR sandbox dengan app nyata (GoPay/OVO/DANA) → merchant sandbox tidak di jaringan QRIS produksi; simulate via simulator.sandbox.midtrans.com/qris/index
❌ owner_phone dengan `+` prefix di DB → format wajib `628xxx` tanpa `+` (verified: 6287715781238 ✅)
❌ owner_phone diisi nomor WA Business → harus nomor personal owner (beda dari META_PHONE_NUMBER_ID)
❌ Meta test mode: kirim WA ke nomor yang belum pernah chat bot → harus tambah sebagai test recipient di Meta Developer Console (WhatsApp → API Setup → "To" field) ATAU nomor harus kirim pesan ke bot dulu dalam 24 jam
❌ CONFIRM_KEYWORDS / CANCEL_KEYWORDS Set → DIHAPUS, pakai parseConfirmationIntent() dari lib/ai/confirmation-parser.ts
❌ extractNumber regex untuk clarification → DIHAPUS, pakai parseClarificationInput() dari lib/ai/confirmation-parser.ts
❌ lib/constants/confirmation-keywords.ts → FILE SUDAH DIHAPUS, jangan import lagi
❌ Keyword matching untuk input apapun dari customer → SELALU pakai AI model (Gemini) untuk semua parsing
❌ parseClarificationInput dengan candidateCount: number → signature lama, SUDAH DIGANTI ke candidates: Array<{name: string}>
❌ parseClarificationInput return {choice, cancel} → return lama, SUDAH DIGANTI ke {choices: ClarificationChoice[], cancel}
❌ parseConfirmationIntent(text) untuk owner confirm → WAJIB pass context "owner": parseConfirmationIntent(text, "owner"); tanpa context, PENTING rule (product name → ambiguous) bleeding ke owner flow
❌ Owner Command count "11 action" atau "14 action" → sudah 15 action (tambah get_orders)
❌ `getActiveOrdersForOwner` import langsung dari server/db/orders.ts → import dari @/server/db (via index.ts)
❌ `await upsertCustomer(tenant.id, senderPhone)` tanpa cek owner → gunakan `if (tenant.owner_phone !== senderPhone)` wrapper
❌ `peekExpiredSession` tanpa `return` setelah send expired message → customer dapat double response
❌ `clearSession` tidak dipanggil setelah order PAID (`mark_paid` + Midtrans callback) → customer bisa cancel PAID order
❌ `Math.min(item.qty, stock)` di repeat_last tanpa notif → pakai `adjustedItemNotes` + kirim via `orderConfirmationMessage` param ke-4
❌ `case "missing_qty"` tanpa else branch → item ke-2+ silently dropped; pakai `notFoundNames.push(result.candidate.name)` di else
```

### Prinsip Natural Language — NO KEYWORD MATCHING

**WAssist harus bisa memahami pesan customer secara natural. Jangan pakai keyword/regex matching.**

| Parsing | ❌ Jangan | ✅ Pakai |
|---|---|---|
| Konfirmasi/batal | `Set<string>` CONFIRM_KEYWORDS | `parseConfirmationIntent()` |
| Jawaban clarification (varian/qty) | `parseInt`, `extractNumber` regex | `parseClarificationInput()` |
| Intent pesan customer | `if (msg.includes("pesan"))` | `parseCustomerMessage()` |
| Perintah owner | Manual string check | `parseOwnerCommand()` |

**`parseClarificationInput` sekarang support:**
- Angka: `"1"`, `"nomor 2"`
- Nama produk: `"yang kulot"`, `"celana palazzo"`
- Multi-select: `"kulot dan palazzo masing-masing 1"`
- Kata ordinal: `"yang pertama"`, `"keduanya"`
- Batal: `"gak jadi"`, `"batal"`

---

## Quick Commands

```bash
npm run dev                  # local dev
npm run build                # verifikasi TypeScript sebelum deploy
npx tsx scripts/test-intent.ts  # test Gemini

gcloud run deploy wassist \
  --source . --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances=1 --max-instances=1
```

---

## Referensi

| File | Isi |
|---|---|
| `progress.md` | **BACA PERTAMA** — task tracker: selesai, bug, todo per sesi |
| `design.md` | Design system: warna, tipografi, komponen rules, spacing |
| `notes/00-overview.md` | Big picture, tim, stack, bobot juri |
| `notes/03-ai-llm.md` | Gemini, prompt engineering |
| `notes/05-order-flow.md` | State machine, handler MVP |
| `notes/07-payment.md` | Midtrans Core API, QR image flow |
| `notes/08-deployment.md` | Dockerfile, GCP Cloud Run |
| `notes/09-demo-and-timeline.md` | Script demo, Q&A juri |
