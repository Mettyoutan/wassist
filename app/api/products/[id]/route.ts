import { NextRequest, NextResponse } from "next/server";
import { getProductById, updateProduct, setProductActive } from "@/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) {
    return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });
  }

  const { id } = await params;
  
  try {
    const body = await request.json();
    
    // Validate required fields if necessary
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.price !== undefined) updates.price = Number(body.price);
    if (body.stock !== undefined) updates.stock = Number(body.stock);
    if (body.unit !== undefined) updates.unit = body.unit;
    if (body.reorder_point !== undefined) updates.reorder_point = Number(body.reorder_point);
    if (body.image_url !== undefined) updates.image_url = body.image_url;
    if (body.category !== undefined) updates.category = body.category;
    if (body.description !== undefined) updates.description = body.description;

    await updateProduct(id, updates);
    return NextResponse.json({ success: true, message: "Produk berhasil diperbarui" });
  } catch (err: any) {
    console.error("[API Products PATCH] error:", err);
    return NextResponse.json({ error: err.message || "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) {
    return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });
  }

  const { id } = await params;

  try {
    // Soft delete product by setting is_active = false
    await setProductActive(id, false);
    return NextResponse.json({ success: true, message: "Produk berhasil dinonaktifkan" });
  } catch (err: any) {
    console.error("[API Products DELETE] error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete product" }, { status: 500 });
  }
}
