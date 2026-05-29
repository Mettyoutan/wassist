export async function handleBrowseIntent(tenant, senderPhone, session) {
  const catalogId = process.env.META_CATALOG_ID;

  if (catalogId) {
    // Kirim WA Catalog visual
    await sendCatalogMessage(senderPhone, catalogId,
      "Ini koleksi Olshop Kak Nina 🛍️ Tap produk untuk order!"
    );
  } else {
    // Fallback: teks daftar produk
    const products = await getActiveProducts(tenant.id);
    const list = products.map(p =>
      `• ${p.name} — Rp${p.price.toLocaleString("id-ID")}`
    ).join("\n");
    await sendWhatsAppMessage(senderPhone,
      `Halo! Ini koleksi kami:\n\n${list}\n\nBalas dengan nama produk + jumlah untuk order. Contoh: *Kaos Oversize 2*`
    );
  }
}