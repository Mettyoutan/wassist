"use client";
import { useState, useEffect } from "react";
import KPICard from "./KPICard";

type Period = "hari ini" | "minggu" | "bulan";

type KpiData = {
  period: string;
  totalRevenue: number;
  orderCount: number;
  aov: number;
  pendingCount: number;
  topProducts: Array<{ name: string; unit: string; qtySold: number; revenue: number }>;
  lowStockProducts: Array<{ name: string; unit: string; stock: number; reorderPoint: number }>;
};

const PERIOD_LABELS: Record<Period, string> = {
  "hari ini": "Hari Ini",
  "minggu":   "Minggu Ini",
  "bulan":    "Bulan Ini",
};

export default function AnalyticsView() {
  const [period, setPeriod] = useState<Period>("hari ini");
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/kpi?period=${encodeURIComponent(period)}`)
      .then((r) => r.json())
      .then((data) => setKpi(data))
      .catch((err) => console.error("[Analytics] fetch error:", err))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="pb-4">
      {/* ── Period Selector ── */}
      <div className="card border-0 shadow-sm mb-2">
        <div className="card-body p-3">
          <div className="fw-semibold mb-2" style={{ fontSize: "14px" }}>Laporan Penjualan</div>
          <div className="d-flex gap-2">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`btn btn-sm rounded-pill ${period === p ? "btn-dark" : "btn-outline-secondary"}`}
                style={{ fontSize: "12px" }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border spinner-border-sm text-secondary" role="status" />
        </div>
      ) : (
        <>
          {/* ── KPI Row ── */}
          <div className="row g-2 mb-2">
            <div className="col-6">
              <KPICard
                title="Omzet"
                value={`Rp ${(kpi?.totalRevenue ?? 0).toLocaleString("id-ID")}`}
                change={0}
                icon="bi-graph-up"
              />
            </div>
            <div className="col-6">
              <KPICard
                title="Pesanan Lunas"
                value={`${kpi?.orderCount ?? 0}`}
                change={0}
                icon="bi-bag-check"
              />
            </div>
            <div className="col-12">
              <KPICard
                title="Rata-rata Transaksi (AOV)"
                value={`Rp ${(kpi?.aov ?? 0).toLocaleString("id-ID")}`}
                change={0}
                icon="bi-receipt"
              />
            </div>
          </div>

          {/* ── Top Produk ── */}
          <div className="card border-0 shadow-sm mb-2">
            <div className="card-body p-3">
              <div className="fw-semibold mb-2" style={{ fontSize: "14px" }}>
                🏆 Top Produk ({kpi?.period})
              </div>
              {(kpi?.topProducts ?? []).length === 0 ? (
                <p className="text-muted" style={{ fontSize: "12px" }}>
                  Belum ada data penjualan periode ini.
                </p>
              ) : (
                <table className="table table-sm mb-0" style={{ fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Produk</th>
                      <th className="text-end">Terjual</th>
                      <th className="text-end">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kpi?.topProducts ?? []).map((p, i) => (
                      <tr key={p.name}>
                        <td className="text-muted">{i + 1}</td>
                        <td>{p.name}</td>
                        <td className="text-end">{p.qtySold} {p.unit}</td>
                        <td className="text-end">Rp {p.revenue.toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Stok Menipis ── */}
          {(kpi?.lowStockProducts ?? []).length > 0 && (
            <div className="card border-0 shadow-sm border-warning">
              <div className="card-body p-3">
                <div className="fw-semibold mb-2 text-warning" style={{ fontSize: "14px" }}>
                  ⚠️ Stok Menipis / Habis
                </div>
                <table className="table table-sm mb-0" style={{ fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th className="text-end">Stok</th>
                      <th className="text-end">Min.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kpi?.lowStockProducts ?? []).map((p) => (
                      <tr key={p.name} className={p.stock <= 0 ? "table-danger" : "table-warning"}>
                        <td>{p.name}</td>
                        <td className="text-end">{p.stock} {p.unit}</td>
                        <td className="text-end">{p.reorderPoint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
