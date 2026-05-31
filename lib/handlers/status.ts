import { getUserIdByPhone, getLatestOrderByCustomer } from "@/server/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function handleStatusIntent(tenant: { id: string }, senderPhone: string) {
  const userId = await getUserIdByPhone(tenant.id, senderPhone);

  if (!userId) {
    await sendWhatsAppMessage(senderPhone, "Kamu belum punya pesanan. Ketik *menu* untuk melihat katalog kami 😊");
    return;
  }

  const order = await getLatestOrderByCustomer(tenant.id, userId);

  const statusMessages: Record<string, string> = {
    PENDING: "Pesananmu masih menunggu konfirmasi 🕐",
    AWAITING_PAYMENT: `Pesananmu menunggu pembayaran.\n💳 ${order?.midtrans_payment_url ?? "Hubungi toko"}`,
    PAID: "Pembayaran diterima! Pesananmu sedang diproses 🎉",
    FULFILLED: "Pesananmu sedang dalam pengiriman 🚚",
    DONE: "Pesananmu sudah selesai. Terima kasih! 💚",
    CANCELLED: "Pesananmu dibatalkan.",
  };

  const msg = order
    ? `📦 Status Order #${order.id.slice(-6).toUpperCase()}:\n${statusMessages[order.status] ?? order.status}`
    : "Kamu belum punya pesanan aktif. Ketik *menu* untuk melihat koleksi kami 😊";

  await sendWhatsAppMessage(senderPhone, msg);
}