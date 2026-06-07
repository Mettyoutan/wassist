import { NextResponse } from "next/server";
import { getTenantById } from "@/server/db";

export async function GET() {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });

  const tenant = await getTenantById(tenantId);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  return NextResponse.json({
    name: tenant.name,
    ownerPhone: tenant.owner_phone,
    category: tenant.category,
  });
}
