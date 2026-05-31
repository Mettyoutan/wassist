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

// Upload media ke Meta — return media_id yang dipakai sendWhatsAppImageMessage.
export async function uploadWhatsAppMedia(imageBuffer: Buffer): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "qris.png");

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/media`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
      body:    form,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[WA] uploadWhatsAppMedia failed: ${err}`);
  }

  const data = await res.json();
  return data.id as string;
}

// Kirim gambar ke nomor WA menggunakan media_id dari uploadWhatsAppMedia.
export async function sendWhatsAppImageMessage(
  to:      string,
  mediaId: string,
  caption: string
): Promise<SendMessageResult> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type:  "image",
        image: { id: mediaId, caption },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] sendWhatsAppImageMessage failed:", err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}
