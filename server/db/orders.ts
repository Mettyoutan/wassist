import { supabaseAdmin } from "./client";
import type { DbOrder, DbOrderItem } from "@/lib/types/db";
import type { PendingOrderItem } from "@/lib/types/session";

// Fetch order terbaru customer — untuk handleStatusIntent.
export async function getLatestOrderByCustomer(
  tenantId: string,
  userId: string
): Promise<DbOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getLatestOrderByCustomer:", error.message);
    return null;
  }
  return data as DbOrder;
}

// INSERT order + order_items dalam satu operasi.
// Tidak ada real transaction di Supabase JS → manual rollback: DELETE order jika items gagal.
export async function createOrder(
  tenantId: string,
  customerId: string,
  items: PendingOrderItem[],
  total: number
): Promise<{ orderId: string }> {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id:        tenantId,
      customer_user_id: customerId,
      total_amount:     total,
      status:           "PENDING",
      payment_status:   "UNPAID",
    })
    .select("id")
    .single();

  if (orderErr) throw new Error(`[DB] createOrder insert: ${orderErr.message}`);

  const orderId = order.id;

  const itemRows = items.map((i) => ({
    order_id:       orderId,
    product_id:     i.product_id,
    qty:            i.qty,
    price_at_order: i.price,
    size:           i.size || null,
    notes:          i.notes || null,
    unit:           i.unit,
  }));

  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemRows);

  if (itemsErr) {
    // Rollback: hapus order agar tidak ada orphan record
    await supabaseAdmin.from("orders").delete().eq("id", orderId);
    throw new Error(`[DB] createOrder items: ${itemsErr.message}`);
  }

  return { orderId };
}

// Set midtrans_id + payment_url setelah Core API charge berhasil.
export async function updateOrderMidtrans(
  orderId: string,
  midtransId: string,
  paymentUrl: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("orders")
    .update({
      midtrans_id:          midtransId,
      midtrans_payment_url: paymentUrl,
      status:               "AWAITING_PAYMENT",
      updated_at:           new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) throw new Error(`[DB] updateOrderMidtrans: ${error.message}`);
}

// Update status + payment_status order — dipanggil dari Midtrans webhook callback.
export async function updateOrderStatus(
  orderId: string,
  status: DbOrder["status"],
  paymentStatus?: DbOrder["payment_status"]
): Promise<void> {
  const patch: { status: string; updated_at: string; payment_status?: string } = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (paymentStatus) patch.payment_status = paymentStatus;

  const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", orderId);
  if (error) throw new Error(`[DB] updateOrderStatus: ${error.message}`);
}

// Fetch semua order_items untuk satu order — dipakai Midtrans callback untuk decrement stok.
export async function getOrderItemsByOrderId(orderId: string): Promise<DbOrderItem[]> {
  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  if (error) console.error("[DB] getOrderItemsByOrderId:", error.message);
  return (data as DbOrderItem[]) ?? [];
}

// Lookup order by midtrans_id — untuk reconcile Midtrans callback.
export async function getOrderByMidtransId(midtransId: string): Promise<DbOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("midtrans_id", midtransId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getOrderByMidtransId:", error.message);
    return null;
  }
  return data as DbOrder;
}
