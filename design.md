# WAssist Design System
> Last updated: 4 Juni 2026 — Referensi untuk konsistensi UI

---

## Brand & Tone

WAssist = WhatsApp native feel untuk owner UMKM Indonesia. Tone: familiar, trustworthy, mobile-first. Bukan enterprise SaaS.

---

## Color Tokens (GUNAKAN VARIABEL, BUKAN HEX LANGSUNG)

```css
--color-primary:    #075E54   /* WA dark green — navbar bg, active state, CTA primary */
--color-accent:     #25D366   /* WA green — success badge, positive action, selesai status */
--color-blue:       #00669E   /* info, link, secondary brand */
--color-warning:    #F59E0B   /* pending status, stok menipis */
--color-danger:     #EF4444   /* error, stok habis, destructive action */
--color-bg:         #F0F2F5   /* page background (WA chat bg feel) */
--color-surface:    #FFFFFF   /* card, bottom nav, navbar surface */
--color-text:       #111827   /* primary text */
--color-text-muted: #6B7280   /* secondary text, labels */
--color-border:     #E5E7EB   /* dividers, card border */
```

Semua token ada di `app/globals.css` `:root {}`.

---

## Typography

| Use | Size | Weight |
|---|---|---|
| Label, badge | 10–12px | 500 |
| Body small | 13px | 400 |
| Body | 14px | 400 |
| Subheading | 14px | 600 |
| KPI value | 18px | 700 |
| Page heading | 24px | 700 |

Font stack: `'Segoe UI', system-ui, sans-serif`
Min body size mobile: **16px** (mencegah iOS auto-zoom)

---

## Spacing

Grid: **4px / 8px** increments. Padding konten: `p-3` (12px). Gap antar section: `mb-3` atau `gap-2`.

---

## Layout

- **Container**: max-width `430px`, centered, white bg, box-shadow
- **Navbar**: sticky top, height ~52px
- **Bottom nav**: fixed bottom, height 64px, `z-index: 1040`
- **Content**: `padding-bottom: 72px` agar tidak tertutup bottom nav

---

## Navigasi

### Bottom Navigation (4 tab — PRIMARY)
```
Beranda (/dashboard)         | Pesanan (/dashboard/orders)
Produk (/dashboard/products) | Analitik (/dashboard/analytics)
```
- Max 4 tab, setiap tab ada icon + label
- Active: `--color-primary` (#075E54), filled icon
- Inactive: `--color-text-muted`, outline icon

### Hamburger Drawer (SECONDARY)
- Untuk: Settings, Account, Logout
- JANGAN pakai untuk navigasi tab utama

### Navbar Title
- Auto-derive dari pathname (via `PAGE_TITLES` map di Navbar.tsx)
- JANGAN hardcode "Beranda" di layout.tsx

---

## Status Badge Colors

| Status | Background | Label |
|---|---|---|
| `pending` | `--color-warning` #F59E0B | Pending |
| `diproses` | `--color-blue` #00669E | Diproses |
| `selesai` | `--color-accent` #25D366 | Selesai |
| `habis` | `--color-danger` #EF4444 | Habis |
| `menipis` | `--color-warning` #F59E0B | Menipis |
| `aman` | `--color-accent` #25D366 | Aman |

---

## Component Rules

### KPICard
- Background: `var(--color-bg)` (#F0F2F5) — bukan white
- Value font: 18px bold
- Label: 12px text-muted

### Card (Bootstrap .card)
- Selalu `border-0 shadow-sm`
- Padding: `p-3`
- Radius: Bootstrap default (0.375rem)

### Button CTA utama
- Class: `btn-success` atau background `var(--color-accent)`
- Tiap screen satu primary CTA saja

### Toast / Alert
- Auto-dismiss: 3–5 detik
- Posisi: top center di dalam container 430px
- Success: green, Error: danger

---

## Anti-Patterns

```
❌ Hardcode hex di component (pakai var())
❌ Emoji sebagai icon navigasi (pakai bi-*)
❌ Bottom nav > 4 item
❌ Navbar title hardcoded "Beranda"
❌ StatusBadge "selesai" pakai bg-primary (Bootstrap blue)
❌ KPICard background white (harusnya --color-bg)
❌ padding-bottom tidak ada di content area (bottom nav nutup konten)
```

---

## Halaman yang Harus Ada (anti-404)

| Path | Status | Note |
|---|---|---|
| `/dashboard` | ✅ | Home |
| `/dashboard/orders` | ✅ | Kelola Pesanan |
| `/dashboard/products` | ✅ | Produk & Stok |
| `/dashboard/analytics` | ✅ | Analitik |
| `/dashboard/settings` | ✅ stub | "Segera Hadir" |
| `/dashboard/account` | ✅ stub | Info tenant |
