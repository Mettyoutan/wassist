# WAssist — Dashboard Web (Owner)
> Untuk implementasi kode UI, lihat: `docs/2026-05-28-regina-dashboard-guide.md`

---

## Filosofi Dashboard

```
WA = Cockpit      → quick actions < 10 detik: omzet, stok, buka/tutup, notif
Dashboard = Control Room → deep analytics: chart 7 hari, order history, kelola produk
```

Dashboard hanya untuk owner, bukan customer. Akses via **magic link** yang dikirim bot ke WA owner.

---

## Halaman yang Dibangun (MVP)

| Halaman | Route | Prioritas | Siapa |
|---|---|---|---|
| Beranda / KPI | `/dashboard` | ✅ Wajib | Regina |
| Order List | `/dashboard/orders` | ✅ Wajib | Regina |
| Order Detail | `/dashboard/orders/[id]` | ✅ Wajib | Regina |
| Analitik Bisnis | `/dashboard/analytics` | ✅ Wajib | Regina |
| Kelola Menu | `/dashboard/products` | Medium | Regina |
| Human Handoff Queue | dari Beranda | ✅ Wajib | Regina |

---

## Halaman 1 — Beranda / KPI

Yang ditampilkan (sesuai desain Figma):
- **4 KPI Cards:** Total Omzet hari ini, Total Order, Order Pending, Rata-rata Order (AOV)
- **Alert:** jika ada order pending, tampilkan notifikasi kuning
- **Quick Links:** ke Order List dan Analitik

Data diambil dari: `GET /api/dashboard/kpi`

```typescript
// Response dari API:
{
  revenue_today: 416000,
  order_count_today: 8,
  pending_orders: 3,
  aov: 52000       // average order value
}
```

---

## Halaman 2 — Order List

Yang ditampilkan:
- List semua order, urut terbaru di atas
- Tab filter: Semua / Pending / Diproses / Selesai
- Per baris: ID order (6 karakter terakhir), nama customer, preview produk, total, status badge
- Tap baris → masuk ke Order Detail

Data diambil dari: `GET /api/orders?tenant_id=X&status=PENDING`

---

## Halaman 3 — Order Detail

Yang ditampilkan:
- Info customer (nama, nomor WA) + tombol "Chat WA" (buka wa.me/nomor)
- List item yang dipesan (nama, qty, harga, notes)
- Total
- Status badge + tombol aksi (Tandai Selesai / Batalkan)
- Catatan customer

---

## Halaman 4 — Analitik Bisnis

Yang ditampilkan (sesuai Figma):
- Summary cards: Total Chat, Konversi Chat→Order, Handoff count
- **Line chart** tren penjualan 7 hari
- **Pie chart** metode pembayaran
- **Bar chart** top 5 produk terjual

Library: **Recharts** (sudah di-install)

---

## Halaman 5 — Human Handoff Queue

Yang ditampilkan:
- List percakapan customer yang di-escalate ke owner
- Per baris: nomor customer, pesan terakhir, waktu
- Tombol "Balas via WA" → buka wa.me/nomor customer

---

## Auth: Magic Link

Owner tidak perlu password. Alurnya:

```
1. Owner kirim "lihat dashboard" ke nomor bot
         │
         ▼
2. Bot generate JWT token (expire 7 hari)
   JWT berisi: { tenantId, ownerPhone, iat, exp }
         │
         ▼
3. Bot kirim link ke owner WA:
   "Dashboard kamu → https://wassist.run.app/dashboard?token=eyJxxx"
         │
         ▼
4. Owner tap link → browser buka dashboard
5. Middleware di /dashboard/layout.tsx validasi JWT dari query param
6. Jika valid → akses masuk, simpan ke sessionStorage
7. Jika tidak valid / expired → redirect ke halaman error
```

```typescript
// app/api/auth/magic-link/route.ts
import { SignJWT } from "jose";

export async function POST(request: NextRequest) {
  const { ownerPhone, tenantId } = await request.json();

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const token = await new SignJWT({ ownerPhone, tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?token=${token}`;
  return NextResponse.json({ url: dashboardUrl });
}
```

```typescript
// Validasi JWT di middleware atau layout
import { jwtVerify } from "jose";

async function verifyToken(token: string) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  return payload; // { ownerPhone, tenantId }
}
```

---

## API Endpoints Dashboard

### `GET /api/dashboard/kpi`
```typescript
// Query params: tenant_id
// Response:
{
  revenue_today: number,
  order_count_today: number,
  pending_orders: number,
  aov: number
}
```

### `GET /api/orders`
```typescript
// Query params: tenant_id, status? (opsional filter)
// Response:
{
  orders: Array<{
    id, status, payment_status, total_amount,
    created_at, notes,
    users: { phone, name },
    order_items: Array<{ qty, price_at_order, notes, products: { name, unit } }>
    // unit wajib: untuk display "2 pcs" / "2.5 kg" di Order Detail dan Order List
  }>
}
```

### `GET /api/orders/[id]`
```typescript
// Response: single order object lengkap
```

### `GET /api/dashboard/handoff`
```typescript
// Response: list percakapan yang butuh owner reply
{
  handoffs: Array<{
    customer_phone, last_message, timestamp
  }>
}
```

### `GET /api/products`
```typescript
// Response: semua produk aktif tenant
```

---

## Real-time Updates

Untuk demo, dashboard **tidak perlu real-time WebSocket**. Cukup dengan:
1. **Auto-refresh** setiap 30 detik (setInterval)
2. **Manual refresh** tombol di header

```typescript
// Di komponen beranda atau order list:
useEffect(() => {
  fetchData(); // initial load

  const interval = setInterval(fetchData, 30000); // refresh tiap 30 detik
  return () => clearInterval(interval);
}, []);
```

Untuk demo live: setelah customer bayar, owner refresh dashboard → order baru muncul. Cukup impactful untuk juri.

---

## Mobile-First

Semua halaman harus terlihat bagus di mobile (layar 375px). Juri kemungkinan melihat demo di HP atau screen sempit.

Aturan Tailwind untuk mobile-first:
```tsx
// Default: mobile layout
// md: prefix: desktop layout
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  {/* 2 kolom di HP, 4 kolom di desktop */}
</div>

<aside className="hidden md:flex ...">
  {/* Sidebar: hidden di HP, muncul di desktop */}
</aside>

<nav className="md:hidden fixed bottom-0 ...">
  {/* Bottom nav: hanya di HP */}
</nav>
```

---

## Color Palette (Konsisten dengan Figma)

| Elemen | Tailwind Class | Hex |
|---|---|---|
| Primary / aksen | `emerald-600` | #059669 |
| Background halaman | `gray-50` | #F9FAFB |
| Card background | `white` | #FFFFFF |
| Border card | `gray-100` | #F3F4F6 |
| Teks judul | `gray-800` | #1F2937 |
| Teks sublabel | `gray-500` | #6B7280 |
| Status pending | `amber-100/700` | |
| Status selesai | `emerald-100/700` | |
| Status batal | `red-100/700` | |
