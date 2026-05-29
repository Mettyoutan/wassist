// app/api/webhook/whatsapp/route.ts

import { handleConfirmation } from "@/lib/handlers/order";
import { handleBrowseIntent } from "@/lib/handlers/browse";
import { handleStatusIntent } from "@/lib/handlers/status";
import { handleHandoffIntent } from "@/lib/handlers/human_handoff";
import { handleCartOrder } from "@/lib/handlers/cart";
import { getSession } from "@/lib/session";
import { parseCustomerMessage } from "@/lib/gemini";

export async function POST(req: Request) {
  // ... validasi webhook Meta ...

  const session = await getSession(senderPhone, tenant.id);

  // 1. Cek state session dulu
  if (session.state === "awaiting_confirmation") {
    await handleConfirmation(tenant, senderPhone, session, message);
    return;
  }

  // 2. Cek cart order dari WA Catalog
  if (message.type === "order") {
    await handleCartOrder(tenant, senderPhone, message);
    return;
  }

  // 3. Parse intent via Gemini
  const parsed = await parseCustomerMessage(message.text.body);

  if (parsed.intent === "browse") {
    await handleBrowseIntent(tenant, senderPhone, session);
  } else if (parsed.intent === "order_new") {
    await handleOrderNew(tenant, senderPhone, parsed);
  } else if (parsed.intent === "order_status") {
    await handleStatusIntent(tenant, senderPhone);
  } else {
    await handleHandoffIntent(tenant, senderPhone, session);
  }
}