export async function handleStatusIntent(tenant, senderPhone) {
  const { data: user } = await supabaseAdmin
    .from("users").select("id")
    .eq("tenant_id", tenant.id).eq("phone", senderPhone).single();

  if (!user) {
    await sendWhatsAppMessage(senderPhone, "Kamu belum punya pesanan. Ketik *menu* untuk melihat katalog kami 😊");
    return;
  }

  const { data: order } = await supabaseAdmin
    .from("orders").select("*")
    .eq("tenant_id", tenant.id)
    .eq("customer_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1).single();

  const statusMessages: Record<string, string> = {
    PENDING: "Pesananmu masih menunggu konfirmasi 🕐",
    AWAITING_PAYMENT: `Pesananmu menunggu pembayaran.\n💳 ${order?.midtrans_payment_url ?? "Hubungi toko"}`,
    PAID: "Pembayaran diterima! Pesananmu sedang diproses 🎉",
    FULFILLED: "Pesananmu sedang dalam pengiriman 🚚",
    DONE: "Pesananmu sudah selesai. Terima kasih! 💚",
    CANCELLED: "Pesananmu dibatalkan.",
  };

  const msg = order
    ? `📦 Status Order #${order.id.slice(-6).toUpperCase()}:\n${statusMessages[order.status] ?? order.status}`
    : "Kamu belum punya pesanan aktif. Ketik *menu* untuk melihat koleksi kami 😊";

  await sendWhatsAppMessage(senderPhone, msg);
}