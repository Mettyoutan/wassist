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
    PENDING:           "Pesananmu masih menunggu konfirmasi 🕐",
    CONFIRMED:         "Pesananmu sudah dikonfirmasi dan sedang dipersiapkan 👍",
    AWAITING_PAYMENT:  "Pesananmu menunggu pembayaran 💳 Silakan scan QR yang sudah dikirim ya kak.",
    PAID:              "Pembayaran diterima! Pesananmu sedang diproses 🎉",
    FULFILLED:         "Pesananmu sedang dalam pengiriman 🚚",
    DONE:              "Pesananmu sudah selesai. Terima kasih! 💚",
    CANCELLED:         "Pesananmu dibatalkan.",
  };

  // Tampilkan midtrans_id jika ada (format WA-XXXXX), fallback ke UUID slice
  const displayId = order?.midtrans_id ?? order?.id.slice(-6).toUpperCase() ?? "-";

  const msg = order
    ? `📦 Status Order \`${displayId}\`:\n${statusMessages[order.status] ?? order.status}`
    : "Kamu belum punya pesanan aktif. Ketik *menu* untuk melihat koleksi kami 😊";

  await sendWhatsAppMessage(senderPhone, msg);
}
