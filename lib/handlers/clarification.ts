import { sendWhatsAppMessage }                     from "@/lib/whatsapp";
import { setSession, clearSession }                from "@/lib/session";
import { handleBrowseIntent }                      from "@/lib/handlers/browse";
import { parseClarificationInput }                 from "@/lib/ai/confirmation-parser";
import {
  orderConfirmationMessage,
  variantClarificationMessage,
  quantityClarificationMessage,
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

  const { choice: num, cancel: isCancelled } = await parseClarificationInput(
    msgText,
    kind,
    candidates.length,
    integer_only,
    max_stock,
  );

  if (isCancelled) {
    clearSession(tenant.id, senderPhone);
    await sendWhatsAppMessage(senderPhone, "Pesanan dibatalkan ya kak 👍 Ketik *menu* untuk lihat katalog.");
    return;
  }

  if (kind === "variant") {
    if (Number.isInteger(num) && num >= 1 && num <= candidates.length) {
      const chosen = candidates[num - 1];

      // Qty belum diketahui → tanya qty dulu
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

      // Stok tidak cukup untuk qty yang diminta → tanya qty baru
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

      const newItem: PendingOrderItem = {
        product_id: chosen.product_id,
        name:       chosen.name,
        qty:        knownQty,
        unit:       chosen.unit,
        size,
        notes,
        price:      chosen.price,
        subtotal:   chosen.price * knownQty,
      };
      await finalizeOrder(tenant, senderPhone, resolved, newItem);
      return;
    }

    await handleRetry(tenant, senderPhone, session, clarification.retry_count, () =>
      sendWhatsAppMessage(senderPhone, variantClarificationMessage(candidates, knownQty))
    );
    return;
  }

  // kind === "quantity"
  const prod = candidates[0];
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

    const newItem: PendingOrderItem = {
      product_id: prod.product_id,
      name:       prod.name,
      qty:        num,
      unit:       prod.unit,
      size,
      notes,
      price:      prod.price,
      subtotal:   prod.price * num,
    };
    await finalizeOrder(tenant, senderPhone, resolved, newItem);
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
  tenant:      DbTenant,
  senderPhone: string,
  resolved:    PendingOrderItem[],
  newItem:     PendingOrderItem
): Promise<void> {
  const allItems = [...resolved, newItem];
  const total    = allItems.reduce((sum, i) => sum + i.subtotal, 0);

  setSession(tenant.id, senderPhone, {
    state:         "awaiting_confirmation",
    pending_order: { items: allItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });

  await sendWhatsAppMessage(senderPhone, orderConfirmationMessage(allItems, total));
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
