import { z } from "zod";
import { ownerParserModel } from "../ai/models";

export const OwnerCommandSchema = z.object({
  action: z.enum([
    "get_revenue",
    "get_stock",
    "update_price",
    "update_stock",
    "set_reorder_point",
    "deactivate_product",
    "activate_product",
    "open_store",
    "close_store",
    "help",
    "unknown",
  ]),
  product_index: z.number().int().min(1).optional(),
  value:         z.number().positive().optional(),
  delta:         z.number().optional(),
  period:        z.string().optional(),
  confidence:    z.number().min(0).max(1),
});

export type OwnerCommand = z.infer<typeof OwnerCommandSchema>;

export type OwnerProductForPrompt = {
  name:  string;
  price: number;
  unit:  string;
  stock: number;
};

function buildOwnerPrompt(message: string, products: OwnerProductForPrompt[]): string {
  const productList =
    products.length > 0
      ? products
          .map((p, i) => `${i + 1}. ${p.name} — Rp${p.price.toLocaleString("id-ID")}/${p.unit} | stok: ${p.stock}`)
          .join("\n")
      : "(tidak ada produk aktif)";

  return `DAFTAR PRODUK:\n${productList}\n\nPERINTAH OWNER: "${message}"`;
}

export async function parseOwnerCommand(
  message:  string,
  products: OwnerProductForPrompt[]
): Promise<OwnerCommand> {
  try {
    const result  = await ownerParserModel.generateContent(buildOwnerPrompt(message, products));
    const rawJson = JSON.parse(result.response.text());
    const parsed  = OwnerCommandSchema.parse(rawJson);

    if (parsed.confidence < 0.70 && parsed.action !== "unknown") {
      return { action: "unknown", confidence: parsed.confidence };
    }

    return parsed;
  } catch (err) {
    console.error("[Gemini/OwnerParser] Error:", err);
    return { action: "unknown", confidence: 0 };
  }
}
