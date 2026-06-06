import { z } from "zod";
import { confirmationParserModel, clarificationParserModel } from "./models";

export type ConfirmationSignal = "confirm" | "cancel" | "ambiguous";

const ConfirmSchema = z.object({
  signal: z.enum(["confirm", "cancel", "ambiguous"]),
});

const ClarificationSchema = z.object({
  choice: z.number(),
  cancel: z.boolean(),
});

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
  text:           string,
  kind:           "variant" | "quantity",
  candidateCount: number,
  integerOnly:    boolean,
  maxStock?:      number,
): Promise<{ choice: number; cancel: boolean }> {
  const context =
    kind === "variant"
      ? `Jenis: pilihan varian. Pilihan valid: 1 sampai ${candidateCount}. Harus integer.`
      : `Jenis: jumlah produk. Harus > 0.${integerOnly ? " Harus bilangan bulat." : ""}${maxStock !== undefined ? ` Maksimum ${maxStock}.` : ""}`;

  try {
    const result = await clarificationParserModel.generateContent(
      `${context}\nPesan customer: "${text}"`
    );
    const raw = JSON.parse(result.response.text());
    const parsed = ClarificationSchema.safeParse(raw);
    if (!parsed.success) return { choice: 0, cancel: false };
    return parsed.data;
  } catch {
    return { choice: 0, cancel: false };
  }
}
