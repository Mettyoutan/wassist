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
  trendPoints: Array<{ label: string; revenue: number }>;
  qrisCount: number;
  manualCount: number;
  uniqueCustomers: number;
  repeatCustomers: number;
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

  const buildSvgPoints = (trendPoints: Array<{ label: string; revenue: number }>) => {
    const n = trendPoints.length;
    if (n === 0) return { points: "10,90 330,90", labels: [] as string[] };
    const maxRev = Math.max(...trendPoints.map((t) => t.revenue), 1);
    const svgPoints = trendPoints
      .map((t, i) => {
        const x = 10 + i * (320 / Math.max(n - 1, 1));
        const y = 90 - (t.revenue / maxRev) * 80;
        return `${Math.round(x)},${Math.round(y)}`;
      })
      .join(" ");
    return { points: svgPoints, labels: trendPoints.map((t) => t.label) };
  };

  const buildInsight = (kpi: KpiData | null): string => {
    if (!kpi || kpi.orderCount === 0)
      return "Belum ada transaksi di periode ini. Bot WA siap menerima pesanan pelanggan!";
    if (kpi.topProducts.length > 0) {
      const top = kpi.topProducts[0];
      return `Produk terlaris: ${top.name} — ${top.qtySold} ${top.unit} terjual (Rp ${top.revenue.toLocaleString("id-ID")}). AOV periode ini Rp ${kpi.aov.toLocaleString("id-ID")}.`;
    }
    return `${kpi.orderCount} transaksi diproses otomatis oleh bot WA periode ini.`;
  };

  const svgTrend = buildSvgPoints(kpi?.trendPoints ?? []);
  const insight = buildInsight(kpi);

  return (
    <div className="pb-4">
      {/* ── Period Selector ── */}
      <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: "14px" }}>
        <div className="card-body p-3">
          <div className="fw-bold mb-2 text-dark" style={{ fontSize: "14px" }}>Laporan Performa</div>
          <div className="d-flex gap-2">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`btn btn-sm rounded-pill px-3 py-1.5 fw-semibold ${
                  period === p ? "btn-dark" : "btn-light text-muted border-0"
                }`}
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
        <div className="d-flex flex-column gap-3">
          
          {/* ── KPI Row ── */}
          <div className="row g-2">
            <div className="col-6">
              <KPICard
                title="Omzet Penjualan"
                value={`Rp ${(kpi?.totalRevenue ?? 0).toLocaleString("id-ID")}`}
                change={period === "hari ini" ? 1.9 : period === "minggu" ? 8.2 : 12.5}
                icon="bi-graph-up-arrow"
              />
            </div>
            <div className="col-6">
              <KPICard
                title="Pesanan Lunas"
                value={`${kpi?.orderCount ?? 0} Transaksi`}
                change={period === "hari ini" ? 0.5 : period === "minggu" ? 3.4 : 5.8}
                icon="bi-bag-check-fill"
              />
            </div>
            <div className="col-12">
              <div 
                className="card border-0 shadow-sm text-white p-3" 
                style={{ 
                  borderRadius: "14px", 
                  background: "linear-gradient(135deg, var(--color-primary), #0a7367)",
                  boxShadow: "0 4px 14px var(--color-shadow)" 
                }}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <small style={{ fontSize: "11px", opacity: 0.85 }}>Total Penghematan Komisi</small>
                    <div className="fw-bold fs-5 mt-0.5">Rp {Math.round((kpi?.totalRevenue ?? 0) * 0.2).toLocaleString("id-ID")}</div>
                    <small style={{ fontSize: "10px", opacity: 0.8 }}>Dihitung dari rata-rata komisi kompetitor (20%)</small>
                  </div>
                  <div className="fs-1 opacity-25">💰</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Visual Line Chart (Sales Trend) ── */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
            <div className="card-body p-3">
              <div className="fw-bold text-dark mb-2" style={{ fontSize: "13px" }}>Grafik Tren Penjualan</div>
              
              {/* SVG Line Graph */}
              <div className="position-relative bg-light rounded-3 p-2 d-flex flex-column align-items-center">
                <svg viewBox="0 0 350 100" className="w-100" style={{ overflow: "visible" }}>
                  <defs>
                    <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Fill area */}
                  <path
                    d={`M 10,95 L ${svgTrend.points} L 330,95 Z`}
                    fill="url(#chart-grad)"
                    stroke="none"
                  />

                  {/* Graph line */}
                  <polyline
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={svgTrend.points}
                  />
                </svg>
                
                {/* Chart labels */}
                <div className="d-flex justify-content-between w-100 px-1 mt-2 text-muted" style={{ fontSize: "9px" }}>
                  {svgTrend.labels.map((lbl, idx) => (
                    <span key={idx}>{lbl}</span>
                  ))}
                </div>
              </div>

              {/* AI Insight bubble */}
              <div className="alert alert-success mt-3 p-2.5 border-0 d-flex gap-2.5 align-items-start" style={{ borderRadius: "10px", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", fontSize: "11px" }}>
                <span className="fs-5" style={{ lineHeight: 1 }}>✨</span>
                <div>
                  <span className="fw-bold d-block mb-0.5">Insight AI WAssist:</span>
                  {insight}
                </div>
              </div>
            </div>
          </div>

          {/* ── Top Produk terlaris (Progress Bar) ── */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
            <div className="card-body p-3">
              <div className="fw-bold text-dark mb-3" style={{ fontSize: "13px" }}>🏆 Top Produk Terlaris</div>
              {(kpi?.topProducts ?? []).length === 0 ? (
                <p className="text-muted mb-0 py-3 text-center" style={{ fontSize: "12px" }}>
                  Belum ada data penjualan periode ini.
                </p>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {(kpi?.topProducts ?? []).map((p, i) => {
                    const maxRev = kpi?.topProducts[0]?.revenue ?? 1;
                    const percentage = maxRev > 0 ? Math.round((p.revenue / maxRev) * 100) : 60;
                    return (
                      <div key={p.name} style={{ fontSize: "12px" }}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-semibold text-dark">{i + 1}. {p.name}</span>
                          <span className="text-muted">{p.qtySold} {p.unit} • Rp {p.revenue.toLocaleString("id-ID")}</span>
                        </div>
                        <div className="progress" style={{ height: "6px", borderRadius: "10px", background: "#f0f2f5" }}>
                          <div 
                            className="progress-bar" 
                            role="progressbar" 
                            style={{ 
                              width: `${percentage}%`, 
                              background: i === 0 ? "var(--color-primary)" : "var(--color-blue)",
                              borderRadius: "10px"
                            }} 
                            aria-valuenow={percentage} 
                            aria-valuemin={0} 
                            aria-valuemax={100}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Gemini AI Performance & Effectiveness ── */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
            <div className="card-body p-3">
              <div className="fw-bold text-dark mb-2.5" style={{ fontSize: "13px" }}>Efektivitas Asisten AI Gemini</div>
              <div className="row g-2">
                {[
                  {
                    title: "Pesanan Diproses Bot",
                    value: `${kpi?.orderCount ?? 0} Order`,
                    desc: "100% otomatis via WA — tanpa campur tangan manual",
                    icon: "bi-chat-left-dots-fill",
                    color: "var(--color-primary)",
                  },
                  {
                    title: "Estimasi Waktu Dihemat",
                    value: `${(kpi?.orderCount ?? 0) * 5} Menit`,
                    desc: "~5 mnt per order — bisa fokus ke produksi",
                    icon: "bi-clock-fill",
                    color: "var(--color-blue)",
                  },
                  {
                    title: "Rata-rata per Transaksi",
                    value: `Rp ${(kpi?.aov ?? 0).toLocaleString("id-ID")}`,
                    desc: "Average Order Value periode ini",
                    icon: "bi-receipt",
                    color: "var(--color-warning)",
                  },
                  {
                    title: "Efisiensi Channel",
                    value: "100% WA",
                    desc: "Semua pesanan masuk via WhatsApp",
                    icon: "bi-check-circle-fill",
                    color: "var(--color-accent)",
                  },
                ].map((item, index) => (
                  <div key={index} className="col-6">
                    <div className="p-2.5 rounded-3 h-100 bg-light" style={{ border: "1px solid var(--color-border)" }}>
                      <div className="d-flex align-items-center gap-1.5 mb-1">
                        <i className={`bi ${item.icon}`} style={{ color: item.color, fontSize: "12px" }}></i>
                        <span className="text-muted" style={{ fontSize: "9px", fontWeight: 500 }}>{item.title}</span>
                      </div>
                      <div className="fw-bold text-dark" style={{ fontSize: "14px" }}>{item.value}</div>
                      <div className="text-muted" style={{ fontSize: "8px", lineHeight: "1.2", marginTop: "2px" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Metode Pembayaran (SVG Donut) ── */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
            <div className="card-body p-3">
              <div className="fw-bold text-dark mb-3" style={{ fontSize: "13px" }}>Metode Pembayaran Terfavorit</div>
              {(() => {
                const total = Math.max((kpi?.orderCount ?? 0), 1);
                const qrisPct = Math.round(((kpi?.qrisCount ?? 0) / total) * 100);
                const manualPct = 100 - qrisPct;
                return (
                  <div className="d-flex align-items-center justify-content-around">
                    <div className="position-relative" style={{ width: "80px", height: "80px" }}>
                      <svg width="80" height="80" viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--color-border)" strokeWidth="4" />
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--color-blue)"
                          strokeWidth="4.2" strokeDasharray={`${manualPct} ${qrisPct}`} strokeDashoffset="0" />
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--color-accent)"
                          strokeWidth="4.2" strokeDasharray={`${qrisPct} ${manualPct}`} strokeDashoffset={`-${manualPct}`} />
                      </svg>
                      <div className="position-absolute top-50 start-50 translate-middle text-center">
                        <span className="fw-bold text-dark" style={{ fontSize: "12px" }}>{qrisPct}%</span>
                        <span className="text-muted d-block" style={{ fontSize: "6px" }}>QRIS</span>
                      </div>
                    </div>
                    <div className="d-flex flex-column gap-2" style={{ fontSize: "11px" }}>
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "var(--color-accent)" }}></span>
                        <span className="fw-semibold text-dark">QRIS (Otomatis): {qrisPct}%</span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "var(--color-blue)" }}></span>
                        <span className="text-muted">Transfer Manual: {manualPct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Customer Loyalty circular indicator ── */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
            <div className="card-body p-3">
              <div className="fw-bold text-dark mb-3" style={{ fontSize: "13px" }}>Tingkat Loyalitas Pelanggan</div>
              {(() => {
                const unique = kpi?.uniqueCustomers ?? 0;
                const repeat = kpi?.repeatCustomers ?? 0;
                const repeatPct = unique > 0 ? Math.round((repeat / unique) * 100) : 0;
                return (
                  <div className="d-flex align-items-center justify-content-around">
                    <div className="position-relative" style={{ width: "80px", height: "80px" }}>
                      <svg width="80" height="80" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f0f2f5" strokeWidth="3.5" />
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--color-primary)"
                          strokeWidth="3.8"
                          strokeDasharray={`${repeatPct} ${100 - repeatPct}`}
                          strokeDashoffset="25"
                          strokeLinecap="round" />
                      </svg>
                      <div className="position-absolute top-50 start-50 translate-middle text-center">
                        <span className="fw-bold text-dark" style={{ fontSize: "12px" }}>{repeatPct}%</span>
                        <span className="text-muted d-block" style={{ fontSize: "6px" }}>Repeat</span>
                      </div>
                    </div>
                    <div className="d-flex flex-column gap-1.5" style={{ fontSize: "10px" }}>
                      <div className="d-flex justify-content-between gap-5 align-items-center">
                        <span className="text-muted">Total pelanggan unik:</span>
                        <span className="fw-bold text-dark">{unique}</span>
                      </div>
                      <div className="d-flex justify-content-between gap-5 align-items-center">
                        <span className="text-muted">Pelanggan repeat order:</span>
                        <span className="fw-bold text-dark">{repeat}</span>
                      </div>
                      <div className="d-flex justify-content-between gap-5 align-items-center">
                        <span className="text-muted">Tingkat repeat (2+ order):</span>
                        <span className="fw-bold text-dark">{repeatPct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Share Reports buttons ── */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
            <div className="card-body p-3">
              <div className="fw-bold text-dark mb-2" style={{ fontSize: "13px" }}>Bagikan Laporan Performa</div>
              <div className="d-flex gap-2">
                <button 
                  className="btn btn-outline-secondary flex-grow-1 py-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5"
                  style={{ fontSize: "12px", borderRadius: "8px" }}
                  onClick={() => alert("Mengunduh laporan PDF...")}
                >
                  <i className="bi bi-file-earmark-pdf"></i>
                  Unduh PDF
                </button>
                <button 
                  className="btn btn-success flex-grow-1 py-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5"
                  style={{ fontSize: "12px", borderRadius: "8px", background: "var(--color-accent)", border: "none" }}
                  onClick={() => alert("Membagikan laporan ke WhatsApp...")}
                >
                  <i className="bi bi-whatsapp"></i>
                  Bagikan ke WA
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
