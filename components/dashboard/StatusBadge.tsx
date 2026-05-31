type Status = 'diproses' | 'pending' | 'lunas' | 'selesai'

interface StatusBadgeProps {
  status: Status
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  diproses: { label: 'Diproses', className: 'bg-warning text-dark' },
  pending:  { label: 'Pending',  className: 'bg-secondary text-white' },
  lunas:    { label: 'Lunas',    className: 'bg-success text-white' },
  selesai:  { label: 'Selesai',  className: 'bg-primary text-white' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span className={`badge rounded-pill px-2 py-1 ${config.className}`} style={{ fontSize: '11px' }}>
      {config.label}
    </span>
  )
}