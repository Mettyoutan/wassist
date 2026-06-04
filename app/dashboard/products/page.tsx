import StockNotification from "@/components/dashboard/StockNotification";
import { getProductsForDashboard, queryRevenueData } from "@/server/db";

function toStockStatus(stock: number, reorder: number): "habis" | "menipis" | "aman" {
  if (stock <= 0) return "habis";
  if (stock <= reorder) return "menipis";
  return "aman";
}

export default async function StockManagement() {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return <p className="p-4 text-danger">DEMO_TENANT_ID tidak dikonfigurasi.</p>;

  const [products, kpiToday] = await Promise.all([
    getProductsForDashboard(tenantId),
    queryRevenueData(tenantId, "hari ini"),
  ]);

  const soldMap = new Map(kpiToday.topProducts.map((p) => [p.name, p.qtySold]));

  const items = products.map((p) => ({
    name:      p.name,
    stock:     p.stock,
    soldToday: soldMap.get(p.name) ?? 0,
    unit:      p.unit,
    image:     p.image_url ?? "",
    status:    toStockStatus(p.stock, p.reorder_point),
  }));

  return <StockNotification items={items} />;
}
