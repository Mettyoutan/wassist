import { NextResponse } from "next/server";
import { getOrdersByTenant } from "@/server/db";
import type { DbOrder } from "@/lib/types/db";

function mapStatus(dbStatus: DbOrder["status"]): "pending" | "diproses" | "selesai" | "batal" {
  switch (dbStatus) {
    case "PENDING":
    case "AWAITING_PAYMENT":
    case "CONFIRMED":
      return "pending";
    case "PAID":
    case "FULFILLED":
      return "diproses";
    case "CANCELLED":
      return "batal";
    case "DONE":
    default:
      return "selesai";
  }
}

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

export async function GET() {
  const tenantId = process.env.DEMO_TENANT_ID;
  if (!tenantId) return NextResponse.json({ error: "DEMO_TENANT_ID not set" }, { status: 500 });

  const raw = await getOrdersByTenant(tenantId);

  const orders = raw
    .map((o) => {
      const orderCode = o.midtrans_id ?? o.id.slice(-6).toUpperCase();
      return {
        id:        o.id,
        order_id:  o.id,
        orderCode,
        customer:       o.customer_name,
        customer_phone: o.customer_phone,
        status:    mapStatus(o.status),
        date:      fmt.format(new Date(o.created_at)),
        total:     o.total_amount,
        items:     o.items.map((i) => ({ name: i.product_name, qty: i.qty, price: i.price_at_order })),
      };
    });

  return NextResponse.json({ orders });
}
