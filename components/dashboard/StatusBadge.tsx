type Status = 'pending' | 'diproses' | 'selesai' | 'batal'

interface StatusBadgeProps {
  status: Status
}

const statusConfig: Record<Status, { label: string; bg: string; color: string }> = {
  pending:  { label: 'Pending',  bg: 'var(--color-warning)', color: 'white' },
  diproses: { label: 'Diproses', bg: 'var(--color-blue)',    color: 'white' },
  selesai:  { label: 'Selesai',  bg: 'var(--color-accent)',  color: 'white' },
  batal:  { label: 'Batal',  bg: 'var(--color-cancelled)',  color: 'white' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span
      className="badge rounded-pill px-2 py-1"
      style={{ fontSize: '11px', background: config.bg, color: config.color }}
    >
      {config.label}
    </span>
  )
}