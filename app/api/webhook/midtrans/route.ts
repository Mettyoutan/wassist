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

    // 1. Verifikasi signature — invalid tetap 200 agar Midtrans tidak retry terus
    if (!verifyMidtransSignature(order_id, status_code, gross_amount, signature_key)) {
      console.warn("[Midtrans] invalid signature for order:", order_id);
      return NextResponse.json({ status: "ok" });
    }

    // 2. Lookup order
    const order = await getOrderByMidtransId(order_id);
    if (!order) {
      console.warn("[Midtrans] order not found:", order_id);
      return NextResponse.json({ status: "ok" });
    }

    // 3. PAID (capture atau settlement, bukan fraud)
    if (
      (transaction_status === "capture" || transaction_status === "settlement") &&
      fraud_status !== "deny"
    ) {
      await updateOrderStatus(order.id, "PAID", "PAID");

      // Decrement stok per item — per-item try/catch agar satu gagal tidak skip sisanya
      const items = await getOrderItemsByOrderId(order.id);
      for (const item of items) {
        try {
          await decrementProductStock(item.product_id, item.qty);
        } catch (e) {
          console.error("[Midtrans] decrementProductStock failed for product", item.product_id, e);
        }
      }

      // Notif customer
      const customer = await getUserById(order.customer_user_id);
      if (customer?.phone) {
        await sendWhatsAppMessage(
          customer.phone,
          paymentSuccessMessage(order.id.slice(-6).toUpperCase())
        );
      }

      // Notif owner
      const tenant = await getTenantById(order.tenant_id);

      if (tenant?.owner_phone) {
        await sendWhatsAppMessage(
          tenant.owner_phone,
          `💰 *Pembayaran masuk!*\nOrder #${order.id.slice(-6).toUpperCase()}\nTotal: *Rp${order.total_amount.toLocaleString("id-ID")}*`
        );
      }
    }

    // 4. Expired atau dibatalkan
    if (transaction_status === "expire" || transaction_status === "cancel") {
      await updateOrderStatus(order.id, "CANCELLED");
    }

  } catch (err) {
    // Jangan return non-200 — Midtrans akan retry terus
    console.error("[Midtrans webhook] unhandled error:", err);
  }

  return NextResponse.json({ status: "ok" }); // selalu 200
}
