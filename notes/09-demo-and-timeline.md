# WAssist — Demo Strategy & Timeline
> Deadline submit: 5 Juli 2026 malam (H-1 dari deadline resmi 6 Juli)

---

## 3 Wow Moments Demo

Ini yang harus berjalan mulus tanpa hitch:

### Wow #1 — WA Catalog Visual
```
Customer chat: "kak mau lihat katalog dulu"
Bot balas: [WA Catalog muncul — foto produk, nama, harga, scrollable native di WA]
```
Kenapa wow: Juri melihat katalog bergambar muncul LANGSUNG di dalam WhatsApp biasa. Tidak ada link, tidak ada app lain. Native.

### Wow #2 — Order + QRIS End-to-End
```
Customer: pilih produk dari catalog → cart → kirim
Bot: "Pesananmu: Kaos Oversize x2, Celana Cargo x1 = Rp320.000. Konfirmasi?"
Customer: "ya"
Bot: "Bayar via QRIS → [link]"
[Customer scan/bayar]
Bot: "Pembayaran diterima! Order #ABC123 sedang diproses 🎉"
Dashboard: order baru muncul, status = PAID
```
Kenapa wow: Transaksi nyata selesai dari WA dalam <2 menit. End-to-end.

### Wow #3 — Owner Command
```
Owner WA: "omzet hari ini?"
Bot: "📊 Hari ini: 8 order | Rp416.000. Top: Kaos Oversize (5x)"
Owner WA: "kaos oversize tinggal berapa?"
Bot: "Stok Kaos Oversize Polos: 48 unit tersisa."
Owner: tap magic link → dashboard terbuka langsung (sudah login)
```
Kenapa wow: Owner kelola bisnis penuh dari WA tanpa buka app lain. Ini yang tidak ada di kompetitor manapun.

---

## Script Demo Video (3–5 Menit)

```
[0:00–0:20] HOOK (Narasi)
"Setiap hari, pemilik olshop di Indonesia menghabiskan 2-4 jam
 hanya untuk balas chat WhatsApp — tanya stok, harga, konfirmasi order.
 Kami membangun WAssist untuk mengotomasi ini semua."

[0:20–0:45] WOW #1: Browse + Catalog
Tampilkan: customer chat "mau lihat katalog" → WA Catalog muncul dengan foto produk
Narasi: "Customer chat seperti biasa. Bot kirim katalog visual langsung di WA."

[0:45–1:40] WOW #2: Order + QRIS
Tampilkan: customer pilih dari catalog → cart → konfirmasi → link QRIS → bayar → dashboard update
Narasi: "Dari pilih produk, bayar QRIS, sampai notifikasi selesai — semua otomatis."

[1:40–2:10] WOW #3: Owner Command
Tampilkan: owner ketik "omzet hari ini" → bot balas → buka dashboard via magic link
Narasi: "Owner kelola bisnis penuh dari WhatsApp — omzet, stok, analitik — tanpa buka app lain."

[2:10–2:40] TECH (Narasi + diagram)
"WAssist ditenagai Gemini 1.5 Flash dari Google AI dengan arsitektur 7-intent classification.
 Confidence threshold 0.70 — bot tidak menebak kalau tidak yakin.
 Berjalan di Google Cloud Run dengan autoscaling."
Tampilkan: arsitektur diagram atau slide tech

[2:40–3:10] BUSINESS
"Target: 64 juta UMKM Indonesia berbasis WhatsApp.
 Pricing: Free (50 order/bulan) → Pro Rp99.000/bulan → Enterprise Rp299.000/bulan.
 Zero komisi transaksi vs GoFood/GrabFood 20-30%."

[3:10–3:40] IMPACT
"Potensi hemat: 2-4 jam/hari per UMKM.
 Meningkatkan kapasitas order tanpa tambah SDM."

[3:40–4:00] TEAM + CLOSING
Tampilkan foto tim + peran
"Kami siap membawa WAssist ke 64 juta UMKM Indonesia."
```

---

## Fallback Scenarios

Siapkan ini SEBELUM hari recording:

| Risk | Backup |
|---|---|
| Gemini API down / error | `USE_MOCK_LLM=true` di env → hardcoded responses |
| Midtrans sandbox down | Script SQL manual set order ke PAID |
| WA message delay >10 detik | Pre-recorded video 90 detik sebagai insert B-roll |
| Meta API error | Screenshot timeline annotated dengan timestamp |
| Network unstable saat rekam | Rekam di environment dengan koneksi stabil (WiFi, bukan mobile data) |

---

## Timeline Minggu per Minggu

### Week 1 — Foundation (28 Mei – 3 Juni)

| Hari | Matthew | Evan | Regina | Rafaela |
|---|---|---|---|---|
| 28 Mei | GitHub repo, Next.js init, Gemini client, test intent parser | Supabase setup, schema, seed data | Wireframe review, install dep | Pitch deck outline |
| 29 Mei | Webhook handler skeleton, HMAC verify, WA echo test | `/api/products` + `/api/orders` CRUD | Dashboard layout + sidebar | Slide 1–5 draft |
| 30 Mei | Jalur 2: Browse → WA Catalog | `/api/dashboard/kpi` | Beranda page (KPI cards) | Slide 6–10 draft |
| 31 Mei | **SIM tiba → daftar ke Meta** + test WA actual | Midtrans sandbox setup | Order list page | Pitch deck review |
| 1 Juni | Jalur 1: order NL → konfirmasi → session state | Midtrans callback webhook | Order detail page | Revisi deck |
| 2 Juni | QRIS create → kirim link ke WA | Update order status PAID | Analitik + charts | Deck final |
| 3 Juni | Integration test Jalur 1+2 end-to-end | Fix bugs dari integration test | Mobile responsiveness fix | — |

**Target akhir Week 1:** Happy path Wow #1 + #2 berjalan lokal.

---

### Week 2 — Owner Features + Dashboard (4–10 Juni)

| Hari | Matthew | Evan | Regina | Rafaela |
|---|---|---|---|---|
| 4 Juni | Owner command parser (omzet, stok, buka/tutup) | Magic link auth (JWT generate + validate) | Handoff queue page | — |
| 5 Juni | Jalur 6: order status query | Dashboard API integration (connect UI ke real API) | Kelola menu page | — |
| 6 Juni | Jalur 7: human handoff flow | Test seluruh dashboard dengan data real | UI polish + loading states | — |
| 7 Juni | Notif WA ke owner setelah PAID | Fix dashboard bugs | Responsive check semua halaman | — |
| 8 Juni | Repeat Order Memory (Jalur 3) — jika sempat | Seed tambahan orders untuk analytics | Charts dengan data real | — |
| 9–10 Juni | Buffer / fix bugs dari full E2E test | Buffer | Buffer | — |

**Target akhir Week 2:** Semua 3 wow moments berjalan.

---

### Week 3 — Deploy + Polish (11–17 Juni)

| Hari | Task | Siapa |
|---|---|---|
| 11 Juni | Buat Dockerfile, update `next.config.js` | Evan |
| 12 Juni | GCP project setup, Cloud Build, deploy pertama | Evan |
| 13 Juni | Update Meta + Midtrans webhook URL ke Cloud Run | Matthew + Evan |
| 14 Juni | Full E2E test dari WA nyata ke production URL | Semua |
| 15 Juni | Fix semua bug production (env vars, CORS, dll) | Matthew + Evan |
| 16–17 Juni | Buffer untuk unexpected issues | — |

**Target akhir Week 3:** Aplikasi live di Cloud Run, bisa demo dari HP ke HP.

---

### Week 4 — Pitch + Video (18–24 Juni)

| Hari | Task | Siapa |
|---|---|---|
| 18 Juni | Rehearsal demo 1 — run happy path 5x tanpa hitch | Matthew |
| 19 Juni | Rekam fallback video 90 detik (pre-recorded) | Matthew |
| 20 Juni | Finalisasi pitch deck (konten + desain) | Rafaela + Regina |
| 21 Juni | Script video pitch 3–5 menit final | Rafaela |
| 22 Juni | Rehearsal demo 2 + setup rekam (lighting, audio) | Semua |
| 23–24 Juni | Buffer + polish | — |

---

### Week 5 — Record + Submit (25 Juni – 5 Juli)

| Hari | Task |
|---|---|
| 25–26 Juni | Rekam video pitch (3–5 menit) — ambil 2-3 take |
| 27 Juni | Edit video: trim, tambah subtitle, background music jika perlu |
| 28 Juni | Review video semua anggota tim |
| 29 Juni | Finalisasi GitHub README + arsitektur diagram |
| 30 Juni | Final review semua deliverable |
| 1–3 Juli | Buffer + revisi jika ada feedback internal |
| 4 Juli | Final check semua link, upload video ke YouTube/Drive |
| **5 Juli malam** | **🚀 SUBMIT ke gcwug.com** |

---

## Submission Checklist

### Pitch Deck (PDF)
- [ ] 12–15 slide
- [ ] Cover, Problem, Solution, Demo, Tech, Business, Market, Impact, Roadmap, Team
- [ ] Gemini + GCP disebutkan eksplisit (bobot 25%)
- [ ] Data market dari BPS/Kemenkop (bukan asumsi)
- [ ] Pricing table Free/Pro/Enterprise
- [ ] Export ke PDF

### Video Pitch (3–5 menit)
- [ ] Hook kuat di 20 detik pertama
- [ ] Demo Wow #1: WA Catalog visual
- [ ] Demo Wow #2: Order + QRIS end-to-end
- [ ] Demo Wow #3: Owner command + dashboard
- [ ] Sebut: "Gemini 1.5 Flash", "Google Cloud Run", "7-intent classification"
- [ ] Upload ke YouTube (unlisted) atau Google Drive
- [ ] Cek link accessible (tidak private)

### Progress Report / GitHub
- [ ] Repo public atau shared dengan panitia
- [ ] README.md: deskripsi produk, tech stack, cara setup, arsitektur diagram
- [ ] Kode ada (bukan repo kosong)
- [ ] Cloud Run URL disebutkan di README

### Technical
- [ ] GCP Cloud Run URL live dan accessible
- [ ] Webhook Meta → Cloud Run URL (bukan localhost/ngrok)
- [ ] Midtrans callback → Cloud Run URL
- [ ] Test kirim WA dari HP → bot balas ✅

---

## Pertanyaan Q&A Juri yang Mungkin Muncul

**"Bagaimana menangani halusinasi AI?"**
> "Kami menggunakan Gemini dengan JSON structured output dan validasi Zod di application layer. Confidence threshold 0.70 — jika bot tidak yakin, pesan otomatis di-escalate ke owner via Human Handoff Queue. Sebelum order direkam, selalu ada konfirmasi eksplisit ke customer."

**"Bagaimana scalabilitynya untuk ribuan tenant?"**
> "Arsitektur sudah multi-tenant ready — semua tabel punya tenant_id dan query selalu di-isolasi per tenant. Untuk onboarding, roadmap Fase 2 menggunakan Meta Embedded Signup sehingga UMKM bisa self-serve tanpa intervensi tim kami."

**"Kenapa WA dan bukan platform lain?"**
> "WhatsApp adalah platform komunikasi utama 112 juta pengguna Indonesia. 88.8% konsumen Indonesia sudah menggunakan WA untuk berinteraksi dengan bisnis (Meta, 2025). Barrier adopsi nol — customer tidak perlu install app baru, tidak perlu daftar akun."

**"Apa bedanya dengan Dazo?"**
> "Dazo punya WA Catalog dan AI chat — bagus. WAssist melangkah lebih jauh: owner mengelola bisnis penuh dari WhatsApp — omzet real-time, update stok, buka/tutup toko — tanpa perlu buka dashboard. Dan seluruh siklus pesanan (status, modifikasi) bisa via chat natural."

**"Bagaimana revenue modelnya?"**
> "Freemium: Free tier 50 order/bulan untuk adopsi awal. Pro Rp99.000/bulan untuk UMKM aktif. Zero komisi transaksi — berbeda dengan GoFood/GrabFood 20-30%. Untuk 100 order per bulan rata-rata Rp50.000, WAssist Pro 10x lebih hemat."
