import type { DbTenant } from "@/lib/types";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function handleHandoffIntent(
  tenant: DbTenant,
  senderPhone: string
): Promise<void> {
  await sendWhatsAppMessage(
    senderPhone,
    "Maaf kak, ada yang perlu dibantu lebih lanjut nih. Admin kami akan segera membalas ya! 🙏"
  );

  await sendWhatsAppMessage(
    tenant.owner_phone,
    `⚠️ Ada pesan dari ${senderPhone} yang perlu ditangani manual.`
  );
}
