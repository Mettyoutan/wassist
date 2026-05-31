import { supabaseAdmin } from "./client";
import type { DbTenant } from "@/lib/types/db";

// Entry point webhook — setiap pesan masuk lookup tenant via phone_number_id.
export async function getTenantByWaPhoneId(waPhoneId: string): Promise<DbTenant | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("wa_business_phone_id", waPhoneId)
    .eq("status", "ACTIVE")
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getTenantByWaPhoneId:", error.message);
    return null;
  }
  return data as DbTenant;
}

export async function setStoreStatus(tenantId: string, isOpen: boolean): Promise<void> {
  const update = isOpen
    ? { is_open: true, closed_until: null as string | null }
    : { is_open: false, closed_until: null as string | null };

  const { error } = await supabaseAdmin
    .from("tenants")
    .update(update)
    .eq("id", tenantId);
  if (error) throw new Error(`[DB] setStoreStatus: ${error.message}`);
}
