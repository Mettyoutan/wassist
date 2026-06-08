"use client";

interface ToastProps {
  message: string;
  type: "success" | "danger" | "warning";
  visible: boolean;
  onHide: () => void;
}

export default function Toast({ message, type, visible, onHide }: ToastProps) {
  if (!visible) return null;

  const bgMap = {
    success: "var(--color-accent)",
    danger:  "var(--color-danger)",
    warning: "var(--color-warning)",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "88px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        minWidth: "220px",
        maxWidth: "90vw",
      }}
    >
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 text-white rounded-3 shadow"
        style={{ background: bgMap[type], fontSize: "13px", fontWeight: 500 }}
      >
        <span style={{ flex: 1 }}>{message}</span>
        <button
          onClick={onHide}
          className="btn p-0 border-0 bg-transparent text-white"
          style={{ fontSize: "16px", lineHeight: 1 }}
          aria-label="Tutup"
        >
          ×
        </button>
      </div>
    </div>
  );
}
