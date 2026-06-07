"use client";
import { useEffect, useState } from "react";
import KPICard from "@/components/dashboard/KPICard";
import OrderTable from "@/components/dashboard/OrderTable";

type KpiData = {
  tenantName: string;
  totalRevenue: number;
  orderCount: number;
  pendingCount: number;
  period: string;
};

type OrderRow = {
  order_id: string;
  customer: string;
  customer_phone: string;
  total: number;
  status: "pending" | "diproses" | "selesai" | "batal";
};

export default function DashboardPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [kpiRes, ordersRes] = await Promise.all([
          fetch("/api/dashboard/kpi?period=hari+ini"),
          fetch("/api/orders"),
        ]);
        const [kpiData, ordersData] = await Promise.all([
          kpiRes.json(),
          ordersRes.json(),
        ]);
        setKpi(kpiData);
        setOrders(ordersData.orders ?? []);
      } catch (err) {
        console.error("[Dashboard] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const now = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

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
              <div className="fw-semibold text-success" style={{ fontSize: "14px" }}>
                {loading ? "Memuat..." : (kpi?.tenantName ?? "Toko")}
              </div>
              <small className="text-muted">📅 {now}</small>
            </div>
            {!loading && (kpi?.pendingCount ?? 0) > 0 && (
              <span className="badge rounded-pill text-bg-warning" style={{ fontSize: "10px" }}>
                🔥 {kpi!.pendingCount} pesanan menunggu
              </span>
            )}
          </div>
          <div className="row g-2 mt-1">
            <div className="col-6">
              <KPICard
                title="Omzet hari ini"
                value={loading ? "..." : `Rp ${(kpi?.totalRevenue ?? 0).toLocaleString("id-ID")}`}
                change={0}
                icon="bi-graph-up"
              />
            </div>
            <div className="col-6">
              <KPICard
                title="Total Pesanan"
                value={loading ? "..." : `${kpi?.orderCount ?? 0} Pesanan`}
                change={0}
                icon="bi-bag"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Order List Table ── */}
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-secondary" role="status" />
        </div>
      ) : (
        <OrderTable orders={orders.slice(0, 5)} />
      )}

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
              <p className="text-muted mb-0" style={{ fontSize: "11px", lineHeight: "1.5" }}>
                Gemini AI membantu customer secara otomatis. Cek tab Pesanan untuk update terbaru.
              </p>
            </div>
          </div>
        </div>
        <div className="col-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-1 mb-2">
                <span style={{ fontSize: "16px" }}>📊</span>
                <span className="fw-semibold" style={{ fontSize: "13px" }}>
                  Analitik Penjualan
                </span>
              </div>
              <p className="text-muted mb-0" style={{ fontSize: "11px", lineHeight: "1.5" }}>
                Lihat top produk dan tren omzet di tab Analitik.
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
              <small className="text-muted">Tim WAssist siap membantu</small>
            </div>
          </div>
          <button className="btn btn-success w-100" style={{ fontSize: "13px" }}>
            <i className="bi bi-whatsapp me-2"></i>Minta Bantuan via WhatsApp
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center py-2">
        <small className="text-muted d-block mb-2" style={{ fontSize: "11px", lineHeight: "1.6" }}>
          Solusi AI WhatsApp Assistant yang dirancang untuk membantu UMKM
          meningkatkan efisiensi operasional, pelayanan pelanggan, dan
          pengelolaan bisnis harian.
        </small>
        <div className="d-flex justify-content-center gap-3 mb-3">
          <i className="bi bi-instagram text-muted"></i>
          <i className="bi bi-twitter-x text-muted"></i>
          <i className="bi bi-tiktok text-muted"></i>
        </div>
      </div>
    </div>
  );
}
