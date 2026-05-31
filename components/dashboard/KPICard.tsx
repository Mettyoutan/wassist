interface KPICardProps {
  title: string
  value: string
  change: number   // positif = naik, negatif = turun
  icon?: string    // bootstrap icon class
}

export default function KPICard({ title, value, change, icon }: KPICardProps) {
  const isPositive = change >= 0
  return (
    <div className="card border-0 h-100" style={{ background: '#f8f9fa' }}>
      <div className="card-body p-3">
        <div className="d-flex align-items-center gap-2 mb-1">
          {icon && <i className={`bi ${icon} text-muted`} style={{ fontSize: '13px' }}></i>}
          <small className="text-muted" style={{ fontSize: '12px' }}>{title}</small>
        </div>
        <div className="fw-bold" style={{ fontSize: '18px' }}>{value}</div>
        <div className={`d-flex align-items-center gap-1 mt-1 ${isPositive ? 'text-success' : 'text-danger'}`} style={{ fontSize: '11px' }}>
          <i className={`bi ${isPositive ? 'bi-arrow-up' : 'bi-arrow-down'}`}></i>
          <span>{Math.abs(change)}% dibanding kemarin</span>
        </div>
      </div>
    </div>
  )
}