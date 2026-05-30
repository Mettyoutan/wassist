// TEMPLATE MESSAGE untukk kurangi beban AI model


export function orderConfirmationMessage(
    items: Array<{ name: string; qty: number; size?: string; subtotal: number }>,
    total: number
): string {
    const itemLines = items
        .map(i => {
            const sizeLabel = i.size ? ` (${i.size})` : "";
            return `• ${i.name}${sizeLabel} x ${i.qty} = Rp${i.subtotal.toLocaleString("id-ID")}`;
        })
        .join("\n");

    return `Oke kak! Ini pesanannya ya:
    
    ${itemLines}
    
    *Total: Rp${total.toLocaleString("id-ID")}*
    
    Mau lanjut bayar? Balas *ya* atau *batal* 😊`;
};


export function paymentLinkMessage(total: number, url: string): string {
    return `💳 *Selesaikan Pembayaran*
    
    Total: Rp${total.toLocaleString("id-ID")}
    Bayar via QRIS → ${url}
    
    _Link berlaku 15 menit_`;
};

// Pembayaran diterima
export function paymentSuccessMessage(orderId: string): string {
  return `✅ *Pembayaran Diterima!*
  
  Order #${orderId} sedang diproses ya kak 🎉
  Nanti kami kabari kalau sudah dikirim!`;
}

// Status order
export const statusMessages: Record<string, string> = {
  PENDING:           "Pesananmu masih menunggu konfirmasi ya kak 🕐",
  AWAITING_PAYMENT:  "Pesananmu belum dibayar nih. Mau link QRIS-nya lagi?",
  PAID:              "Pembayaran sudah kami terima! Lagi diproses kak 🎉",
  FULFILLED:         "Pesananmu sudah dalam pengiriman kak 🚚",
  DONE:              "Pesananmu sudah selesai. Terima kasih ya kak! 💚",
  CANCELLED:         "Pesananmu sudah dibatalkan.",
};
