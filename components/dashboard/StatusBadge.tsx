type Status = 'pending' | 'diproses' | 'selesai'

interface StatusBadgeProps {
  status: Status
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-secondary text-white' },
  diproses: { label: 'Diproses', className: 'bg-warning text-dark' },
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