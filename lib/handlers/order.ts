if (session.state === "awaiting_confirmation") {
  const text = message.text.body.toLowerCase().trim();

  if (text === "ya" || text === "iya" || text === "ok" || text === "oke") {
    await processOrderConfirmation(tenant, senderPhone, session);
  } else if (text === "batal" || text === "tidak" || text === "cancel") {
    clearSession(senderPhone, tenant.id);
    await sendWhatsAppMessage(senderPhone,
      "Pesanan dibatalkan. Ketik *menu* untuk lihat katalog kami 😊"
    );
  } else {
    // Tidak jelas, tanya ulang
    await sendWhatsAppMessage(senderPhone,
      'Balas *ya* untuk konfirmasi atau *batal* untuk membatalkan pesanan.'
    );
  }
  return; // stop, tidak perlu ke Gemini
}