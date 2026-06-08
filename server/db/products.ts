import { meta } from "zod/v4/core";
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

// Ambil meta_retailer_id produk pertama (untuk WA Catalog thumbnail_product_retailer_id).
export async function getFirstProductRetailerId(
  tenantId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("meta_retailer_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("meta_retailer_id", "is", null)
    .order("name", { ascending: true })
    .limit(1)
    .single();

  if (error) return null;
  return data?.meta_retailer_id ?? null;
}

// Untuk tampilan browse dengan category grouping — BUKAN untuk Gemini prompt (gunakan getActiveProducts).
export async function getActiveProductsRich(
  tenantId: string
): Promise<Pick<DbProduct, "name" | "price" | "unit" | "category" | "description">[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("name, price, unit, category, description")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) console.error("[DB] getActiveProductsRich:", error.message);
  return data ?? [];
}

// Ambil detail lengkap produk untuk product_detail intent (gambar, deskripsi, stok).
export async function getProductDetailByName(
  tenantId: string,
  name: string
): Promise<Pick<DbProduct, "id" | "name" | "price" | "stock" | "unit" | "description" | "image_url"> | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, price, stock, unit, description, image_url")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getProductDetailByName:", error.message);
    return null;
  }
  return data;
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

// Fetch produk untuk dashboard — includes stock, reorder_point, image_url.
// BERBEDA dari getActiveProducts yang hanya return name/price/unit untuk Gemini prompt.
export async function getProductsForDashboard(
  tenantId: string
): Promise<Pick<DbProduct, "id" | "name" | "description" | "category" | "price" | "unit" | "stock" | "reorder_point" | "image_url">[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, description, category, price, unit, stock, reorder_point, image_url")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) console.error("[DB] getProductsForDashboard:", error.message);
  return (data ?? []) as Pick<DbProduct, "id" | "name" | "description" | "category" | "price" | "unit" | "stock" | "reorder_point" | "image_url">[];
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

// Fetch ALL products (active + inactive) — dipakai owner handler agar activate_product
// bisa melihat produk yang sedang nonaktif.
export async function getProductsByTenantAll(
  tenantId: string
): Promise<Pick<DbProduct, "id" | "name" | "description" | "category" | "price" | "unit" | "stock" | "reorder_point" | "is_active">[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, description, category, price, unit, stock, reorder_point, is_active")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) console.error("[DB] getProductsByTenantAll:", error.message);
  return (data ?? []) as Pick<DbProduct, "id" | "name" | "description" | "category" | "price" | "unit" | "stock" | "reorder_point" | "is_active">[];
}

export async function createProduct(
  tenantId: string,
  name: string,
  price: number,
  stock: number,
  unit: string,
  reorderPoint: number,
  imageUrl?: string,
  category?: string,
  description?: string,
  metaRetailerId?: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .insert({
      tenant_id: tenantId,
      name,
      price,
      stock,
      unit,
      reorder_point: reorderPoint,
      image_url: imageUrl || null,
      category: category || null,
      description: description || null,
      meta_retailer_id: metaRetailerId || null,
      is_active: true
    })
    .select("id")
    .single();

  if (error) {
    console.error("[DB] createProduct error:", error.message);
    return null;
  }

  // Set meta_retailer_id = product UUID so WA Catalog integration works without extra config.
  const { error: updateErr } = await supabaseAdmin
    .from("products")
    .update({ meta_retailer_id: data.id })
    .eq("id", data.id);
  if (updateErr) console.error("[DB] createProduct meta_retailer_id:", updateErr.message);

  return data;
}

export async function getProductById(
  productId: string
): Promise<Pick<DbProduct, "id" | "name" | "description" | "price" | "stock" | "unit" | "category" | "reorder_point" | "image_url" | "is_active"> | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, description, price, stock, unit, category, reorder_point, image_url, is_active")
    .eq("id", productId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getProductById:", error.message);
    return null;
  }
  return data as Pick<DbProduct, "id" | "name" | "description" | "price" | "stock" | "unit" | "category" | "reorder_point" | "image_url" | "is_active">;
}

export async function updateProduct(
  productId: string,
  updates: {
    name?: string;
    price?: number;
    stock?: number;
    unit?: string;
    reorder_point?: number;
    image_url?: string;
    category?: string;
    description?: string;
    meta_retailer_id?: string;
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq("id", productId);

    console.log("Updated data:", updates); // ← cek hasilnya
    console.log("Error:", error);

  if (error) throw new Error(`[DB] updateProduct: ${error.message}`);
}

export async function deleteProduct(productId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) throw new Error(`[DB] deleteProduct: ${error.message}`);
}

export type ProductStockStatus = {
  id:            string;
  name:          string;
  stock:         number;
  unit:          string;
  reorder_point: number;
};

export async function getProductsStockStatus(
  productIds: string[]
): Promise<ProductStockStatus[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, stock, unit, reorder_point")
    .in("id", productIds);

  if (error) {
    console.error("[DB] getProductsStockStatus:", error.message);
    return [];
  }
  return (data ?? []) as ProductStockStatus[];
}
