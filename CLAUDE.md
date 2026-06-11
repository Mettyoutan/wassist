# CLAUDE.md — WAssist Project Context
> Last updated: 10 Juni 2026

## Apa Ini

WAssist: otomasi pemesanan WA untuk UMKM. Customer chat → Gemini parse → QRIS → notif owner.
**Hackathon:** Gunadarma Code Week 2.0, deadline **11 Juni 2026**.
**Demo tenant:** Olshop Mbak Rina (fashion, 16 produk, `tenant_id: 3b0a38de-811c-40b5-af83-c866e198da12`, `owner_phone: 6287715781238`, tanpa `+`).

---

## Behaviour Rules

1. **Think first** — state assumptions, surface tradeoffs, push back if simpler approach exists.
2. **Simplicity first** — minimum code, no speculative features, no abstractions for single-use code.
3. **Surgical changes** — touch only what's needed, match existing style, remove only orphans YOUR changes created.
4. **Goal-driven** — define verifiable success criteria before implementing.

---

## Auth Strategy

**Aktif (demo mode):** semua API route baca `DEMO_TENANT_ID` langsung dari env. Tidak ada JWT/login.
**Post-hackathon:** magic link via `jose` JWT — stub di `app/api/auth/magic-link/route.ts` (501).

---

## Stack Final

| Layer | Teknologi | Constraint |
|---|---|---|
| Framework | Next.js 16 App Router | API + UI satu project |
| AI — Parser (customer/owner/confirm/clarify) | `gemini-3.1-flash-lite` + `responseSchema` | Temperature 0.1 |
| AI — Generator (owner analytics) | `gemini-3.1-flash-lite` | Temperature 0.4 |
| Database | PostgreSQL via Supabase | `supabaseAdmin` service role |
| Session | In-memory `Map` | **Bukan Redis** — `--max-instances=1` |
| Payment | Midtrans **Core API** | return `qr_string` untuk PNG |
| WA API | Meta WhatsApp Cloud API v19.0 | |
| Deploy | GCP Cloud Run, `asia-southeast1` | `--min-instances=1 --max-instances=1` |

---

## Environment Variables

```env
META_PHONE_NUMBER_ID=1130913063438393   # Meta Phone Number ID (bukan nomor HP)
META_ACCESS_TOKEN=EAAxxxxx
META_VERIFY_TOKEN=wassist_verify_2026
GEMINI_API_KEY=AIzaSy...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co   # TANPA trailing /rest/v1/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
NEXT_PUBLIC_STORAGE_BUCKET=product-images
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
MIDTRANS_IS_PRODUCTION=false
JWT_SECRET=random-secret-min-32-chars
NEXT_PUBLIC_APP_URL=http://localhost:3000
DEMO_TENANT_ID=3b0a38de-811c-40b5-af83-c866e198da12
```

---

## Struktur Folder

```
app/api/webhook/wa/route.ts        ← ENTRY POINT semua pesan WA
app/api/webhook/midtrans/route.ts  ← payment callback
app/api/orders/route.ts + [id]/    ← dashboard orders
app/api/products/route.ts + [id]/  ← dashboard products
app/api/dashboard/kpi/route.ts     ← omzet, count, pending
app/dashboard/                     ← React UI owner
components/dashboard/              ← KPICard, OrderTable, OrderAccordion, ...
server/db/                         ← SEMUA DB queries (import via @/server/db)
  products.ts / orders.ts / users.ts / tenants.ts / analytics.ts / index.ts
lib/ai/models.ts                   ← 5 Gemini model instances
lib/ai/customer-parser.ts          ← parseCustomerMessage
lib/ai/confirmation-parser.ts      ← parseConfirmationIntent, parseClarificationInput
lib/handlers/                      ← satu file per intent/flow
lib/owner/parser.ts + generator.ts ← owner command flow
lib/response-template.ts           ← SEMUA string pesan WA
lib/session.ts                     ← in-memory Map, TTL 30 menit, peekExpiredSession
lib/midtrans.ts                    ← createQrisPayment, getMidtransQrString
lib/whatsapp.ts                    ← sendWhatsAppMessage, sendWhatsAppImageMessage
scripts/delete-demo.sql + seed-demo.sql
next.config.ts                     ← output: "standalone", allowedDevOrigins ngrok
```

---

## Database Schema

> `id` pakai `DEFAULT gen_random_uuid()` — jangan pass manual kecuali tenant demo.

```
tenants:     id, name, owner_phone(628xxx), wa_business_phone_id, plan, status, is_open, category
users:       id, tenant_id, phone, name, role(OWNER/CUSTOMER), last_address — UNIQUE(tenant_id,phone)
products:    id, tenant_id, name, price(INT Rp), stock(NUMERIC), unit, category, is_active, image_url, reorder_point
orders:      id, tenant_id, customer_user_id, status, total_amount(INT), payment_status, midtrans_id, notes
order_items: id, order_id, product_id, qty(NUMERIC), price_at_order(INT snapshot), unit, size, notes
```

**Status flow:** `PENDING → AWAITING_PAYMENT → PAID → FULFILLED → DONE` (CANCELLED dari PENDING saja)

**TS types di `lib/types/db.ts`:** `DbProduct = Tables<"products">`, `DbOrder` dengan status/payment_status union overrides.

---

## AI/LLM — 5 Model Gemini

| Model | Dipakai | Output | Temp |
|---|---|---|---|
| `customerParserModel` | Parse pesan customer | `ParsedIntent` JSON | 0.1 |
| `ownerParserModel` | Parse perintah owner | `OwnerCommand` JSON | 0.1 |
| `confirmationParserModel` | Deteksi confirm/cancel | `signal` enum | 0.1 |
| `clarificationParserModel` | Parse jawaban varian/qty | `choices[]` + `cancel` | 0.1 |
| `generatorModel` | Narasi analytics owner | Free-form teks | 0.4 |

### Customer Intent (8)
```
order_new, browse, order_status, greeting, repeat_last, cancel_order, modify_order(→handoff), low_confidence(→handoff)
```
> ⚠️ Perubahan intent = update **3 tempat**: `models.ts` (systemInstruction+enum) + `customer-parser.ts` (Zod) + `webhook/wa/route.ts` (case)

### Owner Command (15)
```
get_revenue, get_orders, get_stock,
update_price*, update_stock*, set_reorder_point*, deactivate_product*, activate_product*,
open_store, close_store, mark_fulfilled, mark_done, mark_paid, help, unknown
(* = butuh konfirmasi owner)
```

### Rules
```typescript
qty: { type: SchemaType.NUMBER }   // bukan INTEGER — support desimal
// Zod: z.number().positive()      // bukan .int()
// Product list prompt format: "1. Nama — Rp85.000/pcs"  (unit wajib)
```

---

## Session State Machine

```typescript
type SessionState = "idle" | "awaiting_confirmation" | "awaiting_address"
                  | "awaiting_payment" | "awaiting_clarification" | "awaiting_owner_confirmation"
```

**Urutan check di webhook (JANGAN DIUBAH):**
```
1. State machine check — sebelum Gemini
   awaiting_confirmation  → parseConfirmationIntent()
   awaiting_address       → processOrderConfirmation(address)
   awaiting_clarification → handleClarificationAnswer()
   awaiting_payment       → QR resend / cancel / reminder
2. owner_phone === senderPhone → handleOwnerCommand()
3. else → parseCustomerMessage() → intent switch
```

**parseConfirmationIntent:**
- Customer: `parseConfirmationIntent(text)` — default "customer"
- Owner: `parseConfirmationIntent(text, "owner")` — WAJIB "owner" agar PENTING rule tidak berlaku

**parseClarificationInput:** `(text, kind, candidates: Array<{name:string}>, integerOnly, maxStock)` → `{choices: ClarificationChoice[], cancel}`

---

## Payment Flow (Core API)

```
1. createQrisPayment() → { midtransId, qrString }   ← FAST-FAIL sebelum createOrder
2. createOrder() + updateOrderMidtrans()
3. QRCode.toBuffer(qrString) → Buffer PNG            ← generate lokal, BUKAN fetch URL Midtrans
4. uploadWhatsAppMedia(buffer) → media_id
5. sendWhatsAppImageMessage() → cek result.success   ← tidak throw, return {success:false}
6. setSession → awaiting_payment
```

**Sandbox simulate:** `simulator.sandbox.midtrans.com/qris/index` → masukkan `order_id` → Approve → callback → PAID.

---

## MVP Scope (semua ✅)

Cart, browse, order_status, greeting, handoff, owner commands (15), order_new + clarification, QRIS end-to-end, Midtrans callback, Dashboard (home+orders+products+analytics), cancel_order, repeat_last, shipping address, saved address, mark_paid, low-stock alert, QR resend, session expiry, concurrent guard, product image upload, analytics real data.

---

## Dashboard Design System

```css
--color-primary: #075E54  --color-accent: #25D366  --color-blue: #00669E
--color-warning: #F59E0B  --color-danger: #EF4444  --color-bg: #F0F2F5
```

- Bottom nav 4 tab + hamburger drawer; navbar title dinamis
- `padding-bottom: 72px` main content; max-width 430px
- Font: 12px label, 13px body, 14px subheading, 18px KPI value

---

## Remaining Items (per 10 Juni 2026)

### Critical — demo blocker
- [ ] Seed: `scripts/delete-demo.sql` + `scripts/seed-demo.sql` di Supabase sebelum demo
- [ ] Update Meta webhook URL → ngrok URL terbaru
- [ ] E2E test bot dari WA real device

### Nice-to-have
- [ ] `GET /api/orders/[id]` — masih 501
- [ ] KPI `change` prop (perbandingan periode)

---

## Layer Separation

| Layer | Lokasi | Rule |
|---|---|---|
| DB queries | `server/db/*.ts` | Satu-satunya tempat `supabaseAdmin.from(...)` |
| Business logic | `lib/handlers/*.ts` | Import dari `@/server/db`, kirim WA |
| API routes | `app/api/**` | Orchestrate saja, tidak ada DB/logic langsung |
| AI/LLM | `lib/ai/*.ts` | Model calls + Zod parse saja |
| Templates | `lib/response-template.ts` | Pure string functions |

Fungsi DB baru → tulis di `server/db/`, export dari `server/db/index.ts`, import via `@/server/db`.

---

## Anti-Patterns

```
❌ supabaseAdmin.from(...) di luar server/db/
❌ Import dari @/lib/db atau langsung server/db/orders.ts — pakai @/server/db
❌ String pesan WA hardcode di handler — pakai lib/response-template.ts
❌ product_name di responseSchema — pakai product_index
❌ SchemaType.INTEGER / Zod .int() untuk qty — pakai NUMBER / .positive()
❌ Midtrans Snap API — pakai Core API
❌ Web API FormData untuk upload WA media — pakai npm form-data
❌ Redis session — in-memory Map + --max-instances=1
❌ product.price untuk total — pakai price_at_order (snapshot)
❌ item_price dari Meta Cart payload — stale, re-fetch dari DB
❌ SUM(qty) untuk top produk — rank by revenue (Rupiah)
❌ ORDER BY random di getActiveProducts — wajib ORDER BY name ASC
❌ NEXT_PUBLIC_SUPABASE_URL dengan trailing /rest/v1/
❌ META_PHONE_NUMBER_ID diisi nomor HP biasa
❌ owner_phone dengan + prefix — format 628xxx tanpa +
❌ owner_phone diisi nomor WA Business — harus nomor personal owner
❌ Update intent di customer-parser.ts saja — WAJIB update models.ts sekaligus
❌ Tambah fungsi DB tanpa export di server/db/index.ts
❌ Pass id manual di seed INSERT — biarkan gen_random_uuid()
❌ ON CONFLICT di seed script — seed DELETE dulu; upsertCustomer di app: valid
❌ fetch(midtrans_qr_url) untuk image — pakai qr_string + npm qrcode lokal
❌ Scan QR sandbox dengan app nyata — simulate via sandbox Midtrans
❌ CONFIRM_KEYWORDS / CANCEL_KEYWORDS Set — DIHAPUS, pakai parseConfirmationIntent()
❌ extractNumber regex — DIHAPUS, pakai parseClarificationInput()
❌ lib/constants/confirmation-keywords.ts — FILE DIHAPUS
❌ Keyword/regex matching untuk input customer — SELALU pakai Gemini
❌ parseClarificationInput dengan candidateCount:number — pakai candidates:Array<{name}>
❌ parseConfirmationIntent(text) untuk owner — WAJIB pass "owner" arg ke-2
❌ upsertCustomer tanpa cek owner_phone
❌ peekExpiredSession tanpa return setelah send expired message
❌ clearSession tidak dipanggil setelah PAID
❌ Math.min(qty, stock) di repeat_last tanpa adjustedItemNotes
❌ case "missing_qty" tanpa else branch — item silently dropped
❌ sendWhatsAppImageMessage return diabaikan — cek result.success
```

---

## Quick Commands

```bash
npm run dev
npm run build
npx tsx scripts/test-intent.ts

gcloud run deploy wassist \
  --source . --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances=1 --max-instances=1
```

---

## Referensi

| File | Isi |
|---|---|
| `progress.md` | Task tracker per sesi |
| `design.md` | Design system lengkap |
| `notes/00-overview.md` | Big picture, tim, bobot juri |
| `notes/03-ai-llm.md` | Gemini, prompt engineering |
| `notes/05-order-flow.md` | State machine detail |
| `notes/07-payment.md` | Midtrans Core API detail |
| `notes/08-deployment.md` | Cloud Run deploy |
| `notes/09-demo-and-timeline.md` | Demo script, Q&A juri |

## graphify

- `graphify query "<question>"` untuk codebase questions
- `graphify path "<A>" "<B>"` untuk relationships
- `graphify update .` setelah modifikasi kode

## Agent skills

Issues: GitHub (`github.com/Mettyoutan/wassist`). See `docs/agents/issue-tracker.md`.
Labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.
Domain: single-context, `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
