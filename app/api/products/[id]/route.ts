import { deleteProduct, getProductById, updateProduct } from "@/server/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;
  const product = await getProductById(productId);
  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
  return Response.json({ product });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }>}
) {
  const {id: productId} = await params; // ← ambil id dari params
  
  try {
    const body = await request.json();
    
    await updateProduct(productId, {
      name: body.name,                              // ← harus ada key-nya
      price: Number(body.price),
      stock: Number(body.stock || 0),
      unit: body.unit,
      reorder_point: Number(body.reorder_point || 5),
      image_url: body.image_url || "",
      category: body.category || "",
      description: body.description || ""
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Gagal update produk" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;

  try {
    await deleteProduct(productId);
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Gagal menghapus produk" }, { status: 500 });
  }
}
