# WAssist — Build Guide
> Panduan implementasi step-by-step. Baca `notes/00-overview.md` dulu sebelum ini.
> Last updated: 28 Mei 2026

---

## Cara Pakai Guide Ini

Setiap sesi coding, buka guide ini dan cari fase yang sedang dikerjakan.
Setiap fase punya:
1. **Konsep** — kenapa bagian ini ada dan bagaimana cara kerjanya
2. **Urutan file** — file mana yang dibuat duluan dan kenapa
3. **TDD** — tes yang harus ditulis SEBELUM implementasi
4. **Implementasi** — kode aktual (ada di notes/)
5. **Checklist** — cara verifikasi selesai

**Rule TDD yang harus diikuti:**
- Tulis test DULU, jalankan, pastikan MERAH
- Baru tulis implementasi
- Jalankan test lagi, pastikan HIJAU
- Refactor jika perlu

---

## Status Saat Ini (28 Mei 2026)

```
✅ DONE
  - Next.js project init
  - Dependencies installed (gemini, supabase, midtrans, zod)
  - notes/ folder lengkap (spec semua komponen)
  - .env.example sudah ada

🔲 TODO
  [ ] Phase 0: Testing setup + project config
  [ ] Phase 1: TypeScript types layer
  [ ] Phase 2: Core services (DB, session, constants)
  [ ] Phase 3: AI layer (Gemini, intent parser, templates)
  [ ] Phase 4: WhatsApp service
  [ ] Phase 5: Product services (cache, filter, utils)
  [ ] Phase 6: Handlers (browse, order, cart, status, handoff, owner)
  [ ] Phase 7: API routes (webhook, orders, products, dashboard)
  [ ] Phase 8: Payment (Midtrans QRIS)
  [ ] Phase 9: Dashboard UI
  [ ] Phase 10: Deployment (Dockerfile, Cloud Run)
```

---

## Phase 0 — Foundation Setup

### Konsep
Sebelum nulis kode bisnis apapun, kita perlu:
1. **Testing infrastructure** — tanpa ini kita tidak bisa TDD
2. **tsconfig paths** — agar import `@/lib/...` bisa bekerja
3. **next.config.ts** — tambah `output: 'standalone'` untuk Docker nanti
4. **`.env.local`** — copy dari `.env.example`

### Mengapa Testing Infrastructure Penting?
TDD = tulis test dulu, baru kode. Tanpa test runner, kita tidak bisa validate apapun.
Kita pilih **Vitest** (bukan Jest) karena:
- Lebih cepat (native ESM, no transpilation overhead)
- Kompatibel dengan Next.js 14+
- API hampir identik dengan Jest (mudah dipelajari)

### File yang Perlu Dibuat/Diubah
1. `vitest.config.ts` — konfigurasi vitest
2. `tsconfig.json` — pastikan path alias `@/*` ada
3. `next.config.ts` — tambah `output: 'standalone'`
4. `package.json` — tambah scripts `test`, `test:coverage`
5. `.env.local` — copy dari `.env.example` (manual, tidak di git)

### Dependencies yang Perlu Diinstall
```bash
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom
```

### Checklist Phase 0
- [ ] `npm test` berjalan (0 tests, tapi tidak error)
- [ ] Import `@/lib/anything` tidak error TypeScript
- [ ] `next.config.ts` punya `output: 'standalone'`

---

## Phase 1 — TypeScript Types Layer

### Konsep
TypeScript types adalah "kontrak" antara semua bagian sistem.
Buat ini DULU sebelum implementasi apapun karena:
- Handler butuh tahu bentuk `Session`
- Webhook butuh tahu bentuk `WAWebhookBody`
- DB queries butuh tahu bentuk `DbOrder`

**Urutan file di `lib/types/`:**
```
1. db.ts        — bentuk baris dari database (DbTenant, DbProduct, DbOrder, dll)
2. whatsapp.ts  — bentuk pesan dari Meta (WAWebhookBody, WAMessage, dll)
3. tenant.ts    — Tenant type (subset dari DbTenant, untuk runtime)
4. session.ts   — Session state machine types
5. index.ts     — barrel re-export semua types
```

### Mengapa Urutan Ini?
- `db.ts` tidak depend ke file lain → bisa dibuat pertama
- `session.ts` depend ke `PendingOrderItem` yang butuh field dari produk di DB
- `index.ts` dibuat terakhir karena re-export semua

### Spec lengkap ada di
`notes/02-database.md` → DbTenant, DbProduct, DbOrder, DbOrderItem, DbUser
`notes/04-whatsapp-api.md` → WAWebhookBody, WAMessage, WAOrderItem, dll
`notes/05-order-flow.md` → Session, SessionState, PendingOrder, PendingOrderItem

### Checklist Phase 1
- [ ] Semua types export dari `@/lib/types`
- [ ] TypeScript tidak error
- [ ] `import type { Session, DbOrder } from "@/lib/types"` works

---

## Phase 2 — Core Services

### Konsep
Tiga service paling dasar yang hampir semua bagian lain butuhkan:

**1. `lib/db.ts` — Supabase Client**
Entry point ke database. Hanya export satu object: `supabaseAdmin`.
Kenapa `supabaseAdmin`? Karena semua operasi kita di server-side (API routes, webhooks),
dan kita butuh full access. Jangan pernah expose `SUPABASE_SERVICE_ROLE_KEY` ke browser.

**2. `lib/session.ts` — In-Memory Session Store**
State machine percakapan per customer. Satu customer = satu session aktif.
Session berisi: state saat ini (idle/awaiting_confirmation/awaiting_payment),
pending order jika ada, dan retry count untuk handoff logic.

Kenapa in-memory dan bukan Redis?
- Hackathon: setup Redis = kompleksitas tidak perlu
- Set `--max-instances=1` di Cloud Run → semua request ke instance yang sama
- Session hilang jika server restart → acceptable untuk demo

**3. `lib/constants/confirmation-keywords.ts`**
Set kata-kata yang dianggap "ya" dan "batal" oleh state machine.
Kenapa Set bukan Array? O(1) lookup vs O(n). Setiap pesan masuk melalui ini.

### Urutan File
```
1. lib/db.ts                            — tidak depend ke file lain
2. lib/constants/confirmation-keywords.ts — standalone
3. lib/session.ts                       — depend ke types/session.ts
```

### Spec Lengkap
`notes/02-database.md` → Koneksi ke Supabase
`notes/05-order-flow.md` → Session Store + Confirmation Keywords

### TDD untuk Phase 2
```
lib/__tests__/session.test.ts   — test getSession/setSession/clearSession/TTL
```

### Checklist Phase 2
- [ ] `supabaseAdmin` bisa di-import tanpa error
- [ ] `getSession` return idle session jika tidak ada
- [ ] `setSession` simpan session dengan benar
- [ ] `clearSession` hapus session
- [ ] Session expired (TTL 30 menit) return idle session

---

## Phase 3 — AI Layer

### Konsep
Ini bagian paling kritis — bobot juri 25%.

**Dua model, dua fungsi berbeda:**
- `parserModel` (gemini-2.0-flash) — parsing customer intent
  - `responseSchema` enforcement → JSON selalu valid dan sesuai struktur
  - temperature 0.1 → deterministik, tidak kreatif
  - Kenapa responseSchema? Tanpa ini, 2-5% call bisa return JSON rusak = order gagal

- `generatorModel` (gemini-2.5-flash-lite) — generate owner responses
  - Free-form text → tidak perlu schema
  - temperature 0.4 → sedikit kreatif untuk narasi bisnis

**7 Intent yang dikenali:**
1. `order_new` — customer mau pesan
2. `browse` — mau lihat katalog
3. `repeat_last` — mau order ulang (cut di MVP → fallback low_confidence)
4. `modify_order` — ubah order (cut di MVP → fallback low_confidence)
5. `cancel_order` — batalkan (cut di MVP → fallback low_confidence)
6. `order_status` — cek status pesanan
7. `low_confidence` — tidak yakin → human handoff

**Kenapa product_index bukan product_name?**
LLM lebih reliable return angka dari list yang ada di konteks daripada mereproduksi
string nama persis. Angka = exact, tidak ada typo problem.

**Kenapa stock tidak dikirim ke prompt?**
Stock berubah setiap order masuk. Data stale di prompt = misinformasi ke LLM.
Validasi stock adalah tugas handler, bukan parser.

### Urutan File
```
1. lib/gemini.ts              — init dua model
2. lib/intent-parser.ts       — parseCustomerMessage + Zod validation
3. lib/response-templates.ts  — template pesan customer (TIDAK pakai Gemini)
4. lib/owner-generator.ts     — generateRevenueResponse via generatorModel
```

### Spec Lengkap
`notes/03-ai-llm.md` → kode lengkap semua file di atas

### TDD untuk Phase 3
```
lib/__tests__/intent-parser.test.ts      — test dengan USE_MOCK_LLM=true
lib/__tests__/response-templates.test.ts — test format pesan
```

**Penting:** Gunakan `USE_MOCK_LLM=true` di test, jangan call Gemini API saat unit test.

### Checklist Phase 3
- [ ] `parserModel` dan `generatorModel` berhasil init
- [ ] `parseCustomerMessage` dengan mock return ParsedIntent valid
- [ ] Confidence < 0.70 → return `low_confidence`
- [ ] `orderConfirmationMessage` format output yang benar dengan unit produk

---

## Phase 4 — WhatsApp Service

### Konsep
Dua fungsi yang hampir semua handler pakai:
- `sendWhatsAppMessage(to, body)` — kirim teks biasa
- `sendCatalogMessage(to, catalogId, bodyText)` — kirim WA Catalog (Wow Moment #1)

### Spec Lengkap
`notes/04-whatsapp-api.md` → TypeScript types + implementasi lengkap

### TDD
```
lib/__tests__/whatsapp.test.ts — mock fetch, verify payload yang dikirim
```

### Checklist Phase 4
- [ ] sendWhatsAppMessage: auth header benar, payload benar
- [ ] sendCatalogMessage: payload interactive catalog benar
- [ ] Error handling: log error, return { success: false }

---

## Phase 5 — Product Services

### Konsep
- `lib/product-cache.ts` — cache produk per tenant, TTL 5 menit
- `lib/utils.ts` — `toRetailerId()` konversi nama → slug
- `lib/product-filter.ts` — filter relevance (untuk katalog > 50 produk, opsional MVP)

### Spec Lengkap
`notes/03-ai-llm.md` → product-cache.ts + product-filter.ts

### Checklist Phase 5
- [ ] Cache hit saat TTL belum habis
- [ ] Cache miss setelah invalidate
- [ ] ORDER BY name ASC — deterministik untuk product_index

---

## Phase 6 — Handlers

### Konsep
Handler = fungsi yang menangani satu intent. State machine check DULU sebelum Gemini.

**Urutan state check di webhook:**
```
awaiting_confirmation → cek CONFIRM/CANCEL keywords (tanpa Gemini)
awaiting_payment      → kirim ulang link (tanpa Gemini)
idle                  → jalankan Gemini → route ke handler
```

**Jalur MVP yang dibangun:**
1. Browse (`browse.ts`) — kirim WA Catalog, fallback teks
2. Order (`order.ts`) — parse intent, validasi stok, konfirmasi, session
3. Cart Order (`cart-order.ts`) — order dari WA Catalog (tanpa LLM)
4. Status (`status.ts`) — cek order terakhir dari DB
5. Handoff (`handoff.ts`) — retry → escalate ke owner
6. Owner (`owner.ts`) — omzet, stok, buka/tutup

### Urutan Build (paling simple ke paling complex)
```
1. browse.ts    — tidak ada DB write, tidak ada state
2. status.ts    — DB read saja
3. handoff.ts   — DB write sederhana
4. order.ts     — DB read/write + session + konfirmasi
5. cart-order.ts — mirip order.ts
6. owner.ts     — Gemini Mode 1+2 + multiple DB queries
```

### Spec Lengkap
`notes/05-order-flow.md` → semua handler dengan kode lengkap

### Checklist Phase 6
- [ ] Browse: catalog_message jika ada, text fallback jika tidak
- [ ] Status: message yang benar untuk tiap 7 status
- [ ] Handoff: retry_count logic benar, notif owner
- [ ] Order: validasi stok, skip item tidak ada, konfirmasi dengan unit
- [ ] CartOrder: re-fetch harga dari DB (bukan dari cart)
- [ ] processOrderConfirmation: INSERT order + items ke DB (disambung Phase 8)

---

## Phase 7 — API Routes

### Konsep
Webhook routes = endpoint yang Meta dan Midtrans panggil.
Dashboard API = endpoint yang React UI panggil untuk data.

**Aturan webhook kritis:**
- Selalu return HTTP 200 (bungkus semua logic dalam try/catch)
- Verify HMAC dari Meta sebelum proses

### Spec Lengkap
`notes/05-order-flow.md` → webhook route lengkap
`notes/06-dashboard.md` → dashboard API endpoints

### Checklist Phase 7
- [ ] GET /webhook/wa: echo challenge dengan verify_token yang benar
- [ ] POST /webhook/wa: HMAC verify, route ke handler yang benar
- [ ] POST /webhook/midtrans: signature verify, update order ke PAID
- [ ] GET /api/dashboard/kpi: omzet, count, AOV dari DB

---

## Phase 8 — Payment (Midtrans QRIS)

### Konsep
`processOrderConfirmation` (dipanggil saat customer balas "ya"):
1. INSERT order ke DB (AWAITING_PAYMENT)
2. INSERT order_items
3. Panggil Midtrans → dapat payment URL
4. Kirim QR image ke customer
5. Set session awaiting_payment

Midtrans callback (POST /api/webhook/midtrans):
1. Verify signature
2. Update order PAID
3. Kirim notif WA ke customer + owner
4. clearSession

### Spec Lengkap
`notes/07-payment.md` → implementasi lengkap termasuk QR image

### Checklist Phase 8
- [ ] createQrisPayment return { paymentUrl } dari Midtrans sandbox
- [ ] Order tersimpan di DB dengan midtrans_id
- [ ] Customer terima notif setelah bayar
- [ ] Owner terima notif setelah bayar

---

## Phase 9 — Dashboard UI

### Tambahan Deps
```bash
npm install recharts jose
```

### Spec Lengkap
`notes/06-dashboard.md` → semua pages + API integration

### Checklist Phase 9
- [ ] KPI cards menampilkan data real
- [ ] Order list bisa filter by status
- [ ] Mobile responsive
- [ ] Magic link auth bekerja

---

## Phase 10 — Deployment

### Spec Lengkap
`notes/08-deployment.md` → Dockerfile + Cloud Run steps

### Checklist Phase 10
- [ ] docker build sukses
- [ ] Deploy ke Cloud Run berhasil
- [ ] Update webhook URL di Meta + Midtrans
- [ ] Test end-to-end dari HP nyata

---

## Quick Reference

| Butuh apa? | Lihat di mana? |
|---|---|
| Schema DB | `notes/02-database.md` |
| Kode Gemini | `notes/03-ai-llm.md` |
| WA API types | `notes/04-whatsapp-api.md` |
| Handler implementations | `notes/05-order-flow.md` |
| Dashboard pages | `notes/06-dashboard.md` |
| Midtrans QRIS | `notes/07-payment.md` |
| Deployment | `notes/08-deployment.md` |
| Demo script | `notes/09-demo-and-timeline.md` |
