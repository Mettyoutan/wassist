# WAssist — Arsitektur Sistem
> Referensi: `docs/2026-05-09-wasist-master-spec.md` Section 4

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                  │
│                                                                  │
│  [Customer HP]─────WhatsApp Chat──────▶[Meta Cloud API]         │
│  [Owner HP]────────WhatsApp Chat──────▶[Meta Cloud API]         │
│                                               │                  │
│                                    webhook POST (HTTPS)          │
│                                               │                  │
└───────────────────────────────────────────────│──────────────────┘
                                                │
┌───────────────────────────────────────────────▼──────────────────┐
│                  GOOGLE CLOUD RUN (GCP)                           │
│                  Next.js Monorepo                                 │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  API Layer (/api/*)                                          │ │
│  │                                                             │ │
│  │  POST /api/webhook/wa         ← pesan masuk dari Meta       │ │
│  │  POST /api/webhook/midtrans   ← payment callback            │ │
│  │  GET  /api/dashboard/kpi      ← KPI data                    │ │
│  │  GET  /api/orders             ← list orders                 │ │
│  │  GET  /api/orders/[id]        ← detail order                │ │
│  │  *    /api/products           ← CRUD produk                 │ │
│  │  POST /api/auth/magic-link    ← generate JWT                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼────────────────────────────────────┐ │
│  │  Service Layer (lib/)                                        │ │
│  │                                                             │ │
│  │  gemini.ts    → parseCustomerMessage(), parseOwnerCommand() │ │
│  │  wa.ts        → sendWhatsAppMessage(), sendCatalogMessage() │ │
│  │  session.ts   → getSession(), setSession(), clearSession()  │ │
│  │  db.ts        → Supabase client + helper queries            │ │
│  │  midtrans.ts  → createQrisPayment(), verifySignature()      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼────────────────────────────────────┐ │
│  │  React UI (/app/dashboard/*)                                 │ │
│  │                                                             │ │
│  │  /dashboard          → Beranda (KPI cards)                  │ │
│  │  /dashboard/orders   → Order List + filter                  │ │
│  │  /dashboard/orders/[id] → Order Detail                      │ │
│  │  /dashboard/analytics → Charts (Recharts)                   │ │
│  │  /dashboard/products → Kelola Menu                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
          │                    │                      │
          ▼                    ▼                      ▼
[PostgreSQL/Supabase]  [Gemini 1.5 Flash]  [Midtrans Sandbox]
 orders, products,     Intent parsing,      QRIS generation,
 users, sessions,      owner commands       payment callback
 tenants
```

---

## Data Flow: Pesan Customer Masuk

Ini adalah alur yang paling penting untuk dipahami:

```
1. Customer kirim WA: "kaos oversize 2, celana cargo 1"
        │
        ▼
2. Meta WhatsApp Cloud API
   → Terima pesan
   → Kirim POST ke webhook URL kamu (Cloud Run)
   → Body: JSON berisi from, message type, text body
        │
        ▼
3. /api/webhook/wa (POST handler)
   a. Verifikasi HMAC signature (keamanan)
   b. Parse body → ambil: from (nomor pengirim), text, phone_number_id
   c. Cari tenant dari phone_number_id → getTenantByWaPhoneId()
   d. Cek: apakah pengirim adalah owner? → isOwner = (from === tenant.owner_phone)
        │
        ├── isOwner? → handleOwnerCommand()
        │
        └── bukan owner (customer) → handleCustomerMessage()
                │
                ▼
4. handleCustomerMessage()
   a. Load session → getSession(phone, tenantId)
   b. Load produk aktif → getActiveProducts(tenantId)
   c. Kirim ke Gemini → parseCustomerMessage(text, products)
   d. Terima: { intent, items, confidence }
        │
        ▼
5. Intent Router (switch-case)
   ├── "browse"       → handleBrowseIntent() → kirim WA Catalog
   ├── "order_new"    → handleOrderIntent() → parse items, cek stok, konfirmasi
   ├── "order_status" → query DB → balas status
   └── "low_confidence" → minta klarifikasi / handoff
        │
        ▼
6. Kirim respons kembali ke customer
   → sendWhatsAppMessage(customerPhone, responseText)
   → Meta Cloud API → WhatsApp customer
```

---

## Data Flow: Payment QRIS

```
1. Customer konfirmasi order: "ya"
        │
        ▼
2. Order Handler
   a. INSERT ke tabel orders (status: AWAITING_PAYMENT)
   b. INSERT ke tabel order_items
   c. Panggil Midtrans: createQrisPayment(orderId, total, items)
   d. Midtrans return: { redirect_url, token }
        │
        ▼
3. Bot kirim link ke customer:
   "Bayar Rp285.000 via QRIS → [link]"
        │
        ▼
4. Customer buka link → scan QRIS → bayar
        │
        ▼
5. Midtrans kirim POST ke /api/webhook/midtrans
   Body: { order_id, transaction_status: "settlement", ... }
        │
        ▼
6. /api/webhook/midtrans
   a. Verifikasi signature Midtrans
   b. Update order: payment_status = "PAID", status = "CONFIRMED"
   c. Kirim notif WA ke customer: "Pembayaran diterima! 🎉"
   d. Kirim notif WA ke owner: "Order baru #ABC123 - Rp285.000"
   e. Dashboard update otomatis (polling atau page refresh)
```

---

## Data Flow: Owner Command

```
1. Owner kirim WA ke nomor bot: "omzet hari ini"
        │
        ▼
2. /api/webhook/wa → deteksi owner → handleOwnerCommand()
        │
        ▼
3. parseOwnerCommand("omzet hari ini")
   → Gemini return: { action: "get_revenue", params: { period: "today" } }
        │
        ▼
4. Execute function:
   → Query Supabase: SUM(total_amount) WHERE payment_status = 'PAID' AND today
   → Return: { total: 416000, count: 8 }
        │
        ▼
5. Bot balas ke owner:
   "📊 Hari ini: 8 order | Rp416.000
    Top produk: Kaos Oversize (5x)
    Lihat detail → [magic link dashboard]"
```

---

## Arsitektur 3 Layer AI

Dari master spec, WAssist punya 3 layer saling melengkapi:

| Layer | Fungsi | Komponen |
|---|---|---|
| **Discovery** | Customer temukan & pilih produk | WA Catalog, Cart Handler, Browse Handler |
| **Lifecycle** | Perjalanan order dari pesan → selesai | 7-intent Router, Order Handler, Status Handler |
| **Reliability** | Jaga keandalan, eskalasi ke manusia | Confidence threshold 0.70, Zod validation, Handoff Queue |

---

## Keputusan Arsitektur & Trade-off

### Monorepo vs Microservices
**Pilihan:** Monorepo (Next.js satu project).
**Alasan:** Speed development > separation untuk hackathon. Post-hackathon bisa dipisah.
**Trade-off:** Coupling lebih tinggi, tapi iterasi lebih cepat.

### In-memory Session vs Redis
**Pilihan:** In-memory Map di Node.js.
**Alasan:** Tidak perlu setup Redis (Upstash), tidak ada latency tambahan, cukup untuk demo.
**Trade-off:** Session hilang jika server restart, tidak bisa scale horizontal.
**Mitigasi untuk demo:** Set Cloud Run `--max-instances=1` → semua request ke instance yang sama.

### WA Catalog vs Teks Menu
**Pilihan:** WA Catalog (native WhatsApp visual).
**Alasan:** Foto produk native di WA = *wow moment* untuk juri. Customer tidak perlu buka link eksternal.
**Trade-off:** Perlu setup katalog manual di Meta Business Manager.

### Cart Handler vs LLM untuk Catalog
**Pilihan:** Cart handler terpisah dari LLM.
**Alasan:** Ketika customer order dari WA Catalog, Meta kirim structured JSON (`type: "order"`). Tidak perlu LLM untuk parse — langsung proses.
**Trade-off:** Dua jalur berbeda untuk order (NL text vs catalog cart), tapi lebih reliable.

### Single Tenant untuk Demo
**Pilihan:** Single tenant hardcoded (Olshop Kak Nina).
**Alasan:** Multi-tenant onboarding (Embedded Signup Meta) = kompleks, di luar scope hackathon.
**Framing ke juri:** "Arsitektur sudah multi-tenant ready (tenant_id di semua tabel). Onboarding self-service di roadmap Fase 2."

---

## Struktur Folder Project

```
wassist/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   ├── wa/route.ts          ← ENTRY POINT semua pesan WA (GET + POST)
│   │   │   └── midtrans/route.ts    ← payment callback dari Midtrans
│   │   ├── orders/
│   │   │   ├── route.ts             ← GET list orders
│   │   │   └── [id]/route.ts        ← GET detail order
│   │   ├── products/route.ts        ← GET/POST/PATCH produk
│   │   ├── dashboard/
│   │   │   ├── kpi/route.ts         ← omzet hari ini, order count, AOV
│   │   │   └── handoff/route.ts     ← list percakapan yang butuh manual reply
│   │   └── auth/magic-link/route.ts ← generate JWT untuk dashboard owner
│   ├── dashboard/
│   │   ├── layout.tsx               ← sidebar (desktop) + bottom nav (mobile)
│   │   ├── page.tsx                 ← Beranda: KPI cards + handoff alert
│   │   ├── orders/page.tsx          ← Order list + filter status
│   │   ├── orders/[id]/page.tsx     ← Order detail + tombol aksi
│   │   ├── analytics/page.tsx       ← Charts: tren penjualan, top produk
│   │   └── products/page.tsx        ← Kelola menu/produk
│   ├── layout.tsx
│   └── page.tsx
│
├── lib/
│   ├── gemini.ts                    ← parserModel + generatorModel (dual model)
│   ├── intent-parser.ts             ← parseCustomerMessage(), buildCustomerIntentPrompt()
│   ├── owner-generator.ts           ← generateRevenueResponse() via Mode 2
│   ├── response-templates.ts        ← orderConfirmationMessage(), paymentLinkMessage(), dll
│   ├── db.ts                        ← Supabase client (supabaseAdmin)
│   ├── session.ts                   ← In-memory session store (getSession/setSession)
│   ├── whatsapp.ts                  ← sendWhatsAppMessage(), sendCatalogMessage()
│   ├── midtrans.ts                  ← createQrisPayment(), verifyMidtransSignature()
│   ├── product-cache.ts             ← getProductsForPrompt() dengan TTL 5 menit
│   ├── product-filter.ts            ← filterRelevantProducts() untuk katalog besar
│   ├── utils.ts                     ← toRetailerId() dan helper lain
│   │
│   ├── constants/
│   │   └── confirmation-keywords.ts ← CONFIRM_KEYWORDS, CANCEL_KEYWORDS (Set)
│   │
│   ├── types/
│   │   ├── index.ts                 ← barrel re-export semua types
│   │   ├── whatsapp.ts              ← WAMessage, WAOrderItem, WAWebhookBody, dll
│   │   ├── tenant.ts                ← Tenant type
│   │   ├── session.ts               ← Session, PendingOrder, PendingOrderItem
│   │   └── db.ts                    ← DbTenant, DbProduct, DbOrder, DbOrderItem, DbUser
│   │
│   └── handlers/
│       ├── order.ts                 ← Jalur 1: order via teks natural
│       ├── cart-order.ts            ← Jalur 1b: order dari WA Catalog cart
│       ├── browse.ts                ← Jalur 2: tampilkan WA Catalog
│       ├── status.ts                ← Jalur 6: cek status order
│       ├── handoff.ts               ← Jalur 7: human handoff + retry logic
│       ├── owner.ts                 ← Owner command dispatcher
│       │
│       │   ── Post-MVP (lihat notes/11-full-intent-roadmap.md) ──
│       ├── cancel-order.ts          ← Jalur 5: batalkan order
│       ├── repeat-last.ts           ← Jalur 3: order ulang
│       └── modify-order.ts          ← Jalur 4: modifikasi order aktif
│
├── components/
│   └── dashboard/
│       ├── KPICard.tsx
│       ├── StatusBadge.tsx
│       ├── OrderTable.tsx
│       └── charts/
│           ├── SalesChart.tsx       ← line chart tren 7 hari
│           ├── TopProductsChart.tsx ← bar chart top 5
│           └── PaymentPieChart.tsx  ← pie chart metode bayar
│
├── scripts/
│   └── test-gemini.ts               ← test koneksi Gemini tanpa WA
│
├── .env.local                       ← env vars lokal (jangan commit)
├── .dockerignore
├── Dockerfile
└── next.config.js                   ← wajib: output: "standalone"
```

> **Catatan penamaan:** `lib/wa.ts` di diagram arsitektur = `lib/whatsapp.ts` di kode aktual.
> Gunakan `whatsapp.ts` agar lebih eksplisit.
