import { NextRequest, NextResponse } from "next/server";
import { updateOrderStatus } from "@/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // unused — detail order not yet implemented
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });

  const { id } = await params;
  const body = await request.json();
  
  if (body.action === "finish") {
    await updateOrderStatus(id, "DONE");
    return NextResponse.json({ success: true });
  } else if (body.action === "cancel") {
    await updateOrderStatus(id, "CANCELLED");
    return NextResponse.json({ success: true });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
