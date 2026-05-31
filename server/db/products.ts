import { supabaseAdmin } from "./client";
import type { DbProduct } from "@/lib/types/db";

// ORDER BY name ASC wajib — Gemini pakai product_index berdasarkan urutan ini.
// Kalau urutan berubah antar-call → index salah → produk dipesan bisa salah.
export async function getActiveProducts(
  tenantId: string
): Promise<Pick<DbProduct, "name" | "price" | "unit">[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("name, price, unit")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) console.error("[DB] getActiveProducts:", error.message);
  return data ?? [];
}

// Resolve nama produk ke detail DB untuk validasi stok + snapshot harga order.
// price dari sini (bukan dari getActiveProducts) → price_at_order selalu fresh dari DB.
export async function getProductByName(
  tenantId: string,
  name: string
): Promise<Pick<DbProduct, "id" | "price" | "stock" | "unit"> | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, price, stock, unit")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getProductByName:", error.message);
    return null;
  }
  return data;
}

// Lookup produk via meta_retailer_id (slug dari WA Catalog).
// Dipakai di handleCartOrder — ID ini yang dikirim Meta, bukan nama produk.
export async function getProductByRetailerId(
  tenantId: string,
  retailerId: string
): Promise<Pick<DbProduct, "id" | "name" | "price" | "stock" | "unit"> | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, price, stock, unit")
    .eq("tenant_id", tenantId)
    .eq("meta_retailer_id", retailerId)
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getProductByRetailerId:", error.message);
    return null;
  }
  return data;
}

export async function updateProductPrice(productId: string, price: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .update({ price, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(`[DB] updateProductPrice: ${error.message}`);
}

export async function updateProductStock(productId: string, stock: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .update({ stock, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(`[DB] updateProductStock: ${error.message}`);
}

export async function setProductReorderPoint(productId: string, reorderPoint: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .update({ reorder_point: reorderPoint, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(`[DB] setProductReorderPoint: ${error.message}`);
}

// Covers deactivate_product (isActive=false) DAN activate_product (isActive=true).
export async function setProductActive(productId: string, isActive: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(`[DB] setProductActive: ${error.message}`);
}

// Supabase JS tidak support atomic decrement → fetch + update (acceptable untuk hackathon).
export async function decrementProductStock(productId: string, qty: number): Promise<void> {
  const { data: prod, error: fetchErr } = await supabaseAdmin
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single();

  if (fetchErr) throw new Error(`[DB] decrementProductStock fetch: ${fetchErr.message}`);

  const newStock = Math.max(0, (prod?.stock ?? 0) - qty);
  const { error } = await supabaseAdmin
    .from("products")
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(`[DB] decrementProductStock update: ${error.message}`);
}
