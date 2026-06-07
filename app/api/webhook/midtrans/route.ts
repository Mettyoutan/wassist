import { NextRequest, NextResponse }          from "next/server";
import {
  getOrderByMidtransId,
  getOrderItemsByOrderId,
  updateOrderStatus,
  getUserById,
  getTenantById,
  decrementProductStock,
}                                              from "@/server/db";
import { verifyMidtransSignature }             from "@/lib/midtrans";
import { sendWhatsAppMessage }                 from "@/lib/whatsapp";
import { paymentSuccessMessage }               from "@/lib/response-template";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      order_id:            string;
      status_code:         string;
      gross_amount:        string;
      signature_key:       string;
      transaction_status:  string;
      fraud_status?:       string;
    };

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
    } = body;

    console.log("[Midtrans webhook] received:", order_id, "| tx_status:", transaction_status);

    // 1. Verifikasi signature — detail log ada di verifyMidtransSignature (hash prefix logged)
    if (!verifyMidtransSignature(order_id, status_code, gross_amount, signature_key)) {
      return NextResponse.json({ status: "ok" });
    }

    // 2. Lookup order
    const order = await getOrderByMidtransId(order_id);
    if (!order) {
      console.warn("[Midtrans] order not found:", order_id);
      return NextResponse.json({ status: "ok" });
    }

    // 3. PAID — capture (kartu kredit) atau settlement (QRIS/transfer)
    // fraud_status tidak ada di QRIS → undefined !== "deny" = true → kondisi lolos ✓
    if (
      (transaction_status === "capture" || transaction_status === "settlement") &&
      fraud_status !== "deny"
    ) {
      // Idempotency guard — Midtrans kadang kirim duplicate notification
      if (order.payment_status === "PAID") {
        console.log("[Midtrans] duplicate notification, order already PAID:", order_id);
        return NextResponse.json({ status: "ok" });
      }

      await updateOrderStatus(order.id, "PAID", "PAID");
      console.log("[Midtrans] order marked PAID:", order_id);

      // Decrement stok per item — getOrderItemsByOrderId sekarang throw on error
      try {
        const items = await getOrderItemsByOrderId(order.id);
        for (const item of items) {
          try {
            await decrementProductStock(item.product_id, item.qty);
          } catch (e) {
            console.error("[Midtrans] decrementProductStock failed for product", item.product_id, e);
          }
        }
      } catch (e) {
        console.error("[Midtrans] getOrderItemsByOrderId failed — stock NOT decremented:", e);
      }

      const orderId = order.midtrans_id ?? order.id;

      // Notif customer
      const customer = await getUserById(order.customer_user_id);
      if (!customer?.phone) {
        console.error("[Midtrans] cannot notify customer — getUserById null, userId:", order.customer_user_id);
      } else {
        const r = await sendWhatsAppMessage(
          customer.phone,
          paymentSuccessMessage(orderId)
        );
        if (!r.success) console.error("[Midtrans] WA to customer failed:", customer.phone, r.error);
        else console.log("[Midtrans] WA customer notified:", customer.phone);
      }

      // Notif owner
      const tenant = await getTenantById(order.tenant_id);
      if (!tenant?.owner_phone) {
        console.error("[Midtrans] cannot notify owner — getTenantById null, tenantId:", order.tenant_id);
      } else {
        const r = await sendWhatsAppMessage(
          tenant.owner_phone,
          `💰 *Pembayaran masuk!*\nOrder: ${orderId}\nTotal: *Rp${order.total_amount.toLocaleString("id-ID")}*`
        );
        if (!r.success) console.error("[Midtrans] WA to owner failed:", tenant.owner_phone, r.error);
        else console.log("[Midtrans] WA owner notified:", tenant.owner_phone);
      }
    }

    // 4. Expired atau dibatalkan
    if (transaction_status === "expire" || transaction_status === "cancel") {
      try {
        await updateOrderStatus(order.id, "CANCELLED");
        console.log("[Midtrans] order cancelled/expired:", order_id);
      } catch (e) {
        console.error("[Midtrans] failed to cancel order:", order_id, e);
        // Tetap 200 — Midtrans tidak boleh retry terus; order perlu manual fix
      }
    }

  } catch (err) {
    // Jangan return non-200 — Midtrans akan retry terus
    console.error("[Midtrans webhook] unhandled error:", err);
  }

  return NextResponse.json({ status: "ok" }); // selalu 200
}
