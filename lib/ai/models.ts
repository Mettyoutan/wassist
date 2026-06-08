import {
  GoogleGenerativeAI,
  SchemaType,
  HarmCategory,
  HarmBlockThreshold,
  type SafetySetting,
} from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const safetySettings: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// Model 1: Customer Intent Parser — structured output untuk data finansial
// responseSchema + temperature 0.1 = deterministik, tidak boleh kreatif
export const customerParserModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah intent parser untuk toko online WhatsApp.

INTENT (pilih tepat satu):
- order_new     : customer ingin pesan produk baru
- browse        : ingin lihat katalog / tanya produk apa saja
- repeat_last   : ingin order ulang pesanan sebelumnya
- order_status  : tanya status / tracking pesanan
- modify_order  : ubah pesanan yang sedang berlangsung
- cancel_order  : batalkan pesanan
- product_detail: ingin lihat detail / foto / deskripsi / ukuran / info satu produk tertentu
- greeting      : sapaan atau pesan pembuka tanpa intent belanja (halo, hi, selamat pagi, dll)
- low_confidence: pesan tidak jelas atau di luar konteks belanja

ATURAN OUTPUT:
- items: isi HANYA jika intent = order_new. Intent lain → array kosong [].
- product_index: nomor urut produk dari daftar "PRODUK TERSEDIA" (1-based integer). Bukan nama, bukan UUID.
- qty: angka positif. Integer untuk satuan (pcs), desimal untuk berat/volume (kg, L).
- size: ukuran jika disebutkan (S/M/L/XL/XXL atau angka). Default "".
- notes: catatan lain. Default "".
- confidence: range 0.0-1.0. Jika < 0.70 → gunakan intent = low_confidence.
- Handle typo, campur bahasa Indonesia-Inggris, partikel informal (dong, deh, nih, ya kak).
- Jika deskripsi customer cocok ke BEBERAPA produk berbeda dan tidak menyebut nama spesifik, isi candidate_indices dengan SEMUA nomor yang cocok (≥2). product_index = nomor kandidat pertama (tebakan terbaik).
- Jika customer TIDAK menyebut jumlah, KOSONGKAN qty — jangan menebak angka.`,
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        intent: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["order_new", "browse", "repeat_last", "order_status", "modify_order", "cancel_order", "product_detail", "greeting", "low_confidence"],
        },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              product_index:     { type: SchemaType.INTEGER },
              qty:               { type: SchemaType.NUMBER },
              candidate_indices: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
              size:              { type: SchemaType.STRING },
              notes:             { type: SchemaType.STRING },
            },
            required: ["product_index"],
          },
        },
        confidence: { type: SchemaType.NUMBER },
      },
      required: ["intent", "confidence"],
    },
  },
  safetySettings,
});

// Model 2: Owner Command Parser — structured output khusus perintah owner
export const ownerParserModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah command parser untuk owner toko online WhatsApp.

ACTION (pilih tepat satu):
- get_revenue       : tanya omzet / laporan penjualan
- get_orders        : tampilkan daftar order aktif / order yang masih berjalan
- get_stock         : cek stok produk
- update_price      : ubah harga produk
- update_stock      : ubah jumlah stok produk
- set_reorder_point : ubah batas minimum stok sebelum muncul alert
- deactivate_product: nonaktifkan / sembunyikan produk dari katalog
- activate_product  : aktifkan kembali produk yang sebelumnya dinonaktifkan
- open_store        : buka toko
- close_store       : tutup toko
- mark_fulfilled    : tandai order sudah dikirim / dalam pengiriman (status PAID → FULFILLED), notif customer
- mark_done         : tandai order sudah selesai / diterima customer (status FULFILLED → DONE), notif customer
- mark_paid         : tandai order sudah bayar secara manual / konfirmasi pembayaran transfer (status AWAITING_PAYMENT → PAID)
- help              : minta bantuan atau daftar perintah
- unknown           : perintah tidak jelas atau di luar daftar

ATURAN OUTPUT:
- product_index: nomor urut produk dari "DAFTAR PRODUK" (1-based). Isi jika action butuh produk spesifik.
- value: nilai ABSOLUT baru — harga atau stok target. Gunakan jika owner sebut nilai final ("harga jadi 90000", "stok 20").
- delta: perubahan RELATIF stok (positif=tambah, negatif=kurangi). Gunakan jika owner sebut perubahan ("tambah 5", "kurangin 3").
  Jangan isi keduanya sekaligus.
- period: "hari ini" / "minggu" / "bulan" — hanya untuk get_revenue. Default "hari ini" jika tidak disebut.
- confidence: range of 0.0-1.0. Jika < 0.70 → action = unknown.`,
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["get_revenue","get_orders","get_stock","update_price","update_stock","set_reorder_point","deactivate_product","activate_product","open_store","close_store","mark_fulfilled","mark_done","mark_paid","help","unknown"],
        },
        product_index: { type: SchemaType.INTEGER },
        value:         { type: SchemaType.NUMBER },
        delta:         { type: SchemaType.NUMBER },
        period:        { type: SchemaType.STRING },
        confidence:    { type: SchemaType.NUMBER },
      },
      required: ["action", "confidence"],
    },
  },
  safetySettings,
});

// Model 3: Owner Analytics Generator — free-form narasi bisnis untuk owner UMKM
export const generatorModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah asisten analitik bisnis pribadi untuk owner toko online UMKM Indonesia.

TUGAS: Buat ringkasan performa bisnis berdasarkan data yang diberikan.

GAYA OUTPUT:
- Bahasa Indonesia, casual dan hangat — seperti teman yang paham bisnis
- 2-4 kalimat saja, tidak lebih
- Format WhatsApp: bold pakai *teks*, bukan markdown ##
- Emoji boleh, tapi maksimal 3 per pesan

ATURAN KONTEN:
- Jangan sebut angka threshold reorder_point — cukup bilang "hampir habis" atau "perlu restock segera"
- Jika ada stok menipis, sebutkan di kalimat terakhir dengan urgency wajar
- Jika omzet 0 atau order 0, katakan dengan jujur tapi tetap encouraging
- Fokus pada insight actionable: apa yang perlu diperhatikan owner hari ini?
- Jangan ulangi semua angka — pilih yang paling penting`,
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 400,
  },
  safetySettings,
});

// Model 4: Confirmation Parser — deteksi konfirmasi/pembatalan dari customer/owner
export const confirmationParserModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah parser konfirmasi untuk toko WhatsApp.
Tentukan apakah pesan berarti:
- confirm  : setuju / ya / lanjut / oke / bayar / mau bayar / lanjut bayar / gas / gass / siap / deal / jalan (dalam konteks mengkonfirmasi sesuatu)
- cancel   : tidak mau / batal / stop / gak jadi
- ambiguous: tidak jelas, tidak bisa dipastikan

PENTING — konteks customer: Jika pesan mengandung nama produk, kata "tambah", "mau pesan", "pesan X lagi",
atau request item baru → SELALU kembalikan ambiguous (mungkin mau tambah item ke pesanan).

PENTING — konteks owner: Jika pesan mengandung kata perintah baru ("kurangi", "tambah", "tambahkan",
"ubah", "update", "ganti", "nonaktifkan", "aktifkan", "set", "hapus") yang disertai nama produk atau angka
→ SELALU kembalikan ambiguous (owner mungkin memberi perintah baru, bukan mengkonfirmasi).

Handle bahasa informal Indonesia: typo, singkatan, campur Inggris-Indonesia, slang (gak, ngga, gas, sip, dll).`,
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        signal: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["confirm", "cancel", "ambiguous"],
        },
      },
      required: ["signal"],
    },
  },
  safetySettings,
});

// Model 5: Clarification Parser — ekstrak pilihan varian atau jumlah dari jawaban customer
export const clarificationParserModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah parser jawaban klarifikasi untuk toko WhatsApp.
Context diberikan dalam prompt: jenis pertanyaan (varian atau jumlah), daftar kandidat, dan pesan customer.

MODE VARIAN:
- Customer bisa menyebut angka ("1", "nomor 2"), nama produk ("celana kulot"), atau keduanya
- Customer BOLEH pilih lebih dari satu varian sekaligus ("keduanya", "yang pertama dan kedua", "celana kulot 1 dan palazzo 2")
- Untuk setiap pilihan: ekstrak index (integer, 1-based sesuai daftar) dan qty jika disebutkan
- "masing-masing 1" → qty 1 untuk semua pilihan yang disebutkan
- Jika customer tidak sebut qty → qty tidak perlu diisi (omit)
- Konversi kata ke angka: "dua" → 2, "pertama" → 1, "semua/keduanya" → semua kandidat

MODE JUMLAH:
- Ekstrak angka yang valid sebagai choices[0].index = 1, choices[0].qty = angka tersebut
- Konversi kata ke angka: "tiga kilo" → 3, "dua" → 2

CANCEL:
- Jika customer ingin batal (batal, gak jadi, stop, tidak) → choices: [], cancel: true

TIDAK VALID:
- Jika tidak bisa diparse → choices: [], cancel: false (akan trigger retry)`,
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        choices: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              index: { type: SchemaType.INTEGER },
              qty:   { type: SchemaType.NUMBER },
            },
            required: ["index"],
          },
        },
        cancel: { type: SchemaType.BOOLEAN },
      },
      required: ["choices", "cancel"],
    },
  },
  safetySettings,
});

// Model 6: Product Suggestion — rekomen produk terdekat untuk low_confidence intent
export const productSuggestModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah sistem rekomendasi produk untuk toko online WhatsApp.
Diberikan daftar produk dan pesan customer, tentukan apakah ada produk yang paling mirip dengan yang customer cari.

ATURAN:
- found: true HANYA jika ada produk yang cukup mirip (kategori sama atau sangat relevan)
- Jangan return found:true untuk kemiripan yang sangat jauh (customer mau sepatu → produk hanya baju → found: false)
- product_index: nomor urut produk yang paling mirip dari daftar (1-based integer)
- Jika tidak ada yang mirip → found: false, product_index: 0`,
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        found:          { type: SchemaType.BOOLEAN },
        product_index:  { type: SchemaType.INTEGER },
      },
      required: ["found", "product_index"],
    },
  },
  safetySettings,
});
