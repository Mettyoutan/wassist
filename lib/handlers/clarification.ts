import { sendWhatsAppMessage, sendInteractiveButtons } from "@/lib/whatsapp";
import { setSession, clearSession }                from "@/lib/session";
import { handleBrowseIntent }                      from "@/lib/handlers/browse";
import { parseClarificationInput, type ClarificationChoice } from "@/lib/ai/confirmation-parser";
import {
  orderConfirmationMessage,
  variantClarificationMessage,
  quantityClarificationMessage,
  clarificationOutOfStockMessage,
  orderCancelledMessage,
  ORDER_CONFIRM_BUTTONS,
}                                                  from "@/lib/response-template";
import type { DbTenant }                           from "@/lib/types/db";
import type { Session, PendingOrderItem }          from "@/lib/types/session";

export async function handleClarificationAnswer(
  tenant:      DbTenant,
  senderPhone: string,
  msgText:     string,
  session:     Session
): Promise<void> {
  const clarification = session.pending_clarification;
  if (!clarification) {
    clearSession(tenant.id, senderPhone);
    await handleBrowseIntent(tenant, senderPhone);
    return;
  }

  const { kind, candidates, qty: knownQty, integer_only, max_stock, size, notes, resolved } = clarification;

  const { choices, cancel: isCancelled } = await parseClarificationInput(
    msgText,
    kind,
    candidates,
    integer_only,
    max_stock,
  );

  if (isCancelled) {
    clearSession(tenant.id, senderPhone);
    await sendWhatsAppMessage(senderPhone, orderCancelledMessage());
    return;
  }

  if (kind === "variant") {
    const validChoices = choices.filter(
      (c): c is ClarificationChoice =>
        Number.isInteger(c.index) && c.index >= 1 && c.index <= candidates.length
    );

    if (validChoices.length === 0) {
      await handleRetry(tenant, senderPhone, session, clarification.retry_count, () =>
        sendWhatsAppMessage(senderPhone, variantClarificationMessage(candidates, knownQty))
      );
      return;
    }

    // Multi-select atau single dengan qty langsung → resolve sekaligus
    if (validChoices.length > 1 || (validChoices.length === 1 && validChoices[0].qty !== undefined)) {
      const newItems:     PendingOrderItem[] = [];
      const droppedNames: string[]           = [];

      for (const c of validChoices) {
        const chosen = candidates[c.index - 1];
        const qty    = c.qty ?? knownQty ?? 1;

        if (chosen.stock < qty) {
          droppedNames.push(chosen.name);
          continue;
        }

        newItems.push({
          product_id: chosen.product_id,
          name:       chosen.name,
          qty,
          unit:       chosen.unit,
          size,
          notes,
          price:      chosen.price,
          subtotal:   chosen.price * qty,
        });
      }

      if (newItems.length === 0) {
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(
          senderPhone,
          clarificationOutOfStockMessage()
        );
        return;
      }

      await finalizeOrder(tenant, senderPhone, resolved, newItems, droppedNames);
      return;
    }

    // Single choice tanpa qty → cek stok lalu tanya qty jika perlu
    const chosen = candidates[validChoices[0].index - 1];

    if (knownQty === undefined) {
      const updatedClarification = {
        ...clarification,
        kind:        "quantity" as const,
        candidates:  [chosen],
        qty:         undefined,
        retry_count: 0,
      };
      setSession(tenant.id, senderPhone, {
        state:                 "awaiting_clarification",
        pending_clarification: updatedClarification,
        retry_count:           0,
        last_updated:          Date.now(),
      });
      await sendWhatsAppMessage(
        senderPhone,
        quantityClarificationMessage(chosen.name, chosen.unit, { integerOnly: integer_only })
      );
      return;
    }

    if (chosen.stock < knownQty) {
      const updatedClarification = {
        ...clarification,
        kind:        "quantity" as const,
        candidates:  [chosen],
        qty:         undefined,
        max_stock:   chosen.stock,
        retry_count: 0,
      };
      setSession(tenant.id, senderPhone, {
        state:                 "awaiting_clarification",
        pending_clarification: updatedClarification,
        retry_count:           0,
        last_updated:          Date.now(),
      });
      await sendWhatsAppMessage(
        senderPhone,
        quantityClarificationMessage(chosen.name, chosen.unit, { integerOnly: integer_only, maxStock: chosen.stock })
      );
      return;
    }

    await finalizeOrder(tenant, senderPhone, resolved, [{
      product_id: chosen.product_id,
      name:       chosen.name,
      qty:        knownQty,
      unit:       chosen.unit,
      size,
      notes,
      price:      chosen.price,
      subtotal:   chosen.price * knownQty,
    }]);
    return;
  }

  // kind === "quantity"
  const prod = candidates[0];
  const num  = choices[0]?.qty ?? 0;

  if (num > 0) {
    if (integer_only && !Number.isInteger(num)) {
      await handleRetry(tenant, senderPhone, session, clarification.retry_count, () =>
        sendWhatsAppMessage(
          senderPhone,
          quantityClarificationMessage(prod.name, prod.unit, { integerOnly: true, maxStock: max_stock })
        )
      );
      return;
    }

    if (max_stock !== undefined && num > max_stock) {
      await handleRetry(tenant, senderPhone, session, clarification.retry_count, () =>
        sendWhatsAppMessage(
          senderPhone,
          quantityClarificationMessage(prod.name, prod.unit, { integerOnly: integer_only, maxStock: max_stock })
        )
      );
      return;
    }

    await finalizeOrder(tenant, senderPhone, resolved, [{
      product_id: prod.product_id,
      name:       prod.name,
      qty:        num,
      unit:       prod.unit,
      size,
      notes,
      price:      prod.price,
      subtotal:   prod.price * num,
    }]);
    return;
  }

  await handleRetry(tenant, senderPhone, session, clarification.retry_count, () =>
    sendWhatsAppMessage(
      senderPhone,
      quantityClarificationMessage(prod.name, prod.unit, { integerOnly: integer_only, maxStock: max_stock })
    )
  );
}

async function finalizeOrder(
  tenant:       DbTenant,
  senderPhone:  string,
  resolved:     PendingOrderItem[],
  newItems:     PendingOrderItem[],
  droppedNames: string[] = [],
): Promise<void> {
  const allItems = [...resolved, ...newItems];
  const total    = allItems.reduce((sum, i) => sum + i.subtotal, 0);

  setSession(tenant.id, senderPhone, {
    state:         "awaiting_confirmation",
    pending_order: { items: allItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });

  await sendInteractiveButtons(
    senderPhone,
    orderConfirmationMessage(allItems, total, droppedNames.length > 0 ? droppedNames : undefined),
    [...ORDER_CONFIRM_BUTTONS],
  );
}

async function handleRetry(
  tenant:      DbTenant,
  senderPhone: string,
  session:     Session,
  retryCount:  number,
  askAgain:    () => Promise<unknown>
): Promise<void> {
  if (retryCount >= 1) {
    clearSession(tenant.id, senderPhone);
    await handleBrowseIntent(tenant, senderPhone);
    return;
  }

  setSession(tenant.id, senderPhone, {
    ...session,
    pending_clarification: {
      ...session.pending_clarification!,
      retry_count: retryCount + 1,
    },
    last_updated: Date.now(),
  });

  await askAgain();
}
