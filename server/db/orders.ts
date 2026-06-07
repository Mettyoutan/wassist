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
  total: number,
  notes?: string
): Promise<{ orderId: string }> {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id:        tenantId,
      customer_user_id: customerId,
      total_amount:     total,
      status:           "PENDING",
      payment_status:   "UNPAID",
      notes:            notes ?? null,
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

// Hard-delete order — rollback saat updateOrderMidtrans gagal setelah createOrder.
export async function deleteOrder(orderId: string): Promise<void> {
  await supabaseAdmin.from("order_items").delete().eq("order_id", orderId);
  const { error } = await supabaseAdmin.from("orders").delete().eq("id", orderId);
  if (error) console.error("[DB] deleteOrder:", error.message);
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

  if (error) throw new Error(`[DB] getOrderItemsByOrderId: ${error.message}`);
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

export type ActiveOrderWithItems = {
  id:           string;
  midtrans_id:  string | null;
  status:       DbOrder["status"];
  total_amount: number;
  created_at:   string;
  items: Array<{
    product_name:   string;
    qty:            number;
    unit:           string;
    price_at_order: number;
  }>;
};

// Fetch order terbaru NON-CANCELLED + items — untuk handleStatusIntent.
export async function getLatestActiveOrderWithItems(
  tenantId: string,
  userId:   string
): Promise<ActiveOrderWithItems | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      id, midtrans_id, status, total_amount, created_at,
      order_items(qty, price_at_order, unit, products(name))
    `)
    .eq("tenant_id", tenantId)
    .eq("customer_user_id", userId)
    .not("status", "eq", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getLatestActiveOrderWithItems:", error.message);
    return null;
  }

  return {
    id:           data.id,
    midtrans_id:  data.midtrans_id ?? null,
    status:       data.status as DbOrder["status"],
    total_amount: data.total_amount,
    created_at:   data.created_at,
    items: ((data as any).order_items ?? []).map((oi: any) => ({
      product_name:   oi.products?.name ?? "",
      qty:            oi.qty,
      unit:           oi.unit,
      price_at_order: oi.price_at_order,
    })),
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export type OrderWithDetails = {
  id: string;
  midtrans_id: string | null;
  status: DbOrder["status"];
  payment_status: DbOrder["payment_status"];
  total_amount: number;
  created_at: string;
  customer_phone: string;
  customer_name: string;
  items: Array<{
    qty: number;
    price_at_order: number;
    unit: string;
    product_name: string;
  }>;
};

// List orders untuk dashboard owner — join customer phone + order items + product names.
// Opsi A auth: caller menyediakan tenantId dari DEMO_TENANT_ID.
export async function getOrdersByTenant(
  tenantId: string,
  statusFilter?: DbOrder["status"][]
): Promise<OrderWithDetails[]> {
  let query = supabaseAdmin
    .from("orders")
    .select(`
      id, midtrans_id, status, payment_status, total_amount, created_at,
      users!orders_customer_user_id_fkey(phone, name),
      order_items(qty, price_at_order, unit, products(name))
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[DB] getOrdersByTenant:", error.message);
    return [];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id:             row.id,
    midtrans_id:    row.midtrans_id ?? null,
    status:         row.status as DbOrder["status"],
    payment_status: row.payment_status as DbOrder["payment_status"],
    total_amount:   row.total_amount,
    created_at:     row.created_at,
    customer_phone: row.users?.phone ?? "",
    customer_name:  row.users?.name ?? "",
    items: ((row.order_items ?? []) as any[]).map((oi: any) => ({
      qty:            oi.qty,
      price_at_order: oi.price_at_order,
      unit:           oi.unit,
      product_name:   oi.products?.name ?? "",
    })),
  }));
}

export type LastOrderItem = {
  product_id:   string;
  product_name: string;
  qty:          number;
  unit:         string;
  size:         string | null;
  notes:        string | null;
};

// Fetch order terbaru dengan status tertentu — dipakai owner mark_fulfilled/mark_done.
export async function getLatestOrderByStatus(
  tenantId: string,
  status:   DbOrder["status"]
): Promise<DbOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getLatestOrderByStatus:", error.message);
    return null;
  }
  return data as DbOrder;
}

export async function getLastCompletedOrderWithItems(
  tenantId: string,
  userId:   string
): Promise<{ orderId: string; items: LastOrderItem[] } | null> {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_user_id", userId)
    .eq("payment_status", "PAID")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (orderErr || !order) return null;

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from("order_items")
    .select("product_id, qty, unit, size, notes, products(name)")
    .eq("order_id", order.id);

  if (itemsErr || !items) return null;

  return {
    orderId: order.id,
    items: (items as any[]).map((i) => ({
      product_id:   i.product_id,
      product_name: i.products?.name ?? "",
      qty:          i.qty,
      unit:         i.unit,
      size:         i.size ?? null,
      notes:        i.notes ?? null,
    })),
  };
}

export async function getOrderById(orderId: string): Promise<DbOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[DB] getOrderById:", error.message);
    return null;
  }
  return data as DbOrder;
}
