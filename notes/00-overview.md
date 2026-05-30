# WAssist — Overview & Big Picture
> Baca file ini pertama sebelum file lainnya di folder `notes/`.
> Last updated: 28 Mei 2026

---

## Apa itu WAssist?

WAssist adalah platform otomasi pemesanan berbasis WhatsApp untuk UMKM Indonesia. Customer chat ke nomor WA bisnis seperti biasa — bot AI (Gemini) memproses pesanan, generate QRIS, dan notifikasi owner secara otomatis. Owner mengelola bisnisnya langsung dari WA atau dashboard web.

**Tagline:** *"Pelanggan chat WA seperti biasa. Sistem yang kerja kerasnya."*

**Hackathon:** Gunadarma Code Week 2.0 — sub-tema *UMKM E-Commerce & Market Access*

---

## Masalah yang Diselesaikan

UMKM berbasis WA (olshop fashion, F&B delivery, pre-order) menghabiskan **2–4 jam/hari** untuk:
1. Balas chat repetitif satu per satu — tanya stok, harga, katalog
2. Catat order manual → rawan *missed order*
3. Verifikasi transfer/QRIS manual → scroll mutasi rekening

WAssist otomasi ketiga pekerjaan ini dengan AI.

**Target user:** Pre-order berbasis WA, 20–200 order/hari, tim 1–2 orang.
**Demo tenant:** Olshop Kak Nina — fashion (atasan, bawahan, outer, aksesoris).

---

## Mental Model Sistem

```
CUSTOMER (HP biasa, WA normal)
        │ chat biasa
        ▼
[Meta WhatsApp Cloud API]
        │ webhook POST
        ▼
[WAssist Server — Google Cloud Run]
  ├── Webhook Handler      → terima + validasi pesan
  ├── Gemini AI Router     → klasifikasi intent (7 jenis)
  ├── Order Handler        → proses pesanan, cek stok
  ├── Payment Handler      → generate QRIS via Midtrans
  └── Owner Command Parser → parse perintah owner
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
[PostgreSQL — Supabase]              [Dashboard Web — React]
 tenants, products,                   KPI, Order List,
 orders, users, sessions              Handoff Queue
        │
        ▼
[Midtrans QRIS Sandbox]
 Generate QRIS → Callback PAID → Update DB

OWNER (nomor WA pribadi)
  ├── Chat ke nomor bot → owner command (omzet, stok, buka/tutup)
  └── Buka dashboard via magic link dari WA
```

---

## 3 Differensiator Utama

| # | Fitur | Kenapa Unik |
|---|---|---|
| 1 | **Owner WA Command** | Owner kontrol bisnis dari WA: omzet, stok, buka/tutup — tidak ada di kompetitor manapun |
| 2 | **WA Catalog Visual** | Katalog produk dengan foto, native di dalam WA, tanpa link eksternal |
| 3 | **Full Order Lifecycle via NL** | Cek status order via chat natural — kompetitor hanya di dashboard |

---

## Tim & Peran

| Nama | Peran | Tanggung Jawab |
|---|---|---|
| Matthew | Hacker | Backend, WA API, Gemini intent parser, DB schema |
| Evan | Hacker | Backend co-dev, dashboard API, GCP deployment |
| Regina | Hipster | Dashboard UI (Next.js + Tailwind), wireframe |
| Rafaela | Hustler | Pitch deck, video narasi, konten bisnis |

---

## Bobot Penilaian Juri GCW 2.0

| Kriteria | Bobot | Strategi |
|---|---|---|
| **Teknologi & AI (Gemini + GCP)** | **25%** | Sebut eksplisit di video: "Gemini Pro", "Google Cloud Run" |
| Business & Market | 20% | BMC konkret, GTM dengan angka target |
| UX & Design | 20% | Dashboard mulus, mobile-first |
| Pendahuluan | 15% | Data BPS/Kemenkop, bukan asumsi |
| Kesimpulan | 10% | Roadmap realistis |
| Kejelasan | 10% | Demo tidak error, narasi jelas |

**Prioritas development:** AI/webhook → Order flow → Dashboard → Deploy ke GCP.

---

## Stack Teknologi (Final)

| Layer | Teknologi | Alasan |
|---|---|---|
| Backend + Frontend | Next.js 14 App Router (monorepo) | Satu repo, API routes + React dalam satu project |
| AI/LLM | Gemini 2.0 Flash (Parser) + Gemini 2.5 Flash Lite (Generator) | Dual model: responseSchema untuk parsing, flash-lite untuk narasi owner |
| Database | PostgreSQL via Supabase | ACID, free tier, multi-tenant schema ready |
| Session State | In-memory Map (Node.js) | Cukup untuk single-instance hackathon, skip Redis |
| Payment | Midtrans QRIS Sandbox | Lokal Indonesia, QRIS native |
| Deployment | Google Cloud Run (GCP) | **Bobot juri 25%** — wajib di sini |
| WA API | Meta WhatsApp Cloud API | Satu-satunya resmi, gratis 1.000 conv/bulan |

---

## Deliverable Submission (Deadline: 5 Juli 2026 malam)

1. **Pitch Deck** (PDF) — model bisnis + teknis + impact
2. **Video Pitch** (3–5 menit) — value proposition + live demo
3. **Progress Report** — GitHub repo link + README + dokumentasi teknis
4. **GCP Cloud Run URL** — live dan accessible saat submit

---

## Navigasi Catatan Ini

Baca berurutan dari atas ke bawah untuk pertama kali. Setelah familiar, gunakan sebagai referensi.

| File | Isi | Siapa |
|---|---|---|
| `00-overview.md` | ← kamu di sini. Big picture, tim, stack, bobot juri | Semua |
| `01-architecture.md` | Diagram sistem, data flow, folder structure, keputusan teknis | Matthew, Evan |
| `02-database.md` | Schema lengkap, TypeScript DB types, query patterns | Matthew, Evan |
| `03-ai-llm.md` | Gemini dual-model, 7-intent parser, prompt engineering, scalability | Matthew |
| `04-whatsapp-api.md` | Meta API setup, webhook, WA Catalog, message types, TypeScript WA types | Matthew |
| `05-order-flow.md` | Alur lengkap order, semua handler, session state machine, confirmation keywords | Matthew, Evan |
| `06-dashboard.md` | Dashboard pages, API endpoints, auth magic link, mobile-first | Evan, Regina |
| `07-payment.md` | Midtrans QRIS, callback handling, signature verify, state update | Matthew, Evan |
| `08-deployment.md` | Dockerfile, GCP Cloud Run, env vars, checklist go-live | Evan |
| `09-demo-and-timeline.md` | Script demo 90 detik, wow moments, timeline minggu/minggu, Q&A juri | Semua |
| `10-gemini-api-setup.md` | Step-by-step setup Gemini API key, SDK, test koneksi, troubleshooting | Matthew |
| `11-full-intent-roadmap.md` | Post-MVP: cancel_order → repeat_last → modify_order (schema + handler lengkap) | Matthew |
