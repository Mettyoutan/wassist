import { supabaseAdmin } from "./client";

// Upsert customer dan return user.id.
// Dipanggil di setiap pesan masuk customer — aman dipanggil berulang.
export async function upsertCustomer(tenantId: string, phone: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .upsert(
      { tenant_id: tenantId, phone, name: phone, role: "CUSTOMER" },
      { onConflict: "tenant_id,phone" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`[DB] upsertCustomer: ${error.message}`);
  return data.id;
}

// Lookup user ID tanpa upsert — untuk handleStatusIntent yang tidak boleh create user baru.
export async function getUserIdByPhone(tenantId: string, phone: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getUserIdByPhone:", error.message);
    return null;
  }
  return data.id;
}

// Lookup user phone dari UUID — untuk Midtrans callback notifikasi customer.
export async function getUserById(userId: string): Promise<{ phone: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("phone")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getUserById:", error.message);
    return null;
  }
  return data;
}

// Lookup user id + last_address — untuk alamat tersimpan di awaiting_address handler.
export async function getUserWithAddress(
  tenantId: string,
  phone: string
): Promise<{ id: string; last_address: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, last_address")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getUserWithAddress:", error.message);
    return null;
  }
  return data as { id: string; last_address: string | null };
}

export async function updateUserLastAddress(
  userId: string,
  address: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ last_address: address })
    .eq("id", userId);

  if (error) console.error("[DB] updateUserLastAddress:", error.message);
}
