"use client";
import StatusBadge from "./StatusBadge";
import { useRouter } from "next/navigation";

type Status = "pending" | "diproses" | "selesai" | "batal";

interface Order {
  order_id: string;
  customer: string;
  customer_phone: string;
  total: number;
  status: Status;
}

interface OrderTableProps {
  orders: Order[];
}

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

export default function OrderTable({ orders }: OrderTableProps) {
  const router = useRouter();

  if (orders.length === 0) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-5 text-muted" style={{ fontSize: "13px" }}>
          <i className="bi bi-inbox d-block fs-2 mb-2 opacity-50"></i>
          Belum ada pesanan hari ini
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-0">
        {orders.map((order, i) => (
          <div
            key={order.order_id}
            className="d-flex align-items-center gap-3 px-3 py-2"
            style={{
              borderBottom: i < orders.length - 1 ? "1px solid var(--color-border)" : "none",
            }}
          >
            <div
              className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
              style={{ width: "36px", height: "36px", fontSize: "14px", ...avatarStyle(order.customer) }}
            >
              {order.customer.charAt(0).toUpperCase()}
            </div>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <div className="fw-semibold text-truncate" style={{ fontSize: "13px" }}>
                {order.customer}
              </div>
              <div className="text-muted" style={{ fontSize: "11px" }}>
                Rp {order.total.toLocaleString("id-ID")}
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>
        ))}
        <div className="text-center py-2 border-top">
          <button
            className="btn btn-sm"
            style={{ fontSize: "12px", color: "var(--color-primary)", fontWeight: 500 }}
            onClick={() => router.push("/dashboard/orders")}
          >
            Lihat semua pesanan →
          </button>
        </div>
      </div>
    </div>
  );
}
