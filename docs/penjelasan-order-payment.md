# Penjelasan Order & Payment Flow WAssist
> Ditulis: 2026-05-31 — versi mudah dimengerti

---

## Gambaran Besar

Bayangkan WAssist sebagai **kasir otomatis di WhatsApp**. Customer chat → kasir ngerti pesanan → minta bayar → konfirmasi ke owner.

Ada **dua bagian besar** yang dibangun:

1. **Order Flow** — dari chat customer sampai ringkasan pesanan muncul
2. **Payment Flow** — dari customer tekan "ya" sampai QRIS dikirim dan terbayar

---

## Bagian 1: Order Flow (`lib/handlers/order-new.ts`)

### Alur Sederhana

```
Customer kirim teks → AI baca & pahami → bot respon

"mau 2 kaos oversize"
    ↓
AI (Gemini) parse: "ini order baru, produk ke-3 di katalog, jumlah 2"
    ↓
Cek stok di database: "ada 10, oke"
    ↓
Bot: "Oke kak! Kaos Oversize x2 = Rp170.000. Konfirmasi? Balas ya/batal"
```

### Yang Terjadi di Balik Layar

Setiap kali customer mau order via teks, bot melakukan **5 pengecekan** sebelum konfirmasi:

| Pengecekan | Contoh masalah | Respon bot |
|---|---|---|
| Toko buka? | Owner nutup toko | "Maaf toko tutup kak 🙏" |
| Produk ada? | "mau beli sepatu" (gak ada di katalog) | Tampilkan katalog |
| Produk mana? | "mau kaos" — ada Kaos Hitam & Kaos Putih | "Yang mana kak? 1. Hitam 2. Putih" |
| Jumlah disebut? | "mau beli kaos" tanpa angka | "Berapa kak?" |
| Stok cukup? | Minta 10, stok cuma 3 | "Stok tinggal 3, mau berapa?" |

### Istilah Teknis

**Slot-filling** = pola di mana bot "isi kotak kosong" satu per satu. Kalau ada info yang kurang atau tidak jelas, bot tanya dulu — tidak menebak.

**`awaiting_clarification`** = status sesi saat bot lagi nunggu jawaban dari customer (setelah nanya "yang mana?" atau "berapa?").

**`awaiting_confirmation`** = status sesi saat bot udah kasih ringkasan pesanan, nunggu customer balas "ya" atau "batal".

### Alur Lengkap dengan Klarifikasi

```
Customer: "mau kaos polos"
    ↓
Bot: "Ada 2 varian kak:
      1. Kaos Polos Hitam — Rp85.000
      2. Kaos Polos Putih — Rp85.000
      Balas nomornya!"
    ↓
Customer: "1"
    ↓
Bot: "Berapa kak?"   ← karena qty belum disebut
    ↓
Customer: "3"
    ↓
Bot: "Oke! Kaos Polos Hitam x3 = Rp255.000. Konfirmasi? Balas ya/batal"
    ↓
[Session: awaiting_confirmation]
```

---

## Bagian 2: Payment Flow (`lib/handlers/confirm-order.ts` + `lib/midtrans.ts`)

### Alur Sederhana

```
Customer balas "ya"
    ↓
Bot buat order di database
    ↓
Bot minta QRIS ke Midtrans (sistem pembayaran)
    ↓
Midtrans kasih kode QR
    ↓
Bot kirim gambar QR ke WhatsApp customer
    ↓
Customer scan QR → bayar
    ↓
Midtrans kasih tahu bot "sudah dibayar"
    ↓
Bot update database + kurangi stok + notif customer + notif owner
```

### Apa itu Midtrans?

Midtrans adalah **payment gateway** Indonesia — perantara antara bot kita dengan sistem perbankan. Kita pakai **QRIS** (kode QR standar nasional, bisa di-scan dari GoPay, OVO, BCA, dll).

Kita pakai **Core API** (bukan Snap):
- **Snap** = customer diarahkan ke halaman web Midtrans → ribet buat WA
- **Core API** = kita minta QRIS-nya langsung → kirim gambar QR ke WA → customer scan di chat ✅

### Yang Terjadi Step by Step

```
1. Customer: "ya"
   → Bot simpan order ke Supabase (tabel orders + order_items)
   → Dapat order_id: "uuid-xxx"

2. Bot kirim request ke Midtrans:
   "Buatkan QRIS untuk order WA-ABC123, total Rp170.000"
   → Midtrans balas: "Ini URL gambar QR-nya"

3. Bot download gambar QR dari Midtrans
   → Upload gambar ke server WhatsApp (Meta)
   → Dapat media_id

4. Bot kirim gambar QR ke customer via WA
   → Customer lihat gambar QR di chat
   → Customer scan pakai GoPay/OVO/dll

5. Customer bayar ✓
   → Midtrans kirim notifikasi ke /api/webhook/midtrans
   → Bot verifikasi notifikasi itu asli (bukan palsu)
   → Bot update status order: PAID
   → Bot kurangi stok produk
   → Bot kirim "Pembayaran diterima!" ke customer
   → Bot kirim notif ke owner
```

### Fallback (Plan B)

Kalau pengiriman gambar QR gagal (misalnya jaringan bermasalah), bot otomatis kirim **link teks** sebagai gantinya:

```
💳 Selesaikan Pembayaran

Total: Rp170.000
Bayar via QRIS → https://...

_Link berlaku 15 menit_
```

---

## Status Sesi (Session State)

Session = "ingatan sementara" bot tentang customer ini lagi di tahap mana.

```
idle
  ↓ (customer order)
awaiting_clarification   ← bot lagi nanya "yang mana?" / "berapa?"
  ↓ (customer jawab, semua info lengkap)
awaiting_confirmation    ← bot kasih ringkasan, nunggu "ya/batal"
  ↓ (customer: "ya")
awaiting_payment         ← QR sudah dikirim, nunggu bayar
  ↓ (Midtrans: dibayar)
idle (order selesai, session dihapus)
```

Session disimpan **di memori server** (bukan database), dan otomatis hilang setelah 30 menit tidak aktif.

---

## File-File yang Terlibat

| File | Fungsi |
|---|---|
| `lib/handlers/order-new.ts` | Terima data order dari Gemini, cek produk & stok, mulai klarifikasi atau langsung konfirmasi |
| `lib/handlers/clarification.ts` | Handle jawaban customer saat bot lagi nanya klarifikasi |
| `lib/handlers/confirm-order.ts` | Handle saat customer balas "ya" — buat order di DB + minta QRIS Midtrans + kirim ke WA |
| `lib/midtrans.ts` | Komunikasi dengan Midtrans (minta QRIS, verifikasi pembayaran) |
| `lib/whatsapp.ts` | Kirim pesan teks/gambar ke WhatsApp via Meta API |
| `app/api/webhook/wa/route.ts` | Pintu masuk semua pesan dari customer ke server |
| `app/api/webhook/midtrans/route.ts` | Pintu masuk notifikasi pembayaran dari Midtrans |
| `server/db/orders.ts` | Query database untuk order & order_items |
| `lib/types/session.ts` | Definisi tipe data sesi customer |

---

## Demo Script (Singkat)

```
Customer: "mau 2 kaos oversize polos"
Bot:      "Oke kak! Kaos Oversize Polos x2 = Rp170.000
           Mau lanjut bayar? Balas ya atau batal 😊"

Customer: "ya"
Bot:      [gambar QR QRIS]
          "💳 Scan QR untuk bayar kak 😊
           Total: Rp170.000
           Berlaku 15 menit"

[Customer scan & bayar]

Bot:      "✅ Pembayaran Diterima!
           Order #ABC123 sedang diproses ya kak 🎉"
Owner:    "💰 Pembayaran masuk! Order #ABC123 Rp170.000"
```
