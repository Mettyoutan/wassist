import { supabaseAdmin } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TopProduct = {
  name: string;
  unit: string;
  qtySold: number;   // display: "15 pcs" — SUM(qty)
  revenue: number;   // ranking key — SUM(qty × price_at_order)
};

export type LowStockProduct = {
  name: string;
  unit: string;
  stock: number;
  reorderPoint: number; // beri LLM konteks urgency: "sisa 2 dari threshold 5"
};

export type RevenueData = {
  period: string;       // label manusiawi: "hari ini", "7 hari terakhir", "bulan ini"
  periodStart: string;  // ISO 8601 — untuk audit & debug
  totalRevenue: number; // selalu non-null (0 jika tidak ada order)
  orderCount: number;
  aov: number;          // average order value, 0 jika tidak ada order
  topProducts: TopProduct[];           // sorted revenue DESC, capped ≤3, [] jika kosong
  lowStockProducts: LowStockProduct[]; // sorted urgency ASC, capped ≤5
};

// ─── Period parser ────────────────────────────────────────────────────────────

// Terima string perintah owner, return ISO start + label display.
// Tidak pakai library date — 3 case sederhana cukup dengan Date native.
export function parsePeriod(raw: string): { periodStart: string; label: string } {
  const lower = raw.toLowerCase();
  const now = new Date();

  if (lower.includes("minggu") || lower.includes("week")) {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { periodStart: start.toISOString(), label: "7 hari terakhir" };
  }

  if (lower.includes("bulan") || lower.includes("month")) {
    // Awal bulan kalender ini
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { periodStart: start.toISOString(), label: "bulan ini" };
  }

  // Default: hari ini (00:00 waktu lokal server)
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { periodStart: start.toISOString(), label: "hari ini" };
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function queryRevenueData(
  tenantId: string,
  periodRaw: string = "hari ini"
): Promise<RevenueData> {
  const { periodStart, label } = parsePeriod(periodRaw);

  // ── Sub-query 1: KPI agregat ─────────────────────────────────────────────
  // Hanya order dengan payment_status = 'PAID'. Pending/cancelled/refunded bukan omzet.
  const { data: paidOrders } = await supabaseAdmin
    .from("orders")
    .select("id, total_amount")
    .eq("tenant_id", tenantId)
    .eq("payment_status", "PAID")
    .gte("created_at", periodStart);

  const orderCount = paidOrders?.length ?? 0;
  const totalRevenue = paidOrders?.reduce((sum, o) => sum + o.total_amount, 0) ?? 0;
  const aov = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

  // ── Sub-query 2: top produk ──────────────────────────────────────────────
  // Ranking by revenue (qty × price_at_order), BUKAN SUM(qty).
  // Alasan: unit berbeda tidak bisa dibanding (25 kg vs 15 pcs — mana "lebih laris"?).
  // Rupiah = satu-satunya common denominator unit-agnostic.
  // price_at_order = snapshot saat order — jangan pakai product.price yang bisa berubah.
  //
  // Supabase JS tidak support GROUP BY multi-kolom via .select().
  // Agregasi dilakukan di JS layer — acceptable untuk demo tenant 15 produk.
  // Jika katalog besar (>200 produk, >10k items): ganti dengan Supabase RPC / PostgreSQL view.
  let topProducts: TopProduct[] = [];
  const orderIds = (paidOrders ?? []).map((o) => o.id);

  if (orderIds.length > 0) {
    const [{ data: items }, { data: products }] = await Promise.all([
      supabaseAdmin
        .from("order_items")
        .select("product_id, qty, price_at_order")
        .in("order_id", orderIds),
      supabaseAdmin
        .from("products")
        .select("id, name, unit")
        .eq("tenant_id", tenantId),
    ]);

    const productMap = new Map(
      (products ?? []).map((p) => [p.id, { name: p.name, unit: p.unit }])
    );

    // Agregasi per product_id: accumulate qtySold + revenue
    const agg = new Map<string, TopProduct>();
    for (const item of items ?? []) {
      const prod = productMap.get(item.product_id);
      if (!prod) continue;
      const cur = agg.get(item.product_id);
      if (cur) {
        cur.qtySold += item.qty;
        cur.revenue += item.qty * item.price_at_order;
      } else {
        agg.set(item.product_id, {
          name: prod.name,
          unit: prod.unit,
          qtySold: item.qty,
          revenue: item.qty * item.price_at_order,
        });
      }
    }

    topProducts = [...agg.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }

  // ── Sub-query 3: low stock ───────────────────────────────────────────────
  // Supabase JS client tidak support filter "kolom A <= kolom B" via builder —
  // butuh SQL raw atau RPC. Solusi: fetch semua produk aktif, filter di JS.
  // Untuk 15 produk demo ini trivial (<1ms). Scale >500 produk: ganti ke RPC.
  //
  // Urgency sort = stock / reorder_point ASC:
  // rasio 0.2 (sisa 1 dari threshold 5) lebih kritis dari 0.8 (sisa 4 dari threshold 5).
  const { data: allProducts } = await supabaseAdmin
    .from("products")
    .select("name, unit, stock, reorder_point")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const lowStockProducts: LowStockProduct[] = (allProducts ?? [])
    .filter((p) => p.stock <= p.reorder_point)
    .sort((a, b) => a.stock / a.reorder_point - b.stock / b.reorder_point)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      reorderPoint: p.reorder_point,
    }));

  return {
    period: label,
    periodStart,
    totalRevenue,
    orderCount,
    aov,
    topProducts,
    lowStockProducts,
  };
}
