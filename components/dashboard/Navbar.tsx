"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Beranda",         href: "/dashboard",           icon: "bi-house"       },
  { label: "Kelola Pesanan",  href: "/dashboard/orders",    icon: "bi-bag"         },
  { label: "Produk & Stok",   href: "/dashboard/products",  icon: "bi-box"         },
  { label: "Analitik",        href: "/dashboard/analytics", icon: "bi-graph-up"    },
  { label: "Pengaturan Toko", href: "/dashboard/settings",  icon: "bi-shop"        },
  { label: "Pengaturan Akun", href: "/dashboard/account",   icon: "bi-person-gear" },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":           "WAssist",
  "/dashboard/orders":    "Pesanan",
  "/dashboard/products":  "Produk & Stok",
  "/dashboard/analytics": "Analitik",
  "/dashboard/settings":  "Pengaturan",
  "/dashboard/account":   "Akun",
};

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? "WAssist";

  return (
    <>
      {/* Navbar */}
      <nav
        className="d-flex justify-content-between align-items-center px-3 py-2 bg-white border-bottom sticky-top"
        style={{ zIndex: 1050, position: "relative" }}
      >
        {/* Burger Button */}
        <button
          className="btn p-0 border-0 bg-transparent"
          onClick={() => setOpen(true)}
          aria-label="Menu"
        >
          <i className="bi bi-list fs-4 text-dark"></i>
        </button>

        {/* Title */}
        <span
          className="fw-semibold text-center"
          style={{
            position: "absolute",
            left: "50%",
            fontSize: "24px",
            color: "var(--color-primary)",
            transform: "translateX(-50%)",
          }}
        >
          {pageTitle}
        </span>
      </nav>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100vh",
            background: "rgba(0,0,0,0.4)",
            zIndex: 1055,
          }}
        />
      )}

      {/* Drawer Menu */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100vh",
          width: "270px",
          zIndex: 1060,
          background: "white",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.12)" : "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drawer Header */}
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <div
            className="fw-bold"
            style={{
              fontFamily: "Shadows Into Light, cursive",
              fontSize: "24px",
              color: "var(--color-primary)",
            }}
          >
            WASSIST
          </div>
          <button
            className="btn p-0 border-0 bg-transparent"
            onClick={() => setOpen(false)}
          >
            <i className="bi bi-x-lg text-muted fs-5"></i>
          </button>
        </div>

        {/* Menu Items */}
        <div className="flex-grow-1 overflow-auto py-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
                style={{
                  fontSize: "14px",
                  color: isActive ? "var(--color-primary)" : "#374151",
                  background: isActive ? "rgba(7,94,84,0.08)" : "transparent",
                  borderRight: isActive
                    ? "3px solid var(--color-primary)"
                    : "3px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <i
                  className={`bi ${item.icon}`}
                  style={{ fontSize: "17px", width: "20px" }}
                ></i>
                <span>{item.label}</span>
                {isActive && (
                  <i
                    className="bi bi-chevron-right ms-auto text-success"
                    style={{ fontSize: "11px" }}
                  ></i>
                )}
              </Link>
            );
          })}
        </div>

        {/* Drawer Footer */}
        <div className="px-4 py-3 border-top">
          <button
            className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center gap-2"
            style={{ fontSize: "13px" }}
          >
            <i className="bi bi-box-arrow-left"></i>
            Keluar
          </button>
        </div>
      </div>
    </>
  );
}
