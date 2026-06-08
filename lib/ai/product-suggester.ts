import { productSuggestModel } from "@/lib/ai/models";

export type ProductSuggestion = {
  found: boolean;
  product_index: number; // 1-based index into products array; 0 = not found
};

/**
 * Cari produk terdekat dari pesan customer yang tidak jelas / tidak match katalog.
 * Return { found: false, product_index: 0 } jika tidak ada yang cukup mirip atau jika Gemini gagal.
 */
export async function suggestClosestProduct(
  products: Array<{ name: string; price: number; unit: string }>,
  msgText: string
): Promise<ProductSuggestion> {
  if (products.length === 0) return { found: false, product_index: 0 };

  const productList = products
    .map((p, i) => `${i + 1}. ${p.name} — Rp${p.price.toLocaleString("id-ID")}/${p.unit}`)
    .join("\n");

  const prompt = `PRODUK TERSEDIA:\n${productList}\n\nPESAN CUSTOMER: "${msgText}"`;

  try {
    const result = await productSuggestModel.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text) as ProductSuggestion;
    return parsed;
  } catch {
    return { found: false, product_index: 0 };
  }
}
