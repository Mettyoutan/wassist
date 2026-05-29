import { z } from "zod"
import { parserModel } from "./gemini"

enum intent {
    "order_new", "browse", "repeat_last", "modify_order", "cancel_order", "order_status", "low_confidence"
}

// Schema zod untuk order item
const OrderItemSchema = z.object({
    intent: z.string(),
    qty: z.int().positive(),
    size: z.string().optional().default(""), // S/M/L/XL/XXL/angka/khusus
    notes: z.string().default("")
})

// Schema untuk parsed-intent
export const ParsedIntentSchema = z.object({
    intent: z.enum(intent),
    items: z.array(OrderItemSchema).default([]),
    confidence: z.number().min(0).max(1)
})

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>

/**
 * Membuat string untuk prompt customer-intent
 */
export function buildCustomerIntentPrompt(
    message: string,
    products: Array<{ name: string, price: number }> 
): string {
    const productList = products
        .map(p => `- ${p.name} (Rp${p.price.toLocaleString("id-ID")})`)
        .join("\n");

    return `Kamu adalah intent parser untuk toko online.

        PRODUK TERSEDIA DARI toko ini:
        ${productList}
        
        PESAN CUSTOMER: "${message}"
    `;
}

