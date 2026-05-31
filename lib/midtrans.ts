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
  paymentUrl: string; // fallback URL jika QR gagal
  qrImageUrl: string; // URL PNG dari Midtrans actions
};

export async function createQrisPayment(params: {
  totalAmount:   number;
  customerPhone: string;
}): Promise<QrisPaymentResult> {
  const midtransId = generateMidtransOrderId();

  const response = await coreApi.charge({
    payment_type: "qris",
    transaction_details: {
      order_id:     midtransId,
      gross_amount: params.totalAmount,
    },
    qris:             { acquirer: "gopay" },
    customer_details: { phone: params.customerPhone },
  });

  const actions  = response.actions as Array<{ name: string; url: string }> | undefined;
  const qrAction = actions?.find(a => a.name === "generate-qr-code");

  return {
    midtransId,
    paymentUrl: (response.redirect_url as string) ?? "",
    qrImageUrl: qrAction?.url ?? "",
  };
}

// SHA512(order_id + status_code + gross_amount + server_key)
export function verifyMidtransSignature(
  orderId:     string,
  statusCode:  string,
  grossAmount: string,
  received:    string
): boolean {
  const key  = process.env.MIDTRANS_SERVER_KEY!;
  const hash = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${key}`)
    .digest("hex");
  return hash === received;
}
