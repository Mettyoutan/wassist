import { NextResponse } from "next/server";
import { createProduct, getProductsForDashboard, queryRevenueData } from "@/server/db";

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
    description: p.description,
    category: p.category,
    stock:     p.stock,
    unit:      p.unit,
    price:     p.price,
    soldToday: soldMap.get(p.name) ?? 0,
    image:     p.image_url ?? "",
    status:    toStockStatus(p.stock, p.reorder_point),
  }));

  return NextResponse.json({ products: result });
}

export async function POST(request: Request) {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });

  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.price || !body.unit) {
      return NextResponse.json({ error: "Name, price, and unit are required" }, { status: 400 });
    }

    const result = await createProduct(
      tenantId,
      body.name,
      Number(body.price),
      Number(body.stock || 0),
      body.unit,
      Number(body.reorder_point || 5),
      body.image_url || "",
      body.category || "",
      body.description || "",
      body.meta_retailer_id || ""
    );

    if (!result) {
      return NextResponse.json({ error: "Failed to create product in DB" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: result.id }, { status: 201 });
  } catch (err: any) {
    console.error("[API Products POST] error:", err);
    return NextResponse.json({ error: err.message || "Failed to create product" }, { status: 500 });
  }
}