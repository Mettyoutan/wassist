# WAssist — Gemini API Setup
> Setup dari nol sampai siap coding. Implementasi lengkap ada di `notes/03-ai-llm.md`.

---

## Arsitektur Cepat (Baca Dulu)

WAssist pakai **dua model Gemini berbeda** dengan dua tujuan berbeda:

| | Model 1 (Parser) | Model 2 (Generator) |
|---|---|---|
| Model | `gemini-2.0-flash` | `gemini-2.5-flash-lite` |
| Dipakai untuk | Parse pesan customer + owner command | Owner analytics response |
| Fitur kritis | `responseSchema` enforcement | Free-form natural text |
| Temperature | 0.1 | 0.4 |
| Mengapa model ini | Satu-satunya yang support `responseSchema` di free tier | Lebih hemat, cukup untuk narasi |

> ⚠️ **Wajib verifikasi nama model sebelum deploy.** Buka https://aistudio.google.com, cek model tersedia dan string-nya persis. Nama di atas valid per Mei 2026 — bisa berubah.

Detail arsitektur, kode client, dan semua keputusan ada di **`notes/03-ai-llm.md`**. File ini fokus ke setup saja.

---

## Step 1 — Buat API Key di Google AI Studio

1. Buka **https://aistudio.google.com**
2. Login dengan akun Google
3. Klik **"Get API key"** di sidebar kiri
4. Klik **"Create API key"** → pilih project GCP yang sama dengan Cloud Run nanti
5. Copy API key — format: `AIzaSy...`

> ⚠️ Simpan segera. Key hanya muncul sekali saat dibuat.

---

## Step 2 — Verifikasi Model yang Tersedia

Sebelum tulis kode, pastikan nama model yang mau dipakai tersedia di akun kamu:

1. Buka https://aistudio.google.com → **Model settings** atau dropdown model di playground
2. Cari `gemini-2.0-flash` — kalau tidak ada, cek variannya (mungkin `gemini-2.0-flash-exp`)
3. Cari `gemini-2.5-flash-lite` — kalau tidak ada, cek `gemini-2.5-flash-lite-preview` atau versi terbaru

Catat exact string yang tersedia — pakai string itu di `lib/gemini.ts`.

---

## Step 3 — Simpan API Key ke Environment

```env
# .env.local (root project Next.js)
GEMINI_API_KEY="AIzaSy_paste_key_kamu_di_sini"
USE_MOCK_LLM="false"   # set "true" untuk bypass Gemini saat dev/testing
```

Pastikan `.env.local` ada di `.gitignore`:
```
.env.local
.env*.local
```

---

## Step 4 — Install SDK

```bash
npm install @google/generative-ai zod
```

**Kenapa `@google/generative-ai` bukan `@google/genai`?**
`@google/genai` adalah SDK baru yang API-nya masih berubah-ubah dan breaking changes sering terjadi. Gunakan `@google/generative-ai` (stable) untuk hackathon.

---

## Step 5 — Buat Gemini Client

Salin kode lengkap dari **`notes/03-ai-llm.md` bagian "Setup Dua Model (`lib/gemini.ts`)"**.

Poin penting yang berbeda dari contoh generik di internet:

```typescript
// lib/gemini.ts

// Model 1: Parser — WAJIB pakai responseSchema
// Ini yang memastikan output selalu JSON valid dengan struktur persis
export const parserModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",         // ← verifikasi nama exact di AI Studio
  systemInstruction: `...`,           // ← aturan statis, diproses sebagai system turn
  generationConfig: {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: { ... },          // ← schema enforcement di model level
  },
});

// Model 2: Generator — tidak butuh schema, pakai flash-lite
export const generatorModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",    // ← verifikasi nama exact di AI Studio
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 300,
  },
});
```

**Mengapa `systemInstruction` terpisah dari user prompt?**
`systemInstruction` diproses sebagai system turn (weight lebih tinggi, berpotensi di-cache),
sedangkan user turn berubah setiap call. Aturan parsing yang statis (definisi intent, aturan field)
masuk `systemInstruction`. Data dinamis (produk, pesan customer) masuk user turn per call.
Detail dan kode lengkap di `notes/03-ai-llm.md`.

---

## Step 6 — Test Koneksi Gemini

Buat file test di root project untuk verifikasi API key dan nama model benar:

```typescript
// test-gemini.ts
// Jalankan: npx ts-node -e "require('./test-gemini')"
// Atau: npx tsx test-gemini.ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function testParser() {
  console.log("Testing parser model (gemini-2.0-flash)...");
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: "Kamu adalah intent parser. Pilih intent dari: browse, order_new, low_confidence.",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          intent:     { type: SchemaType.STRING, enum: ["browse", "order_new", "low_confidence"] },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ["intent", "confidence"],
      },
    },
  });

  const result = await model.generateContent('PESAN: "mau lihat katalog dong"');
  const text = result.response.text();
  const json = JSON.parse(text);
  console.log("✅ Parser OK:", json);
  // Expected: { intent: "browse", confidence: ~0.98 }
}

async function testGenerator() {
  console.log("Testing generator model (gemini-2.5-flash-lite)...");
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: { temperature: 0.4, maxOutputTokens: 100 },
  });

  const result = await model.generateContent(
    "Buat ringkasan singkat dalam 1 kalimat: Hari ini ada 8 order, omzet Rp416.000."
  );
  console.log("✅ Generator OK:", result.response.text().trim());
}

testParser().then(testGenerator).catch(console.error);
```

**Output yang diharapkan:**
```
Testing parser model (gemini-2.0-flash)...
✅ Parser OK: { intent: 'browse', confidence: 0.98 }
Testing generator model (gemini-2.5-flash-lite)...
✅ Generator OK: Hari ini lumayan dengan 8 order dan omzet Rp416.000.
```

---

## Step 7 — Tambahkan `USE_MOCK_LLM` untuk Development

Selama development, setiap pesan WA ke webhook = 1 Gemini API call. Ini cepat menghabiskan free tier dan membuat debugging lambat. Gunakan mock:

```typescript
// lib/intent-parser.ts (sudah ada di notes/03-ai-llm.md)
export async function parseCustomerMessage(...): Promise<ParsedIntent> {
  if (process.env.USE_MOCK_LLM === "true") return getMockIntent(message);
  // ... real Gemini call
}

// getMockIntent() → hardcoded responses untuk testing
// "katalog" → browse, "order" → order_new, "status" → order_status, dll
```

Set di `.env.local`:
```env
USE_MOCK_LLM="true"   # aktifkan saat development lokal
```

Saat siap test dengan Gemini nyata: ganti ke `"false"`.

---

## Step 8 — Environment Variables untuk Cloud Run

Saat deploy ke GCP, set Gemini key via Cloud Run:

```bash
gcloud run services update wassist \
  --region asia-southeast1 \
  --set-env-vars \
    GEMINI_API_KEY="AIzaSy...",\
    USE_MOCK_LLM="false"
```

Atau via Google Secret Manager (lebih aman):
```bash
echo -n "AIzaSy..." | gcloud secrets create GEMINI_API_KEY --data-file=-
gcloud run services update wassist \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

---

## Troubleshooting

| Error | Penyebab | Solusi |
|---|---|---|
| `API_KEY_INVALID` | Key salah atau expired | Buat key baru di AI Studio, cek `.env.local` |
| `MODEL_NOT_FOUND` | Nama model salah | Verifikasi nama exact di AI Studio playground — bisa `gemini-2.0-flash-exp` atau versi lain |
| `responseSchema` error | Tipe field tidak cocok (misalnya `NUMBER` untuk field integer) | Pakai `SchemaType.INTEGER` untuk integer, bukan `SchemaType.NUMBER` |
| JSON parse error | Model tambah teks di luar JSON | Dengan `responseSchema`, ini tidak seharusnya terjadi. Jika terjadi: log `rawText`, cek `responseMimeType` sudah diset |
| Zod validation error | Gemini return field yang tidak ada di schema | Log `rawJson` sebelum `ParsedIntentSchema.parse()`, lihat field apa yang extra |
| `QUOTA_EXCEEDED` | Rate limit free tier (15 RPM untuk flash) | Tambah retry dengan exponential backoff, atau set `USE_MOCK_LLM=true` sementara |
| Response diblokir safety filter | Nama produk atau kata dalam pesan trigger safety | Turunkan threshold: `HarmBlockThreshold.BLOCK_ONLY_HIGH` (sudah ada di kode) |

### Jika Model 1 Tidak Support `responseSchema`

Kalau model yang kamu pilih ternyata tidak support `responseSchema` (error saat call), fallback ke `responseMimeType: "application/json"` saja:

```typescript
// Fallback: JSON output tanpa schema enforcement
generationConfig: {
  temperature: 0.1,
  responseMimeType: "application/json",
  // responseSchema: { ... },  ← hapus ini
},
```

Konsekuensi: Zod validation di `parseCustomerMessage()` menjadi satu-satunya guard.
Failure rate naik dari ~0% ke ~0.5%. Masih acceptable untuk demo.

---

## Checklist Setup Gemini

- [ ] API key sudah dibuat di AI Studio dan ada di `.env.local`
- [ ] Nama model sudah diverifikasi di AI Studio (exact string)
- [ ] `@google/generative-ai` dan `zod` ter-install
- [ ] `lib/gemini.ts` sudah dibuat dengan dua model (lihat `notes/03-ai-llm.md`)
- [ ] `lib/intent-parser.ts` sudah dibuat dengan `ParsedIntentSchema` Zod
- [ ] `USE_MOCK_LLM=true` di `.env.local` untuk development
- [ ] Test script `test-gemini.ts` return output valid dari kedua model
- [ ] `.env.local` ada di `.gitignore`
