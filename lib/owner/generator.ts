import { generatorModel } from "../ai/models";
import type { RevenueData } from "@/server/db";

export type { RevenueData } from "@/server/db";

export async function generateRevenueResponse(data: RevenueData): Promise<string> {
  const topProductsText =
    data.topProducts.length > 0
      ? data.topProducts
          .map((p) => `${p.name} (${p.qtySold} ${p.unit} terjual, omzet Rp${p.revenue.toLocaleString("id-ID")})`)
          .join(", ")
      : "belum ada penjualan";

  const lowStockText =
    data.lowStockProducts.length > 0
      ? data.lowStockProducts
          .map((p) => `${p.name} (sisa ${p.stock} ${p.unit})`)  // tanpa threshold
          .join(", ")
      : "semua stok aman";

  // systemInstruction sudah set persona + gaya — prompt hanya data
  const prompt = `DATA BISNIS (${data.period}):
- Total omzet: Rp${data.totalRevenue.toLocaleString("id-ID")}
- Jumlah order: ${data.orderCount}
- Rata-rata order (AOV): Rp${data.aov.toLocaleString("id-ID")}
- Produk terlaris (berdasarkan omzet): ${topProductsText}
- Stok perlu perhatian: ${lowStockText}`;

  try {
    const result = await generatorModel.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    const top = data.topProducts[0];
    const topLabel = top ? `${top.name} (${top.qtySold} ${top.unit})` : "belum ada data";
    const lowAlert =
      data.lowStockProducts.length > 0
        ? `\n⚠️ Stok menipis: ${data.lowStockProducts.map((p) => p.name).join(", ")}`
        : "";
    return (
      `📊 *Laporan ${data.period}*\n` +
      `${data.orderCount} order | Rp${data.totalRevenue.toLocaleString("id-ID")}\n` +
      `Top produk: ${topLabel}` + lowAlert
    );
  }
}
