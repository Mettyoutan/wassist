# WAssist — Master Architecture Note

> Gambaran besar arsitektur WAssist MVP. Dokumen ini menjelaskan **keputusan** dan **alasan** di balik setiap bagian sistem — bukan tutorial kode.
> Baca ini untuk memahami "kenapa sistemnya begini", bukan "bagaimana cara nulis fungsi X".
> Last updated: 2026-05-30 · Status: MVP in-progress

---

## 1. Apa itu WAssist

Platform otomasi pemesanan berbasis WhatsApp untuk UMKM Indonesia. Customer chat ke nomor WA bisnis seperti biasa → bot AI (Gemini) proses pesanan → generate QRIS → notif owner. Owner kelola bisnis langsung dari WA atau dashboard web.

**Konteks:** Hackathon Gunadarma Code Week 2.0, deadline 5 Juli 2026. Demo tenant: Olshop Kak Nina (fashion, 15 produk).

**Dua jenis user, dua jalur berbeda:**
- **Customer** → order, browse katalog, cek status. Respons via template (data finansial harus akurat).
- **Owner** → analitik bisnis + kelola produk via command. Respons via LLM-generated (butuh analisis natural).

---

## 2. Stack & Alasan Pemilihan

| Layer | Teknologi | Kenapa ini |
|---|---|---|
| Framework | Next.js App Router (monorepo) | API routes + React UI satu project, satu deploy |
| AI Parser | Gemini `gemini-3.1-flash-lite` + `responseSchema` | Structured output = ~0% failure untuk data finansial |
| AI Generator | Gemini `gemini-3.1-flash-lite` (free-form) | Narasi owner analytics, tidak butuh schema |
| Database | PostgreSQL via Supabase | ACID, free tier, generated TypeScript types |
| Session | In-memory `Map` di Node.js | Cukup untuk single-instance, skip Redis |
| Payment | Midtrans **Core API** (bukan Snap) | Core API return `qr_string` → kirim QR sebagai gambar di WA |
| WA API | Meta WhatsApp Cloud API | Satu-satunya resmi, gratis 1000 conv/bulan |
| Deploy | Google Cloud Run, `asia-southeast1` | `--min-instances=1 --max-instances=1` |

> ⚠️ `--max-instances=1` BUKAN pilihan performa — ini **prasyarat** agar in-memory session & product cache konsisten. Multi-instance = session hilang random. Kalau scale, ganti ke Redis dulu.

---

## 3. Alur Besar Sistem (Request Lifecycle)

```
Customer/Owner kirim WA
        │
        ▼
[Meta WhatsApp Cloud API]  ── webhook POST ──▶  app/api/webhook/wa/route.ts
        │                                              │ ENTRY POINT
        │                                              ▼
        │                              ┌──────────────────────────────────┐
        │                              │ 1. Lookup tenant (by phone_id)   │
        │                              │ 2. Upsert customer               │
        │                              │ 3. Cart order? → handleCartOrder │
        │                              │ 4. STATE MACHINE check           │ ← sebelum LLM
        │                              │ 5. Owner vs Customer split       │
        │                              │ 6. Parse intent (Gemini)         │
        │                              │ 7. Route ke handler              │
        │                              └──────────────────────────────────┘
        │                                              │
        │                          ┌───────────────────┼───────────────────┐
        │                          ▼                   ▼                   ▼
        │                  [Customer handlers]  [Owner handlers]    [Services]
        │                  browse/order/status  owner command       DB, WA API,
        │                                                           Gemini, Midtrans
        ▼
[Supabase PostgreSQL] ←─────────────────────────────────────────────┘
[Midtrans QRIS] · [Dashboard Web — React]
```

**Prinsip:** webhook = resepsionis (validasi + routing). Handler = staf ruangan (satu tanggung jawab). Service = utilitas bersama (DB/WA/Gemini).

---

## 4. Keputusan Arsitektur Inti (INI YANG PENTING)

### 4.1 — Tiga model Gemini, tiga tujuan

| Model | File | Tujuan | Temp | Schema |
|---|---|---|---|---|
| **Parser** (`parserModel`) | gemini.ts | Parse pesan **customer** → intent + items | 0.1 | ✅ responseSchema |
| **Owner Parser** (`ownerParserModel`) | gemini.ts | Parse perintah **owner** → action + params | 0.1 | ✅ responseSchema |
| **Generator** (`generatorModel`) | gemini.ts | Narasi owner analytics (omzet) | 0.4 | ❌ free-form |

**Kenapa customer & owner parser dipisah?** Vocabulary berbeda total. Customer bilang "kaos 2 dong", owner bilang "ubah harga kaos jadi 90rb". systemInstruction + schema di-bake saat init model — tidak bisa di-share. Digabung = confidence turun, intent ambigu.

### 4.2 — "Fetch-then-inject": LLM TIDAK pernah hitung/ranking/akses DB

Pola untuk owner analytics:
```
Server query DB → data terstruktur → inject ke prompt → LLM hanya NARASI
```
LLM tidak boleh sorting angka, banding unit, atau akses DB langsung. Semua "kepintaran" (ranking, filter, hitung) dikerjakan SQL/server **sebelum** data masuk ke LLM. LLM cuma ubah angka jadi kalimat enak dibaca.

**Konsekuensi:** function calling TIDAK dipakai. Owner intent harus **bounded** ke daftar action yang kita definisikan — bukan free chat "tanya apa saja".

### 4.3 — Customer pakai template, Owner pakai LLM-generated

| | Customer | Owner |
|---|---|---|
| Respons | **Template** (response-template.ts) | **LLM-generated** (Mode 2) |
| Kenapa | Data finansial harus exact, 0 toleransi salah angka | Butuh analisis natural, tidak ada state machine yang bisa rusak |

Template customer tetap terasa natural — pakai "kak", emoji, tone kasual. Juri tidak sadar itu template karena nadanya informal, tapi angkanya selalu dari DB.

### 4.4 — `product_index` bukan nama produk

LLM diberi daftar produk **bernomor** (1-based), return **angka indeks**, bukan nama/UUID.
- LLM lebih reliable return angka dari list daripada reproduksi string nama persis
- Hilangkan kebutuhan fuzzy matching
- UUID tidak dipakai: LLM bisa partial-corrupt (char swap) → tidak bisa divalidasi

Berlaku untuk **customer order** DAN **owner mutation** (pola sama). Syarat: `ORDER BY name ASC` deterministik agar indeks konsisten antara prompt dan handler.

### 4.5 — Defense in depth: responseSchema + Zod

`responseSchema` (model level) menjamin JSON valid + struktur. Zod (app level) double-check lagi. Dua lapis karena data finansial — kalau satu bocor, satu lagi nangkap.

### 4.6 — State machine check SEBELUM LLM

Urutan di webhook (JANGAN DIUBAH):
```
1. awaiting_confirmation? → cek CONFIRM/CANCEL keyword (tanpa LLM)
2. awaiting_payment?      → resend reminder (tanpa LLM)
3. awaiting_owner_confirmation? → cek ya/batal (tanpa LLM)
4. Baru: owner vs customer → parse via Gemini
```
Kenapa: kalau customer balas "ya" untuk konfirmasi order, jangan diparse LLM lagi — itu pemborosan + risiko misinterpret. Keyword match dulu, LLM belakangan.

### 4.7 — Konfirmasi sebelum aksi tak-reversibel

Dua tempat:
- **Customer order** → harus balas "ya/batal" sebelum order direkam
- **Owner mutation** (ubah harga/stok/hapus) → harus balas "ya/batal" sebelum DB write

Kenapa: LLM halusinasi "hapus produk X" tanpa guard = bencana. Mutasi data = echo dulu ("Ubah harga jadi Rp90.000? balas ya"), tunggu konfirmasi, baru commit.

### 4.8 — Snapshot harga (`price_at_order`)

Saat order dibuat, harga di-snapshot ke `order_items.price_at_order`. JANGAN pakai `product.price` saat ini untuk hitung total order lama — kalau harga produk berubah, total order historis tidak boleh ikut berubah. Audit trail yang benar.

### 4.9 — `reorder_point` per-produk, unit-aware

Threshold "stok menipis" per produk, bukan global. Kenapa: `stock < 5` lintas unit nonsense — 5 kg tepung beda makna dengan 5 pcs kaos. Owner set sendiri per produk (`DEFAULT 5`). `lowStock = stock <= reorder_point`.

### 4.10 — topProducts rank by REVENUE, bukan qty

`SUM(qty × price_at_order)` bukan `SUM(qty)`. Kenapa: qty lintas unit tidak bisa dibanding (25 kg vs 15 pcs — mana "lebih laris"?). Rupiah = satu-satunya denominator unit-agnostic. qty+unit ditampilkan sebagai info sekunder.

### 4.11 — WA command = OPERASIONAL, Dashboard = SETUP

| Dashboard (setup) | WA command (operasional harian) |
|---|---|
| Tambah produk baru + foto | Restock stok |
| Sync ke Meta Catalog | Update harga promo |
| Deskripsi produk | Cek omzet, buka/tutup toko |

`add_product` via WA **di-cut MVP** — butuh wizard multi-turn + upload gambar + sync Meta Catalog. Terlalu kompleks untuk fitur yang jarang dipakai. Owner tambah produk via dashboard.

---

## 5. Peta Komponen (lib/)

### Services (utilitas bersama)
| File | Isi | Status |
|---|---|---|
| `db.ts` | `supabaseAdmin` client + `getActiveProducts`, `getTenantByWaPhoneId` | ✅ |
| `gemini.ts` | `parserModel`, `ownerParserModel`, `generatorModel` | ✅ |
| `session.ts` | In-memory session store (get/set/clear/cleanup) | ✅ |
| `whatsapp.ts` | `sendWhatsAppMessage`, `sendCatalogMessage`, upload/image | ✅ |
| `midtrans.ts` | QRIS Core API, signature verify, processOrderConfirmation | ⚠️ stub |
| `response-template.ts` | Semua template teks customer | ✅ |

### Parsing / AI
| File | Isi | Status |
|---|---|---|
| `intent-parser.ts` | `parseCustomerMessage` → ParsedIntent (customer) | ✅ |
| `owner-parser.ts` | `parseOwnerCommand` → OwnerCommand (owner) | ✅ |
| `owner-query.ts` | `queryRevenueData` → RevenueData (DB, no LLM) | ✅ |
| `owner-generator.ts` | `generateRevenueResponse` (LLM narasi) | ✅ |
| `product-filter.ts` | Keyword pre-filter (skala katalog besar) | ⚠️ stub |

### Handlers (lib/handlers/)
| File | Intent/peran | Status |
|---|---|---|
| `browse.ts` | `browse` — kirim WA Catalog | ✅ (perlu typing) |
| `status.ts` | `order_status` — cek status order | ✅ |
| `handoff.ts` | `low_confidence` — eskalasi ke owner | ✅ |
| `owner.ts` | Owner command dispatcher + confirm flow | ✅ |
| `order.ts` | `order_new` + processOrderConfirmation | ⚠️ stub |
| `cart-order.ts` | Cart dari WA Catalog | ⚠️ stub |
| `cancel-order.ts`, `repeat-last.ts`, `modify-order.ts` | Post-MVP (cut → low_confidence) | ⚠️ stub |

### Types (lib/types/)
`db.ts` (Supabase-generated + Db* narrowed types), `session.ts`, `whatsapp.ts`, `tenant.ts`, `index.ts` (barrel).

---

## 6. Data Model (ringkas)

```
tenants ──< users          (owner + customer per tenant)
tenants ──< products       (katalog, punya reorder_point)
tenants ──< orders ──< order_items >── products
orders  >── users          (order milik 1 customer)
```

**Field kritis:**
- `products.price` = INTEGER Rupiah (bukan float). `products.stock` = NUMERIC(10,3) (support 2.5 kg). `products.reorder_point` = threshold low-stock per produk.
- `order_items.price_at_order` = snapshot harga. `order_items.qty` = NUMERIC (support desimal).
- `orders.status` flow: `PENDING → CONFIRMED → AWAITING_PAYMENT → PAID → FULFILLED → DONE` (+ `CANCELLED`).

---

## 7. Owner Command Subsystem (yang baru dibangun)

```
Owner WA ──▶ handleOwnerCommand(tenant, phone, text, session)
                  │
       awaiting_owner_confirmation? ──▶ handleOwnerConfirmation (ya/batal → DB write)
                  │ tidak
                  ▼
       fetch produk aktif → parseOwnerCommand (Gemini) → OwnerCommand
                  │
                  ▼  switch(action)
   ┌──────────────┼───────────────────────────────────┐
   │ READ         │ LOW RISK        │ MUTASI (confirm)  │
   │ get_revenue  │ open_store      │ update_price      │
   │ get_stock    │ close_store     │ update_stock      │
   │              │                 │ set_reorder_point │
   │              │                 │ deactivate_product│
   └──────────────┴─────────────────┴───────────────────┘
```

**OwnerCommand schema:** `action` (enum 10), `product_index?`, `value?` (absolut), `delta?` (relatif stok ±), `period?`, `confidence`. Mutasi → `setSession(awaiting_owner_confirmation)` + `PendingOwnerAction` → tunggu "ya" → DB write → `clearSession`.

**Owner & customer share session store** (key `phone:tenantId`) — tidak bentrok karena owner_phone ≠ customer phone.

---

## 8. Customer Order Flow (target — sebagian masih stub)

```
"kaos oversize 2 sama celana cargo 1"
   → parseCustomerMessage → intent: order_new, items: [{index:3,qty:2},{index:5,qty:1}]
   → handleOrderIntent: map index→produk, validasi stok, snapshot harga
   → orderConfirmationMessage → session: awaiting_confirmation
   → customer "ya" → processOrderConfirmation:
       INSERT order + items → Midtrans charge → QR image → kirim WA → notif owner
```
> `handleOrderIntent` + `processOrderConfirmation` masih TODO (order.ts & midtrans.ts stub). Webhook saat ini fallback order_new → handoff agar tidak silent fail.

---

## 9. Payment Flow (Midtrans Core API)

Kenapa Core API bukan Snap: Snap return `redirect_url` (customer keluar WA buka browser). Core API return `qr_string` → generate PNG → kirim sebagai **gambar WA**. Customer scan langsung di chat.

Callback: selalu return HTTP 200 (Midtrans retry kalau non-2xx → risiko duplikat). Lookup order by `midtrans_id`, bukan internal id. Signature: `SHA-512(orderId + statusCode + grossAmount + serverKey)`.

> Status: stub. Implementasi penuh menyusul.

---

## 10. Status Implementasi MVP

| Bagian | Status |
|---|---|
| Webhook entry + routing | ✅ |
| Customer intent parser (Gemini) | ✅ |
| Browse, status, handoff handlers | ✅ |
| Owner command (parse + analytics + mutasi + confirm) | ✅ |
| Owner analytics query (revenue, lowStock) | ✅ |
| Session + state machine | ✅ |
| Migration reorder_point | ✅ (perlu dijalankan di Supabase) |
| **Customer order handler** (`order.ts`) | ⚠️ **TODO** |
| **Cart order** (`cart-order.ts`) | ⚠️ **TODO** |
| **Payment** (`midtrans.ts`) | ⚠️ **TODO** |
| Dashboard UI + API routes | ⚠️ TODO |

**Jalur kritis berikutnya:** order.ts → midtrans.ts → cart-order.ts (ini happy path demo utama).

---

## 11. Anti-Patterns (jangan lakukan)

```
❌ product_name di schema     → pakai product_index (integer)
❌ INTEGER untuk qty          → NUMBER (support desimal kg/L)
❌ Midtrans Snap              → Core API (Snap tidak return qr_string)
❌ Redis untuk session        → in-memory Map + --max-instances=1
❌ product.price untuk total  → price_at_order (snapshot)
❌ SUM(qty) untuk top produk  → SUM(qty × price_at_order) (revenue)
❌ stock < 5 global threshold → reorder_point per-produk
❌ LLM ranking/hitung          → fetch-then-inject, server yang hitung
❌ Owner mutasi tanpa confirm → echo + tunggu "ya" dulu
❌ Web API FormData upload     → npm package form-data
❌ ORDER BY random produk      → ORDER BY name ASC (deterministic index)
```

---

## 12. Yang Sengaja Di-Cut MVP (+ alasan)

| Fitur | Alasan cut | Fallback |
|---|---|---|
| `cancel_order`, `repeat_last`, `modify_order` | Edge case kompleks, jarang di-demo | → low_confidence → handoff |
| `add_product` via WA | Wizard multi-turn + gambar + Meta Catalog sync | → dashboard |
| Gemini context caching | Butuh min 32K token, katalog kita ~150 token | Kirim full list (cukup untuk <50 produk) |
| Redis session | Single instance cukup untuk hackathon | in-memory Map |
| Multi-instance scaling | Out of scope demo | `--max-instances=1` |

---

## Referensi

- Detail per-modul: `notes/00-overview.md` s/d `notes/11-full-intent-roadmap.md`
- Project context Claude Code: `CLAUDE.md` (root project)
- Memory keputusan: `owner-analytics-design`, `owner-command-architecture` (Claude memory)
