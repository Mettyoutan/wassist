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
    console.error(`[WA] sendWhatsAppMessage to=${to} failed:`, err);
    return { success: false, error: err };
  }

  const data = await res.json();
  console.log(`[WA] sendWhatsAppMessage to=${to} success!`)
  return { success: true, message_id: data.messages?.[0]?.id };
}

// Kirim katalog visual WA — customer bisa scroll produk & tap untuk order langsung
// Syarat: catalog sudah di-link ke WABA di Commerce Manager
export async function sendCatalogMessage(
  to: string,
  _catalogId: string,
  bodyText: string,
  thumbnailRetailerId?: string
): Promise<SendMessageResult> {
  const action: Record<string, unknown> = { name: "catalog_message" };
  if (thumbnailRetailerId) {
    action.parameters = { thumbnail_product_retailer_id: thumbnailRetailerId };
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "catalog_message",
      body: { text: bodyText },
      action,
    },
  };
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

// Upload media ke Meta — return media_id yang dipakai sendWhatsAppImageMessage.
// Pakai npm form-data (bukan Web API FormData) agar multipart encoding benar di Node.js.
export async function uploadWhatsAppMedia(imageBuffer: Buffer, contentType = "image/png"): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FormDataNode = require("form-data") as typeof import("form-data");
  const ext  = contentType.includes("jpeg") || contentType.includes("jpg") ? "qris.jpg" : "qris.png";
  const form = new FormDataNode();
  form.append("messaging_product", "whatsapp");
  form.append("file", imageBuffer, { filename: ext, contentType });

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/media`,
    {
      method:  "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer() as unknown as BodyInit,
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
    console.error(`[WA] sendWhatsAppImageMessage to=${to} failed:`, err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}

// Kirim interactive quick-reply buttons — max 3 buttons, title max 20 chars.
export async function sendInteractiveButtons(
  to:      string,
  body:    string,
  buttons: Array<{ id: string; title: string }>,
  footer?: string,
): Promise<SendMessageResult> {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.map(btn => ({
          type: "reply",
          reply: { id: btn.id, title: btn.title },
        })),
      },
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WA] sendInteractiveButtons to=${to} failed:`, err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}

export type ListSection = {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
};

// Kirim WA interactive list message — max 10 rows total, row title max 24 chars.
export async function sendListMessage(
  to:          string,
  body:        string,
  buttonLabel: string,
  sections:    ListSection[],
  footer?:     string,
): Promise<SendMessageResult> {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button: buttonLabel,
        sections,
      },
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WA] sendListMessage to=${to} failed:`, err);
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, message_id: data.messages?.[0]?.id };
}
