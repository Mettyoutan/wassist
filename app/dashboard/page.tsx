'use client'

import { useState } from 'react'
import KPICard from '@/components/dashboard/KPICard'
import OrderTable from '@/components/dashboard/OrderTable'
import StockNotification from '@/components/dashboard/StockNotification'
import OrderAccordion from '@/components/dashboard/OrderAccordion'

// ── Dummy Data ──────────────────────────────────────────────
const dummyOrders = [
  { order_id: 'CSTMR-0001', customer: 'Andin',  total: 30000, status: 'diproses' as const },
  { order_id: 'CSTMR-0002', customer: 'Karla',  total: 25000, status: 'pending'  as const },
  { order_id: 'CSTMR-0003', customer: 'Afin',   total: 25000, status: 'lunas'    as const },
  { order_id: 'CSTMR-0004', customer: 'Netta',  total: 25000, status: 'selesai'  as const },
]

const dummyStock = [
  { name: 'Ayam Penyet',  stock: 3,  soldToday: 22, image: "/ayam_penyet.png", status: 'menipis' as const },
  { name: 'Es Teh Manis', stock: 0,  soldToday: 55, image: "/es_teh_manis.png", status: 'habis'   as const },
  { name: 'Tahu Goreng',  stock: 6,  soldToday: 0, image: "/tahu_goreng.png", status: 'aman'    as const },
]

const dummyOrderDetails = [
  {
    id: '1',
    orderCode: 'UMKM082',
    customer: 'Salsa',
    status: 'diproses' as const,
    date: 'Jum, 16 Mei 2025, 12:10',
    items: [{ name: 'Ayam Penyet', qty: 1 }, { name: 'Es Teh Manis', qty: 1 }],
    total: 30000,
    timeline: [
      'Pesanan Diterima\nSabtu, 16 Mei 2026, 12:07',
      'Pembayaran Dikonfirmasi\nSabtu, 16 Mei 2026, 12:10',
      'Pesanan Diproses\nSabtu, 16 Mei 2026, 12:15',
      'Siap Diambil / Diantar',
      'Pesanan Selesai',
    ],
  },
  {
    id: '2',
    orderCode: 'UMKM083',
    customer: 'Kenzi',
    status: 'pending' as const,
    date: 'Jum, 16 Mei 2025, 11:45',
    items: [{ name: 'Tahu Goreng', qty: 2 }],
    total: 25000,
    timeline: ['Pesanan Diterima', 'Menunggu Konfirmasi Pembayaran'],
  },
  {
    id: '3',
    orderCode: 'UMKM084',
    customer: 'Tasya',
    status: 'pending' as const,
    date: 'Jum, 16 Mei 2025, 11:30',
    items: [{ name: 'Ayam Penyet', qty: 1 }],
    total: 25000,
    timeline: ['Pesanan Diterima', 'Menunggu Konfirmasi Pembayaran'],
  },
]

type FilterTab = 'all' | 'diproses' | 'pending' | 'lunas' | 'selesai'

// ── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const filteredDetails = activeTab === 'all'
    ? dummyOrderDetails
    : dummyOrderDetails.filter(o => o.status === activeTab)

  const statusCount = {
    diproses: dummyOrderDetails.filter(o => o.status === 'diproses').length,
    pending:  dummyOrderDetails.filter(o => o.status === 'pending').length,
    lunas:    dummyOrders.filter(o => o.status === 'lunas').length,
  }

  return (
    <div className="pb-4">

      {/* ── Navbar ── */}
      <nav className="navbar px-3 py-2 bg-white border-bottom sticky-top">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-list fs-5"></i>
        </div>
        <span className="fw-semibold" style={{ fontSize: '15px' }}>Beranda</span>
        <i className="bi bi-bell fs-5"></i>
      </nav>

      <div className="px-3 pt-3 d-flex flex-column gap-3">

        {/* ── Ringkasan Penjualan ── */}
        <div className="card border-0 shadow-sm">
          <div className="card-body p-3">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div className="fw-semibold" style={{ fontSize: '14px' }}>Ringkasan Penjualan -</div>
                <div className="fw-semibold text-success" style={{ fontSize: '14px' }}>Warung Sedap</div>
                <small className="text-muted">📅 16 Mei 2026, 12:10</small>
              </div>
              <span className="badge rounded-pill text-bg-warning" style={{ fontSize: '10px' }}>
                🔥 Pesanan mulai ramai
              </span>
            </div>
            <div className="row g-2 mt-1">
              <div className="col-6">
                <KPICard title="Omzet hari ini" value="Rp 1.250.000" change={1.9} icon="bi-graph-up" />
              </div>
              <div className="col-6">
                <KPICard title="Total Pesanan" value="45 Pesanan" change={-0.5} icon="bi-bag" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Order List Table ── */}
        <OrderTable orders={dummyOrders} />

        {/* ── Insight Cards ── */}
        <div className="row g-2">
          <div className="col-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-3">
                <div className="d-flex align-items-center gap-1 mb-2">
                  <span style={{ fontSize: '16px' }}>✨</span>
                  <span className="fw-semibold" style={{ fontSize: '13px' }}>Efisiensi Operasional</span>
                </div>
                <p className="text-muted mb-0" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                  Gemini AI baru saja membantu pelanggan stok dan pelanggan dalam 2 detik. 90% chat hari ini ditangani otomatis.
                </p>
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-3">
                <div className="d-flex align-items-center gap-1 mb-2">
                  <span style={{ fontSize: '16px' }}>📈</span>
                  <span className="fw-semibold" style={{ fontSize: '13px' }}>Tren Pasar (Community Insight)</span>
                </div>
                <p className="text-muted mb-0" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                  Menu catering nasi box lagi naik daun di area Jakarta Selatan. Coba buat paket promo serupa untuk menarik pelanggan baru.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stok ── */}
        <StockNotification items={dummyStock} />

        {/* ── Status Pesanan ── */}
        <div className="card border-0 shadow-sm">
          <div className="card-body p-3">
            <div className="fw-semibold mb-1" style={{ fontSize: '14px' }}>Status Pesanan</div>
            <small className="text-muted d-block mb-3">Kelola dan lacak seluruh pesanan pelanggan</small>
            <div className="row g-2 text-center">
              <div className="col-4">
                <div className="rounded-3 py-2" style={{ background: '#fee2e2' }}>
                  <div className="fw-bold text-danger" style={{ fontSize: '20px' }}>{statusCount.diproses}</div>
                  <small className="text-danger">Diproses</small>
                </div>
              </div>
              <div className="col-4">
                <div className="rounded-3 py-2" style={{ background: '#fef9c3' }}>
                  <div className="fw-bold text-warning" style={{ fontSize: '20px' }}>{statusCount.pending}</div>
                  <small className="text-warning">Pending</small>
                </div>
              </div>
              <div className="col-4">
                <div className="rounded-3 py-2" style={{ background: '#dcfce7' }}>
                  <div className="fw-bold text-success" style={{ fontSize: '20px' }}>{statusCount.lunas}</div>
                  <small className="text-success">Lunas</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ringkasan Pesanan / Accordion ── */}
        <div>
          <div className="fw-semibold mb-2" style={{ fontSize: '14px' }}>Ringkasan Pesanan</div>

          {/* Filter Tabs */}
          <div className="d-flex gap-1 mb-3 overflow-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {(['all','diproses','pending','lunas','selesai'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`btn btn-sm rounded-pill px-3 ${activeTab === tab ? 'btn-dark' : 'btn-outline-secondary'}`}
                style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
              >
                {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <OrderAccordion orders={filteredDetails} />

          <div className="text-center mt-2">
            <button className="btn btn-sm btn-link text-muted" style={{ fontSize: '12px' }}>
              Tampilkan semua
            </button>
          </div>
        </div>

        {/* ── Bantuan ── */}
        <div className="card border-0 shadow-sm">
          <div className="card-body p-3">
            <div className="d-flex gap-2 align-items-start mb-2">
              <span style={{ fontSize: '20px' }}>💬</span>
              <div>
                <div className="fw-semibold" style={{ fontSize: '13px' }}>Butuh bantuan atau ada pertanyaan?</div>
                <small className="text-muted">Tini Wasiat siap membantu</small>
              </div>
            </div>
            <button className="btn btn-success w-100" style={{ fontSize: '13px' }}>
              <i className="bi bi-whatsapp me-2"></i>Minta Bantuan via WhatsApp
            </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center py-2">
          <small className="text-muted d-block mb-2" style={{ fontSize: '11px', lineHeight: '1.6' }}>
            Solusi AI WhatsApp Assistant yang dirancang untuk membantu UMKM meningkatkan efisiensi operasional, pelayanan pelanggan, dan pengelolaan bisnis harian.
          </small>
          <div className="d-flex justify-content-center gap-3 mb-3">
            <i className="bi bi-instagram text-muted"></i>
            <i className="bi bi-twitter-x text-muted"></i>
            <i className="bi bi-tiktok text-muted"></i>
          </div>
          <div className="border-top pt-3">
            <div className="fw-semibold mb-2" style={{ fontSize: '12px' }}>Navigasi Cepat</div>
            <div className="row g-1 text-start" style={{ fontSize: '11px' }}>
              <div className="col-6 text-muted">Beranda</div>
              <div className="col-6 text-muted">Pengaturan Toko</div>
              <div className="col-6 text-muted">Kelola Pesanan</div>
              <div className="col-6 text-muted">Pengaturan Akun</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}