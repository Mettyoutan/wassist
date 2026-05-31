# Skenario 1 — Happy path: satu produk, qty jelas

Customer: "mau 2 kaos oversize polos"
Parser: {intent:"order_new", items:[{product_index:3, qty:2, candidate_indices:[]}]}
Flow: classifyItem → resolved → orderConfirmationMessage
Bot:
Oke kak! Ini pesanannya ya:

    • Kaos Oversize Polos x 2 = Rp170.000

    *Total: Rp170.000*

    Mau lanjut bayar? Balas *ya* atau *batal* 😊

Problem ditemukan: lihat      (4 spasi) sebelum item dan total — ini indentasi code yang bocor ke
template literal. WhatsApp render-nya jelek. Pre-existing bug tapi perlu difix.

---
# Skenario 2 — Ambiguitas varian (wow-moment)

Customer: "mau 2 kaos polos"
Parser: {product_index:3, qty:2, candidate_indices:[3,4]} (anggap ada "Kaos Polos Hitam" & "Kaos Polos
Putih")
Bot: "Ada beberapa varian kak, yang mana? 😊\n\n1. Kaos Polos Hitam (2x) — Rp85.000/pcs\n2. Kaos Polos
Putih (2x) — Rp85.000/pcs\n\nBalas nomornya ya!"
Customer: "1"
Bot: konfirmasi order kaos hitam 2x ✅

Tapi ada problem tersembunyi: kalau customer balas "yang hitam" (teks, bukan angka) → extractNumber →
null → handleRetry → tanya lagi. Bot tidak cukup helpful — tidak bilang "balas angka saja ya". Pesan
retry persis sama dengan pesan pertama. Customer bingung "aku udah jawab kenapa ditanya lagi?"

---
Skenario 3 — Qty hilang

Customer: "mau kaos oversize"
Bot: "Berapa Kaos Oversize Polos yang mau dipesan kak? (masukkan angka bulat ya, contoh: 2)"
Customer: "2"
Bot: konfirmasi ✅

---
Skenario 4 — Multi-item, satu produk tidak ada di katalog ← BUG SERIUS

Customer: "mau 1 kaos oversize sama 1 celana jeans"
(celana jeans tidak ada di katalog Kak Nina — fashion store punya dress, kaos, dll)

Flow:

- "kaos oversize" → resolved → masuk resolvedItems
- "celana jeans" → Gemini hallucinate index atau getProductByName miss → not_found → break ← silent drop
- clarification === null, resolvedItems = [kaos oversize]

Bot: konfirmasi pesanan untuk kaos oversize saja. Tidak ada peringatan tentang celana jeans.

Customer: konfirmasi "ya" → order masuk hanya untuk kaos oversize. Customer baru sadar setelah payment.

🔴 Ini masalah nyata. Customer merasa tertipu — bayar tapi barang tidak lengkap. Harus ada notifikasi:
"Kaos Oversize berhasil, tapi celana jeans tidak kami temukan di katalog. Lanjut hanya untuk kaos?"

---
Skenario 5 — Multi-item, item ke-2 juga bermasalah tapi di-skip ← BUG SERIUS

Customer: "mau 1 kaos polos (ambigu) sama 1 dress floral (stok habis)"

Flow:

- "kaos polos" → ambiguous → clarification diset, resolved = []
- "dress floral" → out_of_stock → if (clarification === null) = false → di-skip total
- Bot hanya tanya soal kaos polos
- Customer jawab variant → finalizeOrder dengan kaos polos saja
- Dress floral hilang tanpa notifikasi

🔴 Customer tidak tahu dress-nya tidak bisa diorder.

---
Skenario 6 — Stok tidak cukup

Customer: "mau 10 kaos" (stok = 3)
Bot: "Stok Kaos Oversize Polos tinggal 3 pcs kak 😊 Mau berapa?"
Customer: "2" → konfirmasi ✅

Tapi kalau customer jawab "8" (masih > stok):

- handleRetry → retry_count 0 → 1 → tanya lagi (pesan sama persis)
- Customer jawab "8" lagi → retry_count >= 1 → handleBrowseIntent → katalog muncul tiba-tiba
- Bot tidak pernah menjelaskan kenapa tiba-tiba kasih katalog

🟡 UX buruk saat retry. Pesan retry seharusnya lebih eksplisit: "Qty melebihi stok kak, maksimal 3. Mau
berapa?"

---
Skenario 7 — finalizeOrder — session di-set sebelum WA terkirim

setSession(...);                                 // ← ditulis dulu
await sendWhatsAppMessage(...orderConfirmation); // ← baru kirim

Kalau WA API gagal, session sudah awaiting_confirmation tapi customer tidak terima pesan. Customer kirim
pesan berikutnya → webhook cek state awaiting_confirmation → minta konfirmasi dari order yang tidak
pernah dilihat customer.

🟡 Race condition kecil. Fix: tukar urutan (kirim pesan dulu, baru set session).

---
Skenario 8 — Stale pending_clarification di session

Setelah finalizeOrder, setSession merge dengan existing:
{ ...current, ...update }
// current masih punya pending_clarification
// update tidak set pending_clarification: undefined
// → pending_clarification ikut terbawa ke state awaiting_confirmation

Tidak ada kode yang baca pending_clarification saat state bukan awaiting_clarification, jadi tidak ada
runtime error. Tapi state kotor.

🟢 Harmless, low priority.

---
Ringkasan Bug yang Perlu Difix

```text
┌─────┬───────────┬───────────────────────────────────────────┬─────────────────────────────────────┐
│  #  │ Severity  │                   Issue                   │                 Fix                 │
├─────┼───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ 1   │ 🔴        │ Multi-item: item not_found di-drop        │ Kumpulkan notFoundNames[], warn +   │
│     │ Critical  │ silent, customer tidak tahu               │ konfirmasi parsial                  │
├─────┼───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ 2   │ 🔴        │ Multi-item: item ke-2+ bermasalah di-skip │ Sama — collect semua masalah, bukan │
│     │ Critical  │  setelah clarification pertama            │  hanya pertama                      │
├─────┼───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ 3   │ 🟡 Medium │ Retry message tidak kontekstual (sama     │ Tambah prefix "Maaf kak, belum      │
│     │           │ persis dengan pertanyaan awal)            │ valid. "                            │
├─────┼───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ 4   │ 🟡 Medium │ finalizeOrder set session sebelum kirim   │ Tukar urutan                        │
│     │           │ WA                                        │                                     │
├─────┼───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ 5   │ 🟢 Low    │ orderConfirmationMessage template literal │ Reformat dengan backslash           │
│     │           │  bocorkan 4-space indent                  │ continuation atau pindah indent     │
├─────┼───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ 6   │ 🟢 Low    │ Stale pending_clarification setelah       │ Add pending_clarification:          │
│     │           │ transition                                │ undefined di finalizeOrder          │
└─────┴───────────┴───────────────────────────────────────────┴─────────────────────────────────────┘

Bug #1 dan #2 harus difix sebelum demo — silent drop berpotensi bikin customer komplain ke owner saat
acara.
```
