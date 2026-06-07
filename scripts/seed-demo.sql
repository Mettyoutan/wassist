-- ================================================================
-- WAssist Demo Seed — Olshop Mbak Rina
-- ================================================================
-- PRASYARAT: Jalankan delete-demo.sql dulu sebelum script ini.
-- Jalankan di: Supabase Dashboard > SQL Editor
--
-- Hasil yang diharapkan setelah seed:
--   Dashboard KPI hari ini  : Rp1.065.000 | 4 order PAID | AOV Rp266.250
--   Tab Pesanan "pending"   : 2 order (AWAITING_PAYMENT + PENDING)
--   Tab Pesanan "diproses"  : 2 order (PAID + FULFILLED)
--   Tab Pesanan "selesai"   : 2 order DONE hari ini
--   Stok menipis (alert)    : Tunik Batik (8/10), Rok Mini Denim (6/10), Cardigan Rajut (4/8)
--   Analytics kemarin       : Rp445.000
--   Analytics 2 hari lalu   : Rp475.000
-- ================================================================

DO $$
DECLARE
  -- Tenant ID tetap — harus sama dengan DEMO_TENANT_ID di .env.local
  v_tenant   uuid := '3b0a38de-811c-40b5-af83-c866e198da12';

  -- Products (di-capture dari RETURNING id)
  v_kaos_oversize    uuid;
  v_blouse_floral    uuid;
  v_kemeja_linen     uuid;
  v_crop_top         uuid;
  v_tunik_batik      uuid;
  v_rok_midi         uuid;
  v_celana_palazzo   uuid;
  v_rok_mini_denim   uuid;
  v_celana_kulot     uuid;
  v_cardigan_rajut   uuid;
  v_jaket_denim      uuid;
  v_blazer_casual    uuid;
  v_outer_korean     uuid;
  v_tas_tote         uuid;
  v_kalung_rantai    uuid;
  v_scrunchie_set    uuid;

  -- Users
  v_owner            uuid;
  v_siti             uuid;
  v_dewi             uuid;
  v_rina             uuid;
  v_ahmad            uuid;

  -- Orders
  v_order1           uuid;
  v_order2           uuid;
  v_order3           uuid;
  v_order4           uuid;
  v_order5           uuid;
  v_order6           uuid;
  v_order7           uuid;
  v_order8           uuid;
  v_order9           uuid;
  v_order10          uuid;

BEGIN

-- ================================================================
-- 1. TENANT (id eksplisit — harus match DEMO_TENANT_ID di .env.local)
-- ================================================================
INSERT INTO tenants (
  id, name, owner_phone, wa_business_phone_id, category,
  plan, status, is_open
) VALUES (
  v_tenant,
  'Olshop Mbak Rina',
  '6287715781238',        -- owner: Mbak Rina personal phone (verified ✅)
  '1130913063438393',
  'fashion & pakaian',
  'TRIAL',
  'ACTIVE',
  true
);


-- ================================================================
-- 2. USERS (id di-generate DB via DEFAULT gen_random_uuid())
-- ================================================================
INSERT INTO users (tenant_id, phone, name, role, last_seen)
VALUES (v_tenant, '6287715781238', 'Mbak Rina', 'OWNER', NOW())
RETURNING id INTO v_owner;

INSERT INTO users (tenant_id, phone, name, role, last_seen)
VALUES (v_tenant, '6281234567801', 'Siti Rahayu', 'CUSTOMER', NOW())
RETURNING id INTO v_siti;

INSERT INTO users (tenant_id, phone, name, role, last_seen)
VALUES (v_tenant, '6282345678902', 'Dewi Anggraini', 'CUSTOMER', NOW() - INTERVAL '2 hours')
RETURNING id INTO v_dewi;

INSERT INTO users (tenant_id, phone, name, role, last_seen)
VALUES (v_tenant, '6283456789003', 'Rina Kartika', 'CUSTOMER', NOW() - INTERVAL '3 hours')
RETURNING id INTO v_rina;

INSERT INTO users (tenant_id, phone, name, role, last_seen)
VALUES (v_tenant, '6289876543204', 'Ahmad Fauzi', 'CUSTOMER', NOW() - INTERVAL '1 day')
RETURNING id INTO v_ahmad;


-- ================================================================
-- 3. PRODUCTS (id di-generate DB via DEFAULT gen_random_uuid())
--    meta_retailer_id di-set bulk di akhir = product UUID
-- LOW STOCK (stock <= reorder_point):
--   Tunik Batik Modern    : 8 / 10
--   Rok Mini Denim        : 6 / 10
--   Cardigan Rajut Pastel : 4 /  8
-- ================================================================

-- ATASAN
INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Kaos Oversize Polos', 'atasan', 85000, 45, 'pcs', 10, true)
RETURNING id INTO v_kaos_oversize;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Blouse Floral Lengan Panjang', 'atasan', 120000, 28, 'pcs', 10, true)
RETURNING id INTO v_blouse_floral;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Kemeja Linen Wanita', 'atasan', 145000, 15, 'pcs', 8, true)
RETURNING id INTO v_kemeja_linen;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Crop Top Ribbed', 'atasan', 75000, 32, 'pcs', 10, true)
RETURNING id INTO v_crop_top;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Tunik Batik Modern', 'atasan', 165000, 8, 'pcs', 10, true)
RETURNING id INTO v_tunik_batik;

-- BAWAHAN
INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Rok Midi Plisket', 'bawahan', 110000, 22, 'pcs', 8, true)
RETURNING id INTO v_rok_midi;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Celana Palazzo', 'bawahan', 130000, 19, 'pcs', 8, true)
RETURNING id INTO v_celana_palazzo;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Rok Mini Denim', 'bawahan', 95000, 6, 'pcs', 10, true)
RETURNING id INTO v_rok_mini_denim;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Celana Kulot Polos', 'bawahan', 105000, 35, 'pcs', 10, true)
RETURNING id INTO v_celana_kulot;

-- OUTER
INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Cardigan Rajut Pastel', 'outer', 175000, 4, 'pcs', 8, true)
RETURNING id INTO v_cardigan_rajut;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Jaket Denim Basic', 'outer', 215000, 18, 'pcs', 5, true)
RETURNING id INTO v_jaket_denim;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Blazer Casual Wanita', 'outer', 195000, 12, 'pcs', 5, true)
RETURNING id INTO v_blazer_casual;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Outer Polos Korean Style', 'outer', 155000, 23, 'pcs', 8, true)
RETURNING id INTO v_outer_korean;

-- AKSESORIS
INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Tas Tote Kanvas', 'aksesoris', 85000, 40, 'pcs', 15, true)
RETURNING id INTO v_tas_tote;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Kalung Rantai Minimalis', 'aksesoris', 55000, 65, 'pcs', 20, true)
RETURNING id INTO v_kalung_rantai;

INSERT INTO products (tenant_id, name, category, price, stock, unit, reorder_point, is_active)
VALUES (v_tenant, 'Scrunchie Set Satin (isi 3)', 'aksesoris', 35000, 88, 'pcs', 30, true)
RETURNING id INTO v_scrunchie_set;

-- meta_retailer_id = product UUID — dipakai WA Catalog integration (lookup via getProductByRetailerId)
UPDATE products SET meta_retailer_id = id::text WHERE tenant_id = v_tenant;


-- ================================================================
-- 4. ORDERS + ORDER ITEMS (id di-generate DB via DEFAULT gen_random_uuid())
--
-- Revenue hari ini (payment_status = 'PAID'):
--   Order 1 DONE  : Kaos Oversize 2L + Rok Midi 1M   = Rp280.000
--   Order 2 DONE  : Cardigan Rajut 1S + Tas Tote 1   = Rp260.000
--   Order 3 PAID  : Kemeja Linen 1M + Blouse 1M      = Rp265.000
--   Order 4 FULF  : Celana Palazzo 2L                 = Rp260.000
--   TOTAL                                              = Rp1.065.000
-- ================================================================

-- ── HARI INI ──────────────────────────────────────────────────────────────

-- Order 1: Siti → DONE / PAID (Rp280.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_siti, 'DONE', 280000, 'QRIS', 'PAID', 'WA-DEMO0001-a1b2', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours')
RETURNING id INTO v_order1;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order1, v_kaos_oversize, 2, 85000,  'pcs', 'L'),
  (v_order1, v_rok_midi,      1, 110000, 'pcs', 'M');

-- Order 2: Dewi → DONE / PAID (Rp260.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_dewi, 'DONE', 260000, 'QRIS', 'PAID', 'WA-DEMO0002-b3c4', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours')
RETURNING id INTO v_order2;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order2, v_cardigan_rajut, 1, 175000, 'pcs', 'S'),
  (v_order2, v_tas_tote,       1,  85000, 'pcs', NULL);

-- Order 3: Rina → PAID / PAID (tab diproses, Rp265.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_rina, 'PAID', 265000, 'QRIS', 'PAID', 'WA-DEMO0003-c5d6', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours')
RETURNING id INTO v_order3;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order3, v_kemeja_linen,  1, 145000, 'pcs', 'M'),
  (v_order3, v_blouse_floral, 1, 120000, 'pcs', 'M');

-- Order 4: Ahmad → FULFILLED / PAID (tab diproses, Rp260.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, notes, created_at, updated_at)
VALUES (v_tenant, v_ahmad, 'FULFILLED', 260000, 'QRIS', 'PAID', 'WA-DEMO0004-e7f8', 'tolong dibungkus rapi ya kak', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
RETURNING id INTO v_order4;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order4, v_celana_palazzo, 2, 130000, 'pcs', 'L');

-- Order 5: Siti → AWAITING_PAYMENT / UNPAID (tab pending)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_siti, 'AWAITING_PAYMENT', 155000, 'QRIS', 'UNPAID', 'WA-DEMO0005-g9h0', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '55 minutes')
RETURNING id INTO v_order5;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order5, v_outer_korean, 1, 155000, 'pcs', 'M');

-- Order 6: Dewi → PENDING / UNPAID (tab pending)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, created_at, updated_at)
VALUES (v_tenant, v_dewi, 'PENDING', 150000, 'QRIS', 'UNPAID', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes')
RETURNING id INTO v_order6;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order6, v_crop_top, 2, 75000, 'pcs', 'S');


-- ── KEMARIN ───────────────────────────────────────────────────────────────

-- Order 7: Ahmad → DONE / PAID (Rp195.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_ahmad, 'DONE', 195000, 'QRIS', 'PAID', 'WA-DEMO0007-i1j2', NOW() - INTERVAL '1 day 6 hours', NOW() - INTERVAL '1 day 5 hours')
RETURNING id INTO v_order7;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order7, v_blazer_casual, 1, 195000, 'pcs', 'M');

-- Order 8: Rina → DONE / PAID (Rp250.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_rina, 'DONE', 250000, 'QRIS', 'PAID', 'WA-DEMO0008-k3l4', NOW() - INTERVAL '1 day 3 hours', NOW() - INTERVAL '1 day 2 hours')
RETURNING id INTO v_order8;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order8, v_jaket_denim,   1, 215000, 'pcs', 'L'),
  (v_order8, v_scrunchie_set, 1,  35000, 'pcs', NULL);


-- ── 2 HARI LALU ───────────────────────────────────────────────────────────

-- Order 9: Siti → DONE / PAID (Rp275.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_siti, 'DONE', 275000, 'QRIS', 'PAID', 'WA-DEMO0009-m5n6', NOW() - INTERVAL '2 days 4 hours', NOW() - INTERVAL '2 days 3 hours')
RETURNING id INTO v_order9;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order9, v_tunik_batik,   1, 165000, 'pcs', 'XL'),
  (v_order9, v_kalung_rantai, 2,  55000, 'pcs', NULL);

-- Order 10: Dewi → DONE / PAID (Rp200.000)
INSERT INTO orders (tenant_id, customer_user_id, status, total_amount, payment_method, payment_status, midtrans_id, created_at, updated_at)
VALUES (v_tenant, v_dewi, 'DONE', 200000, 'QRIS', 'PAID', 'WA-DEMO0010-o7p8', NOW() - INTERVAL '2 days 2 hours', NOW() - INTERVAL '2 days 1 hour')
RETURNING id INTO v_order10;
INSERT INTO order_items (order_id, product_id, qty, price_at_order, unit, size) VALUES
  (v_order10, v_rok_mini_denim, 1,  95000, 'pcs', 'S'),
  (v_order10, v_celana_kulot,   1, 105000, 'pcs', 'M');


END $$;

-- ================================================================
-- VERIFIKASI (jalankan terpisah setelah seed selesai):
-- ================================================================
-- SELECT COUNT(*) FROM products  WHERE tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12'; -- 16
-- SELECT COUNT(*) FROM users     WHERE tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12'; -- 5
-- SELECT COUNT(*) FROM orders    WHERE tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12'; -- 10
-- SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
--   WHERE o.tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12';                            -- 19
-- SELECT name, stock, reorder_point FROM products
--   WHERE tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12' AND stock <= reorder_point;   -- 3 rows
-- SELECT SUM(total_amount) FROM orders
--   WHERE tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12'
--     AND payment_status = 'PAID'
--     AND created_at >= CURRENT_DATE;                                                        -- 1065000
-- SELECT id, name, meta_retailer_id FROM products
--   WHERE tenant_id = '3b0a38de-811c-40b5-af83-c866e198da12'
--   ORDER BY name;                                                                           -- 16 rows, meta_retailer_id = id
