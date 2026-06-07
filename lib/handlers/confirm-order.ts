import {
  getUserIdByPhone,
  createOrder,
  updateOrderMidtrans,
  deleteOrder,
}                                                    from "@/server/db";
import { createQrisPayment }                         from "@/lib/midtrans";
import {
  sendWhatsAppMessage,
  uploadWhatsAppMedia,
  sendWhatsAppImageMessage,
}                                                    from "@/lib/whatsapp";
import { setSession }                                from "@/lib/session";
import { paymentLinkMessage, qrPaymentCaption, ownerNewOrderMessage } from "@/lib/response-template";
import type { DbTenant }                             from "@/lib/types/db";
import type { Session }                              from "@/lib/types/session";
import QRCode from "qrcode"

export async function processOrderConfirmation(
  tenant:      DbTenant,
  senderPhone: string,
  session:     Session,
  address?:    string
): Promise<void> {
  const pendingOrder = session.pending_order;
  if (!pendingOrder) {
    console.error("[confirmOrder] no pending_order in session for", senderPhone);
    return;
  }

  const { items, total } = pendingOrder;

  // 1. Ambil userId (sudah di-upsert di awal webhook)
  const userId = await getUserIdByPhone(tenant.id, senderPhone);
  if (!userId) {
    console.error("[confirmOrder] userId not found for", senderPhone);
    await sendWhatsAppMessage(senderPhone, "Maaf kak, ada kendala teknis. Coba lagi ya 🙏");
    return;
  }

  // 2. Charge Midtrans QRIS dulu — fast-fail sebelum ada DB side effect.
  const { midtransId, paymentUrl, qrString } = await createQrisPayment({
    totalAmount:   total,
    customerPhone: senderPhone,
  });

  // 3. Buat order di DB (hanya setelah Midtrans berhasil)
  const { orderId } = await createOrder(tenant.id, userId, items, total, address);

  // 4. Update order dengan data Midtrans — rollback order jika gagal (hindari orphan)
  try {
    await updateOrderMidtrans(orderId, midtransId, paymentUrl);
  } catch (err) {
    console.error("[confirmOrder] updateOrderMidtrans failed, rolling back order:", err);
    await deleteOrder(orderId);
    throw err;
  }

  // 5. Generate QR lokal dari qr_string. Jika berhasil, kirim image saja (tanpa teks duplikat).
  // Jika gagal, fallback ke teks paymentLinkMessage.
  let qrSent = false;
  if (qrString) {
    try {
      const qrBuffer = await QRCode.toBuffer(qrString, {
        type:   "png",
        width:  400,
        margin: 2,
        color:  { dark: "#000000", light: "#FFFFFF" },
      });
      console.log("[confirmOrder] QR local generate size:", qrBuffer.length, "bytes");

      const mediaId = await uploadWhatsAppMedia(qrBuffer, "image/png");
      console.log("[confirmOrder] WA media_id:", mediaId);

      const result = await sendWhatsAppImageMessage(
        senderPhone,
        mediaId,
        qrPaymentCaption(total, midtransId)
      );
      qrSent = result.success;
      console.log("[confirmOrder] sendWhatsAppImageMessage result:", result.success);
    } catch (err) {
      console.warn("[confirmOrder] QR image send failed:", err);
    }
  }

  // Kirim teks hanya jika QR image gagal — hindari pesan duplikat
  if (!qrSent) {
    await sendWhatsAppMessage(senderPhone, paymentLinkMessage(total, paymentUrl, midtransId));
  }

  // 6. Update session → awaiting_payment (sebelum notif owner — agar state konsisten meski notif gagal)
  setSession(tenant.id, senderPhone, {
    state:                 "awaiting_payment",
    current_order_id:      orderId,
    pending_order:         undefined,
    pending_saved_address: undefined,
    retry_count:           0,
    last_updated:          Date.now(),
  });

  // 7. Notif owner — best-effort, jangan abort flow jika gagal
  const itemSummary = items.map(i => `${i.name} x${i.qty}`).join(", ");
  sendWhatsAppMessage(
    tenant.owner_phone,
    ownerNewOrderMessage(senderPhone, total, itemSummary, midtransId, address)
  ).catch((err) => console.error("[confirmOrder] owner notification failed:", err));
}
