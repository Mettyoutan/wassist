// TEMPLATE MESSAGE untukk kurangi beban AI model


export function orderConfirmationMessage(
    items: Array<{ name: string; qty: number; size?: string; subtotal: number }>,
    total: number,
    notFoundNames?: string[]
): string {
    const itemLines = items
        .map(i => {
            const sizeLabel = i.size ? ` (${i.size})` : "";
            return `• ${i.name}${sizeLabel} x ${i.qty} = Rp${i.subtotal.toLocaleString("id-ID")}`;
        })
        .join("\n");

    const notFoundNote = notFoundNames && notFoundNames.length > 0
        ? `\n\n_Produk tidak tersedia: ${notFoundNames.join(", ")}_`
        : "";

    return `Oke kak! Ini pesanannya ya:\n\n${itemLines}\n\n*Total: Rp${total.toLocaleString("id-ID")}*${notFoundNote}\n\nMau lanjut bayar? Balas *ya* atau *batal* 😊`;
};

export function itemsNotFoundMessage(names: string[]): string {
    const list = names.map(n => `• ${n}`).join("\n");
    return `Maaf kak, produk berikut tidak tersedia di toko kami:\n${list}\n\nMau lihat koleksi kami? 😊`;
}


export function paymentLinkMessage(total: number, url: string, orderId?: string): string {
  const urlLine     = url     ? `Bayar via QRIS: ${url}\n`          : "";
  const scanNote    = url     ? ""                                    : `Scan QR code yang sudah dikirim ya kak 📱\n`;
  const orderIdLine = orderId ? `No. Order: \`${orderId}\`\n`        : "";
  return (
    `💳 *Selesaikan Pembayaran*\n\n` +
    `Total: Rp${total.toLocaleString("id-ID")}\n` +
    urlLine +
    scanNote +
    orderIdLine +
    `_Berlaku 15 menit_`
  );
}

export function qrPaymentCaption(total: number, orderId: string): string {
  return (
    `💳 Scan QR untuk bayar kak 😊\n` +
    `*Total: Rp${total.toLocaleString("id-ID")}*\n` +
    `No. Order: \`${orderId}\`\n` +
    `_Berlaku 15 menit_`
  );
}

// Pembayaran diterima
export function paymentSuccessMessage(orderId: string): string {
  return (
    `✅ *Pembayaran Diterima!*\n\n` +
    `Order \`${orderId}\` sedang diproses ya kak 🎉\n` +
    `Nanti kami kabari kalau sudah dikirim!`
  );
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

export function greetingMessage(storeName: string): string {
  return `Halo kak! Selamat datang di *${storeName}* 👋\n\nAda yang bisa kami bantu?\n• Ketik *menu* untuk lihat katalog\n• Atau langsung sebutkan pesananmu 😊`;
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

export function cancelOrderMessage(): string {
  return (
    `Untuk membatalkan pesanan kak:\n\n` +
    `• Pesanan *belum bayar*: balas *batal* saat bot tampilkan ringkasan pesanan\n` +
    `• Pesanan *sudah bayar*: hubungi kami langsung ya, kami bantu proses 🙏\n\n` +
    `Ada yang bisa dibantu lagi?`
  );
}

export function repeatLastNotFoundMessage(): string {
  return `Belum ada pesanan selesai sebelumnya kak 😊 Ketik *menu* untuk lihat koleksi kami!`;
}

export function repeatLastUnavailableMessage(unavailable: string[]): string {
  const list = unavailable.map((n) => `• ${n}`).join("\n");
  return (
    `Maaf kak, semua produk dari pesanan sebelumnya sudah tidak tersedia:\n${list}\n\n` +
    `Ketik *menu* untuk lihat koleksi terbaru kami 😊`
  );
}

export function confirmationPendingMessage(): string {
  return (
    `Pesananmu masih menunggu konfirmasi ya kak 😊\n\n` +
    `• Balas *ya* untuk lanjut bayar\n` +
    `• Balas *batal* untuk ubah atau batalkan pesanan`
  );
}

// Dipanggil saat customer kirim modify_order di dalam awaiting_confirmation
export function modifyOrderInConfirmationMessage(): string {
  return (
    `Untuk ubah atau hapus item, balas *batal* lalu pesan ulang lengkap ya kak 😊\n\n` +
    `Atau langsung sebutkan item *tambahan* yang mau ditambahkan ke pesanan!`
  );
}

// Dipanggil saat customer kirim modify_order di luar konteks order aktif
export function modifyOrderHandoffMessage(): string {
  return (
    `Untuk mengubah pesanan yang sudah dibayar, hubungi admin kami langsung ya kak 🙏\n\n` +
    `Kalau pesanan belum dikonfirmasi, balas *batal* dan pesan ulang dengan item lengkap.`
  );
}

// Notif customer saat owner tandai FULFILLED (barang dikirim)
export function fulfillmentNotificationMessage(orderId: string): string {
  return (
    `🚚 *Pesananmu Sedang Dikirim!*\n\n` +
    `Order \`${orderId}\` sudah dalam perjalanan ya kak 😊\n` +
    `Ditunggu dan terima kasih sudah belanja! 💚`
  );
}

// Notif customer saat owner tandai DONE (selesai)
export function orderDoneNotificationMessage(orderId: string): string {
  return (
    `✅ *Pesananmu Sudah Selesai!*\n\n` +
    `Order \`${orderId}\` sudah diterima ya kak 🎉\n` +
    `Terima kasih sudah belanja! Sampai ketemu lagi 💚`
  );
}
