# WAssist — Database Design
> Stack: PostgreSQL via Supabase

---

## Entity Relationship (Singkat)

```
tenants ──< users           (1 tenant punya banyak user: owner + customer)
tenants ──< products        (1 tenant punya banyak produk)
tenants ──< orders          (1 tenant punya banyak order)
orders  ──< order_items     (1 order punya banyak item)
order_items >── products    (item referensi ke produk)
orders  >── users           (order milik 1 customer)
tenants ──< wa_sessions     (1 tenant punya session per customer)
tenants ──< ai_conversations(audit log LLM calls)
```

---

## Schema Lengkap

### Tabel `tenants`
Setiap UMKM = 1 tenant. Ini root dari semua data.

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- "Olshop Kak Nina"
  owner_phone TEXT NOT NULL UNIQUE,      -- "6281234567890" — detect owner di webhook
  wa_business_phone_id TEXT,             -- Phone Number ID dari Meta dashboard
  category TEXT NOT NULL DEFAULT 'toko online',
                                         -- "fashion & pakaian", "makanan & minuman", dll
                                         -- dipakai sebagai context di LLM prompt
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  is_open BOOLEAN NOT NULL DEFAULT true, -- buka/tutup toko via owner command
  closed_until TIMESTAMPTZ,              -- NULL = buka terus / ada value = tutup sampai jam ini
  meta_catalog_id TEXT,                  -- Catalog ID di Commerce Manager. NULL = belum setup WA Catalog
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Kolom penting:**
- `owner_phone` — dipakai webhook untuk deteksi apakah pengirim adalah owner
- `wa_business_phone_id` — dipakai untuk route pesan ke tenant yang benar
- `is_open` + `closed_until` — dikontrol via owner command "tutup sampai jam 5"

---

### Tabel `users`
Owner dan customer dipisah per tenant. Customer tidak perlu daftar — otomatis di-upsert saat pertama kali kirim pesan.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,                   -- "6281234567890"
  name TEXT,                             -- bisa null untuk customer baru
  role TEXT NOT NULL CHECK (role IN ('owner', 'customer')),
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)               -- 1 nomor = 1 user per tenant
);
```

---

### Tabel `products`
Katalog produk per tenant.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Kaos Oversize Polos"
  description TEXT,
  price INTEGER NOT NULL,                -- dalam Rupiah (bukan float, hindari floating point)
  stock NUMERIC(10,3) NOT NULL DEFAULT 0, -- NUMERIC bukan INTEGER: mendukung berat/volume (2.5 kg, 0.5 L)
                                          -- Fashion → selalu integer (2.000). Backward compatible.
  unit TEXT NOT NULL DEFAULT 'pcs',      -- satuan produk: "pcs", "kg", "g", "L", "ml", "porsi", "loaf", dll
                                          -- dipakai untuk: (1) display konfirmasi, (2) context LLM prompt
  category TEXT,                         -- "atasan" | "bawahan" | "outer" | "aksesoris"
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,                        -- URL foto produk (untuk WA Catalog)
  meta_retailer_id TEXT,                 -- slug untuk WA Catalog, ex: "kaos-oversize-polos"
                                         -- NULL = produk belum di-sync ke Meta Catalog
                                         -- IMMUTABLE setelah di-set — ID permanen di Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, meta_retailer_id)    -- 1 retailer_id unik per tenant
);
```

**Catatan:** Harga disimpan sebagai `INTEGER` (Rupiah bulat), bukan DECIMAL/FLOAT. Ini menghindari masalah floating-point precision untuk kalkulasi total order.

**`meta_retailer_id`:** Slug yang menghubungkan DB product ke Meta Catalog. Diisi saat produk pertama kali dibuat, tidak boleh berubah setelahnya karena Meta menyimpan ID ini di sisi mereka. Format: kebab-case dari nama produk (lihat `toRetailerId()` di `lib/utils.ts`).

---

### Tabel `orders`
Order dengan state machine. Status bergerak maju, tidak mundur (kecuali CANCELLED).

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING',          -- baru dibuat, belum dikonfirmasi customer
      'CONFIRMED',        -- customer konfirmasi, siap bayar
      'AWAITING_PAYMENT', -- link QRIS sudah dikirim, menunggu bayar
      'PAID',             -- Midtrans callback settlement diterima
      'FULFILLED',        -- owner sedang proses/kirim
      'DONE',             -- selesai
      'CANCELLED'         -- dibatalkan
    )),
  total_amount INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'QRIS',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PAID', 'REFUNDED', 'FAILED')),
  midtrans_id TEXT,                      -- order_id dari Midtrans untuk reconcile
  midtrans_payment_url TEXT,             -- link QRIS yang dikirim ke customer
  notes TEXT,                            -- catatan dari customer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**State Machine Order:**
```
PENDING → CONFIRMED → AWAITING_PAYMENT → PAID → FULFILLED → DONE
                                                           ↗
CANCELLED ← (dari PENDING atau CONFIRMED saja)
```

Aturan:
- Setelah PAID → tidak bisa di-cancel via bot, harus human handoff
- FULFILLED = owner sudah proses/kirim, menunggu konfirmasi selesai
- DONE = final state, tidak berubah lagi

---

### Tabel `order_items`
Detail item per order. Harga disimpan sebagai snapshot saat order dibuat (bukan referensi harga produk saat ini).

```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),  -- NUMERIC: mendukung 2.5 kg, 0.5 L, dll
  price_at_order INTEGER NOT NULL,   -- SNAPSHOT harga saat order dibuat
  size TEXT,                         -- "S", "M", "L", "XL", "XXL" — NULL jika tidak relevan
  notes TEXT,                        -- catatan lain: "warna hitam", "tanpa pedas"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Kenapa `price_at_order`?** Kalau harga produk berubah setelah order dibuat, total order tidak boleh berubah. Snapshot harga = audit trail yang benar.

---

### Tabel `wa_sessions`
State percakapan per nomor customer per tenant. BUKAN log history — ini current state.

```sql
CREATE TABLE wa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'idle',
  -- State: idle → browsing → ordering → awaiting_confirmation → awaiting_payment → done
  context_json JSONB NOT NULL DEFAULT '{}',
  -- Berisi: pending_order, current_order_id, last_intent, retry_count
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone, tenant_id)  -- 1 nomor = 1 session aktif per tenant
);
```

**Kenapa UNIQUE(phone, tenant_id)?** Session adalah current-state store. Satu customer hanya bisa berada di satu state percakapan pada satu waktu. Pattern yang digunakan: UPSERT (bukan INSERT baru), sehingga selalu tepat 1 baris per customer.

**Catatan implementasi MVP:** Untuk hackathon, session disimpan di in-memory Map di `lib/session.ts`, bukan ke tabel ini. Tabel ini ada untuk production nanti. Set `--max-instances=1` di Cloud Run agar in-memory konsisten.

---

### Tabel `ai_conversations`
Audit log setiap LLM call. Append-only (tidak ada UNIQUE constraint — setiap percakapan = baris baru).

```sql
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  messages_json JSONB NOT NULL DEFAULT '[]',  -- history percakapan
  intent TEXT,                                -- hasil klasifikasi
  model_used TEXT,                            -- "gemini-1.5-flash"
  confidence FLOAT,                           -- skor confidence
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Query Patterns yang Sering Dipakai

### 1. KPI Dashboard — Omzet Hari Ini
```sql
SELECT
  COUNT(*) as order_count,
  COALESCE(SUM(total_amount), 0) as revenue,
  COALESCE(AVG(total_amount), 0) as aov
FROM orders
WHERE
  tenant_id = $1
  AND payment_status = 'PAID'
  AND created_at >= CURRENT_DATE  -- mulai dari 00:00 hari ini
  AND created_at < CURRENT_DATE + INTERVAL '1 day';
```

### 2. Top Produk Hari Ini
```sql
SELECT
  p.name,
  p.unit,                      -- wajib: dipakai untuk display "15 pcs" atau "25 kg", bukan "15x"
  SUM(oi.qty) as total_terjual -- SUM NUMERIC — total volume terjual, bukan count order
FROM order_items oi
JOIN products p ON p.id = oi.product_id
JOIN orders o ON o.id = oi.order_id
WHERE
  o.tenant_id = $1
  AND o.payment_status = 'PAID'
  AND o.created_at >= CURRENT_DATE
GROUP BY p.id, p.name, p.unit   -- sertakan p.unit di GROUP BY karena ada di SELECT
ORDER BY total_terjual DESC
LIMIT 5;
```
-- Contoh hasil:
-- name: "Kaos Oversize Polos", unit: "pcs", total_terjual: 15
-- name: "Daging Sapi",          unit: "kg",  total_terjual: 25.5

### 3. Lookup Produk by meta_retailer_id (untuk cart order dari WA Catalog)
```sql
-- Dipakai saat WAOrderMessage masuk — mapping retailer_id ke product DB
SELECT id, name, price, stock, meta_retailer_id
FROM products
WHERE
  tenant_id = $1
  AND meta_retailer_id = $2   -- exact match, bukan fuzzy
  AND is_active = true
LIMIT 1;
```

> Ini menggantikan fuzzy match. Parser sekarang pakai `product_index` bukan `product_name`,
> jadi fuzzy match tidak lagi dibutuhkan untuk text-based order.
> Satu-satunya case yang butuh lookup by identifier adalah cart order dari WA Catalog.

### 4. Upsert Session (in-memory di MVP, tapi pattern ini untuk production)
```sql
INSERT INTO wa_sessions (phone, tenant_id, state, context_json, expires_at)
VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')
ON CONFLICT (phone, tenant_id)
DO UPDATE SET
  state = EXCLUDED.state,
  context_json = EXCLUDED.context_json,
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW();
```

### 5. Orders untuk Order List Dashboard
```sql
SELECT
  o.id, o.status, o.payment_status, o.total_amount,
  o.created_at, o.notes,
  u.phone as customer_phone,
  u.name as customer_name
FROM orders o
JOIN users u ON u.id = o.customer_user_id
WHERE o.tenant_id = $1
ORDER BY o.created_at DESC
LIMIT 50;
-- Tambah: AND o.status = $2  untuk filter per status
```

### 6. Upsert Customer (auto-create saat pertama chat)
```sql
INSERT INTO users (tenant_id, phone, name, role)
VALUES ($1, $2, $3, 'customer')
ON CONFLICT (tenant_id, phone)
DO UPDATE SET last_seen = NOW()
RETURNING *;
```

---

## Indexes Penting

```sql
-- Query dashboard: filter by tenant + status sering
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);

-- Query KPI: filter by tenant + waktu
CREATE INDEX idx_orders_tenant_created ON orders(tenant_id, created_at DESC);

-- Query order items
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- Cari produk aktif
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);

-- Lookup user by phone
CREATE INDEX idx_users_tenant_phone ON users(tenant_id, phone);

-- Session lookup (sangat sering — setiap pesan masuk)
CREATE INDEX idx_wa_sessions_phone_tenant ON wa_sessions(phone, tenant_id);
```

---

## Data Seed Demo (Olshop Kak Nina)

Lihat query lengkap di `docs/2026-05-28-day1-implementation.md` Part 2.4.

Summary:
- **Tenant:** Olshop Kak Nina (`id: 00000000-0000-0000-0000-000000000001`)
- **15 produk:** 5 atasan, 4 bawahan, 3 outer, 3 aksesoris
- **1 owner user:** nomor owner (update setelah SIM aktif)

---

## TypeScript Types untuk DB Rows (`lib/types/db.ts`)

```typescript
// lib/types/db.ts
// Row types yang merepresentasikan baris dari DB.
// Cocok dengan schema SQL di atas — update jika schema berubah.

export type DbTenant = {
  id: string;
  name: string;
  owner_phone: string;
  wa_business_phone_id: string | null;
  category: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "inactive" | "suspended";
  is_open: boolean;
  closed_until: string | null;     // ISO 8601
  meta_catalog_id: string | null;
  created_at: string;
};

export type DbProduct = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;                   // integer Rupiah
  stock: number;                   // NUMERIC(10,3) di DB → number di TypeScript
  unit: string;                    // "pcs" (default), "kg", "g", "L", "ml", "porsi", dll
  category: string | null;
  is_active: boolean;
  image_url: string | null;
  meta_retailer_id: string | null; // slug, null = belum di-sync ke catalog
  created_at: string;
  updated_at: string;
};

export type DbOrder = {
  id: string;
  tenant_id: string;
  customer_user_id: string;
  status: "PENDING" | "CONFIRMED" | "AWAITING_PAYMENT" | "PAID" | "FULFILLED" | "DONE" | "CANCELLED";
  total_amount: number;
  payment_method: string;
  payment_status: "UNPAID" | "PAID" | "REFUNDED" | "FAILED";
  midtrans_id: string | null;
  midtrans_payment_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DbOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  qty: number;              // NUMERIC(10,3) di DB → number di TypeScript (bisa desimal)
  price_at_order: number;   // snapshot harga saat order — JANGAN pakai product.price
  size: string | null;
  notes: string | null;
  created_at: string;
};

export type DbUser = {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  role: "owner" | "customer";
  last_seen: string;
  created_at: string;
};
```

---

## Koneksi ke Supabase dari Kode

```typescript
// lib/db.ts
import { createClient } from "@supabase/supabase-js";

// Server-side (full access, JANGAN expose ke browser)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // ← service role key
);
```

**Aturan penting:**
- `SUPABASE_SERVICE_ROLE_KEY` → hanya di server (API routes, Server Components). Jangan pernah di client-side component.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → boleh di client, tapi terbatas RLS.
- Untuk semua operasi webhook dan API routes → pakai `supabaseAdmin`.
