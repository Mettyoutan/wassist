import { getUserIdByPhone,
         getLastCompletedOrderWithItems,
         getProductByName }        from "@/server/db";
import { sendWhatsAppMessage, sendInteractiveButtons } from "@/lib/whatsapp";
import { setSession }              from "@/lib/session";
import {
  orderConfirmationMessage,
  repeatLastNotFoundMessage,
  repeatLastUnavailableMessage,
  storeClosedMessage,
  ORDER_CONFIRM_BUTTONS,
}                                  from "@/lib/response-template";
import type { DbTenant }           from "@/lib/types/db";
import type { Session, PendingOrderItem } from "@/lib/types/session";

export async function handleRepeatLastIntent(
  tenant:      DbTenant,
  senderPhone: string,
  session:     Session
): Promise<void> {
  if (!tenant.is_open) {
    await sendWhatsAppMessage(senderPhone, storeClosedMessage(tenant.closed_until));
    return;
  }

  const userId = await getUserIdByPhone(tenant.id, senderPhone);
  if (!userId) {
    await sendWhatsAppMessage(senderPhone, repeatLastNotFoundMessage());
    return;
  }

  const lastOrder = await getLastCompletedOrderWithItems(tenant.id, userId);
  if (!lastOrder || lastOrder.items.length === 0) {
    await sendWhatsAppMessage(senderPhone, repeatLastNotFoundMessage());
    return;
  }

  const resolvedItems: PendingOrderItem[]  = [];
  const unavailableNames: string[]          = [];
  const adjustedItemNotes: string[]         = [];

  for (const item of lastOrder.items) {
    const product = await getProductByName(tenant.id, item.product_name);
    if (!product || product.stock <= 0) {
      unavailableNames.push(item.product_name);
      continue;
    }

    const qty = Math.min(item.qty, product.stock);
    if (qty < item.qty) {
      adjustedItemNotes.push(`${item.product_name} (${qty} dari ${item.qty} ${product.unit})`);
    }
    resolvedItems.push({
      product_id: product.id,
      name:       item.product_name,
      qty,
      unit:       product.unit,
      size:       item.size ?? "",
      notes:      item.notes ?? "",
      price:      product.price,
      subtotal:   product.price * qty,
    });
  }

  if (resolvedItems.length === 0) {
    await sendWhatsAppMessage(senderPhone, repeatLastUnavailableMessage(unavailableNames));
    return;
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);

  await sendInteractiveButtons(
    senderPhone,
    orderConfirmationMessage(
      resolvedItems,
      total,
      unavailableNames.length > 0 ? unavailableNames : undefined,
      adjustedItemNotes.length > 0 ? adjustedItemNotes : undefined,
    ),
    [...ORDER_CONFIRM_BUTTONS],
  );

  setSession(tenant.id, senderPhone, {
    ...session,
    state:         "awaiting_confirmation",
    pending_order: { items: resolvedItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });
}
