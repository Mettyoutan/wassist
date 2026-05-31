import {
  getUserIdByPhone,
  createOrder,
  updateOrderMidtrans,
}                                                    from "@/server/db";
import { createQrisPayment }                         from "@/lib/midtrans";
import {
  sendWhatsAppMessage,
  uploadWhatsAppMedia,
  sendWhatsAppImageMessage,
}                                                    from "@/lib/whatsapp";
import { setSession }                                from "@/lib/session";
import { paymentLinkMessage }                        from "@/lib/response-template";
import type { DbTenant }                             from "@/lib/types/db";
import type { Session }                              from "@/lib/types/session";

export async function processOrderConfirmation(
  tenant:      DbTenant,
  senderPhone: string,
  session:     Session
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

  // 2. Buat order di DB
  const { orderId } = await createOrder(tenant.id, userId, items, total);

  // 3. Charge Midtrans QRIS
  const { midtransId, paymentUrl, qrImageUrl } = await createQrisPayment({
    totalAmount:   total,
    customerPhone: senderPhone,
  });

  // 4. Update order dengan data Midtrans
  await updateOrderMidtrans(orderId, midtransId, paymentUrl);

  // 5. Kirim QR image — fallback ke link teks jika gagal
  let qrSent = false;
  if (qrImageUrl) {
    try {
      const imgRes = await fetch(qrImageUrl);
      if (imgRes.ok) {
        const buffer  = Buffer.from(await imgRes.arrayBuffer());
        const mediaId = await uploadWhatsAppMedia(buffer);
        await sendWhatsAppImageMessage(
          senderPhone,
          mediaId,
          `💳 Scan QR untuk bayar kak 😊\n*Total: Rp${total.toLocaleString("id-ID")}*\n_Berlaku 15 menit_`
        );
        qrSent = true;
      }
    } catch (err) {
      console.warn("[confirmOrder] QR image send failed, fallback to link:", err);
    }
  }

  if (!qrSent) {
    await sendWhatsAppMessage(senderPhone, paymentLinkMessage(total, paymentUrl));
  }

  // 6. Notif owner
  const itemSummary = items.map(i => `${i.name} x${i.qty}`).join(", ");
  await sendWhatsAppMessage(
    tenant.owner_phone,
    `🛒 *Order baru!*\nDari: ${senderPhone}\nTotal: *Rp${total.toLocaleString("id-ID")}*\nItem: ${itemSummary}\nOrder ID: ${midtransId}`
  );

  // 7. Update session → awaiting_payment
  setSession(tenant.id, senderPhone, {
    state:            "awaiting_payment",
    current_order_id: orderId,
    retry_count:      0,
    last_updated:     Date.now(),
  });
}
