export type SendMessageResult = {
  success: boolean;
  message_id?: string; // wamid dari Meta response
  error?: string;
};

// Kirim pesan teks biasa ke nomor WhatsApp
export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<SendMessageResult> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] sendWhatsAppMessage failed:", err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}

// Kirim katalog visual WA — customer bisa scroll produk & tap untuk order langsung
// Syarat: catalog sudah di-link ke WABA di Commerce Manager
export async function sendCatalogMessage(
  to: string,
  catalogId: string,
  bodyText: string
): Promise<SendMessageResult> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "catalog_message",
          body: { text: bodyText },
          action: { catalog_id: catalogId }, // catalog ID dari Commerce Manager
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] sendCatalogMessage failed:", err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}

// ----------------------------------------
// Stubs — diimplementasi saat payment flow
// ----------------------------------------

// Terima media(gambar, dll)
// contoh: untuk PNG bukti pembayaran QRIS, dll
export async function uploadWhatsAppMedia(_imageBuffer: Buffer): Promise<string> {
  throw new Error("uploadWhatsAppMedia: not implemented yet");
}

// Kirim media gambar ke nomor WA
// contoh: kirim gambar QRIS ke customer
export async function sendWhatsAppImageMessage(
  _to: string,
  _mediaId: string,
  _caption: string
): Promise<SendMessageResult> {
  throw new Error("sendWhatsAppImageMessage: not implemented yet");
}
