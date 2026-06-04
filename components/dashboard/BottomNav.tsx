"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Beranda",  href: "/dashboard",           icon: "bi-house-fill",     iconOff: "bi-house"    },
  { label: "Pesanan",  href: "/dashboard/orders",    icon: "bi-bag-fill",       iconOff: "bi-bag"      },
  { label: "Produk",   href: "/dashboard/products",  icon: "bi-box-fill",       iconOff: "bi-box"      },
  { label: "Analitik", href: "/dashboard/analytics", icon: "bi-graph-up-arrow", iconOff: "bi-graph-up" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Navigasi utama">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav__item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <i className={`bi ${active ? tab.icon : tab.iconOff}`} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
