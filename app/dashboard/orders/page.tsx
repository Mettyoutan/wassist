"use client";

import OrderAccordion from "@/components/dashboard/OrderAccordion";
import { useState, useEffect, useCallback } from "react";

type Status = "pending" | "diproses" | "selesai";
type FilterTab = Status;

interface OrderDetail {
  id: string;
  orderCode: string;
  customer: string;
  customer_phone: string;
  status: Status;
  date: string;
  items: { name: string; qty: number }[];
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

  const statusCount = {
    pending:  orders.filter((o) => o.status === "pending").length,
    diproses: orders.filter((o) => o.status === "diproses").length,
    selesai:  orders.filter((o) => o.status === "selesai").length,
  };

  const filteredDetails = orders.filter((o) => o.status === activeTab);

  const tabLabels: Record<FilterTab, string> = {
    pending:  "Pending",
    diproses: "Diproses",
    selesai:  "Selesai",
  };

  return (
    <div className="card border-0 shadow-sm">
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
            <div className="row g-2 text-center">
              <div className="col-4">
                <div className="rounded-3 py-2" style={{ background: "#fef9c3" }}>
                  <div className="fw-bold text-warning" style={{ fontSize: "20px" }}>
                    {statusCount.pending}
                  </div>
                  <small className="text-warning">Pending</small>
                </div>
              </div>
              <div className="col-4">
                <div className="rounded-3 py-2" style={{ background: "#fee2e2" }}>
                  <div className="fw-bold text-danger" style={{ fontSize: "20px" }}>
                    {statusCount.diproses}
                  </div>
                  <small className="text-danger">Diproses</small>
                </div>
              </div>
              <div className="col-4">
                <div className="rounded-3 py-2" style={{ background: "#dcfce7" }}>
                  <div className="fw-bold text-success" style={{ fontSize: "20px" }}>
                    {statusCount.selesai}
                  </div>
                  <small className="text-success">Selesai</small>
                </div>
              </div>
            </div>

            <div className="fw-semibold mb-2 mt-3" style={{ fontSize: "14px" }}>
              Ringkasan Pesanan
            </div>

            <div
              className="d-flex gap-1 mb-3 overflow-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {(["pending", "diproses", "selesai"] as FilterTab[]).map((tab) => (
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

            <OrderAccordion orders={filteredDetails} onFinish={finishHandler} />
          </>
        )}
      </div>
    </div>
  );
}
