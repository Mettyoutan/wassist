// Di webhook handler, sebelum cek teks:
if (message.type === "order") {
  const items = message.order.product_items.map(item => ({
    product_retailer_id: item.product_retailer_id,  // slug nama produk
    qty: item.quantity,
    price: item.item_price,
  }));

  // Match product_retailer_id ke produk di DB
  // product_retailer_id harus sama dengan slug yang di-upload ke Meta Catalog
  // Contoh: "kaos-oversize-polos" → produk "Kaos Oversize Polos"

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  // Langsung kirim konfirmasi (skip Gemini)
  const summary = items.map(i => `• ${i.product_retailer_id} x${i.qty} = Rp${(i.price * i.qty).toLocaleString("id-ID")}`).join("\n");
  await sendWhatsAppMessage(senderPhone,
    `✅ Pesananmu dari katalog:\n\n${summary}\n\nTotal: Rp${total.toLocaleString("id-ID")}\n\nKonfirmasi? Balas *ya* untuk bayar.`
  );

  setSession(senderPhone, tenant.id, {
    state: "awaiting_confirmation",
    pending_order: { items, total },
    retry_count: 0,
  });
  return;
}