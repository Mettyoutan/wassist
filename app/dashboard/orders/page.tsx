"use client";

import OrderAccordion from "@/components/dashboard/OrderAccordion";
import { useState, useEffect, useCallback } from "react";

type Status = "pending" | "diproses" | "selesai" | "batal";
type FilterTab = Status;

interface OrderDetail {
  id: string;
  orderCode: string;
  customer: string;
  customer_phone: string;
  status: Status;
  date: string;
  items: { name: string; qty: number; price?: number }[];
  total: number;
}

export default function OrderManagement() {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("diproses");
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch (err) {
      console.error("[Orders] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const finishHandler = async (id: string) => {
    try {
      await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish" }),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "selesai" as const } : o))
      );
      setActiveTab("selesai");
    } catch (err) {
      console.error("[Orders] finishHandler error:", err);
    }
  };

  const cancelHandler = async (id: string) => {
    try {
      await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "batal" as const } : o))
      );
      setActiveTab("batal");
    } catch (err) {
      console.error("[Orders] cancelHandler error:", err);
    }
  };

  const statusCount = {
    pending:  orders.filter((o) => o.status === "pending").length,
    diproses: orders.filter((o) => o.status === "diproses").length,
    selesai:  orders.filter((o) => o.status === "selesai").length,
    batal:    orders.filter((o) => o.status === "batal").length,
  };

  const filteredDetails = orders.filter((o) => o.status === activeTab);

  const tabLabels: Record<FilterTab, string> = {
    pending:  "Pending",
    diproses: "Diproses",
    selesai:  "Selesai",
    batal:    "Batal",
  };

  return (
    <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
      <div className="card-body p-3">
        <div className="fw-semibold mb-1" style={{ fontSize: "14px" }}>
          Status Pesanan
        </div>
        <small className="text-muted d-block mb-3">
          Kelola dan lacak seluruh pesanan pelanggan
        </small>

        {loading ? (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-secondary" role="status" />
          </div>
        ) : (
          <>
            <div className="row g-2 text-center mb-3">
              <div className="col-3">
                <div className="rounded-3 py-2" style={{ background: "var(--color-status-pending-bg)" }}>
                  <div className="fw-bold" style={{ fontSize: "18px", color: "var(--color-status-pending-text)" }}>
                    {statusCount.pending}
                  </div>
                  <small className="fw-semibold" style={{ fontSize: "10px", color: "var(--color-status-pending-text)" }}>Pending</small>
                </div>
              </div>
              <div className="col-3">
                <div className="rounded-3 py-2" style={{ background: "var(--color-status-process-bg)" }}>
                  <div className="fw-bold" style={{ fontSize: "18px", color: "var(--color-status-process-text)" }}>
                    {statusCount.diproses}
                  </div>
                  <small className="fw-semibold" style={{ fontSize: "10px", color: "var(--color-status-process-text)" }}>Diproses</small>
                </div>
              </div>
              <div className="col-3">
                <div className="rounded-3 py-2" style={{ background: "var(--color-status-success-bg)" }}>
                  <div className="fw-bold" style={{ fontSize: "18px", color: "var(--color-status-success-text)" }}>
                    {statusCount.selesai}
                  </div>
                  <small className="fw-semibold" style={{ fontSize: "10px", color: "var(--color-status-success-text)" }}>Selesai</small>
                </div>
              </div>
              <div className="col-3">
                <div className="rounded-3 py-2" style={{ background: "var(--color-status-danger-bg)" }}>
                  <div className="fw-bold" style={{ fontSize: "18px", color: "var(--color-status-danger-text)" }}>
                    {statusCount.batal}
                  </div>
                  <small className="fw-semibold" style={{ fontSize: "10px", color: "var(--color-status-danger-text)" }}>Batal</small>
                </div>
              </div>
              <div className="col-3">
                <div className="rounded-3 py-2" style={{ background: "#cdd7d0" }}>
                  <div className="fw-bold text-secondary" style={{ fontSize: "20px" }}>    
                    {statusCount.batal}
                  </div>
                  <small className="text-secondary">Batal</small>
                </div>
              </div>
            </div>

            <div className="fw-semibold mb-2 mt-4" style={{ fontSize: "14px" }}>
              Ringkasan Pesanan
            </div>

            <div
              className="d-flex gap-1.5 mb-3 overflow-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {(["pending", "diproses", "selesai", "batal"] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`btn btn-sm rounded-pill px-3 ${
                    activeTab === tab ? "btn-dark" : "btn-outline-secondary"
                  }`}
                  style={{ fontSize: "12px", whiteSpace: "nowrap" }}
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>

            <OrderAccordion 
              orders={filteredDetails} 
              onFinish={finishHandler} 
              onCancel={cancelHandler}
            />
          </>
        )}
      </div>
    </div>
  );
}
