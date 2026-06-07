import crypto from "crypto";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MidtransClient = require("midtrans-client") as {
  CoreApi: new (config: {
    isProduction: boolean;
    serverKey:    string;
    clientKey:    string;
  }) => {
    charge: (params: unknown) => Promise<Record<string, unknown>>;
  };
};

const coreApi = new MidtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey:    process.env.MIDTRANS_SERVER_KEY!,
  clientKey:    process.env.MIDTRANS_CLIENT_KEY!,
});

function generateMidtransOrderId(): string {
  const ts   = Date.now().toString(36).toUpperCase().slice(-8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `WA-${ts}-${rand}`;
}

export type QrisPaymentResult = {
  midtransId: string;
  paymentUrl: string; // fallback URL jika QR gagal (biasanya kosong untuk QRIS Core API)
  qrImageUrl: string; // URL PNG dari Midtrans actions (sering corrupt di sandbox)
  qrString:   string; // raw QR data — pakai ini untuk generate PNG lokal
};

export async function createQrisPayment(params: {
  totalAmount:   number;
  customerPhone: string;
}): Promise<QrisPaymentResult> {
  const midtransId = generateMidtransOrderId();

  // notification_url override dashboard setting — wajib set agar callback sampai ke server kita
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const notificationUrl = appUrl ? `${appUrl}/api/webhook/midtrans` : undefined;

  const response = await coreApi.charge({
    payment_type: "qris",
    transaction_details: {
      order_id:     midtransId,
      gross_amount: params.totalAmount,
    },
    qris:             { acquirer: "gopay" },
    customer_details: { phone: params.customerPhone },
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
  });
  console.log("[Midtrans] notification_url:", notificationUrl ?? "(not set — using dashboard)");

  const actions  = response.actions as Array<{ name: string; url: string }> | undefined;
  const qrAction = actions?.find(a => a.name === "generate-qr-code");

  const qrString = (response.qr_string as string) ?? "";

  console.log(`Midtrans_order_id: ${midtransId}`)
  console.log("[Midtrans] status:", response.status_code, "| qr_string length:", qrString.length, "| actions:", JSON.stringify(actions));

  return {
    midtransId,
    paymentUrl: (response.redirect_url as string) ?? "",
    qrImageUrl: qrAction?.url ?? "",
    qrString,
  };
}

// SHA512(order_id + status_code + gross_amount + server_key)
export function verifyMidtransSignature(
  orderId:     string,
  statusCode:  string,
  grossAmount: string,
  received:    string
): boolean {
  const key  = process.env.MIDTRANS_SERVER_KEY ?? "";
  const hash = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${key}`)
    .digest("hex");
  const match = hash === received;
  if (!match) {
    console.warn(
      "[Midtrans] signature MISMATCH — possible wrong MIDTRANS_SERVER_KEY.",
      "| order:", orderId,
      "| key present:", !!key,
      "| computed prefix:", hash.slice(0, 16),
      "| received prefix:", received.slice(0, 16),
    );
  }
  return match;
}

export async function getMidtransQrString(orderId: string): Promise<string | null> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  const baseUrl = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  const authHeader = "Basic " + Buffer.from(serverKey + ":").toString("base64");

  try {
    const res = await fetch(`${baseUrl}/v2/${orderId}/status`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.qr_string as string) ?? null;
  } catch (err) {
    console.error("[midtrans] getMidtransQrString failed:", err);
    return null;
  }
}
