import { getProductByName }                        from "@/server/db";
import { sendWhatsAppMessage }                      from "@/lib/whatsapp";
import { setSession }                               from "@/lib/session";
import { handleBrowseIntent }                       from "@/lib/handlers/browse";
import {
  orderConfirmationMessage,
  storeClosedMessage,
  variantClarificationMessage,
  quantityClarificationMessage,
}                                                   from "@/lib/response-template";
import type { DbTenant }                            from "@/lib/types/db";
import type { PendingOrderItem, ClarificationCandidate, PendingClarification } from "@/lib/types/session";
import type { ParsedIntent }                        from "@/lib/ai/customer-parser";

// Unit kontinu: qty boleh desimal. Selain ini → diskret → qty wajib integer.
const CONTINUOUS_UNITS = new Set([
  "kg","g","gram","gr","l","liter","ml","ons","meter","m","cm",
]);

function isDiscreteUnit(unit: string): boolean {
  return !CONTINUOUS_UNITS.has(unit.toLowerCase());
}

type ItemClassification =
  | { kind: "resolved";     item: PendingOrderItem }
  | { kind: "ambiguous";    candidates: ClarificationCandidate[]; qty?: number; size: string; notes: string }
  | { kind: "missing_qty";  candidate: ClarificationCandidate; size: string; notes: string }
  | { kind: "invalid_qty";  candidate: ClarificationCandidate; qty: number; size: string; notes: string }
  | { kind: "out_of_stock"; candidate: ClarificationCandidate; qty: number; size: string; notes: string }
  | { kind: "not_found" };

async function classifyItem(
  tenantId:   string,
  products:   Array<{ name: string; price: number; unit: string }>,
  parsedItem: ParsedIntent["items"][number]
): Promise<ItemClassification> {
  const { product_index, qty, candidate_indices = [], size = "", notes = "" } = parsedItem;

  // Ambiguitas varian — Gemini memberi beberapa kandidat
  if (candidate_indices.length >= 2) {
    const candidateProducts: ClarificationCandidate[] = [];
    for (const idx of candidate_indices) {
      const cached = products[idx - 1];
      if (!cached) continue;
      const db = await getProductByName(tenantId, cached.name);
      if (db) {
        candidateProducts.push({ product_id: db.id, name: cached.name, price: db.price, unit: db.unit, stock: db.stock });
      }
    }
    if (candidateProducts.length >= 2) {
      return { kind: "ambiguous", candidates: candidateProducts, qty, size, notes };
    }
  }

  // Resolve produk tunggal
  const cached = products[product_index - 1];
  if (!cached) return { kind: "not_found" };

  const db = await getProductByName(tenantId, cached.name);
  if (!db) return { kind: "not_found" };

  const candidate: ClarificationCandidate = {
    product_id: db.id, name: cached.name, price: db.price, unit: db.unit, stock: db.stock,
  };
  const discrete = isDiscreteUnit(db.unit);

  if (qty === undefined) {
    return { kind: "missing_qty", candidate, size, notes };
  }

  if (discrete && !Number.isInteger(qty)) {
    return { kind: "invalid_qty", candidate, qty, size, notes };
  }

  if (db.stock < qty) {
    return { kind: "out_of_stock", candidate, qty, size, notes };
  }

  return {
    kind: "resolved",
    item: {
      product_id: db.id,
      name:       cached.name,
      qty,
      unit:       db.unit,
      size,
      notes,
      price:      db.price,
      subtotal:   db.price * qty,
    },
  };
}

export async function handleOrderIntent(
  tenant:      DbTenant,
  senderPhone: string,
  products:    Array<{ name: string; price: number; unit: string }>,
  parsedItems: ParsedIntent["items"]
): Promise<void> {
  if (!tenant.is_open) {
    await sendWhatsAppMessage(senderPhone, storeClosedMessage(tenant.closed_until));
    return;
  }

  if (parsedItems.length === 0) {
    await handleBrowseIntent(tenant, senderPhone);
    return;
  }

  // Merge C2: gabung item dengan product_index + size sama sebelum validasi stok
  const merged = new Map<string, typeof parsedItems[number]>();
  for (const item of parsedItems) {
    const key = `${item.product_index}:${(item.size ?? "").toLowerCase()}`;
    const existing = merged.get(key);
    if (existing && (existing.candidate_indices?.length ?? 0) === 0) {
      merged.set(key, {
        ...existing,
        qty: existing.qty !== undefined && item.qty !== undefined
          ? existing.qty + item.qty
          : existing.qty ?? item.qty,
      });
    } else {
      merged.set(key, item);
    }
  }
  const dedupedItems = Array.from(merged.values());

  const resolvedItems: PendingOrderItem[] = [];
  let clarification: PendingClarification | null = null;

  for (const parsedItem of dedupedItems) {
    const result = await classifyItem(tenant.id, products, parsedItem);

    switch (result.kind) {
      case "resolved":
        resolvedItems.push(result.item);
        break;

      case "not_found":
        break;

      case "ambiguous":
        if (clarification === null) {
          clarification = {
            kind:         "variant",
            candidates:   result.candidates,
            qty:          result.qty,
            integer_only: result.candidates.length > 0 ? isDiscreteUnit(result.candidates[0].unit) : true,
            size:         result.size,
            notes:        result.notes,
            resolved:     resolvedItems.slice(),
            retry_count:  0,
          };
        }
        break;

      case "missing_qty":
        if (clarification === null) {
          clarification = {
            kind:         "quantity",
            candidates:   [result.candidate],
            integer_only: isDiscreteUnit(result.candidate.unit),
            size:         result.size,
            notes:        result.notes,
            resolved:     resolvedItems.slice(),
            retry_count:  0,
          };
        }
        break;

      case "invalid_qty":
        if (clarification === null) {
          clarification = {
            kind:         "quantity",
            candidates:   [result.candidate],
            integer_only: true,
            size:         result.size,
            notes:        result.notes,
            resolved:     resolvedItems.slice(),
            retry_count:  0,
          };
        }
        break;

      case "out_of_stock":
        if (clarification === null) {
          clarification = {
            kind:         "quantity",
            candidates:   [result.candidate],
            integer_only: isDiscreteUnit(result.candidate.unit),
            max_stock:    result.candidate.stock,
            size:         result.size,
            notes:        result.notes,
            resolved:     resolvedItems.slice(),
            retry_count:  0,
          };
        }
        break;
    }
  }

  if (clarification !== null) {
    setSession(tenant.id, senderPhone, {
      state:                 "awaiting_clarification",
      pending_clarification: clarification,
      retry_count:           0,
      last_updated:          Date.now(),
    });

    const { kind, candidates, qty, integer_only, max_stock } = clarification;
    if (kind === "variant") {
      await sendWhatsAppMessage(senderPhone, variantClarificationMessage(candidates, qty));
    } else {
      const prod = candidates[0];
      await sendWhatsAppMessage(
        senderPhone,
        quantityClarificationMessage(prod.name, prod.unit, { integerOnly: integer_only, maxStock: max_stock })
      );
    }
    return;
  }

  if (resolvedItems.length === 0) {
    await handleBrowseIntent(tenant, senderPhone);
    return;
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);
  await sendWhatsAppMessage(senderPhone, orderConfirmationMessage(resolvedItems, total));
  setSession(tenant.id, senderPhone, {
    state:         "awaiting_confirmation",
    pending_order: { items: resolvedItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });
}
