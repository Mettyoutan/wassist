import { getProductDetailByName } from "@/server/db";
import { sendWhatsAppMessage, uploadWhatsAppMedia, sendWhatsAppImageMessage } from "@/lib/whatsapp";
import { productDetailMessage } from "@/lib/response-template";

export async function handleProductDetailIntent(
  tenant:       { id: string; name: string },
  senderPhone:  string,
  products:     Array<{ name: string; price: number; unit: string }>,
  productIndex: number
): Promise<void> {
  const candidate = products[productIndex - 1]; // 1-based → 0-based
  if (!candidate) {
    await sendWhatsAppMessage(
      senderPhone,
      "Produk tidak ditemukan kak 🙏 Ketik *menu* untuk lihat koleksi kami."
    );
    return;
  }

  const detail = await getProductDetailByName(tenant.id, candidate.name);
  if (!detail) {
    await sendWhatsAppMessage(
      senderPhone,
      "Produk tidak ditemukan kak 🙏 Ketik *menu* untuk lihat koleksi kami."
    );
    return;
  }

  const caption = productDetailMessage(
    detail.name, detail.price, detail.unit, detail.stock, detail.description
  );

  if (detail.image_url) {
    try {
      const imgRes = await fetch(detail.image_url, { redirect: "follow" });
      if (imgRes.ok) {
        const buffer      = Buffer.from(await imgRes.arrayBuffer());
        const contentType = detail.image_url.toLowerCase().endsWith(".jpg") ||
                            detail.image_url.toLowerCase().endsWith(".jpeg")
                            ? "image/jpeg" : "image/png";
        const mediaId = await uploadWhatsAppMedia(buffer, contentType);
        const result  = await sendWhatsAppImageMessage(senderPhone, mediaId, caption);
        if (result.success) return;
      }
    } catch (err) {
      console.error("[ProductDetail] image send failed:", err);
    }
  }

  // fallback: teks saja jika image_url null atau upload gagal
  await sendWhatsAppMessage(senderPhone, caption);
}
