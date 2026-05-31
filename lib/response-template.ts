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

export function storeClosedMessage(closedUntil?: string | null): string {
  const until = closedUntil ? ` hingga ${closedUntil}` : "";
  return `Maaf kak, toko kami sedang tutup${until} 🙏 Silakan order lagi nanti ya!`;
}

export function variantClarificationMessage(
  candidates: Array<{ name: string; price: number; unit: string }>,
  qty?: number
): string {
  const qtyLabel = qty !== undefined ? ` (${qty}x)` : "";
  const list = candidates
    .map((c, i) => `${i + 1}. ${c.name}${qtyLabel} — Rp${c.price.toLocaleString("id-ID")}/${c.unit}`)
    .join("\n");
  return `Ada beberapa varian kak, yang mana? 😊\n\n${list}\n\nBalas nomornya ya!`;
}

export function quantityClarificationMessage(
  name: string,
  unit: string,
  opts: { integerOnly?: boolean; maxStock?: number }
): string {
  if (opts.maxStock !== undefined) {
    return `Stok *${name}* tinggal *${opts.maxStock} ${unit}* kak 😊 Mau berapa?`;
  }
  if (opts.integerOnly) {
    return `Berapa *${name}* yang mau dipesan kak? (masukkan angka bulat ya, contoh: 2)`;
  }
  return `Berapa *${name}* yang mau dipesan kak?`;
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
