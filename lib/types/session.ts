export type SessionState =
  | "idle"
  | "awaiting_confirmation"
  | "awaiting_address"
  | "awaiting_payment"
  | "awaiting_clarification"
  | "awaiting_owner_confirmation";

export type ClarificationCandidate = {
  product_id: string;
  name:       string;
  price:      number;
  unit:       string;
  stock:      number;
};

// State untuk slot-filling saat customer perlu menjawab satu pertanyaan fokus.
export type PendingClarification = {
  kind:         "variant" | "quantity";
  candidates:   ClarificationCandidate[]; // variant: semua opsi; quantity: array [1 produk]
  qty?:         number;                    // diketahui (kasus variant ambiguitas)
  integer_only: boolean;                   // true jika unit diskret (pcs, dll)
  max_stock?:   number;                    // batas qty karena stok (kasus out-of-stock)
  size:         string;
  notes:        string;
  resolved:     PendingOrderItem[];        // item sudah resolved sebelum klarifikasi ini
  retry_count:  number;                    // jawaban gagal; ≥2 → arahkan katalog
};

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

// Aksi owner yang menunggu konfirmasi "ya/batal" sebelum di-commit ke DB.
export type PendingOwnerAction = {
  action:       "update_price" | "update_stock" | "set_reorder_point" | "deactivate_product" | "activate_product";
  product_id:   string;   // UUID dari DB — target mutasi
  product_name: string;   // untuk display di pesan konfirmasi
  product_unit: string;   // untuk display (harga/stok pakai unit ini)
  new_value?:   number;   // nilai absolut baru (harga atau stok target)
  delta?:       number;   // perubahan relatif stok (±) — mutually exclusive dengan new_value
};

export type Session = {
  state:                   SessionState;
  pending_order?:          PendingOrder;         // hanya saat awaiting_confirmation
  current_order_id?:       string;               // UUID order di DB, hanya saat awaiting_payment
  pending_saved_address?:  string;               // alamat tersimpan — set saat awaiting_address
  pending_owner_action?:   PendingOwnerAction;   // hanya saat awaiting_owner_confirmation
  pending_clarification?:  PendingClarification; // hanya saat awaiting_clarification
  retry_count:             number;               // 0 → minta klarifikasi, 1 → handoff ke owner
  last_updated:            number;               // Date.now() — untuk TTL check
};
