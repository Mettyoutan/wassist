import { z } from "zod";
import { confirmationParserModel, clarificationParserModel } from "./models";

export type ConfirmationSignal = "confirm" | "cancel" | "ambiguous";

const ConfirmSchema = z.object({
  signal: z.enum(["confirm", "cancel", "ambiguous"]),
});

const ClarificationChoiceSchema = z.object({
  index: z.number(),
  qty:   z.number().optional(),
});

const ClarificationSchema = z.object({
  choices: z.array(ClarificationChoiceSchema),
  cancel:  z.boolean(),
});

export type ClarificationChoice = { index: number; qty?: number };

export async function parseConfirmationIntent(text: string): Promise<ConfirmationSignal> {
  try {
    const result = await confirmationParserModel.generateContent(
      `Pesan customer/owner: "${text}"`
    );
    const raw = JSON.parse(result.response.text());
    const parsed = ConfirmSchema.safeParse(raw);
    return parsed.success ? parsed.data.signal : "ambiguous";
  } catch {
    return "ambiguous";
  }
}

export async function parseClarificationInput(
  text:        string,
  kind:        "variant" | "quantity",
  candidates:  Array<{ name: string }>,
  integerOnly: boolean,
  maxStock?:   number,
): Promise<{ choices: ClarificationChoice[]; cancel: boolean }> {
  const empty = { choices: [], cancel: false };

  let context: string;
  if (kind === "variant") {
    const candidateList = candidates
      .map((c, i) => `${i + 1}. ${c.name}`)
      .join("\n");
    context = `Jenis: pilihan varian.\nKandidat:\n${candidateList}\nCustomer boleh pilih satu atau lebih.`;
  } else {
    const prodName = candidates[0]?.name ?? "produk";
    context =
      `Jenis: jumlah produk (${prodName}). Harus > 0.` +
      `${integerOnly ? " Harus bilangan bulat." : ""}` +
      `${maxStock !== undefined ? ` Maksimum ${maxStock}.` : ""}`;
  }

  try {
    const result = await clarificationParserModel.generateContent(
      `${context}\nPesan customer: "${text}"`
    );
    const raw    = JSON.parse(result.response.text());
    const parsed = ClarificationSchema.safeParse(raw);
    if (!parsed.success) return empty;
    return parsed.data;
  } catch {
    return empty;
  }
}

export type PaymentStateSignal = "resend_qr" | "cancel" | "other";

export async function parsePaymentStateIntent(
  text: string,
): Promise<PaymentStateSignal> {
  try {
    const result = await confirmationParserModel.generateContent(
      `Konteks: customer sedang menunggu pembayaran QRIS untuk pesanannya.
- "confirm"  : customer ingin lihat/kirim ulang QR, minta link bayar, tanya cara bayar, mau lanjut bayar (kata: scan, qr, bayar, kirim ulang, mau bayar, gimana bayarnya, dll)
- "cancel"   : customer ingin batalkan pesanan (kata: batal, cancel, gak jadi, dll)
- "ambiguous": selain itu
Pesan customer: "${text}"`
    );
    const raw    = JSON.parse(result.response.text());
    const parsed = ConfirmSchema.safeParse(raw);
    if (!parsed.success) return "other";
    if (parsed.data.signal === "confirm") return "resend_qr";
    if (parsed.data.signal === "cancel")  return "cancel";
    return "other";
  } catch {
    return "other";
  }
}
