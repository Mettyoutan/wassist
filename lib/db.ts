import { createClient } from "@supabase/supabase-js";
import type { Database, DbProduct, DbTenant } from "./types/db";

// Server-side admin client (full access, pakai service role key)
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: "public" } }
);

// Ambil produk aktif untuk dikirim ke Gemini parser sebagai daftar produk.
// ORDER BY name ASC wajib — Gemini return product_index berdasarkan urutan ini.
// Kalau urutan berubah antar-call → index salah → produk yang dipesan bisa salah.
export async function getActiveProducts(
  tenantId: string
): Promise<Pick<DbProduct, "name" | "price" | "unit">[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("name, price, unit")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) console.error("[DB] getActiveProducts failed:", error.message);
  return data ?? [];
}

// Lookup tenant dari phone_number_id yang ada di setiap webhook WA.
// Setiap pesan masuk → cari tenant mana yang punya nomor itu → route ke handler yang tepat.
export async function getTenantByWaPhoneId(
  waPhoneId: string
): Promise<DbTenant | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("wa_business_phone_id", waPhoneId)
    .eq("status", "ACTIVE")
    .single();

  if (error) console.error("[DB] getTenantByWaPhoneId failed:", error.message);
  return data as DbTenant | null; // Explicit cast karena pakai Omit
}