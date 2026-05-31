<<<<<<< HEAD
"use client";

import OrderAccordion from "@/components/dashboard/OrderAccordion";
import { useState } from "react";

const dummyOrderDetails = [
    {
        id: "1",
        orderCode: "UMKM082",
        customer: "Salsa",
        status: "diproses" as const,
        date: "Jum, 16 Mei 2025, 12:10",
        items: [
        { name: "Ayam Penyet", qty: 1 },
        { name: "Es Teh Manis", qty: 1 },
        ],
        total: 30000,
    },
    {
        id: "2",
        orderCode: "UMKM083",
        customer: "Kenzi",
        status: "diproses" as const,
        date: "Jum, 16 Mei 2025, 11:45",
        items: [{ name: "Tahu Goreng", qty: 2 }],
        total: 25000,
    },
    {
        id: "3",
        orderCode: "UMKM084",
        customer: "Tasya",
        status: "diproses" as const,
        date: "Jum, 16 Mei 2025, 11:30",
        items: [{ name: "Ayam Penyet", qty: 1 }],
        total: 25000,
    },
    ];

type FilterTab = "pending" | "diproses" | "selesai";

export default function OrderManagement() {
    type Status = "pending" | "diproses" | "selesai";

    interface OrderDetail {
        id: string;
        orderCode: string;
        customer: string;
        status: Status;
        date: string;
        items: { name: string; qty: number }[];
        total: number;   
    }
    
    const [orders, setOrders] = useState<OrderDetail[]>(dummyOrderDetails);
    const [activeTab, setActiveTab] = useState<FilterTab>("diproses");

    const finishHandler = (id: string) => {
        setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "selesai" as const } : o))
        );
        setActiveTab("selesai");
    };

    const statusCount = {
            pending: orders.filter((o) => (o.status as string) === "pending").length,
            diproses: orders.filter((o) => (o.status as string) === "diproses").length,
            selesai: orders.filter((o) => (o.status as string) === "selesai").length,
        };

    const filteredDetails = orders.filter((o) => o.status === activeTab);

    const tabLabels: Record<FilterTab, string> = {
        pending: "Pending",
        diproses: "Diproses",
        selesai: "Selesai",
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
        </div>

        <div className="card-body p-3 pt-0">
            <div className="fw-semibold mb-2" style={{ fontSize: "14px" }}>
            Ringkasan Pesanan
            </div>

            {/* Filter Tabs */}
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

            <OrderAccordion orders={filteredDetails} onFinish={finishHandler}/>
        </div>
        </div>
    );
    }
=======
export default function OrdersPage() {
  return null;
}
>>>>>>> e27bfab813bfe200a0f5d6ab9587fe52db17e319
