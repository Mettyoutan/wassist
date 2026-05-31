import StatusBadge from './StatusBadge'

type Status = 'diproses' | 'pending' | 'lunas' | 'selesai'

interface Order {
  order_id: string
  customer: string
  total: number
  status: Status
}

interface OrderTableProps {
  orders: Order[]
}

export default function OrderTable({ orders }: OrderTableProps) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-0">
        <div className="d-flex justify-content-between align-items-center px-3 pt-3 pb-2">
          <span className="fw-semibold" style={{ fontSize: '14px' }}>Order List</span>
          <span className="badge rounded-pill text-bg-light text-muted border" style={{ fontSize: '11px' }}>
            <i className="bi bi-arrow-down me-1"></i>{orders.length} Pesanan masuk
          </span>
        </div>
        <table className="table table-sm mb-0" style={{ fontSize: '12px' }}>
          <thead className="table-light">
            <tr>
              <th className="ps-3 py-2 fw-semibold text-muted">Customer ID</th>
              <th className="py-2 fw-semibold text-muted">Nama pelanggan</th>
              <th className="py-2 fw-semibold text-muted">Total</th>
              <th className="py-2 fw-semibold text-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.order_id}>
                <td className="ps-3 py-2 text-muted">{order.order_id}</td>
                <td className="py-2">{order.customer}</td>
                <td className="py-2">Rp {order.total.toLocaleString('id-ID')}</td>
                <td className="py-2">
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-center py-2 border-top">
          <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: '12px' }}>
            <i className="bi bi-grid me-1"></i>Kelola Pesanan
          </button>
        </div>
      </div>
    </div>
  )
}