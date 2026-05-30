# CLAUDE.md — WAssist Project Context
> Copy file ini ke root folder Next.js project sebagai `CLAUDE.md`.
> Claude Code akan membacanya otomatis di setiap session.
> Last updated: 29 Mei 2026

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
| Framework | Next.js 14 App Router (monorepo) | API routes + React dalam satu project |
| AI Parser | `gemini-2.0-flash` + `responseSchema` | Verifikasi nama exact di AI Studio sebelum code |
| AI Generator | `gemini-2.5-flash-lite` | Free-form text, owner analytics only |
| Database | PostgreSQL via Supabase | `supabaseAdmin` dengan service role key |
| Session | In-memory `Map` di Node.js | **Bukan Redis** — `--max-instances=1` di Cloud Run |
| Payment | Midtrans **Core API** (bukan Snap) | Core API return `qr_string` untuk QR image |
| WA API | Meta WhatsApp Cloud API v19.0 | |
| Deploy | Google Cloud Run, `asia-southeast1` | `--min-instances=1 --max-instances=1` |

---

## Environment Variables yang Dibutuhkan

```env
# .env.local
GEMINI_API_KEY="AIzaSy..."
USE_MOCK_LLM="true"            # "false" saat test dengan Gemini nyata

NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJxxx"

WHATSAPP_TOKEN="EAAxxxxx"      # Meta permanent token
WHATSAPP_PHONE_NUMBER_ID="xxx" # Phone Number ID dari Meta dashboard
META_VERIFY_TOKEN="wassist-verify-xxx"
META_CATALOG_ID="xxx"          # Catalog ID di Commerce Manager (opsional, untuk WA Catalog)

MIDTRANS_SERVER_KEY="SB-Mid-server-xxx"
MIDTRANS_CLIENT_KEY="SB-Mid-client-xxx"

JWT_SECRET="random-secret-min-32-chars"
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # ganti Cloud Run URL saat deploy
```

---

## Struktur Folder

```
wassist/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   ├── wa/route.ts          ← ENTRY POINT semua pesan WA (GET verify + POST handler)
│   │   │   └── midtrans/route.ts    ← payment callback dari Midtrans
│   │   ├── orders/
│   │   │   ├── route.ts             ← GET list orders (dashboard)
│   │   │   └── [id]/route.ts        ← GET detail order
│   │   ├── products/route.ts        ← GET/POST/PATCH produk
│   │   ├── dashboard/
│   │   │   ├── kpi/route.ts         ← omzet, order count, AOV
│   │   │   └── handoff/route.ts     ← list percakapan needs manual reply
│   │   └── auth/magic-link/route.ts ← generate JWT untuk dashboard
│   ├── dashboard/                   ← React UI untuk owner
│   └── ...
├── lib/
│   ├── gemini.ts                    ← parserModel + generatorModel (dual model)
│   ├── intent-parser.ts             ← parseCustomerMessage(), buildCustomerIntentPrompt()
│   ├── owner-generator.ts           ← generateRevenueResponse() via Model 2
│   ├── response-templates.ts        ← semua template teks WA (orderConfirmationMessage dll)
│   ├── db.ts                        ← supabaseAdmin client
│   ├── session.ts                   ← in-memory session store
│   ├── whatsapp.ts                  ← sendWhatsAppMessage(), sendCatalogMessage(),
│   │                                   uploadWhatsAppMedia(), sendWhatsAppImageMessage()
│   ├── midtrans.ts                  ← createQrisPayment(), verifyMidtransSignature(),
│   │                                   processOrderConfirmation()
│   ├── qr-generator.ts              ← generateQrisImage() via qrcode package
│   ├── product-cache.ts             ← getProductsForPrompt() dengan TTL 5 menit
│   ├── product-filter.ts            ← filterRelevantProducts() untuk katalog besar
│   ├── utils.ts                     ← toRetailerId() dan helper lain
│   ├── constants/
│   │   └── confirmation-keywords.ts ← CONFIRM_KEYWORDS, CANCEL_KEYWORDS (Set)
│   ├── types/
│   │   ├── index.ts                 ← barrel re-export
│   │   ├── whatsapp.ts              ← WA webhook types
│   │   ├── tenant.ts                ← Tenant type
│   │   ├── session.ts               ← Session, PendingOrder, PendingOrderItem
│   │   └── db.ts                    ← DbTenant, DbProduct, DbOrder, DbOrderItem, DbUser
│   └── handlers/
│       ├── order.ts                 ← handleOrderIntent() + processOrderConfirmation() import
│       ├── cart-order.ts            ← handleCartOrder() dari WA Catalog
│       ├── browse.ts                ← handleBrowseIntent()
│       ├── status.ts                ← handleStatusIntent()
│       ├── handoff.ts               ← handleHandoff()
│       ├── owner.ts                 ← handleOwnerCommand() dispatcher
│       ├── cancel-order.ts          ← post-MVP
│       ├── repeat-last.ts           ← post-MVP
│       └── modify-order.ts          ← post-MVP (butuh breaking schema change)
├── scripts/
│   └── test-gemini.ts               ← test koneksi Gemini (jalankan: npx tsx scripts/test-gemini.ts)
└── next.config.js                   ← WAJIB: output: "standalone"
```

---

## Database Schema (Key Points)

### Tabel `products`
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,              -- Rupiah bulat, BUKAN float
  stock NUMERIC(10,3) NOT NULL DEFAULT 0, -- NUMERIC bukan INTEGER: support 2.5 kg, 0.5 L
  unit TEXT NOT NULL DEFAULT 'pcs',    -- "pcs", "kg", "g", "L", "ml", "porsi", dll
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  meta_retailer_id TEXT,               -- slug ke Meta Catalog, IMMUTABLE setelah di-set
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, meta_retailer_id)
);
```

### Tabel `order_items`
```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0), -- NUMERIC: support desimal
  price_at_order INTEGER NOT NULL,     -- SNAPSHOT harga saat order
  size TEXT,                           -- "S", "M", "L", "XL", "XXL" atau null
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Tabel `orders` (status flow)
```
PENDING → CONFIRMED → AWAITING_PAYMENT → PAID → FULFILLED → DONE
CANCELLED ← (hanya dari PENDING atau CONFIRMED)
```
- `midtrans_id TEXT` — format `WA-XXXXXXXX-xxxx`, dipakai reconcile callback
- `midtrans_payment_url TEXT` — fallback URL jika QR image gagal dikirim

### TypeScript Types (`lib/types/db.ts`)
```typescript
export type DbProduct = {
  id: string; tenant_id: string; name: string; description: string | null;
  price: number; stock: number; unit: string; category: string | null;
  is_active: boolean; image_url: string | null; meta_retailer_id: string | null;
  created_at: string; updated_at: string;
};

export type DbOrderItem = {
  id: string; order_id: string; product_id: string;
  qty: number;            // NUMERIC(10,3) di DB → number TypeScript
  price_at_order: number; // snapshot — JANGAN pakai product.price
  size: string | null; notes: string | null; created_at: string;
};
```

---

## AI/LLM Architecture — KRITIS, BACA SEMUA

### Dua Model, Dua Tujuan

| | Model 1 (Parser) | Model 2 (Generator) |
|---|---|---|
| Model | `gemini-2.0-flash` | `gemini-2.5-flash-lite` |
| Fitur | `responseSchema` enforcement | Free-form natural text |
| Dipakai | Parse SEMUA pesan customer + owner command | Owner analytics response only |
| Temperature | 0.1 | 0.4 |
| Kenapa beda | responseSchema = ~0% failure rate untuk data finansial | Flash-lite lebih hemat, narasi tidak perlu schema |

> ⚠️ Verifikasi nama model di https://aistudio.google.com SEBELUM coding. String di atas valid per Mei 2026.

### `ProductForPrompt` Type
```typescript
// lib/intent-parser.ts
export type ProductForPrompt = {
  name: string;
  price: number;
  unit: string;  // WAJIB — Gemini perlu tahu unit untuk parse "2.5 kg" vs "2 pcs"
};
```

### `responseSchema` untuk Parser (JANGAN PAKAI INTEGER untuk qty)
```typescript
// lib/gemini.ts — bagian responseSchema
items: {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      product_index: { type: SchemaType.INTEGER }, // 1-based index, BUKAN nama/UUID
      qty:           { type: SchemaType.NUMBER },  // NUMBER bukan INTEGER: support 2.5 kg
      size:          { type: SchemaType.STRING },
      notes:         { type: SchemaType.STRING },
    },
    required: ["product_index", "qty"],
  },
},
```

### Kenapa `product_index` bukan `product_name`?
- LLM lebih reliable return angka dari list terurut daripada reproduce string nama persis
- Menghilangkan kebutuhan fuzzy matching di handler
- UUID tidak dipakai: LLM bisa partial-corrupt UUID (char swap) → tidak bisa divalidasi

### Zod Schema
```typescript
// lib/intent-parser.ts
const OrderItemSchema = z.object({
  product_index: z.number().int().min(1),
  qty:           z.number().positive(),   // TIDAK .int() — support desimal
  size:          z.string().optional().default(""),
  notes:         z.string().default(""),
});
```

### `buildCustomerIntentPrompt` — Format Product List
```typescript
// Format: "1. Kaos Oversize Polos — Rp85.000/pcs"
//         "2. Daging Sapi — Rp150.000/kg"
// Unit ditampilkan agar Gemini tahu kapan qty boleh desimal
const productList = products
  .map((p, i) => `${i + 1}. ${p.name} — Rp${p.price.toLocaleString("id-ID")}/${p.unit}`)
  .join("\n");
```

### `systemInstruction` untuk Parser — Aturan qty
```
qty: angka positif. Integer untuk satuan (1, 2, 3).
     Desimal untuk berat/volume (0.5, 1.5, 2.5). Ikuti satuan produk.
```

### `product-cache.ts` — Wajib Fetch `unit`
```typescript
// lib/product-cache.ts
const { data } = await supabaseAdmin
  .from("products")
  .select("name, price, unit")   // ← unit wajib ada
  .eq("tenant_id", tenantId)
  .eq("is_active", true)
  .order("name", { ascending: true }); // ORDER BY deterministik — WAJIB untuk product_index
```

### `PromptContext` Type
```typescript
export type PromptContext = {
  store_name: string;
  store_category: string;
  current_order?: Array<{
    name: string;   // key "name", BUKAN "product_name"
    qty: number;
    size: string;
  }>;
};
```

### `RevenueData` untuk Owner Analytics
```typescript
// lib/owner-generator.ts
type RevenueData = {
  period: string;
  totalRevenue: number;
  orderCount: number;
  topProducts: Array<{ name: string; sold: number; unit: string }>;      // unit wajib
  lowStockProducts: Array<{ name: string; stock: number; unit: string }>; // unit wajib
};
// Display: "${p.sold} ${p.unit}" bukan "${p.sold}x" — "50x" salah untuk "50 kg"
```

---

## Session State Machine

### `lib/types/session.ts`
```typescript
export type PendingOrderItem = {
  product_id: string;
  name:       string;
  qty:        number;   // bisa desimal: 2.5 kg
  unit:       string;   // snapshot satuan — untuk display konfirmasi
  size:       string;
  notes:      string;
  price:      number;   // snapshot harga per unit
  subtotal:   number;   // price × qty
};

export type Session = {
  state:             "idle" | "awaiting_confirmation" | "awaiting_payment";
  pending_order?:    { items: PendingOrderItem[]; total: number };
  current_order_id?: string;
  retry_count:       number;
  last_updated:      number;  // Date.now()
};
```

### Urutan Check di Webhook (JANGAN DIUBAH)
```
1. State machine check DULU — sebelum Gemini
   └── awaiting_confirmation → cek CONFIRM/CANCEL keywords
   └── awaiting_payment → resend payment reminder
2. Owner vs Customer check
3. Customer intent parsing via Gemini
4. Intent router → handler
```

### `CONFIRM_KEYWORDS` dan `CANCEL_KEYWORDS` — Gunakan Set
```typescript
// lib/constants/confirmation-keywords.ts
// Normalize dulu: text.toLowerCase().trim() sebelum .has()
export const CONFIRM_KEYWORDS = new Set([
  "ya", "iya", "ok", "oke", "okay", "yes", "yep", "yap",
  "gas", "gaskeun", "sip", "siap", "mantap", "deal", "acc",
  "lanjut", "lanjutkan", "lanjutin", "boleh", "ayo", "hayuk", "jadi",
  // ... (list lengkap di lib/constants/confirmation-keywords.ts)
]);
export const CANCEL_KEYWORDS = new Set([
  "batal", "batalkan", "tidak", "gak", "ga", "nggak", "enggak",
  "cancel", "no", "nope", "gak jadi", "ga jadi", "batal aja",
  // ... (list lengkap di lib/constants/confirmation-keywords.ts)
]);
```

---

## Payment Flow — Core API (BUKAN Snap)

### Kenapa Core API?
- Snap API: return hanya `redirect_url` → customer harus keluar WA buka browser
- Core API: return `qr_string` → generate PNG → kirim langsung sebagai gambar WA

### Alur `processOrderConfirmation()` (di `lib/midtrans.ts`)
```
1. upsert user → dapat user.id
2. INSERT orders → dapat order.id (status: AWAITING_PAYMENT)
3. INSERT order_items (bulk) — manual rollback jika gagal
4. coreApi.charge({ payment_type: "qris" }) → dapat qr_string
5. UPDATE orders SET midtrans_id = ...
6. generateQrisImage(qr_string) → PNG Buffer
7. uploadWhatsAppMedia(buffer) → media_id
8. sendWhatsAppImageMessage(phone, media_id, caption) [try/catch]
   └── catch: fallback ke sendWhatsAppMessage dengan URL teks
9. sendWhatsAppMessage(owner_phone, ownerNewOrderMessage(...))
10. clearSession()
```

### `qrisImageCaption` vs `paymentLinkMessage`
- `qrisImageCaption` — caption untuk image message (happy path)
- `paymentLinkMessage` — fallback teks jika upload gambar gagal
- Keduanya di `lib/response-templates.ts`

### Midtrans Callback Handler
- Selalu return HTTP 200 — Midtrans retry jika dapat non-2xx
- Lookup order by `midtrans_id`, bukan internal `id`
- `fraud_status !== "deny"` guard — QRIS biasanya tidak ada fraud_status (safe if undefined)

### `verifyMidtransSignature` — Formula
```typescript
SHA-512(orderId + statusCode + grossAmount + serverKey)
```

---

## WhatsApp API Patterns

### Send Text Message
```typescript
POST /v19.0/{PHONE_NUMBER_ID}/messages
{ messaging_product: "whatsapp", to, type: "text", text: { body } }
```

### Send Catalog
```typescript
POST /v19.0/{PHONE_NUMBER_ID}/messages
{ messaging_product: "whatsapp", to, type: "interactive",
  interactive: { type: "catalog_message", body: { text }, action: { catalog_id } } }
```

### Upload Media → Send Image
```typescript
// 1. Upload
POST /v19.0/{PHONE_NUMBER_ID}/media
FormData: { messaging_product: "whatsapp", type: "image/png", file: buffer }
→ returns { id: media_id }

// 2. Send
POST /v19.0/{PHONE_NUMBER_ID}/messages
{ ..., type: "image", image: { id: media_id, caption } }
```

### FormData di Node.js
Gunakan package `form-data` (npm), bukan Web API FormData — Web API tidak support `getBuffer()` dan `getHeaders()`.

---

## `orderConfirmationMessage` — Format yang Benar

```typescript
// lib/response-templates.ts
// Format: "• Kaos Oversize Polos (L) 2 pcs = Rp170.000"
//         "• Daging Sapi 2.5 kg = Rp375.000"
// TIDAK pakai "x" prefix — "x2.5 kg" tidak natural
export function orderConfirmationMessage(
  items: Array<{ name: string; qty: number; unit: string; size?: string; subtotal: number }>,
  total: number
): string {
  const itemLines = items.map(i => {
    const sizeLabel = i.size ? ` (${i.size})` : "";
    return `• ${i.name}${sizeLabel} ${i.qty} ${i.unit} = Rp${i.subtotal.toLocaleString("id-ID")}`;
  }).join("\n");
  return `Oke kak! Ini pesanannya ya:\n\n${itemLines}\n\n*Total: Rp${total.toLocaleString("id-ID")}*\n\nMau lanjut bayar? Balas *ya* atau *batal* 😊`;
}
```

---

## Handler Patterns

### `handleOrderIntent` — Alur Mapping `product_index`
```typescript
for (const item of parsed.items) {
  const product = products[item.product_index - 1]; // 1-based → 0-based
  if (!product) { log error; continue; }

  // DB lookup untuk id + stock + unit terbaru (cache hanya punya name/price/unit)
  const { data: dbProduct } = await supabaseAdmin
    .from("products")
    .select("id, stock, unit")
    .eq("tenant_id", tenant.id).eq("name", product.name).eq("is_active", true)
    .single<Pick<DbProduct, "id" | "stock" | "unit">>();

  if (dbProduct.stock < item.qty) {
    errors.push(`${product.name} (stok hanya ${dbProduct.stock} ${dbProduct.unit})`);
    continue;
  }

  resolvedItems.push({
    product_id: dbProduct.id, name: product.name,
    qty: item.qty, unit: dbProduct.unit,  // ← unit wajib
    size: item.size ?? "", notes: item.notes ?? "",
    price: product.price, subtotal: product.price * item.qty,
  });
}
```

### `handleCartOrder` — `item_price` dari Meta SELALU STALE
```typescript
// JANGAN pakai cartItem.item_price — stale
// Selalu re-fetch dari DB by meta_retailer_id
.select("id, name, price, stock, unit")
.eq("meta_retailer_id", cartItem.product_retailer_id)
```

---

## MVP Scope — Jalur yang Dibangun

| Jalur | Status | File |
|---|---|---|
| order_new (teks natural) | ✅ MVP | `lib/handlers/order.ts` |
| Cart dari WA Catalog | ✅ MVP | `lib/handlers/cart-order.ts` |
| browse | ✅ MVP | `lib/handlers/browse.ts` |
| order_status | ✅ MVP | `lib/handlers/status.ts` |
| low_confidence / handoff | ✅ MVP | `lib/handlers/handoff.ts` |
| cancel_order | ❌ Cut → low_confidence | `lib/handlers/cancel-order.ts` post-MVP |
| repeat_last | ❌ Cut → low_confidence | `lib/handlers/repeat-last.ts` post-MVP |
| modify_order | ❌ Cut → low_confidence | `lib/handlers/modify-order.ts` post-MVP |

MVP: Gemini return `low_confidence` untuk intent yang di-cut. Switch statement tetap ditulis lengkap agar tidak perlu refactor nanti.

---

## Anti-Patterns — Jangan Lakukan Ini

```
❌ product_name di responseSchema → pakai product_index (integer)
❌ SchemaType.INTEGER untuk qty → pakai SchemaType.NUMBER (support desimal)
❌ Zod .int() untuk qty → hapus .int(), pakai .positive() saja
❌ Midtrans Snap API → pakai Core API (Snap tidak return qr_string)
❌ Web API FormData untuk upload media → pakai npm package form-data
❌ Redis untuk session → in-memory Map + --max-instances=1
❌ product.price untuk order total → pakai price_at_order (snapshot)
❌ i.product_name di currentOrderContext → pakai i.name (field key di PromptContext)
❌ hardcode "unit" di stock message → pakai ${stock.unit} dari DB
❌ "50x" untuk sold quantity → pakai "${sold} ${unit}" (50 kg, bukan 50x)
❌ SUM(qty) tanpa unit di Top Produk query → GROUP BY p.id, p.name, p.unit
❌ Tidak invalidate product cache setelah update produk → panggil invalidateProductCache()
❌ ORDER BY random di getActiveProducts → wajib ORDER BY name ASC (deterministic product_index)
```

---

## Quick Commands

```bash
# Dev
npm run dev

# Test Gemini (verifikasi API key dan model names)
npx tsx scripts/test-gemini.ts

# Build (pastikan tidak ada TypeScript error sebelum deploy)
npm run build

# Deploy ke Cloud Run (setelah gcloud auth login)
gcloud run deploy wassist \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=1 \
  --set-env-vars "NODE_ENV=production"
```

---

## Referensi Lengkap (baca jika butuh detail)

Semua file di `notes/` (relative ke parent folder dari project ini):

| File | Isi |
|---|---|
| `notes/00-overview.md` | Big picture, tim, stack, bobot juri |
| `notes/01-architecture.md` | Diagram sistem, data flow, folder structure |
| `notes/02-database.md` | Schema SQL lengkap, TypeScript types, query patterns |
| `notes/03-ai-llm.md` | Dual Gemini, 7-intent parser, prompt engineering, semua kode |
| `notes/04-whatsapp-api.md` | Meta API setup, webhook, WA Catalog, TypeScript WA types |
| `notes/05-order-flow.md` | State machine, semua handler MVP, session, response templates |
| `notes/06-dashboard.md` | Dashboard pages, API endpoints, auth magic link |
| `notes/07-payment.md` | Midtrans Core API, QR image flow, processOrderConfirmation |
| `notes/08-deployment.md` | Dockerfile, GCP Cloud Run, env vars, checklist |
| `notes/09-demo-and-timeline.md` | Script demo, timeline, Q&A juri |
| `notes/10-gemini-api-setup.md` | Step-by-step Gemini setup |
| `notes/11-full-intent-roadmap.md` | Post-MVP: cancel/repeat/modify handlers |
