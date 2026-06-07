import type { DbTenant } from "@/lib/types";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { handoffCustomerMessage, handoffOwnerAlertMessage } from "@/lib/response-template";

export async function handleHandoffIntent(
  tenant: DbTenant,
  senderPhone: string
): Promise<void> {
  await sendWhatsAppMessage(senderPhone, handoffCustomerMessage());
  await sendWhatsAppMessage(tenant.owner_phone, handoffOwnerAlertMessage(senderPhone));
}
