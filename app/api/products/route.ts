import { NextResponse } from "next/server";
import { getProductsForDashboard, queryRevenueData } from "@/server/db";

function toStockStatus(stock: number, reorder: number): "habis" | "menipis" | "aman" {
  if (stock <= 0) return "habis";
  if (stock <= reorder) return "menipis";
  return "aman";
}

export async function GET() {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });

  const [products, kpiToday] = await Promise.all([
    getProductsForDashboard(tenantId),
    queryRevenueData(tenantId, "hari ini"),
  ]);

  const soldMap = new Map(kpiToday.topProducts.map((p) => [p.name, p.qtySold]));

  const result = products.map((p) => ({
    id:        p.id,
    name:      p.name,
    stock:     p.stock,
    unit:      p.unit,
    price:     p.price,
    soldToday: soldMap.get(p.name) ?? 0,
    image:     p.image_url ?? "",
    status:    toStockStatus(p.stock, p.reorder_point),
  }));

  return NextResponse.json({ products: result });
}
