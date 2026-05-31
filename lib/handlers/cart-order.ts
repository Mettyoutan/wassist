import { getProductByRetailerId }  from "@/server/db";
import { sendWhatsAppMessage }     from "@/lib/whatsapp";
import { setSession }              from "@/lib/session";
import { storeClosedMessage }      from "@/lib/response-template";
import type { DbTenant }           from "@/lib/types/db";
import type { WAOrderMessage }     from "@/lib/types/whatsapp";
import type { PendingOrderItem }   from "@/lib/types/session";

// Cart dari WA Catalog — message.type === "order"
// item_price dari Meta SELALU stale → re-fetch harga dari DB via meta_retailer_id
export async function handleCartOrder(
  tenant:      DbTenant,
  senderPhone: string,
  message:     WAOrderMessage
): Promise<void> {
  if (!tenant.is_open) {
    await sendWhatsAppMessage(senderPhone, storeClosedMessage(tenant.closed_until));
    return;
  }

  const resolvedItems: PendingOrderItem[] = [];
  const errors: string[] = [];

  for (const cartItem of message.order.product_items) {
    const product = await getProductByRetailerId(tenant.id, cartItem.product_retailer_id);

    if (!product) {
      errors.push(`Produk "${cartItem.product_retailer_id}" tidak ditemukan`);
      continue;
    }

    if (product.stock < cartItem.quantity) {
      errors.push(`${product.name} (stok hanya ${product.stock} ${product.unit})`);
      continue;
    }

    resolvedItems.push({
      product_id: product.id,
      name:       product.name,
      qty:        cartItem.quantity,
      unit:       product.unit,
      size:       "",
      notes:      "",
      price:      product.price,
      subtotal:   product.price * cartItem.quantity,
    });
  }

  if (resolvedItems.length === 0) {
    await sendWhatsAppMessage(
      senderPhone,
      errors.length > 0
        ? `Maaf kak, ada kendala dengan pesananmu:\n${errors.map(e => `• ${e}`).join("\n")}\n\nSilakan hubungi toko ya 🙏`
        : "Pesananmu kosong, silakan pilih produk lagi dari katalog 😊"
    );
    return;
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);

  const itemLines = resolvedItems
    .map(i => `• ${i.name} ${i.qty} ${i.unit} = Rp${i.subtotal.toLocaleString("id-ID")}`)
    .join("\n");

  const warningBlock = errors.length > 0
    ? `⚠️ Beberapa produk tidak tersedia:\n${errors.map(e => `• ${e}`).join("\n")}\n\n`
    : "";

  await sendWhatsAppMessage(
    senderPhone,
    `${warningBlock}✅ Pesananmu dari katalog:\n\n${itemLines}\n\n*Total: Rp${total.toLocaleString("id-ID")}*\n\nKonfirmasi? Balas *ya* untuk bayar atau *batal* 😊`
  );

  setSession(tenant.id, senderPhone, {
    state:         "awaiting_confirmation",
    pending_order: { items: resolvedItems, total },
    retry_count:   0,
    last_updated:  Date.now(),
  });
}
