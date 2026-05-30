export type SessionState =
  | "idle"
  | "awaiting_confirmation"
  | "awaiting_payment";

// Snapshot produk saat customer order.
// Bukan referensi ke DB — harga bisa berubah setelah order dibuat.
export type PendingOrderItem = {
  product_id: string;  // UUID dari DB — untuk INSERT order_items
  name:       string;  // snapshot nama
  qty:        number;  // bisa desimal untuk produk berat/volume (1.5 kg)
  unit:       string;  // snapshot satuan ("pcs", "kg", "L", dll)
  size:       string;  // "" jika tidak ada
  notes:      string;  // "" jika tidak ada
  price:      number;  // snapshot harga per unit (integer Rupiah)
  subtotal:   number;  // price × qty — pre-calculated
};

export type PendingOrder = {
  items: PendingOrderItem[];
  total: number;
};

export type Session = {
  state:             SessionState;
  pending_order?:    PendingOrder;  // hanya saat awaiting_confirmation
  current_order_id?: string;        // UUID order di DB, hanya saat awaiting_payment
  retry_count:       number;        // 0 → minta klarifikasi, 1 → handoff ke owner
  last_updated:      number;        // Date.now() — untuk TTL check
};
