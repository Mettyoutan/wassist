import { useState } from "react";
import StatusBadge from "./StatusBadge";

const AVATAR_PALETTES = [
  { background: "#fee2e2", color: "#991b1b" },
  { background: "#fef3c7", color: "#92400e" },
  { background: "#d1fae5", color: "#065f46" },
  { background: "#dbeafe", color: "#1e3a8a" },
  { background: "#ede9fe", color: "#4c1d95" },
  { background: "#fce7f3", color: "#831843" },
  { background: "#e0f2fe", color: "#0c4a6e" },
  { background: "#dcfce7", color: "#14532d" },
];

function avatarStyle(name: string) {
  const idx = ((name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0)) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

type Status = "pending" | "diproses" | "selesai" | "batal";

interface OrderItem {
  name: string;
  qty: number;
  price?: number;
}

interface OrderDetail {
  id: string;
  orderCode: string;
  customer: string;
  customer_phone: string;
  status: Status;
  date: string;
  items: OrderItem[];
  total: number;
}

interface OrderAccordionProps {
  orders: OrderDetail[];
  onFinish: (id: string) => void;
  onCancel: (id: string) => void;
}

export default function OrderAccordion({
  orders,
  onFinish,
  onCancel,
}: OrderAccordionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (orders.length === 0) {
    return (
      <div className="text-center py-5 bg-light rounded-3 text-muted" style={{ fontSize: "13px" }}>
        <i className="bi bi-inbox d-block fs-3 mb-2"></i>
        Tidak ada pesanan pada status ini.
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {orders.map((order) => {
        const isExpanded = expandedId === order.id;
        const isPending = order.status === "pending";
        const isProcessing = order.status === "diproses";
        const isCancelled = order.status === "batal";
        const isFinished = order.status === "selesai";

        return (
          <div 
            key={order.id} 
            className="card border-0 shadow-sm transition-all"
            style={{ 
              borderRadius: "14px",
              boxShadow: isExpanded ? "0 8px 24px var(--color-shadow-hover)" : "0 2px 8px var(--color-shadow)"
            }}
          >
            <div className="card-body p-3">
              {/* Header (Always Visible) */}
              <div 
                className="d-flex justify-content-between align-items-center cursor-pointer"
                onClick={() => toggleExpand(order.id)}
                style={{ cursor: "pointer" }}
              >
                <div className="d-flex align-items-center gap-2.5">
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                    style={{ width: "38px", height: "38px", fontSize: "15px", ...avatarStyle(order.customer) }}
                  >
                    {order.customer.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="fw-semibold text-dark" style={{ fontSize: "13px" }}>
                      {order.customer}
                    </div>
                    <small className="text-muted" style={{ fontSize: "11px" }}>
                      #{order.orderCode} • {order.date}
                    </small>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <a
                    href={`https://wa.me/${order.customer_phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="btn btn-sm p-1 text-success d-flex align-items-center justify-content-center"
                    aria-label="Hubungi pelanggan"
                  >
                    <i className="bi bi-whatsapp fs-5"></i>
                  </a>
                  <i className={`bi bi-chevron-${isExpanded ? "up" : "down"} text-muted`} style={{ fontSize: "12px" }}></i>
                </div>
              </div>

              {/* Status Badge & Summary (Collapsed) */}
              {!isExpanded && (
                <div className="d-flex justify-content-between align-items-center mt-2.5 pt-2 border-top">
                  <StatusBadge status={order.status} />
                  <span className="fw-bold text-dark" style={{ fontSize: "13px" }}>
                    Rp {order.total.toLocaleString("id-ID")}
                  </span>
                </div>
              )}

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-top transition-all">
                  {/* Status Badge */}
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="text-muted" style={{ fontSize: "12px" }}>Status Pesanan:</span>
                    <StatusBadge status={order.status} />
                  </div>

                  {/* Detail Item Belanja */}
                  <div className="bg-light p-2.5 rounded-3 mb-3" style={{ fontSize: "12px" }}>
                    <div className="fw-semibold text-dark mb-1.5" style={{ fontSize: "12px" }}>Item Pesanan:</div>
                    <div className="d-flex flex-column gap-1.5">
                      {order.items.map((item, index) => {
                        const price = item.price ?? (order.total / item.qty); // fallback
                        return (
                          <div key={index} className="d-flex justify-content-between align-items-start">
                            <span className="text-muted">
                              • {item.qty}x {item.name}
                            </span>
                            <span className="text-dark fw-medium">
                              Rp {(price * item.qty).toLocaleString("id-ID")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="d-flex justify-content-between align-items-center border-top mt-2 pt-2 fw-bold text-dark">
                      <span>Total Tagihan:</span>
                      <span>Rp {order.total.toLocaleString("id-ID")}</span>
                    </div>
                  </div>

                  {/* Stepper Timeline Tracker */}
                  <div className="mb-3">
                    <div className="fw-semibold text-dark mb-2" style={{ fontSize: "12px" }}>Progres Pesanan:</div>
                    
                    {isCancelled ? (
                      <div className="alert alert-danger py-2 px-3 border-0 d-flex align-items-center gap-2" style={{ fontSize: "11px", borderRadius: "8px" }}>
                        <i className="bi bi-x-circle-fill"></i>
                        <span>Pesanan telah dibatalkan</span>
                      </div>
                    ) : (
                      <div className="position-relative ps-4 d-flex flex-column gap-3.5 py-1" style={{ fontSize: "11px" }}>
                        {/* Vertical line connector */}
                        <div 
                          className="position-absolute" 
                          style={{ 
                            left: "8px", 
                            top: "8px", 
                            bottom: "8px", 
                            width: "2px", 
                            background: "var(--color-border)",
                            zIndex: 1
                          }}
                        />

                        {/* Step 1: Diterima */}
                        <div className="d-flex align-items-center gap-2.5 position-relative" style={{ zIndex: 2 }}>
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center text-white"
                            style={{ 
                              width: "18px", 
                              height: "18px", 
                              background: "var(--color-primary)",
                              fontSize: "9px"
                            }}
                          >
                            <i className="bi bi-check"></i>
                          </div>
                          <span className="fw-semibold text-dark">Pesanan Diterima</span>
                        </div>

                        {/* Step 2: Konfirmasi Pembayaran */}
                        <div className="d-flex align-items-center gap-2.5 position-relative" style={{ zIndex: 2 }}>
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center text-white"
                            style={{ 
                              width: "18px", 
                              height: "18px", 
                              background: (isProcessing || isFinished) ? "var(--color-primary)" : "var(--color-text-muted)",
                              fontSize: "9px"
                            }}
                          >
                            {(isProcessing || isFinished) ? <i className="bi bi-check"></i> : <div style={{ width: 4, height: 4, borderRadius: "50%", background: "white" }}></div>}
                          </div>
                          <span className={(isProcessing || isFinished) ? "fw-semibold text-dark" : "text-muted"}>Pembayaran Dikonfirmasi</span>
                        </div>

                        {/* Step 3: Diproses */}
                        <div className="d-flex align-items-center gap-2.5 position-relative" style={{ zIndex: 2 }}>
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center text-white"
                            style={{ 
                              width: "18px", 
                              height: "18px", 
                              background: isFinished ? "var(--color-primary)" : isProcessing ? "var(--color-blue)" : "var(--color-text-muted)",
                              fontSize: "9px"
                            }}
                          >
                            {isFinished ? <i className="bi bi-check"></i> : <div style={{ width: 4, height: 4, borderRadius: "50%", background: "white" }}></div>}
                          </div>
                          <span className={(isProcessing || isFinished) ? "fw-semibold text-dark" : "text-muted"}>
                            {isFinished ? "Pesanan Diproses" : isProcessing ? "Sedang Diproses/Memasak" : "Pesanan Diproses"}
                          </span>
                        </div>

                        {/* Step 4: Selesai */}
                        <div className="d-flex align-items-center gap-2.5 position-relative" style={{ zIndex: 2 }}>
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center text-white"
                            style={{ 
                              width: "18px", 
                              height: "18px", 
                              background: isFinished ? "var(--color-accent)" : "var(--color-text-muted)",
                              fontSize: "9px"
                            }}
                          >
                            {isFinished ? <i className="bi bi-check"></i> : <div style={{ width: 4, height: 4, borderRadius: "50%", background: "white" }}></div>}
                          </div>
                          <span className={isFinished ? "fw-semibold text-dark" : "text-muted"}>Pesanan Selesai / Siap</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Area */}
                  {(isPending || isProcessing) && (
                    <div className="d-flex gap-2 border-top pt-3 mt-3">
                      {isProcessing && (
                        <button
                          className="btn btn-success flex-grow-1 fw-semibold d-flex align-items-center justify-content-center gap-1.5"
                          style={{ fontSize: "12px", borderRadius: "8px", background: "var(--color-accent)", border: "none" }}
                          onClick={() => onFinish(order.id)}
                        >
                          <i className="bi bi-check-lg"></i>
                          Selesai Diproses
                        </button>
                      )}
                      
                      <button
                        className="btn btn-outline-danger flex-grow-1 fw-semibold d-flex align-items-center justify-content-center gap-1.5"
                        style={{ fontSize: "12px", borderRadius: "8px" }}
                        onClick={() => {
                          if (confirm("Apakah Anda yakin ingin membatalkan pesanan ini?")) {
                            onCancel(order.id);
                          }
                        }}
                      >
                        <i className="bi bi-x-circle"></i>
                        Batalkan Pesanan
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
