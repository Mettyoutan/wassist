"use client";
import KPICard from "@/components/dashboard/KPICard";
import OrderTable from "@/components/dashboard/OrderTable";
import OrderAccordion from "@/components/dashboard/OrderAccordion";
// ── Dummy Data ──────────────────────────────────────────────
const dummyOrders = [
  {
    order_id: "CSTMR-0001",
    customer: "Andin",
    total: 30000,
    status: "diproses" as const,
  },
  {
    order_id: "CSTMR-0002",
    customer: "Karla",
    total: 25000,
    status: "pending" as const,
  },
  {
    order_id: "CSTMR-0003",
    customer: "Afin",
    total: 25000,
    status: "pending" as const,
  },
  {
    order_id: "CSTMR-0004",
    customer: "Netta",
    total: 25000,
    status: "selesai" as const,
  },
];

type FilterTab = "pending" | "diproses" | "selesai";

// ── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div className="pb-4">
      {/* ── Ringkasan Penjualan ── */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <div>
              <div className="fw-semibold" style={{ fontSize: "14px" }}>
                Ringkasan Penjualan -
              </div>
              <div
                className="fw-semibold text-success"
                style={{ fontSize: "14px" }}
              >
                Warung Sedap
              </div>
              <small className="text-muted">📅 16 Mei 2026, 12:10</small>
            </div>
            <span
              className="badge rounded-pill text-bg-warning"
              style={{ fontSize: "10px" }}
            >
              🔥 Pesanan mulai ramai
            </span>
          </div>
          <div className="row g-2 mt-1">
            <div className="col-6">
              <KPICard
                title="Omzet hari ini"
                value="Rp 1.250.000"
                change={1.9}
                icon="bi-graph-up"
              />
            </div>
            <div className="col-6">
              <KPICard
                title="Total Pesanan"
                value="45 Pesanan"
                change={-0.5}
                icon="bi-bag"
              />
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
                <span style={{ fontSize: "16px" }}>✨</span>
                <span className="fw-semibold" style={{ fontSize: "13px" }}>
                  Efisiensi Operasional
                </span>
              </div>
              <p
                className="text-muted mb-0"
                style={{ fontSize: "11px", lineHeight: "1.5" }}
              >
                Gemini AI baru saja membantu pelanggan stok dan pelanggan dalam
                2 detik. 90% chat hari ini ditangani otomatis.
              </p>
            </div>
          </div>
        </div>
        <div className="col-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-1 mb-2">
                <span style={{ fontSize: "16px" }}>📈</span>
                <span className="fw-semibold" style={{ fontSize: "13px" }}>
                  Tren Pasar (Community Insight)
                </span>
              </div>
              <p
                className="text-muted mb-0"
                style={{ fontSize: "11px", lineHeight: "1.5" }}
              >
                Menu catering nasi box lagi naik daun di area Jakarta Selatan.
                Coba buat paket promo serupa untuk menarik pelanggan baru.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* ── Bantuan ── */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-3">
          <div className="d-flex gap-2 align-items-start mb-2">
            <span style={{ fontSize: "20px" }}>💬</span>
            <div>
              <div className="fw-semibold" style={{ fontSize: "13px" }}>
                Butuh bantuan atau ada pertanyaan?
              </div>
              <small className="text-muted">Tini Wasiat siap membantu</small>
            </div>
          </div>
          <button
            className="btn btn-success w-100"
            style={{ fontSize: "13px" }}
          >
            <i className="bi bi-whatsapp me-2"></i>Minta Bantuan via WhatsApp
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center py-2">
        <small
          className="text-muted d-block mb-2"
          style={{ fontSize: "11px", lineHeight: "1.6" }}
        >
          Solusi AI WhatsApp Assistant yang dirancang untuk membantu UMKM
          meningkatkan efisiensi operasional, pelayanan pelanggan, dan
          pengelolaan bisnis harian.
        </small>
        <div className="d-flex justify-content-center gap-3 mb-3">
          <i className="bi bi-instagram text-muted"></i>
          <i className="bi bi-twitter-x text-muted"></i>
          <i className="bi bi-tiktok text-muted"></i>
        </div>
        <div className="border-top pt-3">
          <div className="fw-semibold mb-2" style={{ fontSize: "12px" }}>
            Navigasi Cepat
          </div>
          <div className="row g-1 text-start" style={{ fontSize: "11px" }}>
            <div className="col-6 text-muted">Beranda</div>
            <div className="col-6 text-muted">Pengaturan Toko</div>
            <div className="col-6 text-muted">Kelola Pesanan</div>
            <div className="col-6 text-muted">Pengaturan Akun</div>
          </div>
        </div>
      </div>
    </div>
  );
}
