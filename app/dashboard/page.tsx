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

function fmtRevenue(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

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

  const h = new Date().getHours();
  const greeting = h < 12 ? "Selamat Pagi" : h < 17 ? "Selamat Siang" : "Selamat Malam";
  const dateStr = new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date());

  return (
    <div style={{ background: "var(--color-bg)" }}>
      {/* ── Hero Banner ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #075E54 0%, #0A7A6E 55%, #128C7E 100%)",
          padding: "20px 16px 36px",
          color: "#fff",
        }}
      >
        <p className="mb-1" style={{ fontSize: "11px", opacity: 0.7, letterSpacing: "0.02em" }}>
          {dateStr}
        </p>
        <h1 className="fw-bold mb-1" style={{ fontSize: "20px", letterSpacing: "-0.01em" }}>
          {greeting}, {loading ? "..." : (kpi?.tenantName ?? "Toko Anda")}!
        </h1>
        <p className="mb-0" style={{ fontSize: "12px", opacity: 0.75 }}>
          WAssist · Bot aktif 24/7 🤖
        </p>
        {!loading && (kpi?.pendingCount ?? 0) > 0 && (
          <div
            className="mt-2 d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill"
            style={{ background: "rgba(255,255,255,0.18)", fontSize: "11px", fontWeight: 600 }}
          >
            <span>🔥</span>
            <span>{kpi!.pendingCount} pesanan menunggu</span>
          </div>
        )}
      </div>

      {/* ── KPI Cards — 3-col, overlapping hero ── */}
      <div className="row g-2 px-3" style={{ marginTop: "-20px" }}>
        <div className="col-4" style={{ overflow: "hidden" }}>
          <div style={{ borderRadius: "0.375rem", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
            <KPICard
              title="Omzet"
              value={loading ? "..." : fmtRevenue(kpi?.totalRevenue ?? 0)}
              change={0}
              icon="bi-graph-up"
            />
          </div>
        </div>
        <div className="col-4" style={{ overflow: "hidden" }}>
          <div style={{ borderRadius: "0.375rem", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
            <KPICard
              title="Pesanan"
              value={loading ? "..." : String(kpi?.orderCount ?? 0)}
              change={0}
              icon="bi-bag"
            />
          </div>
        </div>
        <div className="col-4" style={{ overflow: "hidden" }}>
          <div style={{ borderRadius: "0.375rem", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
            <KPICard
              title="Pending"
              value={loading ? "..." : String(kpi?.pendingCount ?? 0)}
              change={0}
              icon="bi-clock"
            />
          </div>
        </div>
      </div>

      {/* ── Pesanan Terbaru ── */}
      <div className="px-3 mt-4 mb-2">
        <span className="fw-semibold" style={{ fontSize: "14px" }}>Pesanan Terbaru</span>
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-secondary" role="status" />
        </div>
      ) : (
        <div className="px-3">
          <OrderTable orders={orders.slice(0, 5)} />
        </div>
      )}

      {/* ── Insight Cards ── */}
      <div className="row g-2 px-3 mt-3">
        <div className="col-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-1 mb-2">
                <span style={{ fontSize: "16px" }}>✨</span>
                <span className="fw-semibold" style={{ fontSize: "13px" }}>AI Aktif</span>
              </div>
              <p className="text-muted mb-0" style={{ fontSize: "11px", lineHeight: "1.5" }}>
                Gemini AI membantu customer 24/7 secara otomatis.
              </p>
            </div>
          </div>
        </div>
        <div className="col-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3">
              <div className="d-flex align-items-center gap-1 mb-2">
                <span style={{ fontSize: "16px" }}>📊</span>
                <span className="fw-semibold" style={{ fontSize: "13px" }}>Analitik</span>
              </div>
              <p className="text-muted mb-0" style={{ fontSize: "11px", lineHeight: "1.5" }}>
                Lihat tren omzet dan top produk di tab Analitik.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center py-4">
        <small className="text-muted" style={{ fontSize: "11px" }}>
          WAssist · Solusi AI WhatsApp untuk UMKM Indonesia
        </small>
      </div>
    </div>
  );
}
