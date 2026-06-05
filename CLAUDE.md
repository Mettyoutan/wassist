# CLAUDE.md — WAssist Project Context
> Last updated: 4 Juni 2026

---

## Apa Ini

WAssist adalah platform otomasi pemesanan berbasis WhatsApp untuk UMKM Indonesia.
Customer chat ke nomor WA bisnis → bot AI (Gemini) proses pesanan → generate QRIS → notif owner.
**Hackathon:** Gunadarma Code Week 2.0, deadline submit **11 Juni 2026**. Target WAssist selesai: **8 Juni 2026** (buffer 3 hari).
**Demo tenant:** Toko Olshop Mbak Rina (fashion store, 16 produk, `tenant_id: 3b0a38de-811c-40b5-af83-c866e198da12`, `owner_phone: +6285196133302`).

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
│       │                                setProductActive, decrementProductStock
│       ├── orders.ts                 ← createOrder, updateOrderMidtrans, updateOrderStatus,
│       │                                getOrderByMidtransId, getLatestOrderByCustomer,
│       │                                getOrderItemsByOrderId
│       ├── users.ts                  ← upsertCustomer, getUserIdByPhone, getUserById
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
│   │   ├── order-new.ts              ← handleOrderIntent() — slot-filling, guard toko tutup
│   │   ├── clarification.ts          ← handleClarificationAnswer() — jawaban varian/qty
│   │   ├── confirm-order.ts          ← processOrderConfirmation() — Midtrans QRIS + WA
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

### Customer Intent — 8 Intent (`lib/ai/customer-parser.ts`)
```
order_new       → customer ingin pesan produk baru
browse          → ingin lihat katalog
order_status    → tanya status pesanan
greeting        → sapaan tanpa intent belanja → template sambutan
repeat_last     → post-MVP → low_confidence
modify_order    → post-MVP → low_confidence
cancel_order    → post-MVP → low_confidence
low_confidence  → tidak jelas / di luar konteks → handoff ke owner
```

> ⚠️ Perubahan intent WAJIB update 3 tempat sekaligus:
> 1. `lib/ai/models.ts` — `systemInstruction` + `responseSchema.enum`
> 2. `lib/ai/customer-parser.ts` — `ParsedIntentSchema` Zod enum
> 3. `app/api/webhook/wa/route.ts` — `case` baru di switch

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
  state:                  SessionState;
  pending_order?:         PendingOrder;
  current_order_id?:      string;
  pending_owner_action?:  PendingOwnerAction;
  pending_clarification?: PendingClarification; // hanya saat awaiting_clarification
  retry_count:            number;
  last_updated:           number;  // Date.now() — TTL 30 menit
};
```

### Urutan Check di Webhook (JANGAN DIUBAH)
```
1. State machine check DULU — sebelum Gemini
   awaiting_confirmation  → cek CONFIRM/CANCEL keywords → processOrderConfirmation
   awaiting_clarification → cek CANCEL → handleClarificationAnswer
   awaiting_payment       → resend payment reminder
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

### Alur `processOrderConfirmation()` (di `lib/handlers/confirm-order.ts` — ✅ DONE)
```
1. getUserIdByPhone()             → userId
2. createOrder(tenantId, userId, items, total) → orderId
3. createQrisPayment({ totalAmount, customerPhone }) → { midtransId, paymentUrl, qrImageUrl }
4. updateOrderMidtrans(orderId, midtransId, paymentUrl)
5. fetch(qrImageUrl) → Buffer → uploadWhatsAppMedia → media_id
6. sendWhatsAppImageMessage(...)  → [try/catch: fallback ke paymentLinkMessage]
7. sendWhatsAppMessage(owner_phone, notif)
8. setSession → awaiting_payment + current_order_id
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
| greeting | ✅ | `lib/response-template.ts` → `greetingMessage()` |
| handoff | ✅ | `lib/handlers/handoff.ts` |
| Owner commands (11 action) | ✅ | `lib/handlers/owner.ts` |
| order_new + slot-filling klarifikasi | ✅ | `lib/handlers/order-new.ts`, `lib/handlers/clarification.ts` |
| Payment QRIS end-to-end | ✅ | `lib/handlers/confirm-order.ts`, `lib/midtrans.ts` |
| Midtrans callback webhook | ✅ | `app/api/webhook/midtrans/route.ts` |
| Dashboard: home + orders + products + analytics | ✅ | `app/dashboard/`, `components/dashboard/` |
| All API routes (kpi, orders, products) | ✅ | `app/api/dashboard/`, `app/api/orders/` |
| cancel_order | ❌ Cut → low_confidence | post-MVP |
| repeat_last | ❌ Cut → low_confidence | post-MVP |
| modify_order | ❌ Cut → low_confidence | post-MVP |

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

## Remaining Items (per 4 Juni 2026)

### Critical (demo blocker)
- **ngrok + Meta webhook setup** sebelum demo
- End-to-end test bot dari WA real device
- Seed demo data (order PAID, stok bervariasi)

### Dashboard UI
- ✅ Bottom navigation bar + dynamic navbar title
- ✅ `design.md` + `globals.css` fix (duplicate import, unified tokens)
- ✅ `StatusBadge` color fix (selesai→green, diproses→blue, pending→amber)
- ✅ `KPICard` background fix
- ✅ Stub pages: `/dashboard/settings`, `/dashboard/account`
- [ ] Toast notifications untuk aksi (finish order, dll)
- [ ] Empty states saat data kosong

### Nice-to-have
- `GET /api/orders/[id]` — masih 501
- Upload product images ke Supabase Storage
- KPI `change` prop (prior-period comparison)

### Post-Hackathon
- Auth Opsi B: magic link JWT via `jose`
- Meta Catalog full setup
- Cloud Run deploy

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
| `progress.md` | **BACA PERTAMA** — task tracker: selesai, bug, todo per sesi |
| `design.md` | Design system: warna, tipografi, komponen rules, spacing |
| `notes/00-overview.md` | Big picture, tim, stack, bobot juri |
| `notes/03-ai-llm.md` | Gemini, prompt engineering |
| `notes/05-order-flow.md` | State machine, handler MVP |
| `notes/07-payment.md` | Midtrans Core API, QR image flow |
| `notes/08-deployment.md` | Dockerfile, GCP Cloud Run |
| `notes/09-demo-and-timeline.md` | Script demo, Q&A juri |
