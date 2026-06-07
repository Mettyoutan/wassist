"use client";
import { useEffect, useState } from "react";

type TenantInfo = {
  name: string;
  ownerPhone: string;
  category: string;
};

function formatPhone(raw: string): string {
  if (raw.startsWith("62")) {
    const digits = raw.slice(2);
    return "+62 " + digits.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");
  }
  return raw;
}

export default function AccountPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/tenant")
      .then((r) => r.json())
      .then((data) => setTenant(data))
      .catch((err) => console.error("[Account] fetch error:", err));
  }, []);

  const name     = tenant?.name     ?? "—";
  const phone    = tenant?.ownerPhone ? formatPhone(tenant.ownerPhone) : "—";
  const category = tenant?.category  ?? "—";

  return (
    <div className="p-3">
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body p-3">
          <div className="d-flex align-items-center gap-3 mb-3">
            <div
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: 56, height: 56,
                background: "var(--color-primary)",
                color: "white",
                fontSize: "24px",
              }}
            >
              <i className="bi bi-shop" />
            </div>
            <div>
              <div className="fw-bold" style={{ fontSize: "16px" }}>{name}</div>
              <small className="text-muted" style={{ textTransform: "capitalize" }}>{category}</small>
            </div>
          </div>
          <div className="d-flex flex-column gap-2">
            {[
              { icon: "bi-whatsapp", label: "Nomor WA",  value: phone },
              { icon: "bi-geo-alt",  label: "Platform",  value: "WhatsApp Business" },
              { icon: "bi-cpu",      label: "AI Engine", value: "Gemini Flash Lite" },
            ].map(({ icon, label, value }) => (
              <div key={label} className="d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
                <i className={`bi ${icon} text-muted`} style={{ width: 18 }} />
                <span className="text-muted">{label}:</span>
                <span className="fw-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-3 text-center">
          <i
            className="bi bi-person-gear mb-2 d-block"
            style={{ fontSize: "32px", color: "var(--color-text-muted)" }}
          />
          <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
            Manajemen akun lanjutan segera hadir.
          </p>
        </div>
      </div>
    </div>
  );
}
