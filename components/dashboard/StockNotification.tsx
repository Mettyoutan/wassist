interface StockItem {
  name: string
  stock: number
  soldToday: number
  unit: string
  image: string
  status: 'habis' | 'menipis' | 'aman'
}

interface StockNotificationProps {
  items: StockItem[]
}

const statusConfig = {
  habis:   { label: 'Habis',   bg: '#fff3cd', badge: 'bg-danger' },
  menipis: { label: 'Menipis', bg: '#fff3cd', badge: 'bg-warning text-dark' },
  aman:    { label: 'Aman',    bg: '#f8f9fa', badge: 'bg-success' },
}

export default function StockNotification({ items }: StockNotificationProps) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="fw-semibold" style={{ fontSize: '14px' }}>Pemberitahuan Stok</span>
          <i className="bi bi-three-dots text-muted"></i>
        </div>
        <div className="row g-2">
          {items.map((item, i) => (
            <div key={i} className="col-4">
              <div className="rounded-3 p-2 text-center" style={{ background: statusConfig[item.status].bg, fontSize: '11px' }}>
                {item.image ? (
                  <img src={item.image} alt={item.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' }}/>
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>👗</div>
                )}
                <div className="fw-semibold mt-1" style={{ fontSize: '11px', lineHeight: '1.2' }}>{item.name}</div>
                {item.status === 'habis' ? (
                  <span className="badge bg-danger mt-1" style={{ fontSize: '10px' }}>Habis</span>
                ) : (
                  <div className="text-muted mt-1">Sisa {item.stock}</div>
                )}
                <div className="text-muted mt-1">Terjual {item.soldToday} {item.unit} hari ini</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}