import { NextRequest, NextResponse } from "next/server";
import { queryRevenueData, getOrdersByTenant, getTenantById } from "@/server/db";

export async function GET(request: NextRequest) {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });

  const period = request.nextUrl.searchParams.get("period") ?? "hari ini";

  const [kpiData, allOrders, tenant] = await Promise.all([
    queryRevenueData(tenantId, period),
    getOrdersByTenant(tenantId),
    getTenantById(tenantId),
  ]);

  const pendingCount = allOrders.filter(
    (o) => o.status === "PENDING" || o.status === "AWAITING_PAYMENT"
  ).length;

  return NextResponse.json({
    ...kpiData,
    pendingCount,
    tenantName: tenant?.name ?? "",
  });
}
