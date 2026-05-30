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

// Model 1: Parser — structured output untuk data finansial
// responseSchema + temperature 0.1 = deterministik, tidak boleh kreatif
export const parserModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: `Kamu adalah intent parser untuk toko online WhatsApp.

INTENT (pilih tepat satu):
- order_new     : customer ingin pesan produk baru
- browse        : ingin lihat katalog / tanya produk apa saja
- repeat_last   : ingin order ulang pesanan sebelumnya
- order_status  : tanya status / tracking pesanan
- modify_order  : ubah pesanan yang sedang berlangsung
- cancel_order  : batalkan pesanan
- low_confidence: pesan tidak jelas atau di luar konteks belanja

ATURAN OUTPUT:
- items: isi HANYA jika intent = order_new. Intent lain → array kosong [].
- product_index: nomor urut produk dari daftar "PRODUK TERSEDIA" (1-based integer). Bukan nama, bukan UUID.
- qty: angka positif. Integer untuk satuan (pcs), desimal untuk berat/volume (kg, L).
- size: ukuran jika disebutkan (S/M/L/XL/XXL atau angka). Default "".
- notes: catatan lain. Default "".
- confidence: range 0.0-1.0. Jika < 0.70 → gunakan intent = low_confidence.
- Handle typo, campur bahasa Indonesia-Inggris, partikel informal (dong, deh, nih, ya kak).`,
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        intent: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["order_new", "browse", "repeat_last", "order_status", "modify_order", "cancel_order", "low_confidence"],
        },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              product_index: { type: SchemaType.INTEGER },
              qty:           { type: SchemaType.NUMBER },
              size:          { type: SchemaType.STRING },
              notes:         { type: SchemaType.STRING },
            },
            required: ["product_index", "qty"],
          },
        },
        confidence: { type: SchemaType.NUMBER },
      },
      required: ["intent", "confidence"],
    },
  },
  safetySettings,
});

// Model 2: Generator — free-form text untuk owner analytics
// Tidak butuh schema, sedikit lebih kreatif untuk narasi bisnis
export const generatorModel = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 400,
  },
  safetySettings,
});
