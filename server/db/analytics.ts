import { supabaseAdmin } from "./client";

export type TopProduct = {
  name: string;
  unit: string;
  qtySold: number;
  revenue: number;   // ranking key — SUM(qty × price_at_order)
};

export type LowStockProduct = {
  name: string;
  unit: string;
  stock: number;
  reorderPoint: number;
};

export type TrendPoint = {
  label: string;
  revenue: number;
};

export type RevenueData = {
  period: string;
  periodStart: string;
  totalRevenue: number;
  orderCount: number;
  aov: number;
  topProducts: TopProduct[];
  lowStockProducts: LowStockProduct[];
  trendPoints: TrendPoint[];
  qrisCount: number;
  manualCount: number;
  uniqueCustomers: number;
  repeatCustomers: number;
};

export function parsePeriod(raw: string): { periodStart: string; label: string } {
  const lower = raw.toLowerCase();
  const now = new Date();

  if (lower.includes("minggu") || lower.includes("week")) {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { periodStart: start.toISOString(), label: "7 hari terakhir" };
  }

  if (lower.includes("bulan") || lower.includes("month")) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { periodStart: start.toISOString(), label: "bulan ini" };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { periodStart: start.toISOString(), label: "hari ini" };
}

export async function queryRevenueData(
  tenantId: string,
  periodRaw: string = "hari ini"
): Promise<RevenueData> {
  const { periodStart, label } = parsePeriod(periodRaw);

  // KPI — hanya order PAID
  const { data: paidOrders } = await supabaseAdmin
    .from("orders")
    .select("id, total_amount, created_at, payment_method, customer_user_id")
    .eq("tenant_id", tenantId)
    .eq("payment_status", "PAID")
    .gte("created_at", periodStart);

  const orderCount = paidOrders?.length ?? 0;
  const totalRevenue = paidOrders?.reduce((sum, o) => sum + o.total_amount, 0) ?? 0;
  const aov = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

  // Top produk — rank by revenue (Rupiah), bukan qty (unit berbeda tidak bisa dibanding)
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
          name: prod.name, unit: prod.unit,
          qtySold: item.qty,
          revenue: item.qty * item.price_at_order,
        });
      }
    }

    topProducts = [...agg.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }

  // Low stock — stock <= reorder_point, filter di JS (Supabase tidak support kolom-vs-kolom filter)
  const { data: allProducts } = await supabaseAdmin
    .from("products")
    .select("name, unit, stock, reorder_point")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const lowStockProducts: LowStockProduct[] = (allProducts ?? [])
    .filter((p) => p.stock <= p.reorder_point)
    .sort((a, b) => a.stock / a.reorder_point - b.stock / b.reorder_point)
    .slice(0, 5)
    .map((p) => ({ name: p.name, unit: p.unit, stock: p.stock, reorderPoint: p.reorder_point }));

  // ── Trend points: revenue bucketed by time ──
  const periodLower = periodRaw.toLowerCase();
  let trendPoints: TrendPoint[];
  if (periodLower.includes("minggu") || periodLower.includes("week")) {
    const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    const DAY_JS = [1, 2, 3, 4, 5, 6, 0];
    trendPoints = DAY_JS.map((jsDay, i) => ({
      label: DAY_LABELS[i],
      revenue: (paidOrders ?? [])
        .filter((o) => new Date(o.created_at).getDay() === jsDay)
        .reduce((s, o) => s + o.total_amount, 0),
    }));
  } else if (periodLower.includes("bulan") || periodLower.includes("month")) {
    trendPoints = [1, 2, 3, 4].map((week) => ({
      label: `Minggu ${week}`,
      revenue: (paidOrders ?? [])
        .filter((o) => Math.ceil(new Date(o.created_at).getDate() / 7) === week)
        .reduce((s, o) => s + o.total_amount, 0),
    }));
  } else {
    const HOURS = [8, 10, 12, 14, 16, 18, 20];
    trendPoints = HOURS.map((h) => ({
      label: `${h.toString().padStart(2, "0")}:00`,
      revenue: (paidOrders ?? [])
        .filter((o) => {
          const hr = new Date(o.created_at).getHours();
          return hr >= h && hr < h + 2;
        })
        .reduce((s, o) => s + o.total_amount, 0),
    }));
  }

  // ── Payment method split ──
  const qrisCount = (paidOrders ?? []).filter(
    (o) => (o.payment_method ?? "QRIS").toUpperCase() === "QRIS"
  ).length;
  const manualCount = orderCount - qrisCount;

  // ── Customer loyalty ──
  const customerOrderCount = new Map<string, number>();
  for (const o of paidOrders ?? []) {
    if (!o.customer_user_id) continue;
    customerOrderCount.set(
      o.customer_user_id,
      (customerOrderCount.get(o.customer_user_id) ?? 0) + 1
    );
  }
  const uniqueCustomers = customerOrderCount.size;
  const repeatCustomers = [...customerOrderCount.values()].filter((n) => n >= 2).length;

  return {
    period: label, periodStart, totalRevenue, orderCount, aov,
    topProducts, lowStockProducts,
    trendPoints, qrisCount, manualCount, uniqueCustomers, repeatCustomers,
  };
}
