import { supabaseAdmin }           from "@/lib/db";
import { sendWhatsAppMessage }     from "@/lib/whatsapp";
import { queryRevenueData }        from "@/lib/owner-query";
import { generateRevenueResponse } from "@/lib/owner-generator";
import type { DbTenant }           from "@/lib/types/db";

// Owner commands yang dikenali (keyword matching sederhana — tidak butuh Gemini untuk ini)
// Pattern: periksa substring, tidak perlu exact match.
// Kalau tidak dikenali → balas help message.

export async function handleOwnerCommand(
  tenant: DbTenant,
  ownerPhone: string,
  text: string
): Promise<void> {
  const lower = text.toLowerCase().trim();

  // ── Omzet / revenue report ────────────────────────────────────────────────
  // Trigger: "omzet", "laporan", "revenue", "pendapatan", "hasil"
  if (
    lower.includes("omzet") ||
    lower.includes("laporan") ||
    lower.includes("revenue") ||
    lower.includes("pendapatan") ||
    lower.includes("hasil")
  ) {
    // Ekstrak period dari pesan — parsePeriod di owner-query handle defaultnya
    const periodRaw = lower.includes("minggu")
      ? "minggu"
      : lower.includes("bulan")
      ? "bulan"
      : "hari ini";

    const data = await queryRevenueData(tenant.id, periodRaw);
    const response = await generateRevenueResponse(data);
    await sendWhatsAppMessage(ownerPhone, response);
    return;
  }

  // ── Stok check ────────────────────────────────────────────────────────────
  // Trigger: "stok", "stock", "sisa"
  if (lower.includes("stok") || lower.includes("stock") || lower.includes("sisa")) {
    // Cek apakah ada nama produk yang disebut
    // Kalau ada → lookup spesifik. Kalau tidak → tampilkan semua low stock.
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("name, unit, stock, reorder_point")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (!products || products.length === 0) {
      await sendWhatsAppMessage(ownerPhone, "Tidak ada produk aktif kak 🤔");
      return;
    }

    // Cari produk yang namanya disebut di pesan (case-insensitive substring match)
    const mentioned = products.find((p) =>
      lower.includes(p.name.toLowerCase())
    );

    if (mentioned) {
      const status = mentioned.stock <= mentioned.reorder_point ? "⚠️ hampir habis!" : "✅ aman";
      await sendWhatsAppMessage(
        ownerPhone,
        `📦 *${mentioned.name}*\nStok: ${mentioned.stock} ${mentioned.unit} — ${status}`
      );
      return;
    }

    // Tidak sebut produk spesifik → tampilkan yang low stock
    const lowStock = products
      .filter((p) => p.stock <= p.reorder_point)
      .sort((a, b) => a.stock / a.reorder_point - b.stock / b.reorder_point);

    if (lowStock.length === 0) {
      await sendWhatsAppMessage(ownerPhone, "✅ Semua stok aman kak!");
      return;
    }

    const lines = lowStock
      .map((p) => `⚠️ ${p.name}: sisa ${p.stock} ${p.unit}`)
      .join("\n");
    await sendWhatsAppMessage(ownerPhone, `Stok yang perlu restock:\n\n${lines}`);
    return;
  }

  // ── Buka/tutup toko ───────────────────────────────────────────────────────
  if (lower.includes("buka") || lower === "open") {
    await supabaseAdmin
      .from("tenants")
      .update({ is_open: true, closed_until: null })
      .eq("id", tenant.id);
    await sendWhatsAppMessage(ownerPhone, "✅ Toko sekarang *buka* ya kak!");
    return;
  }

  if (lower.includes("tutup") || lower === "close" || lower.includes("closed")) {
    await supabaseAdmin
      .from("tenants")
      .update({ is_open: false })
      .eq("id", tenant.id);
    await sendWhatsAppMessage(ownerPhone, "🔒 Toko sekarang *tutup*. Balas *buka* untuk buka lagi.");
    return;
  }

  // ── Help / fallback ───────────────────────────────────────────────────────
  await sendWhatsAppMessage(
    ownerPhone,
    `👋 *Owner Command WAssist*\n\n` +
      `📊 Laporan: "omzet hari ini" / "omzet minggu ini" / "omzet bulan ini"\n` +
      `📦 Stok: "stok" (semua low stock) / "stok kaos oversize" (produk spesifik)\n` +
      `🟢 Toko: "buka" / "tutup"\n\n` +
      `_Pesan customer dibalas otomatis oleh bot._`
  );
}
