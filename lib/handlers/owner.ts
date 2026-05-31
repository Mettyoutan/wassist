import { supabaseAdmin,
         updateProductPrice,
         updateProductStock,
         setProductReorderPoint,
         setProductActive,
         setStoreStatus,
         queryRevenueData }           from "@/server/db";
import { sendWhatsAppMessage }        from "@/lib/whatsapp";
import { generateRevenueResponse }    from "@/lib/owner/generator";
import { parseOwnerCommand }          from "@/lib/owner/parser";
import { setSession, clearSession }   from "@/lib/session";
import { CONFIRM_KEYWORDS,
         CANCEL_KEYWORDS }            from "@/lib/constants/confirmation-keywords";
import type { DbTenant }              from "@/lib/types/db";
import type { Session,
              PendingOwnerAction }    from "@/lib/types/session";

// ─── Entry point dari webhook ─────────────────────────────────────────────────

export async function handleOwnerCommand(
  tenant:     DbTenant,
  ownerPhone: string,
  text:       string,
  session:    Session
): Promise<void> {
  // 1. Jika menunggu konfirmasi mutasi → tangani dulu
  if (session.state === "awaiting_owner_confirmation") {
    await handleOwnerConfirmation(tenant, ownerPhone, text, session);
    return;
  }

  // 2. Fetch daftar produk aktif (untuk context parser)
  const { data: rawProducts } = await supabaseAdmin
    .from("products")
    .select("id, name, price, unit, stock, reorder_point")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  const products = rawProducts ?? [];

  // 3. Parse perintah owner via Gemini
  const parsed = await parseOwnerCommand(
    text,
    products.map((p) => ({ name: p.name, price: p.price, unit: p.unit, stock: p.stock }))
  );

  // 4. Dispatch berdasarkan action
  switch (parsed.action) {

    // ── ANALYTICS (read only, langsung balas) ──────────────────────────────
    case "get_revenue": {
      const data = await queryRevenueData(tenant.id, parsed.period ?? "hari ini");
      const msg  = await generateRevenueResponse(data);
      await sendWhatsAppMessage(ownerPhone, msg);
      break;
    }

    case "get_stock": {
      if (parsed.product_index) {
        const prod = products[parsed.product_index - 1];
        if (!prod) {
          await sendWhatsAppMessage(ownerPhone, "Nomor produk tidak ditemukan 🤔");
          break;
        }
        const flag = prod.stock <= prod.reorder_point ? "⚠️ hampir habis!" : "✅ aman";
        await sendWhatsAppMessage(
          ownerPhone,
          `📦 *${prod.name}*\nStok: ${prod.stock} ${prod.unit} — ${flag}`
        );
      } else {
        const lowStock = products
          .filter((p) => p.stock <= p.reorder_point)
          .sort((a, b) => a.stock / a.reorder_point - b.stock / b.reorder_point);

        if (lowStock.length === 0) {
          await sendWhatsAppMessage(ownerPhone, "✅ Semua stok aman!");
        } else {
          const lines = lowStock
            .map((p) => `⚠️ ${p.name}: sisa ${p.stock} ${p.unit}`)
            .join("\n");
          await sendWhatsAppMessage(ownerPhone, `Stok perlu restock:\n\n${lines}`);
        }
      }
      break;
    }

    // ── LOW RISK (langsung tanpa konfirmasi) ───────────────────────────────
    case "open_store":
      await setStoreStatus(tenant.id, true);
      await sendWhatsAppMessage(ownerPhone, "✅ Toko sekarang *buka*!");
      break;

    case "close_store":
      await setStoreStatus(tenant.id, false);
      await sendWhatsAppMessage(ownerPhone, "🔒 Toko *tutup*. Balas *buka* untuk buka lagi.");
      break;

    // ── MUTASI (wajib konfirmasi) ──────────────────────────────────────────
    case "update_price": {
      const prod = parsed.product_index ? products[parsed.product_index - 1] : undefined;
      if (!prod || parsed.value === undefined) {
        await sendWhatsAppMessage(ownerPhone, "Sebutkan produk dan harga baru ya.\nContoh: *ubah harga kaos oversize jadi 90000*");
        break;
      }
      const pendingAction: PendingOwnerAction = {
        action: "update_price", product_id: prod.id,
        product_name: prod.name, product_unit: prod.unit,
        new_value: parsed.value,
      };
      setSession(tenant.id, ownerPhone, { ...session, state: "awaiting_owner_confirmation", pending_owner_action: pendingAction, last_updated: Date.now() });
      await sendWhatsAppMessage(
        ownerPhone,
        `Ubah harga *${prod.name}*:\nRp${prod.price.toLocaleString("id-ID")} → *Rp${parsed.value.toLocaleString("id-ID")}*\n\nBalas *ya* untuk konfirmasi atau *batal*.`
      );
      break;
    }

    case "update_stock": {
      const prod = parsed.product_index ? products[parsed.product_index - 1] : undefined;
      if (!prod || (parsed.value === undefined && parsed.delta === undefined)) {
        await sendWhatsAppMessage(ownerPhone, "Sebutkan produk dan jumlah stok baru.\nContoh: *stok kaos oversize jadi 20* atau *tambah stok kaos 5*");
        break;
      }
      const newStock = parsed.value !== undefined
        ? parsed.value
        : prod.stock + (parsed.delta ?? 0);
      const pendingAction: PendingOwnerAction = {
        action: "update_stock", product_id: prod.id,
        product_name: prod.name, product_unit: prod.unit,
        new_value: newStock,
      };
      setSession(tenant.id, ownerPhone, { ...session, state: "awaiting_owner_confirmation", pending_owner_action: pendingAction, last_updated: Date.now() });
      await sendWhatsAppMessage(
        ownerPhone,
        `Update stok *${prod.name}*:\n${prod.stock} → *${newStock} ${prod.unit}*\n\nBalas *ya* untuk konfirmasi atau *batal*.`
      );
      break;
    }

    case "set_reorder_point": {
      const prod = parsed.product_index ? products[parsed.product_index - 1] : undefined;
      if (!prod || parsed.value === undefined) {
        await sendWhatsAppMessage(ownerPhone, "Sebutkan produk dan batas minimum stok.\nContoh: *batas stok kaos oversize 5*");
        break;
      }
      const pendingAction: PendingOwnerAction = {
        action: "set_reorder_point", product_id: prod.id,
        product_name: prod.name, product_unit: prod.unit,
        new_value: parsed.value,
      };
      setSession(tenant.id, ownerPhone, { ...session, state: "awaiting_owner_confirmation", pending_owner_action: pendingAction, last_updated: Date.now() });
      await sendWhatsAppMessage(
        ownerPhone,
        `Set batas minimum stok *${prod.name}*:\n${prod.reorder_point} → *${parsed.value} ${prod.unit}*\n\nBalas *ya* untuk konfirmasi atau *batal*.`
      );
      break;
    }

    case "deactivate_product": {
      const prod = parsed.product_index ? products[parsed.product_index - 1] : undefined;
      if (!prod) {
        await sendWhatsAppMessage(ownerPhone, "Sebutkan produk yang ingin dinonaktifkan.\nContoh: *nonaktifkan kaos oversize*");
        break;
      }
      const pendingAction: PendingOwnerAction = {
        action: "deactivate_product", product_id: prod.id,
        product_name: prod.name, product_unit: prod.unit,
      };
      setSession(tenant.id, ownerPhone, { ...session, state: "awaiting_owner_confirmation", pending_owner_action: pendingAction, last_updated: Date.now() });
      await sendWhatsAppMessage(
        ownerPhone,
        `Nonaktifkan *${prod.name}*? Produk tidak akan muncul di katalog.\n\nBalas *ya* untuk konfirmasi atau *batal*.`
      );
      break;
    }

    case "activate_product": {
      const prod = parsed.product_index ? products[parsed.product_index - 1] : undefined;
      if (!prod) {
        await sendWhatsAppMessage(ownerPhone, "Sebutkan produk yang ingin diaktifkan kembali.\nContoh: *aktifkan kaos oversize*");
        break;
      }
      const pendingAction: PendingOwnerAction = {
        action: "activate_product", product_id: prod.id,
        product_name: prod.name, product_unit: prod.unit,
      };
      setSession(tenant.id, ownerPhone, { ...session, state: "awaiting_owner_confirmation", pending_owner_action: pendingAction, last_updated: Date.now() });
      await sendWhatsAppMessage(
        ownerPhone,
        `Aktifkan kembali *${prod.name}*? Produk akan muncul lagi di katalog.\n\nBalas *ya* untuk konfirmasi atau *batal*.`
      );
      break;
    }

    // ── HELP / UNKNOWN ─────────────────────────────────────────────────────
    case "help":
    case "unknown":
    default:
      await sendWhatsAppMessage(
        ownerPhone,
        `👋 *Owner Command WAssist*\n\n` +
        `📊 *Laporan*: "omzet hari ini" / "omzet minggu ini"\n` +
        `📦 *Stok*: "cek stok" / "stok kaos oversize"\n` +
        `✏️ *Ubah harga*: "harga kaos jadi 90000"\n` +
        `📥 *Update stok*: "stok kaos jadi 20" / "tambah stok kaos 5"\n` +
        `🔔 *Batas stok*: "batas stok kaos 5"\n` +
        `🚫 *Nonaktifkan*: "nonaktifkan kaos oversize"\n` +
        `🟢 *Toko*: "buka" / "tutup"\n\n` +
        `_Nomor produk merujuk ke urutan katalog aktif._`
      );
      break;
  }
}

// ─── Konfirmasi mutasi ────────────────────────────────────────────────────────

async function handleOwnerConfirmation(
  tenant:     DbTenant,
  ownerPhone: string,
  text:       string,
  session:    Session
): Promise<void> {
  const normalized = text.toLowerCase().trim();
  const action = session.pending_owner_action;

  if (CANCEL_KEYWORDS.has(normalized) || !action) {
    clearSession(tenant.id, ownerPhone);
    await sendWhatsAppMessage(ownerPhone, "Dibatalkan 👍");
    return;
  }

  if (!CONFIRM_KEYWORDS.has(normalized)) {
    await sendWhatsAppMessage(ownerPhone, "Balas *ya* untuk konfirmasi atau *batal* untuk membatalkan.");
    return;
  }

  // Owner konfirmasi → eksekusi mutasi ke DB
  try {
    switch (action.action) {
      case "update_price":
        await updateProductPrice(action.product_id, action.new_value!);
        await sendWhatsAppMessage(
          ownerPhone,
          `✅ Harga *${action.product_name}* diubah ke Rp${action.new_value!.toLocaleString("id-ID")}`
        );
        break;

      case "update_stock":
        await updateProductStock(action.product_id, action.new_value!);
        await sendWhatsAppMessage(
          ownerPhone,
          `✅ Stok *${action.product_name}* diperbarui ke ${action.new_value} ${action.product_unit}`
        );
        break;

      case "set_reorder_point":
        await setProductReorderPoint(action.product_id, action.new_value!);
        await sendWhatsAppMessage(
          ownerPhone,
          `✅ Batas minimum stok *${action.product_name}* diset ke ${action.new_value} ${action.product_unit}`
        );
        break;

      case "deactivate_product":
        await setProductActive(action.product_id, false);
        await sendWhatsAppMessage(
          ownerPhone,
          `✅ *${action.product_name}* dinonaktifkan dari katalog`
        );
        break;

      case "activate_product":
        await setProductActive(action.product_id, true);
        await sendWhatsAppMessage(
          ownerPhone,
          `✅ *${action.product_name}* diaktifkan kembali di katalog`
        );
        break;
    }
  } catch (err) {
    console.error("[Owner/Confirm] DB update failed:", err);
    await sendWhatsAppMessage(ownerPhone, "Gagal menyimpan perubahan 😔 Coba lagi ya.");
  } finally {
    clearSession(tenant.id, ownerPhone);
  }
}
