import { z } from "zod";
import { customerParserModel } from "./models";

const OrderItemSchema = z.object({
  product_index:     z.number().int().min(1),
  qty:               z.number().positive().optional(),
  candidate_indices: z.array(z.number().int().min(1)).optional().default([]),
  size:              z.string().optional().default(""),
  notes:             z.string().default(""),
});

export const ParsedIntentSchema = z.object({
  intent: z.enum([
    "order_new", "browse", "repeat_last",
    "modify_order", "cancel_order", "order_status",
    "product_detail", "greeting", "low_confidence",
  ]),
  items:      z.array(OrderItemSchema).default([]),
  confidence: z.number().min(0).max(1),
});

export type ParsedIntent    = z.infer<typeof ParsedIntentSchema>;
export type ProductForPrompt = {
  name:  string;
  price: number;
  unit:  string;
};

export type PromptContext = {
  store_name:     string;
  store_category: string;
  current_order?: Array<{ name: string; qty: number; size: string }>;
};

export function buildCustomerIntentPrompt(
  message:  string,
  products: ProductForPrompt[],
  context:  PromptContext
): string {
  const productList = products
    .map((p, i) => `${i + 1}. ${p.name} — Rp${p.price.toLocaleString("id-ID")}/${p.unit}`)
    .join("\n");

  const currentOrderBlock =
    context.current_order && context.current_order.length > 0
      ? `\nORDER AKTIF CUSTOMER SAAT INI:\n${context.current_order
          .map(o => `- ${o.name} x${o.qty}${o.size ? ` (${o.size})` : ""}`)
          .join("\n")}`
      : "";

  return `TOKO: ${context.store_name} (${context.store_category})

PRODUK TERSEDIA:
${productList}${currentOrderBlock}

PESAN CUSTOMER: "${message}"`;
}

export async function parseCustomerMessage(
  message:  string,
  products: ProductForPrompt[],
  context:  PromptContext
): Promise<ParsedIntent> {
  try {
    const prompt  = buildCustomerIntentPrompt(message, products, context);
    const result  = await customerParserModel.generateContent(prompt);
    const rawText = result.response.text();
    const rawJson = JSON.parse(rawText);
    const parsed  = ParsedIntentSchema.parse(rawJson);

    if (parsed.confidence < 0.70 && parsed.intent !== "low_confidence") {
      return { intent: "low_confidence", items: [], confidence: parsed.confidence };
    }

    return parsed;
  } catch (err) {
    console.error("[Gemini/Parser] Error:", err);
    return { intent: "low_confidence", items: [], confidence: 0 };
  }
}
