
// Webhook body
export type WAWebhookBody = {
    object: "whatsapp_business_account";
    entry: WAEntry[];
};

export type WAEntry = {
    id: string; // WABA ID
    changes: WAChange[];
};

export type WAChange = {
    value: WAChangeValue;
    field: "messages";
};

export type WAChangeValue = {
    messaging_product: "whatsapp";
    metadata: WAMetadata;
    messages?: WAMessage[];
    statuses?: WAStatus[];
};

export type WAMetadata = {
  display_phone_number: string;
  phone_number_id: string;   // dipakai untuk identifikasi tenant
};

// ─── Message Union ─────────────────────────────────────────────────
// Semua message dari customer masuk lewat sini.
// Gunakan discriminated union — type guard via message.type.
export type WAMessage =
  | WATextMessage
  | WAOrderMessage
  | WAAudioMessage
  | WAImageMessage
  | WAInteractiveMessage
  | WAUnknownMessage;

// Base object yg dibutuhkan beberapa message type
type WAMessageBase = {
  from: string;       // nomor pengirim (E.164 tanpa +, contoh: "6281234567890")
  id: string;         // message ID — pakai untuk deduplication
  timestamp: string;  // unix timestamp string
};

export type WATextMessage = WAMessageBase & {
  type: "text";
  text: { body: string };
};

export type WAOrderMessage = WAMessageBase & {
  type: "order";
  order: {
    catalog_id: string;
    product_items: WAOrderItem[];
  };
};

export type WAOrderItem = {
  product_retailer_id: string; // slug — maps ke products.meta_retailer_id di DB
  quantity: number;
  item_price: number;          // harga dalam Rupiah (integer, bukan float)
  currency: "IDR";
};

export type WAAudioMessage = WAMessageBase & {
  type: "audio";
  audio: { id: string; mime_type: string };
};

export type WAImageMessage = WAMessageBase & {
  type: "image";
  image: { id: string; mime_type: string; caption?: string };
};

export type WAUnknownMessage = WAMessageBase & {
  type: string;  // semua type lain yang tidak ditangani (location, sticker, dll)
};

export type WAInteractiveMessage = WAMessageBase & {
  type: "interactive";
  interactive: {
    type: "button_reply";
    button_reply: {
      id: string;
      title: string;
    };
  };
};

export type WAStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
};

export type SendMessageResult = {
  success:     boolean;
  message_id?: string;
  error?:      string;
};