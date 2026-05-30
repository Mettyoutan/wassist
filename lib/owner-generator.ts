import { generatorModel } from "./gemini";
import type { RevenueData } from "./owner-query";

// Re-export agar consumer tidak perlu import dari dua tempat
export type { RevenueData } from "./owner-query";

export async function generateRevenueResponse(data: RevenueData): Promise<string> {
  // Bangun context block yang di-inject ke prompt.
  // LLM terima data terstruktur — LLM TIDAK ranking/hitung, hanya narasi.
  // topProducts sudah terurut revenue DESC oleh query layer.
  const topProductsText =
    data.topProducts.length > 0
      ? data.topProducts
          .map(
            (p) =>
              `${p.name} (${p.qtySold} ${p.unit} terjual, omzet Rp${p.revenue.toLocaleString("id-ID")})`
          )
          .join(", ")
      : "belum ada penjualan";

  const lowStockText =
    data.lowStockProducts.length > 0
      ? data.lowStockProducts
          .map((p) => `${p.name} (sisa ${p.stock} ${p.unit}, threshold ${p.reorderPoint})`)
          .join(", ")
      : "semua stok aman";

  const prompt = `Kamu adalah asisten bisnis untuk owner toko online UMKM.
Berdasarkan data berikut, buat ringkasan singkat dalam Bahasa Indonesia.
Gaya: casual dan informatif, seperti teman yang bantu analisis bisnis.
Panjang: 2-4 kalimat. Gunakan emoji secukupnya.
Jika ada stok hampir habis, ingatkan dengan urgency yang wajar.
Jangan sebut angka threshold reorder_point secara eksplisit — cukup bilang "hampir habis" atau "perlu restock".

DATA BISNIS (${data.period}):
- Total omzet: Rp${data.totalRevenue.toLocaleString("id-ID")}
- Jumlah order: ${data.orderCount}
- Rata-rata order: Rp${data.aov.toLocaleString("id-ID")}
- Produk terlaris (berdasarkan omzet): ${topProductsText}
- Stok perlu perhatian: ${lowStockText}

Ringkasan:`;

  try {
    const result = await generatorModel.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    // Fallback template jika Gemini Mode 2 gagal — jangan biarkan owner command error
    const top = data.topProducts[0];
    const topLabel = top
      ? `${top.name} (${top.qtySold} ${top.unit})`
      : "belum ada data";
    const lowAlert =
      data.lowStockProducts.length > 0
        ? `\n⚠️ Stok menipis: ${data.lowStockProducts.map((p) => p.name).join(", ")}`
        : "";
    return (
      `📊 *Laporan ${data.period}*\n` +
      `${data.orderCount} order | Rp${data.totalRevenue.toLocaleString("id-ID")}\n` +
      `Top produk: ${topLabel}` +
      lowAlert
    );
  }
}
