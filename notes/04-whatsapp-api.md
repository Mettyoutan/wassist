# WAssist — WhatsApp Cloud API
> Referensi lengkap setup: `docs/meta-wa-api-setup.md`

---

## TypeScript Types (`lib/types/whatsapp.ts`)

Semua tipe ini harus di-export dari satu file agar handler webhook bisa import dengan konsisten.

```typescript
// lib/types/whatsapp.ts

// ─── Webhook Body ───────────────────────────────────────────────────
export type WAWebhookBody = {
  object: "whatsapp_business_account";
  entry: WAEntry[];
};

export type WAEntry = {
  id: string;             // WABA ID
  changes: WAChange[];
};

export type WAChange = {
  value: WAChangeValue;
  field: "messages";
};

export type WAChangeValue = {
  messaging_product: "whatsapp";
  metadata: WAMetadata;
  messages?: WAMessage[];
  statuses?: WAStatus[];
};

export type WAMetadata = {
  display_phone_number: string;
  phone_number_id: string;   // dipakai untuk identifikasi tenant
};

// ─── Message Union ─────────────────────────────────────────────────
// Semua message dari customer masuk lewat sini.
// Gunakan discriminated union — type guard via message.type.
export type WAMessage =
  | WATextMessage
  | WAOrderMessage
  | WAAudioMessage
  | WAImageMessage
  | WAUnknownMessage;

type WAMessageBase = {
  from: string;       // nomor pengirim (E.164 tanpa +, contoh: "6281234567890")
  id: string;         // message ID — pakai untuk deduplication
  timestamp: string;  // unix timestamp string
};

export type WATextMessage = WAMessageBase & {
  type: "text";
  text: { body: string };
};

export type WAOrderMessage = WAMessageBase & {
  type: "order";
  order: {
    catalog_id: string;
    product_items: WAOrderItem[];
  };
};

export type WAOrderItem = {
  product_retailer_id: string; // slug — maps ke products.meta_retailer_id di DB
  quantity: number;
  item_price: number;          // harga dalam Rupiah (integer, bukan float)
  currency: "IDR";
};

export type WAAudioMessage = WAMessageBase & {
  type: "audio";
  audio: { id: string; mime_type: string };
};

export type WAImageMessage = WAMessageBase & {
  type: "image";
  image: { id: string; mime_type: string; caption?: string };
};

export type WAUnknownMessage = WAMessageBase & {
  type: string;  // semua type lain yang tidak ditangani (location, sticker, dll)
};

export type WAStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
};
```

---

## TypeScript Types (`lib/types/tenant.ts`)

```typescript
// lib/types/tenant.ts

export type Tenant = {
  id: string;
  name: string;
  owner_phone: string;                // "6281234567890"
  wa_business_phone_id: string;       // Phone Number ID dari Meta
  category: string;                   // "fashion & pakaian" — dipakai di LLM prompt context
  plan: "free" | "pro" | "enterprise";
  status: "active" | "inactive" | "suspended";
  is_open: boolean;
  closed_until: string | null;        // ISO timestamp atau null
  meta_catalog_id: string | null;     // Catalog ID di Commerce Manager, null = belum setup
  created_at: string;
};
```

> ℹ️ **`meta_catalog_id` di Tenant** — Disimpan di DB supaya setiap tenant bisa punya catalog berbeda.
> Alternatif: simpan di env var kalau single-tenant hackathon (saat ini pakai `META_CATALOG_ID`).
> Untuk multi-tenant production: pindahkan ke tabel `tenants`.

---

## TypeScript Types (`lib/whatsapp.ts`)

```typescript
// lib/whatsapp.ts

export type SendMessageResult = {
  success: boolean;
  message_id?: string;    // wamid dari Meta response
  error?: string;
};

/** Kirim pesan teks biasa ke nomor WhatsApp */
export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<SendMessageResult> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] sendMessage failed:", err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}

/**
 * Kirim WA Catalog Message — tampilkan katalog produk native di WA.
 * Syarat: catalog sudah di-link ke WABA di Commerce Manager.
 *
 * @param to                  - nomor tujuan (E.164 tanpa +)
 * @param catalogId           - Catalog ID dari Commerce Manager
 * @param bodyText            - teks pengantar yang muncul di atas katalog
 * @param thumbnailRetailerId - (opsional) retailer_id produk untuk thumbnail preview
 */
export async function sendCatalogMessage(
  to: string,
  catalogId: string,
  bodyText: string,
  thumbnailRetailerId?: string
): Promise<SendMessageResult> {
  const parameters: Record<string, string> = {};
  if (thumbnailRetailerId) {
    parameters.thumbnail_product_retailer_id = thumbnailRetailerId;
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "catalog_message",
          body: { text: bodyText },
          action: {
            name: "catalog_message",
            parameters,
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] sendCatalog failed:", err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}
```

---

## Konsep Dasar

3 entitas penting di Meta:

| Entitas | Penjelasan |
|---|---|
| **Meta Business Account** | Akun induk bisnis di Meta. Dibuat sekali di business.facebook.com |
| **WhatsApp Business Account (WABA)** | Akun WA Business yang terhubung ke Meta Business Account |
| **Phone Number** | Nomor WA yang dipakai bot. Bisa nomor test gratis Meta atau nomor Indonesia sendiri |

---

## Status Setup Saat Ini

Dari context percakapan:
- ✅ Meta Business Account: sudah dibuat
- ✅ App "WAssist": sudah dibuat di developers.facebook.com
- ✅ WABA: sudah terhubung
- ⏳ Phone Number: menunggu daftarkan SIM baru (atau gunakan test number dulu)

**Rekomendasi sekarang:** Gunakan nomor test Meta (+1 555...) dulu untuk development. Daftar SIM baru ke nomor Indonesia kapan pun siap — tidak blocking development.

---

## Nomor Test vs Nomor Indonesia

| | Nomor Test Meta | Nomor Indonesia (SIM baru) |
|---|---|---|
| Langsung bisa pakai | ✅ Ya | ❌ Perlu OTP verifikasi |
| Tampilan di customer | +1 (555) xxx-xxxx | +62 8xx-xxxx-xxxx |
| Batas penerima | Max 5 nomor whitelist | Tidak terbatas |
| Untuk demo video | ✅ Cukup | ✅ Lebih bagus |
| Biaya | Gratis | ~Rp5.000 SIM baru |

---

## Webhook Setup

### Cara Kerja

```
Customer kirim WA
       │
       ▼
Meta Cloud API
       │ POST ke URL webhook kamu
       ▼
/api/webhook/wa
```

Meta hanya kirim ke satu URL. URL ini harus:
1. HTTPS (bukan HTTP)
2. Accessible dari internet (bukan localhost)
3. Return HTTP 200 dalam 20 detik

**Untuk development lokal:** Gunakan ngrok.

```bash
# Terminal 1: jalankan Next.js
npm run dev

# Terminal 2: expose localhost ke internet
npx ngrok http 3000
# Copy URL: https://xxxx.ngrok-free.app
```

Webhook URL: `https://xxxx.ngrok-free.app/api/webhook/wa`

**Untuk production:** Pakai URL Cloud Run (statis, tidak berubah).

---

## Struktur Body Webhook (Pesan Teks)

Saat customer kirim pesan, Meta POST body ini ke webhook kamu:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550607791",
          "phone_number_id": "PHONE_NUMBER_ID"  ← identifikasi tenant
        },
        "messages": [{
          "from": "6281234567890",              ← nomor pengirim (customer/owner)
          "id": "wamid.xxx",
          "timestamp": "1748390400",
          "type": "text",
          "text": { "body": "kaos oversize 2" } ← isi pesan
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Cara ambil data yang dibutuhkan (typed):**
```typescript
import type { WAWebhookBody, WAMessage, WATextMessage, WAOrderMessage } from "@/lib/types/whatsapp";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as WAWebhookBody;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.length) {
    // Bisa berisi status update (delivered/read) — tidak perlu diproses
    return NextResponse.json({ status: "ok" });
  }

  const phoneNumberId: string = value.metadata.phone_number_id;  // identify tenant
  const message: WAMessage = value.messages[0];
  const senderPhone: string = message.from;

  // Type guard sebelum akses field spesifik
  if (message.type === "text") {
    const textBody: string = message.text.body;
    // → proses text
  }

  if (message.type === "order") {
    const items = message.order.product_items; // WAOrderItem[]
    // → proses cart order tanpa LLM
  }
}
```

---

## Tipe Pesan yang Perlu Dihandle

### 1. Text (paling umum)
```typescript
if (message.type === "text") {
  const text = message.text.body;
  // → kirim ke Gemini intent parser
}
```

### 2. Order (dari WA Catalog Cart) — PENTING!
Ketika customer pilih produk dari WA Catalog dan tap "Add to Cart", Meta kirim `type: "order"`:

```json
{
  "type": "order",
  "order": {
    "catalog_id": "CATALOG_ID",
    "product_items": [
      {
        "product_retailer_id": "kaos-oversize-polos",
        "quantity": 2,
        "item_price": 85000,
        "currency": "IDR"
      }
    ]
  }
}
```

**Ini tidak perlu Gemini** — data sudah structured. Langsung proses:
```typescript
import type { WAOrderMessage, WAOrderItem } from "@/lib/types/whatsapp";

if (message.type === "order") {
  const orderMsg = message as WAOrderMessage;
  const cartItems: WAOrderItem[] = orderMsg.order.product_items;
  // product_retailer_id → lookup products.meta_retailer_id di DB
  // → langsung handle sebagai order_new tanpa LLM
}
```

**Penting:** `item_price` dari cart adalah harga saat customer add-to-cart, bukan harga DB terbaru.
Selalu re-fetch harga dari DB via `meta_retailer_id` — jangan percaya `item_price` dari Meta
(bisa stale kalau catalog belum di-update setelah price change).

### 3. Audio & Image (optional, jika sempat)
- Audio → Gemini multimodal → transcribe → proses sebagai teks
- Image → customer kirim foto produk → Gemini Vision → identifikasi produk

Untuk MVP: skip audio dan image, balas "Maaf, saya hanya bisa terima pesan teks".

---

## Mengirim Pesan dari Bot

Semua fungsi kirim pesan sudah ada di `lib/whatsapp.ts` (lihat TypeScript Types section di atas).
Gunakan fungsi tersebut — jangan raw fetch langsung dari handler.

```typescript
import { sendWhatsAppMessage, sendCatalogMessage } from "@/lib/whatsapp";

// Kirim teks biasa
await sendWhatsAppMessage("6281234567890", "Halo! Apa yang bisa saya bantu?");

// Kirim WA Catalog
await sendCatalogMessage(
  "6281234567890",
  process.env.META_CATALOG_ID!,
  "Ini koleksi terbaru kami 🛍️ Tap produk untuk order!",
  "kaos-oversize-polos"   // thumbnail (opsional)
);
```

### WA Catalog (Wow Moment #1) — Penjelasan

WA Catalog = katalog produk dengan foto, harga, deskripsi — native di dalam WA.
Customer bisa scroll, lihat foto, dan Add to Cart tanpa keluar dari WhatsApp.

**Syarat WA Catalog bisa dikirim:**
1. Produk sudah di-upload ke Meta Commerce Manager / Catalog
2. Catalog sudah dilink ke WhatsApp Business Account
3. Setiap produk punya `retailer_id` unik = slug dari nama produk

**Setup Catalog di Meta (Manual — untuk hackathon):**
1. Buka business.facebook.com → Commerce Manager → Create Catalog
2. Upload produk: nama, harga, foto, `retailer_id` (gunakan slug nama produk, contoh: `kaos-oversize-polos`)
3. Link catalog ke WABA: WhatsApp Manager → Settings → Shopping → Connect catalog

---

## WA Catalog sebagai Product Display Layer

**Prinsip arsitektur:** WA Catalog adalah *display layer* — bukan source of truth.
Source of truth tetap DB (tabel `products`). Meta menyimpan copy-nya untuk ditampilkan ke customer.

```
DB products (source of truth)
    ↕ sync (manual untuk hackathon, otomatis untuk production)
Meta Catalog (display layer)
    ↓
Customer di WhatsApp → scroll produk → Add to Cart
    ↓
WAOrderMessage → product_retailer_id
    ↓
DB lookup by meta_retailer_id → harga + stok terbaru
```

### Kenapa browse tidak perlu fetch DB?

Saat customer tap *lihat katalog*, bot hanya mengirim `catalog_message` ke Meta.
Meta yang serve tampilan katalog ke customer — bot tidak perlu tahu isi katalog.
Tidak ada DB fetch sama sekali untuk browse intent.

```typescript
// lib/handlers/browse.ts
// Browse = kirim catalog_message → Meta serve katalog → SELESAI
// Tidak ada getActiveProducts(), tidak ada DB query
```

Fetch DB hanya terjadi saat:
1. **Text-based order** (`order_new`) — product list diinjeksi ke LLM prompt (via cache)
2. **Cart order** (`order` message type) — lookup harga + stok terbaru by `meta_retailer_id`

### Sync DB ↔ Meta Catalog

**Untuk hackathon:** Manual sync. Upload produk sekali ke Meta Commerce Manager,
setelah itu tidak perlu update kecuali ada perubahan.

**Untuk production:** Otomatisasi via Meta Catalog Management API.
Trigger dari dashboard saat owner add/edit/delete produk.

```typescript
// lib/meta-catalog.ts — panduan untuk production nanti

type CatalogProductInput = {
  retailer_id: string;   // harus sama dengan products.meta_retailer_id di DB
  name: string;
  description: string;
  price: number;         // dalam sen (IDR * 100) — Meta requirement untuk IDR
  currency: "IDR";
  availability: "in stock" | "out of stock";
  image_url: string;
  url: string;           // URL produk (bisa dummy untuk WA-only store)
};

/**
 * Upload atau update produk ke Meta Catalog.
 * Dipanggil dari dashboard API route saat owner add/edit produk.
 * Untuk hackathon: tidak perlu diimplementasi — upload manual via Commerce Manager.
 */
export async function upsertCatalogProduct(
  catalogId: string,
  product: CatalogProductInput
): Promise<void> {
  await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(product),
  });
}

/**
 * Hapus produk dari Meta Catalog.
 * Dipanggil saat produk di-deactivate dari dashboard.
 */
export async function deleteCatalogProduct(
  productId: string  // Meta product ID (berbeda dari retailer_id)
): Promise<void> {
  await fetch(`https://graph.facebook.com/v19.0/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
  });
}
```

> ⚠️ **Meta Catalog price format untuk IDR:** Meta kadang meminta price dalam sen (integer × 100).
> Verifikasi di Commerce Manager setelah upload — kalau harga tampil 100× lebih besar, pakai nilai asli.
> Behavior ini tidak konsisten di dokumentasi Meta dan perlu dicoba langsung.

### Slug Convention untuk `meta_retailer_id`

```typescript
// lib/utils.ts

/** Konversi nama produk ke slug untuk meta_retailer_id */
export function toRetailerId(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/\s+/g, "-")        // spasi → dash
    .replace(/[^a-z0-9-]/g, "") // hapus karakter non-alphanumeric kecuali dash
    .replace(/-+/g, "-")         // multiple dash → single dash
    .slice(0, 100);              // Meta limit: 100 karakter
}

// Contoh:
// "Kaos Oversize Polos"  → "kaos-oversize-polos"
// "Celana Cargo Panjang" → "celana-cargo-panjang"
// "Outer Denim (M)"      → "outer-denim-m"
```

`meta_retailer_id` harus diisi saat produk dibuat via dashboard, dan slug ini yang di-upload ke Meta Catalog.
Kalau produk diganti nama, `meta_retailer_id` **tidak boleh berubah** — ini ID permanen yang tersimpan di Meta.

---

## HMAC Verification (Keamanan)

Meta menyertakan header `X-Hub-Signature-256` di setiap POST webhook. Verifikasi ini **wajib** untuk production agar tidak ada request palsu masuk ke server.

```typescript
import crypto from "crypto";

function verifyHmacSignature(rawBody: string, signature: string): boolean {
  const appSecret = process.env.META_APP_SECRET;

  // Development: skip jika belum set
  if (!appSecret) {
    console.warn("META_APP_SECRET not set — skipping HMAC verification");
    return true;
  }

  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual mencegah timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

**`META_APP_SECRET`** ada di: App Dashboard → Settings → Basic → App Secret.

---

## Webhook Verification (GET handler)

Saat pertama kali register webhook di Meta dashboard, Meta kirim GET request untuk verifikasi:

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });  // echo challenge
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

`META_VERIFY_TOKEN` adalah string bebas yang kamu tentukan (contoh: `wassist_verify_2026`) dan harus sama persis antara `.env.local` dan yang diisi di Meta dashboard.

---

## Penting: Selalu Return 200 ke Meta

Di handler POST, **selalu return HTTP 200**, bahkan kalau ada error internal:

```typescript
export async function POST(request: NextRequest) {
  try {
    // ... proses pesan
  } catch (err) {
    console.error("Handler error:", err);
    // JANGAN return 500 — Meta akan retry terus-menerus
  }

  return NextResponse.json({ status: "ok" });  // ← selalu 200
}
```

Kalau tidak return 200, Meta akan retry pengiriman webhook berkali-kali → pesan duplikat masuk → order ganda.

---

## Environment Variables Meta

```bash
META_PHONE_NUMBER_ID=     # Phone Number ID dari API Setup page
META_ACCESS_TOKEN=        # System User Token (permanent, bukan temporary)
META_VERIFY_TOKEN=        # String bebas buatanmu, harus sama dengan di Meta dashboard
META_APP_SECRET=          # App Secret dari Settings → Basic (untuk HMAC verify)
META_WABA_ID=             # WhatsApp Business Account ID
META_CATALOG_ID=          # Catalog ID (setelah setup catalog di Commerce Manager)
```

---

## Troubleshooting Umum

| Error | Penyebab | Solusi |
|---|---|---|
| Webhook verification failed | `META_VERIFY_TOKEN` tidak cocok atau server tidak jalan | Cek token sama persis, pastikan dev server aktif |
| Pesan tidak masuk ke webhook | Subscription "messages" belum dicentang | WhatsApp → Configuration → Webhook → Manage → centang "messages" |
| "recipient not in allowed list" | Nomor belum di-whitelist (mode test) | Manage phone number list, tambahkan nomor tujuan |
| Token expired | Pakai temporary token (24 jam) | Generate System User Token (permanent) |
| 130497 error | Nomor test tidak bisa kirim ke Indonesia | Daftar SIM baru sebagai nomor Indonesia |
| Pesan duplikat | Server return non-200 → Meta retry | Pastikan handler selalu return 200 |
