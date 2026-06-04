import StatusBadge from "./StatusBadge";

type Status = "pending" | "diproses" | "selesai";

interface OrderItem {
  name: string;
  qty: number;
}

interface OrderDetail {
  id: string;
  orderCode: string;
  customer: string;
  status: Status;
  date: string;
  items: OrderItem[];
  total: number;
}

interface OrderAccordionProps {
  orders: OrderDetail[];
  onFinish: (id: string) => void;
}

export default function OrderAccordion({
  orders,
  onFinish,
}: OrderAccordionProps) {
  return (
    <div className="d-flex flex-column gap-2">
      {orders.map((order) => (
        <div key={order.id} className="card border-0 shadow-sm">
          <div className="card-body p-3">
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-grid-3x3-gap text-muted"></i>
                <span className="fw-semibold" style={{ fontSize: "13px" }}>
                  {order.customer} - #{order.orderCode}
                </span>
              </div>
              <a
                href={`https://wa.me/${order.customer.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm p-0 text-success"
              >
                <i className="bi bi-whatsapp fs-5"></i>
              </a>
            </div>

            {/* Status & Tanggal */}
            <div className="d-flex justify-content-between align-items-center mb-1">
              <StatusBadge status={order.status} />
              <small className="text-muted">{order.date}</small>
            </div>

            {/* Item pesanan */}
            <div className="mb-2 mt-2">
              {order.items.map((item, j) => (
                <div
                  key={j}
                  className="text-muted"
                  style={{ fontSize: "12px" }}
                >
                  • {item.qty}x {item.name}
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="d-flex justify-content-end border-top pt-2">
              <span className="fw-semibold" style={{ fontSize: "13px" }}>
                Rp {order.total.toLocaleString("id-ID")}
              </span>
            </div>

            {order.status === "diproses" && (
              <button
                className="btn btn-sm btn-success"
                style={{
                  fontSize: "12px",
                }}
                onClick={() => onFinish(order.id)}
              >
                Selesai
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
