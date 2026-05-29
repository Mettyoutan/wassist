import {
    GoogleGenerativeAI,
    GenerationConfig,
    SchemaType,
    HarmCategory,
    HarmBlockThreshold,
    SafetySetting
} from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const safetySettings: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

/**
 * Model untuk parsing dengan temperature 0.1 dan responseSchema
 */
export const parserModel = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
                intent: {
                    type: SchemaType.STRING,
                    format: "enum",
                    enum: ["order_new", "browse", "repeat_last", "order_status", "modify_order", "cancel_order", "low_confidence"]
                },
                items: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            product_name:   { type: SchemaType.STRING },
                            qty:            { type: SchemaType.INTEGER },
                            size:           { type: SchemaType.STRING },
                            notes:          { type: SchemaType.STRING },
                        },
                        required: ["product_name", "qty"]
                    }
                },
                confidence: { type: SchemaType.NUMBER }
            },
            required: ["intent", "confidence"]
        },
    },
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
    - items         : isi HANYA jika intent = order_new. Intent lain → array kosong [].
                    Alasan: semantik "items" hanya valid untuk order baru.
                    browse/order_status/repeat_last → handler lookup DB, tidak butuh items dari parser.
                    modify_order/cancel_order → cut MVP, fallback ke low_confidence → handoff manual.
    - product_name  : nama produk sesuai katalog. Abaikan ukuran saat mencocokkan nama.
    - qty           : bilangan bulat positif (1, 2, 3). Tidak boleh desimal.
    - size          : ukuran jika disebutkan (S/M/L/XL/XXL atau angka seperti 32/34). Default "".
    - notes         : catatan lain (warna, motif, permintaan khusus). Default "".
    - confidence    : range 0.0-1.0. Pesan ambigu atau di luar konteks belanja → turunkan confidence. Jika confidence < 0.70, gunakan intent = low_confidence.
    - Handle typo, campur bahasa Indonesia-Inggris, partikel informal (dong, deh, nih, ya kak).
    `,
    safetySettings
})

export const generatorModel = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500
    },
    systemInstruction: "",
    safetySettings
})