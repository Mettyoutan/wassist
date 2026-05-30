# WAssist — Payment (Midtrans QRIS + QR Image)
> Baca `notes/05-order-flow.md` terlebih dahulu — file ini lanjutan dari sana.
> `processOrderConfirmation()` adalah bridge antara order flow dan payment. Dipanggil dari webhook ketika customer ketik "ya".

---

## 0. Arsitektur Pilihan: Core API (bukan Snap)

### Kenapa Core API?

| | Snap API | Core API ✅ |
|---|---|---|
| Return value | `token` + `redirect_url` | `qr_string` (raw EMV) + `actions[].url` |
| Customer experience | Buka browser → navigasi → scan | Scan QR langsung di WA (1 langkah) |
| Implementasi | Lebih mudah | Sedikit lebih banyak kode |

**Keputusan:** Core API. Customer tidak perlu keluar dari WhatsApp. QR digenerate server, dikirim sebagai gambar langsung ke chat.

### Alur Baru

```
1. Customer konfirmasi: "ya"
        │
        ▼
2. processOrderConfirmation()
   a. INSERT orders → dapat order.id
   b. INSERT order_items (bulk)
   c. Core API charge QRIS → dapat qr_string + expiry
   d. UPDATE orders SET midtrans_id = ...
        │
        ▼
3. generateQrisImage(qr_string)
   → qrcode library → PNG Buffer
        │
        ▼
4. uploadWhatsAppMedia(pngBuffer)
   → Media API → dapat media_id
        │
        ▼
5. sendWhatsAppImageMessage(customerPhone, media_id, caption)
   Caption: order #, total, expiry, instruksi scan
        │
        ▼
6. clearSession()
        │
        ▼
7. Customer scan QR di WA → bayar
        │
        ▼
8. Midtrans POST ke /api/webhook/midtrans
   transaction_status: "settlement"
        │
        ▼
9. Verifikasi signature → UPDATE DB → notif customer + owner
```

### Install Dependencies

```bash
npm install midtrans-client qrcode
npm install --save-dev @types/qrcode
```

Tambah ke `.env.local`:
```env
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"   # dari Midtrans Sandbox dashboard
MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"
NEXT_PUBLIC_APP_URL="http://localhost:3000" # ganti dengan Cloud Run URL saat deploy
```

---

## 1. Setup Midtrans Sandbox

1. Buka https://dashboard.midtrans.com → Login
2. Pastikan toggle pojok kiri atas: **Sandbox** (bukan Production)
3. **Settings → Access Keys** → copy:
   - `Server Key` → `MIDTRANS_SERVER_KEY`
   - `Client Key` → `MIDTRANS_CLIENT_KEY`
4. **Settings → Configuration** → isi **Payment Notification URL**:
   ```
   https://[CLOUD_RUN_URL]/api/webhook/midtrans
   ```
   Saat development lokal: pakai [ngrok](https://ngrok.com) untuk expose localhost.
   ```bash
   ngrok http 3000
   # copy URL: https://xxxx.ngrok-free.app/api/webhook/midtrans
   ```

---

## 2. `lib/midtrans.ts` — Core API Client + `createQrisPayment()`

```typescript
// lib/midtrans.ts
import MidtransClient from "midtrans-client";
import { nanoid } from "nanoid";
import crypto from "crypto";

// ─── Core API Client (bukan Snap) ───────────────────────────────────────────
const coreApi = new MidtransClient.CoreApi({
  isProduction: false,  // sandbox
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  clientKey: process.env.MIDTRANS_CLIENT_KEY!,
});

// ─── Types ───────────────────────────────────────────────────────────────────
export interface QrisPaymentResult {
  midtransOrderId: string;  // format: "WA-ABCD1234-xyz1" — key untuk reconcile callback
  qrString: string;         // raw EMV QR string → di-pass ke generateQrisImage()
  redirectUrl: string;      // fallback URL jika QR image gagal dikirim
  expiryMinutes: number;    // untuk caption pesan ke customer
}

// ─── Create QRIS Payment ─────────────────────────────────────────────────────
export async function createQrisPayment(params: {
  orderId: string;          // internal UUID dari tabel orders
  totalAmount: number;      // dalam Rupiah (integer)
  customerPhone: string;
  items: Array<{ name: string; qty: number; price: number }>;
}): Promise<QrisPaymentResult> {
  // Format midtrans order ID unik — dipakai untuk reconcile di callback
  // Midtrans tidak boleh reuse order_id yang sama
  const midtransOrderId = `WA-${params.orderId.slice(-8).toUpperCase()}-${nanoid(4)}`;
  const expiryMinutes = 15;

  const response = await coreApi.charge({
    payment_type: "qris",
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: params.totalAmount,
    },
    qris: {
      acquirer: "gopay",   // acquirer default sandbox — production: bisa "gopay" atau "airpay shopee"
    },
    item_details: params.items.map(item => ({
      id: item.name.toLowerCase().replace(/\s+/g, "-").slice(0, 50),
      name: item.name.slice(0, 50),  // Midtrans max 50 karakter per item name
      quantity: item.qty,
      price: item.price,
    })),
    customer_details: {
      phone: params.customerPhone,
    },
    expiry: {
      unit: "minutes",
      duration: expiryMinutes,
    },
  });

  // Core API response fields:
  // response.qr_string       → raw EMV string untuk generate QR image
  // response.actions[0].url  → URL QR image dari Midtrans (alternatif)
  // response.transaction_id  → Midtrans internal ID

  const redirectUrl = response.actions?.find((a: any) => a.name === "generate-qr-code")?.url
    ?? `https://app.sandbox.midtrans.com/payment-links/${midtransOrderId}`;

  return {
    midtransOrderId,
    qrString: response.qr_string,
    redirectUrl,
    expiryMinutes,
  };
}

// ─── Verify Signature ────────────────────────────────────────────────────────
// Dipanggil di /api/webhook/midtrans untuk validasi request dari Midtrans
// Formula resmi Midtrans: SHA-512(orderId + statusCode + grossAmount + serverKey)
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  receivedSignature: string
): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY!;
  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
  return expected === receivedSignature;
}
```

**Catatan penting:**
- `nanoid` sudah tersedia di Next.js dependencies, tapi verifikasi dulu: `npm ls nanoid`. Jika tidak ada: `npm install nanoid`.
- `response.qr_string` adalah raw EMV QR Code string (panjang ~200–400 karakter). Ini yang di-pass ke `generateQrisImage()`.
- `acquirer: "gopay"` untuk sandbox. Di production bisa berbeda tergantung kontrak Midtrans.

---

## 3. `lib/qr-generator.ts` — Generate QR Image dari `qr_string`

```typescript
// lib/qr-generator.ts
import QRCode from "qrcode";

/**
 * Generate QR code PNG buffer dari raw EMV QRIS string
 * Buffer ini langsung di-upload ke WhatsApp Media API
 *
 * @param qrString   raw EMV string dari Midtrans (qr_string field)
 * @returns          PNG Buffer
 */
export async function generateQrisImage(qrString: string): Promise<Buffer> {
  const buffer = await QRCode.toBuffer(qrString, {
    type: "png",
    width: 512,           // resolusi cukup untuk scan via WA
    margin: 2,            // quiet zone minimal
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",  // Medium — balance antara density dan scanability
  });
  return buffer;
}
```

**Mengapa `errorCorrectionLevel: "M"`?**
QRIS EMV string panjang (~200-400 karakter). Level `H` (High) bisa buat QR terlalu padat dan sulit di-scan. Level `M` adalah sweet spot untuk QRIS.

---

## 4. `lib/whatsapp.ts` — Tambahan: Upload Media + Kirim Image

Tambahkan dua fungsi ini ke `lib/whatsapp.ts` yang sudah ada (jangan replace file):

```typescript
// lib/whatsapp.ts — TAMBAHAN (append ke file yang sudah ada)
import FormData from "form-data";  // form-data sudah bundled di Node.js, tidak perlu install terpisah

const WA_API_BASE = "https://graph.facebook.com/v19.0";
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const WA_TOKEN = process.env.WHATSAPP_TOKEN!;

/**
 * Upload image buffer ke WhatsApp Media API
 * Return media_id yang dipakai untuk send image message
 *
 * Media dihost oleh Meta — berlaku 30 hari
 */
export async function uploadWhatsAppMedia(imageBuffer: Buffer): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "image/png");
  form.append("file", imageBuffer, {
    filename: "qris.png",
    contentType: "image/png",
  });

  const response = await fetch(
    `${WA_API_BASE}/${WA_PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        ...form.getHeaders(),  // content-type: multipart/form-data; boundary=...
      },
      body: form.getBuffer(),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[WA Media Upload] HTTP ${response.status}: ${err}`);
  }

  const json = await response.json() as { id: string };
  return json.id;  // media_id
}

/**
 * Kirim image message ke customer
 * Gunakan media_id dari uploadWhatsAppMedia()
 *
 * @param to        nomor tujuan (format: 628xxx)
 * @param mediaId   media_id dari uploadWhatsAppMedia()
 * @param caption   teks di bawah gambar (max 1024 karakter, support WA markdown)
 */
export async function sendWhatsAppImageMessage(
  to: string,
  mediaId: string,
  caption: string
): Promise<void> {
  const response = await fetch(
    `${WA_API_BASE}/${WA_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          id: mediaId,
          caption,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[WA Image Message] HTTP ${response.status}: ${err}`);
  }
}
```

**Catatan `form-data`:**
Next.js 14 App Router berjalan di Node.js runtime. `FormData` dari native Web API tidak support `getBuffer()` dan `getHeaders()`. Gunakan package `form-data` (lowercase) dari npm yang adalah Node.js implementation:
```bash
npm install form-data
```

---

## 5. `processOrderConfirmation()` — Bridge Order → Payment

Fungsi ini dipanggil dari webhook ketika customer balas "ya". Letakkan di `lib/midtrans.ts` (append setelah fungsi yang sudah ada di Section 2).

```typescript
// lib/midtrans.ts — TAMBAHAN
import { supabaseAdmin } from "@/lib/db";
import { getSession, clearSession } from "@/lib/session";
import { sendWhatsAppMessage, sendWhatsAppImageMessage, uploadWhatsAppMedia } from "@/lib/whatsapp";
import { generateQrisImage } from "@/lib/qr-generator";
import { qrisImageCaption, paymentLinkMessage, ownerNewOrderMessage } from "@/lib/response-templates";
import type { Tenant } from "@/lib/types/tenant";
import type { Session } from "@/lib/types/session";

/**
 * Dipanggil dari webhook saat customer konfirmasi order ("ya")
 * Urutan: INSERT DB → Midtrans → QR Image → WA send → clear session
 *
 * Tidak return value — side effect only (DB write + WA messages)
 */
export async function processOrderConfirmation(
  tenant: Tenant,
  senderPhone: string,
  session: Session
): Promise<void> {
  const pending = session.pendingOrder;
  if (!pending || pending.items.length === 0) {
    await sendWhatsAppMessage(senderPhone, "Tidak ada pesanan aktif kak. Ketik *menu* untuk lihat katalog.");
    clearSession(senderPhone, tenant.id);
    return;
  }

  // ── Step 1: Pastikan user ada di tabel users ─────────────────────────────
  // upsert: kalau nomor sudah ada, return existing; kalau baru, insert
  const { data: user } = await supabaseAdmin
    .from("users")
    .upsert({ phone: senderPhone, tenant_id: tenant.id }, { onConflict: "phone,tenant_id" })
    .select("id")
    .single();

  if (!user) throw new Error(`[processOrderConfirmation] Gagal upsert user: ${senderPhone}`);

  // ── Step 2: INSERT ke tabel orders ───────────────────────────────────────
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: tenant.id,
      user_id: user.id,
      total_amount: pending.totalAmount,
      status: "AWAITING_PAYMENT",
      payment_status: "UNPAID",
      // midtrans_id diisi setelah dapat response dari Midtrans
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("[processOrderConfirmation] INSERT order gagal:", orderError);
    await sendWhatsAppMessage(senderPhone, "Maaf kak, ada masalah teknis. Coba lagi ya 🙏");
    return;
  }

  // ── Step 3: INSERT ke tabel order_items (bulk) ───────────────────────────
  const orderItemsPayload = pending.items.map(item => ({
    order_id: order.id,
    product_id: item.productId,
    product_name: item.name,   // snapshot nama saat order — tidak ikut berubah kalau produk diedit
    size: item.size ?? null,
    qty: item.qty,
    unit_price: item.unitPrice,
    subtotal: item.qty * item.unitPrice,
  }));

  const { error: itemsError } = await supabaseAdmin
    .from("order_items")
    .insert(orderItemsPayload);

  if (itemsError) {
    console.error("[processOrderConfirmation] INSERT order_items gagal:", itemsError);
    // Rollback: hapus order yang sudah diinsert tadi
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
    await sendWhatsAppMessage(senderPhone, "Maaf kak, ada masalah teknis. Coba lagi ya 🙏");
    return;
  }

  // ── Step 4: Buat transaksi QRIS via Midtrans Core API ────────────────────
  let qrisResult: QrisPaymentResult;
  try {
    qrisResult = await createQrisPayment({
      orderId: order.id,
      totalAmount: pending.totalAmount,
      customerPhone: senderPhone,
      items: pending.items.map(i => ({ name: i.name, qty: i.qty, price: i.unitPrice })),
    });
  } catch (err) {
    console.error("[processOrderConfirmation] Midtrans gagal:", err);
    // Tetap lanjut tapi kirim URL teks sebagai fallback — order tetap valid di DB
    await sendWhatsAppMessage(senderPhone, `Pesanan kamu berhasil dibuat! Tapi ada masalah koneksi payment saat ini. Tim kami akan segera menghubungi kamu untuk instruksi pembayaran.`);
    clearSession(senderPhone, tenant.id);
    return;
  }

  // ── Step 5: Simpan midtrans_id ke order ──────────────────────────────────
  await supabaseAdmin
    .from("orders")
    .update({
      midtrans_id: qrisResult.midtransOrderId,
      midtrans_payment_url: qrisResult.redirectUrl,
    })
    .eq("id", order.id);

  // ── Step 6: Generate QR Image → Upload ke WA → Kirim ─────────────────────
  const shortOrderId = order.id.slice(-6).toUpperCase();
  const caption = qrisImageCaption(order.id, pending.totalAmount, qrisResult.expiryMinutes);

  try {
    const qrBuffer = await generateQrisImage(qrisResult.qrString);
    const mediaId = await uploadWhatsAppMedia(qrBuffer);
    await sendWhatsAppImageMessage(senderPhone, mediaId, caption);
  } catch (err) {
    console.error("[processOrderConfirmation] QR image gagal, fallback ke URL:", err);
    // Fallback: kirim link teks
    await sendWhatsAppMessage(
      senderPhone,
      paymentLinkMessage(order.id, pending.totalAmount, qrisResult.redirectUrl, qrisResult.expiryMinutes)
    );
  }

  // ── Step 7: Notif owner (setelah payment dibuat, bukan setelah dibayar) ──
  // Owner tau ada order baru yang menunggu pembayaran
  await sendWhatsAppMessage(
    tenant.ownerPhone,
    ownerNewOrderMessage(order.id, pending.totalAmount, senderPhone)
  );

  // ── Step 8: Clear session ─────────────────────────────────────────────────
  clearSession(senderPhone, tenant.id);
}
```

**Design decisions:**
- Owner dinotif **saat order dibuat** (status `AWAITING_PAYMENT`), bukan saat dibayar. Ini supaya owner bisa follow up kalau customer tidak bayar.
- Rollback manual untuk `order_items` gagal — Supabase free tier tidak support transaction rollback via API.
- `try/catch` di Midtrans dan QR image terpisah — QR image gagal tidak membatalkan order di DB.

---

## 6. `app/api/webhook/midtrans/route.ts` — Payment Callback

```typescript
// app/api/webhook/midtrans/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    order_id,            // format: "WA-ABCD1234-xyz1" — midtrans_id di tabel orders
    transaction_status,  // "settlement" | "capture" | "pending" | "deny" | "expire" | "cancel"
    fraud_status,        // "accept" | "deny" | "challenge" — hanya ada untuk card/gopay
    gross_amount,        // string: "320000.00"
    signature_key,       // hash untuk verifikasi
    status_code,         // string: "200" | "201" | "202"
  } = body;

  // ── Step 1: Verifikasi signature ─────────────────────────────────────────
  // Tanpa ini, siapapun bisa fake callback dan mark order sebagai PAID
  const isValid = verifyMidtransSignature(order_id, status_code, gross_amount, signature_key);
  if (!isValid) {
    console.warn("[Midtrans Webhook] Invalid signature:", order_id);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Step 2: Cek apakah transaksi berhasil ────────────────────────────────
  // QRIS hanya punya "settlement" (tidak ada "capture")
  // fraud_status hanya ada untuk metode tertentu — QRIS biasanya tidak ada, jadi aman default accept
  const isPaid =
    (transaction_status === "settlement" || transaction_status === "capture") &&
    fraud_status !== "deny";

  if (!isPaid) {
    // Log tapi return 200 — Midtrans retry kalau dapat non-2xx
    console.log(`[Midtrans Webhook] Status tidak perlu diproses: ${transaction_status} | ${order_id}`);
    return NextResponse.json({ status: "ok" });
  }

  // ── Step 3: Update order di DB ───────────────────────────────────────────
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "PAID",
      status: "CONFIRMED",
      updated_at: new Date().toISOString(),
    })
    .eq("midtrans_id", order_id)          // cari by midtrans_id, bukan internal id
    .select("id, total_amount, users(phone), tenants(owner_phone)")
    .single();

  if (error || !order) {
    console.error("[Midtrans Webhook] Order tidak ditemukan:", order_id, error);
    return NextResponse.json({ status: "ok" });  // return 200 supaya Midtrans tidak retry
  }

  // ── Step 4: Notif customer ────────────────────────────────────────────────
  const customerPhone = (order.users as any)?.phone;
  const shortId = order.id.slice(-6).toUpperCase();

  if (customerPhone) {
    await sendWhatsAppMessage(
      customerPhone,
      `✅ *Pembayaran Diterima!*\n\nOrder *#${shortId}* sudah terkonfirmasi.\nTotal: *Rp${order.total_amount.toLocaleString("id-ID")}*\n\nPesanan sedang diproses ya kak. Terima kasih! 🎉`
    );
  }

  // ── Step 5: Notif owner (payment confirmed) ───────────────────────────────
  // Notif kedua ke owner: sebelumnya saat order dibuat (AWAITING_PAYMENT),
  // sekarang konfirmasi payment sudah masuk
  const ownerPhone = (order.tenants as any)?.owner_phone;
  if (ownerPhone) {
    await sendWhatsAppMessage(
      ownerPhone,
      `💰 *Pembayaran Masuk!*\n\nOrder *#${shortId}* — *Rp${order.total_amount.toLocaleString("id-ID")}*\nCustomer: ${customerPhone ?? "unknown"}\n\nLihat dashboard → ${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    );
  }

  return NextResponse.json({ status: "ok" });
}
```

**Edge cases yang perlu diperhatikan:**
- Midtrans bisa kirim callback yang sama lebih dari satu kali (retry). UPDATE ke status yang sudah `PAID` tidak merusak data — idempotent.
- `fraud_status` tidak selalu ada di body (QRIS biasanya tanpa fraud check). Operator `!== "deny"` aman jika `undefined`.
- Selalu return HTTP 200 ke Midtrans meski order tidak ditemukan — kalau return 4xx/5xx, Midtrans akan retry berkali-kali.

---

## 7. `lib/response-templates.ts` — Template Relevan untuk Payment

Template ini sudah ada di `notes/05-order-flow.md` Section 10. Salin ke `lib/response-templates.ts`. Berikut ini adalah referensi cepat untuk template yang dipakai di file ini:

```typescript
// lib/response-templates.ts (bagian payment — lihat 05-order-flow.md untuk file lengkap)

// Dipakai di processOrderConfirmation() saat QR image berhasil dikirim
export function qrisImageCaption(orderId: string, total: number, expiryMinutes: number): string {
  return [
    "💳 *Pembayaran QRIS*",
    "",
    `📋 Order #${orderId.slice(-6).toUpperCase()}`,
    `💰 Total: *Rp${total.toLocaleString("id-ID")}*`,
    "",
    `⏱ QR berlaku ${expiryMinutes} menit`,
    "",
    "Scan QR di atas dengan e-wallet atau mobile banking kamu.",
    "Setelah bayar, kami konfirmasi otomatis 🎉",
  ].join("\n");
}

// Fallback jika QR image gagal — kirim URL teks
export function paymentLinkMessage(
  orderId: string,
  total: number,
  url: string,
  expiryMinutes: number
): string {
  return [
    `💳 *Bayar Order #${orderId.slice(-6).toUpperCase()}*`,
    `💰 Total: *Rp${total.toLocaleString("id-ID")}*`,
    "",
    `Bayar via QRIS → ${url}`,
    "",
    `⏱ Link berlaku ${expiryMinutes} menit`,
    "Pembayaran otomatis terkonfirmasi setelah berhasil.",
  ].join("\n");
}

// Dipakai di processOrderConfirmation() untuk notif owner saat order dibuat
export function ownerNewOrderMessage(orderId: string, total: number, customerPhone: string): string {
  return [
    `🛍️ *Order Baru Menunggu Pembayaran*`,
    "",
    `Order #${orderId.slice(-6).toUpperCase()}`,
    `Customer: ${customerPhone}`,
    `Total: *Rp${total.toLocaleString("id-ID")}*`,
    "",
    `Status: Menunggu pembayaran QRIS`,
    `Dashboard → ${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  ].join("\n");
}
```

---

## 8. Test Sandbox

### Test via ngrok (end-to-end)

1. Jalankan server lokal: `npm run dev`
2. Jalankan ngrok: `ngrok http 3000`
3. Copy URL ngrok → masukkan ke Midtrans Sandbox → Settings → Configuration → Notification URL
4. Kirim pesan WA ke bot → konfirmasi order → cek: QR image muncul di WA
5. Untuk simulate pembayaran di sandbox:
   ```bash
   # Midtrans Sandbox tidak perlu scan QR asli — gunakan simulator
   # Buka: https://simulator.sandbox.midtrans.com/qris/index
   # Masukkan order_id Midtrans (format: WA-ABCD1234-xyz1)
   # Klik "Accept Payment"
   # Cek: callback masuk ke ngrok URL kamu
   ```
6. Verifikasi di DB (Supabase SQL Editor):
   ```sql
   SELECT id, status, payment_status, midtrans_id, updated_at
   FROM orders
   ORDER BY created_at DESC
   LIMIT 5;
   ```
   Hasil yang diharapkan: `status = 'CONFIRMED'`, `payment_status = 'PAID'`

### Checklist Test

- [ ] Core API charge berhasil → `qr_string` tidak null/undefined
- [ ] `generateQrisImage()` return Buffer PNG (bukan null, bukan empty)
- [ ] `uploadWhatsAppMedia()` return media_id string
- [ ] QR image muncul di WhatsApp customer (dapat di-scan)
- [ ] Midtrans simulator trigger callback ke `/api/webhook/midtrans`
- [ ] Signature verification lolos (tidak return 401)
- [ ] Order status berubah: `AWAITING_PAYMENT` → `CONFIRMED`
- [ ] Customer terima pesan konfirmasi pembayaran
- [ ] Owner terima dua notif: saat order dibuat + saat bayar konfirmasi

---

## 9. Fallback Demo jika Midtrans Down

Simpan script SQL ini untuk demo darurat. Jalankan di Supabase SQL Editor:

```sql
-- Step 1: Lihat order yang AWAITING_PAYMENT
SELECT id, total_amount, status, payment_status, created_at
FROM orders
WHERE status = 'AWAITING_PAYMENT'
ORDER BY created_at DESC
LIMIT 5;

-- Step 2: Manual set ke PAID (ganti ORDER_ID_DI_SINI)
UPDATE orders
SET
  payment_status = 'PAID',
  status         = 'CONFIRMED',
  updated_at     = NOW()
WHERE id = 'ORDER_ID_DI_SINI';

-- Verifikasi
SELECT id, status, payment_status, updated_at
FROM orders
WHERE id = 'ORDER_ID_DI_SINI';
```

Setelah jalankan SQL, manual kirim pesan WA ke customer lewat WA Business app (bukan bot) kalau perlu.

---

## Ringkasan File yang Perlu Dibuat/Diedit

| File | Aksi | Isi |
|---|---|---|
| `lib/midtrans.ts` | Buat baru | `coreApi`, `createQrisPayment()`, `verifyMidtransSignature()`, `processOrderConfirmation()` |
| `lib/qr-generator.ts` | Buat baru | `generateQrisImage()` |
| `lib/whatsapp.ts` | Append | `uploadWhatsAppMedia()`, `sendWhatsAppImageMessage()` |
| `lib/response-templates.ts` | Buat baru | Semua template — lihat `notes/05-order-flow.md` Section 10 untuk file lengkap |
| `app/api/webhook/midtrans/route.ts` | Buat baru | POST handler payment callback |
| `.env.local` | Edit | Tambah `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `NEXT_PUBLIC_APP_URL` |

**Urutan implementasi yang direkomendasikan:**
1. `.env.local` + Setup Midtrans Sandbox (Section 1)
2. `lib/midtrans.ts` client + `createQrisPayment()` + `verifyMidtransSignature()` (Section 2)
3. `lib/qr-generator.ts` (Section 3)
4. `lib/whatsapp.ts` tambahan (Section 4)
5. `lib/response-templates.ts` (Section 7, atau lengkap dari `05-order-flow.md`)
6. `processOrderConfirmation()` di `lib/midtrans.ts` (Section 5)
7. `app/api/webhook/midtrans/route.ts` (Section 6)
8. Test end-to-end (Section 8)
