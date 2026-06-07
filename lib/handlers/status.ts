import { getUserIdByPhone, getLatestActiveOrderWithItems } from "@/server/db";
import { sendWhatsAppMessage }  from "@/lib/whatsapp";
import { orderStatusMessage }   from "@/lib/response-template";
import type { DbTenant }        from "@/lib/types/db";

export async function handleStatusIntent(tenant: DbTenant, senderPhone: string) {
  const userId = await getUserIdByPhone(tenant.id, senderPhone);

  if (!userId) {
    await sendWhatsAppMessage(senderPhone, "Kamu belum punya pesanan. Ketik *menu* untuk melihat katalog kami 😊");
    return;
  }

  const order = await getLatestActiveOrderWithItems(tenant.id, userId);

  if (!order) {
    await sendWhatsAppMessage(senderPhone, "Kamu belum punya pesanan aktif. Ketik *menu* untuk melihat koleksi kami 😊");
    return;
  }

  const displayId = order.midtrans_id ?? order.id.slice(-6).toUpperCase();
  await sendWhatsAppMessage(
    senderPhone,
    orderStatusMessage(displayId, order.status, order.items, order.total_amount)
  );
}
