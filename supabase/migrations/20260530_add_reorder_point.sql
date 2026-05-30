-- Add reorder_point column to products.
-- Threshold per-product untuk trigger lowStock alert ke owner.
-- Unit-aware: owner set sendiri per produk sesuai unitnya (5 pcs kaos vs 2 kg daging).
-- DEFAULT 5 = titik aman untuk produk fashion (pcs). Override via dashboard produk.

ALTER TABLE products
  ADD COLUMN reorder_point NUMERIC(10,3) NOT NULL DEFAULT 5;

-- Index tidak dibutuhkan untuk reorder_point — query lowStock hanya jalan
-- saat owner command, bukan di hot path webhook (tidak setiap pesan).
