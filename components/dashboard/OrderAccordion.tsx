import StatusBadge from './StatusBadge'

type Status = 'diproses' | 'pending' | 'lunas' | 'selesai'

interface OrderItem {
  name: string
  qty: number
}

interface OrderDetail {
  id: string
  orderCode: string
  customer: string
  status: Status
  date: string
  items: OrderItem[]
  total: number
  timeline: string[]
}

interface OrderAccordionProps {
  orders: OrderDetail[]
}

export default function OrderAccordion({ orders }: OrderAccordionProps) {
  return (
    <div className="d-flex flex-column gap-2">
      {orders.map((order, i) => (
        <div key={order.id} className="card border-0 shadow-sm">
          <div
            className="card-header bg-white d-flex justify-content-between align-items-center py-2 px-3"
            data-bs-toggle="collapse"
            data-bs-target={`#order-${i}`}
            style={{ cursor: 'pointer', fontSize: '13px' }}
          >
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-grid-3x3-gap text-muted"></i>
              <span className="fw-semibold">{order.customer} - #{order.orderCode}</span>
            </div>
            <i className="bi bi-chevron-down text-muted"></i>
          </div>

          <div id={`order-${i}`} className={i === 0 ? 'collapse show' : 'collapse'}>
            <div className="card-body p-3">
              {/* Status & Tanggal */}
              <div className="d-flex justify-content-between align-items-center mb-2">
                <StatusBadge status={order.status} />
                <div className="d-flex gap-2">
                  <button className="btn btn-sm p-0 text-success">
                    <i className="bi bi-whatsapp fs-5"></i>
                  </button>
                </div>
              </div>
              <small className="text-muted d-block mb-2">{order.date}</small>

              {/* Item pesanan */}
              <div className="mb-2">
                {order.items.map((item, j) => (
                  <div key={j} className="text-muted" style={{ fontSize: '12px' }}>
                    • {item.qty}x {item.name}
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="d-flex justify-content-between align-items-center border-top pt-2 mb-3">
                <span style={{ fontSize: '12px' }}></span>
                <span className="fw-semibold" style={{ fontSize: '13px' }}>
                  Rp {order.total.toLocaleString('id-ID')}
                </span>
              </div>

              {/* Timeline */}
              <div className="d-flex flex-column gap-1">
                {order.timeline.map((step, k) => (
                  <div key={k} className="d-flex align-items-start gap-2" style={{ fontSize: '12px' }}>
                    <i className={`bi ${k < order.timeline.length - 1 ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} mt-1`} style={{ fontSize: '10px' }}></i>
                    <span className={k < order.timeline.length - 1 ? '' : 'text-muted'}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}