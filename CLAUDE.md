# CLAUDE.md — WAssist Project Context
> Last updated: 31 Mei 2026

---

## Apa Ini

WAssist adalah platform otomasi pemesanan berbasis WhatsApp untuk UMKM Indonesia.
Customer chat ke nomor WA bisnis → bot AI (Gemini) proses pesanan → generate QRIS → notif owner.
**Hackathon:** Gunadarma Code Week 2.0, deadline submit 5 Juli 2026 malam.
**Demo tenant:** Olshop Kak Nina (fashion store, 15 produk, `tenant_id: 00000000-0000-0000-0000-000000000001`).

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

# Midtrans Sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
MIDTRANS_IS_PRODUCTION=false

# Auth
JWT_SECRET=random-secret-min-32-chars
NEXT_PUBLIC_APP_URL=http://localhost:3000
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
│   │       ├── kpi/routes.ts         ← omzet, order count, AOV
│   │       └── handoff/routes.ts     ← list percakapan needs manual reply
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
│       │                                setProductActive, decrementProductStock
│       ├── orders.ts                 ← createOrder, updateOrderMidtrans, updateOrderStatus,
│       │                                getOrderByMidtransId, getLatestOrderByCustomer
│       ├── users.ts                  ← upsertCustomer, getUserIdByPhone
│       ├── tenants.ts                ← getTenantByWaPhoneId, setStoreStatus
│       ├── analytics.ts              ← queryRevenueData, RevenueData type, parsePeriod
│       └── index.ts                  ← re-export semua → import dari @/server/db
├── lib/                              # Pure utilities — NO DB queries di sini
│   ├── ai/
│   │   ├── models.ts                 ← parserModel, ownerParserModel, generatorModel
│   │   └── customer-parser.ts        ← parseCustomerMessage, buildCustomerIntentPrompt
│   ├── constants/
│   │   └── confirmation-keywords.ts  ← CONFIRM_KEYWORDS, CANCEL_KEYWORDS (Set)
│   ├── handlers/
│   │   ├── browse.ts                 ← handleBrowseIntent()
│   │   ├── cart-order.ts             ← handleCartOrder() dari WA Catalog
│   │   ├── status.ts                 ← handleStatusIntent()
│   │   ├── handoff.ts                ← handleHandoffIntent()
│   │   ├── owner.ts                  ← handleOwnerCommand() dispatcher
│   │   ├── order-new.ts              ← handleOrderIntent() — TODO: webhook belum connect
│   │   ├── cancel-order.ts           ← post-MVP
│   │   ├── repeat-last.ts            ← post-MVP
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
│   ├── session.ts                    ← in-memory session store (Map, TTL 30 menit)
│   ├── whatsapp.ts                   ← sendWhatsAppMessage, sendCatalogMessage,
│   │                                    uploadWhatsAppMedia, sendWhatsAppImageMessage
│   ├── midtrans.ts                   ← createQrisPayment, verifyMidtransSignature
│   ├── response-template.ts          ← orderConfirmationMessage, dll
│   └── utils.ts
├── scripts/
│   └── test-intent.ts
└── next.config.ts                    ← WAJIB: output: "standalone"
```

---

## Database Schema (Key Points)

### Tabel `products`
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,              -- Rupiah bulat, BUKAN float
  stock NUMERIC(10,3) NOT NULL DEFAULT 0, -- NUMERIC: support 2.5 kg, 0.5 L
  unit TEXT NOT NULL DEFAULT 'pcs',
  reorder_point NUMERIC NOT NULL DEFAULT 0, -- batas minimum stok sebelum alert
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta_retailer_id TEXT,               -- slug ke Meta Catalog, IMMUTABLE setelah di-set
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Tabel `order_items`
```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  price_at_order INTEGER NOT NULL,  -- SNAPSHOT harga saat order
  unit TEXT NOT NULL DEFAULT 'pcs', -- snapshot satuan
  size TEXT, notes TEXT
);
```

### Status Flow Orders
```
PENDING → AWAITING_PAYMENT → PAID → FULFILLED → DONE
CANCELLED ← (dari PENDING saja)
```
- `midtrans_id` — format `WA-XXXXXXXX-xxxx`, untuk reconcile callback
- `midtrans_payment_url` — fallback URL jika QR image gagal dikirim

### TypeScript Types (`lib/types/db.ts`)
```typescript
export type DbProduct = Tables<"products">;
export type DbOrder = Omit<Tables<"orders">, "status" | "payment_status"> & {
  status: "PENDING" | "CONFIRMED" | "AWAITING_PAYMENT" | "PAID" | "FULFILLED" | "DONE" | "CANCELLED";
  payment_status: "UNPAID" | "PAID" | "REFUNDED" | "FAILED";
};
```

---

## AI/LLM Architecture — 3 Model Gemini

### Tiga Model, Tiga Tujuan (semua di `lib/ai/models.ts`)

| | `customerParserModel` | `ownerParserModel` | `generatorModel` |
|---|---|---|---|
| Dipakai | Parse pesan customer | Parse perintah owner | Narasi analytics owner |
| Output | `ParsedIntent` (JSON schema) | `OwnerCommand` (JSON schema) | Free-form teks |
| Temperature | 0.1 | 0.1 | 0.4 |

> ⚠️ Verifikasi nama model di https://aistudio.google.com SEBELUM coding. String `gemini-3.1-flash-lite` valid per Mei 2026.

### Customer Intent — 7 Intent (`lib/ai/customer-parser.ts`)
```
order_new       → customer ingin pesan produk baru
browse          → ingin lihat katalog
order_status    → tanya status pesanan
repeat_last     → post-MVP → low_confidence
modify_order    → post-MVP → low_confidence
cancel_order    → post-MVP → low_confidence
low_confidence  → tidak jelas / di luar konteks → handoff ke owner
```

### Owner Command — 11 Action (`lib/owner/parser.ts`)
```
get_revenue        → omzet / laporan → queryRevenueData + Gemini narasi
get_stock          → cek stok
update_price       ← BUTUH KONFIRMASI
update_stock       ← BUTUH KONFIRMASI
set_reorder_point  ← BUTUH KONFIRMASI
deactivate_product ← BUTUH KONFIRMASI
activate_product   ← BUTUH KONFIRMASI
open_store         → langsung, tanpa konfirmasi
close_store        → langsung, tanpa konfirmasi
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
  | "awaiting_payment"              // customer sedang bayar QRIS
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

export type Session = {
  state:                  SessionState;
  pending_order?:         PendingOrder;
  current_order_id?:      string;
  pending_owner_action?:  PendingOwnerAction;
  retry_count:            number;
  last_updated:           number;  // Date.now() — TTL 30 menit
};
```

### Urutan Check di Webhook (JANGAN DIUBAH)
```
1. State machine check DULU — sebelum Gemini
   awaiting_confirmation → cek CONFIRM/CANCEL keywords
   awaiting_payment      → resend payment reminder
2. Owner vs Customer check (tenant.owner_phone === senderPhone)
3. Owner → handleOwnerCommand() (punya state machine sendiri)
4. Customer → parseCustomerMessage() → intent router
```

### CONFIRM_KEYWORDS / CANCEL_KEYWORDS — Gunakan `.has()` dengan normalize
```typescript
// Normalize dulu: text.toLowerCase().trim()
CONFIRM_KEYWORDS.has(normalized)  // "ya", "iya", "ok", "gas", "gaskeun", dll
CANCEL_KEYWORDS.has(normalized)   // "batal", "tidak", "gak", "cancel", dll
```

---

## Payment Flow — Core API (BUKAN Snap)

### Kenapa Core API?
- Snap: return `redirect_url` → customer harus buka browser
- Core API: return `qr_string` → PNG → kirim langsung di WA

### Alur `processOrderConfirmation()` (di `lib/midtrans.ts` — TODO)
```
1. upsertCustomer()               → userId          (dari @/server/db)
2. createOrder(tenantId, userId, items, total) → orderId
3. coreApi.charge({ payment_type: "qris" })   → qr_string
4. updateOrderMidtrans(orderId, ...)
5. generateQrisImage(qr_string)   → PNG Buffer
6. uploadWhatsAppMedia(buffer)    → media_id
7. sendWhatsAppImageMessage(...)  → [try/catch: fallback ke text URL]
8. sendWhatsAppMessage(owner_phone, notif)
9. clearSession()
```

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
| handoff | ✅ | `lib/handlers/handoff.ts` |
| Owner commands (11 action) | ✅ | `lib/handlers/owner.ts` |
| order_new (teks natural) | ⚠️ Handler ada, webhook belum connect | `lib/handlers/order-new.ts` |
| cancel_order | ❌ Cut → low_confidence | post-MVP |
| repeat_last | ❌ Cut → low_confidence | post-MVP |
| modify_order | ❌ Cut → low_confidence | post-MVP |

---

## Anti-Patterns — Jangan Lakukan Ini

```
❌ Import DB queries dari @/lib/db → pakai @/server/db
❌ Inline supabaseAdmin query di handler → pakai fungsi dari @/server/db
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
```

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
| `notes/00-overview.md` | Big picture, tim, stack, bobot juri |
| `notes/03-ai-llm.md` | Gemini, prompt engineering |
| `notes/05-order-flow.md` | State machine, handler MVP |
| `notes/07-payment.md` | Midtrans Core API, QR image flow |
| `notes/08-deployment.md` | Dockerfile, GCP Cloud Run |
| `notes/09-demo-and-timeline.md` | Script demo, Q&A juri |
