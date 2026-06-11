import { getUserIdByPhone, getLatestActiveOrderWithItems } from "@/server/db";
import { sendWhatsAppMessage, sendInteractiveButtons }      from "@/lib/whatsapp";
import { orderStatusMessage, STATUS_QR_BUTTONS }            from "@/lib/response-template";
import { setSession }                                        from "@/lib/session";
import type { DbTenant }                                     from "@/lib/types/db";
import type { Session }                                      from "@/lib/types/session";

export async function handleStatusIntent(
  tenant:      DbTenant,
  senderPhone: string,
  session:     Session,
) {
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

  const displayId  = order.midtrans_id ?? order.id.slice(-6).toUpperCase();
  const statusText = orderStatusMessage(displayId, order.status, order.items, order.total_amount);

  if (order.status === "AWAITING_PAYMENT") {
    // Restore session → awaiting_payment so button taps handled by payment state machine
    setSession(tenant.id, senderPhone, {
      ...session,
      state:            "awaiting_payment",
      current_order_id: order.id,
      last_updated:     Date.now(),
    });
    await sendInteractiveButtons(senderPhone, statusText, [...STATUS_QR_BUTTONS]);
  } else {
    await sendWhatsAppMessage(senderPhone, statusText);
  }
}
