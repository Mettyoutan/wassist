type Status = 
  | 'pending' | 'PENDING'
  | 'diproses' | 'DIPROSES' | 'AWAITING_PAYMENT' | 'confirmed' | 'CONFIRMED'
  | 'selesai' | 'SELESAI' | 'done' | 'DONE' | 'fulfilled' | 'FULFILLED' | 'lunas' | 'LUNAS' | 'PAID' | 'paid'
  | 'batal' | 'BATAL' | 'cancelled' | 'CANCELLED';

interface StatusBadgeProps {
  status: Status | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = (status || '').toLowerCase().trim();

  let label = 'Detail';
  let bg = 'var(--color-bg)';
  let color = 'var(--color-text-muted)';

  if (normalized === 'pending') {
    label = 'Pending';
    bg = 'var(--color-status-pending-bg)';
    color = 'var(--color-status-pending-text)';
  } else if (['diproses', 'diproses', 'awaiting_payment', 'confirmed'].includes(normalized)) {
    label = 'Diproses';
    bg = 'var(--color-status-process-bg)';
    color = 'var(--color-status-process-text)';
  } else if (['selesai', 'done', 'fulfilled', 'lunas', 'paid'].includes(normalized)) {
    label = 'Selesai';
    bg = 'var(--color-status-success-bg)';
    color = 'var(--color-status-success-text)';
  } else if (['batal', 'cancelled'].includes(normalized)) {
    label = 'Batal';
    bg = 'var(--color-status-danger-bg)';
    color = 'var(--color-status-danger-text)';
  }

  return (
    <span
      className="badge rounded-pill px-2.5 py-1 fw-semibold"
      style={{ 
        fontSize: '11px', 
        background: bg, 
        color: color,
        border: `1px solid ${color}22` 
      }}
    >
      {label}
    </span>
  );
}