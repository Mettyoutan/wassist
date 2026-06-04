# WAssist — Progress Tracker
> Selalu baca file ini di awal sesi sebelum melakukan apapun.
> Update segera setelah task selesai atau bug ditemukan.

---

## Status Umum
- **Deadline submit:** 11 Juni 2026
- **Target selesai:** 8 Juni 2026
- **Last updated:** 4 Juni 2026
- **Build status:** ✅ 0 TypeScript error (`npm run build` clean)
- **Deploy status:** ❌ Belum di-deploy ke Cloud Run (BLOCKER)

---

## ✅ SELESAI

### Bot / Webhook
- [x] `app/api/webhook/wa/route.ts` — entry point, state machine check, intent router
- [x] `lib/handlers/order-new.ts` — slot-filling: ambiguous, missing_qty, invalid_qty, out_of_stock
- [x] `lib/handlers/clarification.ts` — jawaban clarification + retry_count + graceful degradation
- [x] `lib/handlers/confirm-order.ts` — QRIS via Midtrans Core API, upload image ke WA
- [x] `lib/handlers/browse.ts` — kirim WA Catalog atau fallback teks
- [x] `lib/handlers/status.ts` — cek status order terakhir customer
- [x] `lib/handlers/handoff.ts` — low_confidence → handoff ke owner
- [x] `lib/handlers/owner.ts` — 11 owner actions + mutation confirmation flow
- [x] `lib/handlers/cart-order.ts` — Cart dari WA Catalog (meta order type)

### AI / LLM
- [x] `lib/ai/models.ts` — 3 model Gemini (customerParser 0.1, ownerParser 0.1, generator 0.4)
- [x] `lib/ai/customer-parser.ts` — parseCustomerMessage + buildCustomerIntentPrompt
- [x] `lib/owner/parser.ts` — parseOwnerCommand (11 actions, confidence threshold)
- [x] `lib/owner/generator.ts` — generateRevenueResponse (fetch-then-inject pattern)

### Payment
- [x] `lib/midtrans.ts` — createQrisPayment (Core API, bukan Snap), verifyMidtransSignature
- [x] `app/api/webhook/midtrans/route.ts` — callback PAID → updateOrderStatus + decrementProductStock + notif

### Dashboard
- [x] `app/dashboard/page.tsx` — home, real KPI + 5 order terakhir
- [x] `app/dashboard/orders/page.tsx` — tab pending/diproses/selesai, auto-refresh 30s, finishHandler
- [x] `app/dashboard/products/page.tsx` — server component, real stock dari DB
- [x] `app/dashboard/analytics/page.tsx` → `components/dashboard/AnalyticsView.tsx`

### API Routes
- [x] `app/api/dashboard/kpi/route.ts` — GET KPI + pendingCount + tenantName
- [x] `app/api/orders/route.ts` — GET list orders, status mapping, date format
- [x] `app/api/orders/[id]/route.ts` — PATCH finish order (action: "finish" → DONE)
- [x] `app/api/products/route.ts` — GET products + soldToday dari queryRevenueData
- [x] `app/api/dashboard/handoff/route.ts` — stub `[]` (post-MVP)
- [x] `app/api/auth/magic-link/route.ts` — stub 501 (Auth Opsi B, post-hackathon)

### Database
- [x] `server/db/orders.ts` — getOrdersByTenant (with nested join users + order_items)
- [x] `server/db/products.ts` — getProductsForDashboard (id, name, price, unit, stock, reorder_point, image_url)
- [x] Semua fungsi DB lain (createOrder, updateOrderMidtrans, dll)

---

## 🐛 BUG DITEMUKAN — semua sudah fix

### Bug 1 — `current_order` context tidak pernah diisi [MEDIUM]
- **File:** `app/api/webhook/wa/route.ts` sekitar baris call `parseCustomerMessage`
- **Masalah:** `buildCustomerIntentPrompt` punya field `current_order?` untuk kirim konteks order aktif ke Gemini, tapi TIDAK PERNAH diisi di webhook handler. Gemini tidak tahu customer sudah punya pesanan apa.
- **Dampak demo:** Customer tidak bisa bilang "tambah 1 lagi" — bot tidak paham konteks
- **Status:** ✅ Fixed 2026-06-04

### Bug 2 — StockNotification hardcode "porsi" [HIGH - terlihat di demo]
- **File:** `components/dashboard/StockNotification.tsx` line 39
- **Masalah:** `"Terjual {item.soldToday} porsi hari ini"` — "porsi" hardcoded, fashion store tidak jual "porsi"
- **Status:** ✅ Fixed 2026-06-04

### Bug 3 — StockNotification broken image [MEDIUM]
- **File:** `components/dashboard/StockNotification.tsx` line 31
- **Masalah:** `<img src={item.image}>` tidak ada fallback. Jika `image_url` null → broken image icon
- **Fix applied:** Conditional render dengan emoji 👗 placeholder
- **Status:** ✅ Fixed 2026-06-04

### Bug 4 — Browse fallback tidak tampilkan unit [LOW]
- **File:** `lib/handlers/browse.ts` line 15
- **Masalah:** List produk tidak tampilkan satuan — customer tidak tahu "pcs" atau "kg"
- **Status:** ✅ Fixed 2026-06-04

### Bug 5 — WA button di OrderAccordion tidak bisa di-tap [MEDIUM - terlihat di demo]
- **File:** `components/dashboard/OrderAccordion.tsx` line 42
- **Masalah:** Button WA icon ada tapi tidak ada `href` atau `onClick` → tidak bisa buka WA
- **Fix applied:** `<button>` → `<a href="https://wa.me/...">` dengan `.replace(/\D/g, "")`
- **Status:** ✅ Fixed 2026-06-04

---

## 📋 TODO (berurutan prioritas)

### CRITICAL — blocker demo nyata
- [ ] Cloud Run deploy + update Meta Developer Console webhook URL
- [ ] End-to-end test dari WA real device setelah deploy

### HIGH — terlihat juri saat demo
- [x] Fix Bug 2: StockNotification "porsi" → unit ✅ 2026-06-04
- [x] Fix Bug 3: StockNotification broken image → placeholder emoji 👗 ✅ 2026-06-04
- [x] Fix Bug 5: WA button di OrderAccordion → href wa.me ✅ 2026-06-04
- [x] Fix Bug 1: Pass `current_order` ke Gemini context ✅ 2026-06-04

### MEDIUM — polish
- [x] Fix Bug 4: Browse fallback tampilkan unit ✅ 2026-06-04
- [x] design.md — design system doc ✅ 2026-06-04
- [x] globals.css — hapus duplicate Bootstrap, unify CSS vars WA color tokens ✅ 2026-06-04
- [x] BottomNav.tsx — 4-tab bottom nav (Beranda/Pesanan/Produk/Analitik) ✅ 2026-06-04
- [x] Navbar.tsx — auto-derive title dari pathname, fix warna ke CSS vars ✅ 2026-06-04
- [x] layout.tsx — add BottomNav, padding-bottom 72px ✅ 2026-06-04
- [x] StatusBadge.tsx — selesai→accent green, diproses→blue, pending→warning ✅ 2026-06-04
- [x] KPICard.tsx — background --color-bg ✅ 2026-06-04
- [x] /dashboard/settings — stub page ✅ 2026-06-04
- [x] /dashboard/account — stub page dengan info tenant ✅ 2026-06-04
- [ ] Upload product images ke Supabase Storage
- [ ] Seed demo data: order PAID + stok bervariasi (ada yang menipis)

### LOW — nice to have
- [ ] `GET /api/orders/[id]` — detail endpoint (masih 501)
- [ ] KPI `change` prop (perbandingan periode, hardcoded 0)
- [ ] `GET /api/dashboard/handoff` real implementation
- [ ] Toast notifications untuk aksi (finish order)
- [ ] Empty states saat data kosong

### POST-HACKATHON (jangan kerjakan sekarang)
- [ ] Auth Opsi B: magic link JWT via `jose`
- [ ] Meta Catalog setup (Meta Commerce Manager)
- [ ] Redis session (sekarang in-memory Map)

---

## 📝 Catatan Sesi

### 2026-06-04 (sesi 2)
- Mobile UI Polish Phase 1-5 selesai semua
- design.md dibuat (design system reference)
- globals.css: hapus duplicate Bootstrap, WA color token system
- BottomNav 4-tab + Navbar dynamic title + layout padding-bottom 72px
- StatusBadge color fix, KPICard bg fix
- Stub pages settings + account (anti-404)
- Build ✅ 0 TypeScript error, 17 routes

### 2026-06-04 (sesi 1)
- Analisis mendalam LLM integration: 3 model Gemini, candidate_indices, fetch-then-inject
- Update CLAUDE.md: last updated, MVP Scope table, Known Bugs section
- Ditemukan 5 bug (dicatat di atas)
- Demo script dirancang: ambiguous product → candidate_indices → slot-filling → QRIS → owner analytics

### 2026-06-01
- Dashboard 4 halaman selesai terhubung ke Supabase real data
- Fix naming bug `routes.ts` → `route.ts` (3 file dead routes)
- Auth Opsi A aktif: `DEMO_TENANT_ID` env var
- Build passing 0 error
- ngrok issue → solved dengan `npm run build && npm start`
