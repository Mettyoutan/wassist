import { sendWhatsAppMessage, sendCatalogMessage } from "@/lib/whatsapp";
import { getActiveProducts, getActiveProductsRich, getFirstProductRetailerId } from "@/server/db";
import { productBrowseMessage } from "@/lib/response-template";

export async function handleBrowseIntent(tenant: { id: string; name: string }, senderPhone: string, _session?: unknown) {
  const catalogId = process.env.META_CATALOG_ID;

  if (catalogId) {
    const thumbnailId = await getFirstProductRetailerId(tenant.id);
    await sendCatalogMessage(
      senderPhone, catalogId,
      `Ini koleksi ${tenant.name} 🛍️ Tap produk untuk order!`,
      thumbnailId ?? undefined
    );
  } else {
    const richProducts = await getActiveProductsRich(tenant.id);
    const grouped: Record<string, typeof richProducts> = {};
    for (const p of richProducts) {
      const cat = p.category ?? "lainnya";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }
    await sendWhatsAppMessage(senderPhone, productBrowseMessage(tenant.name, grouped));
  }
}