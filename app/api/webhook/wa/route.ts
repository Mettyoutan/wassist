import { NextRequest, NextResponse }    from "next/server";
import { getTenantByWaPhoneId,
         upsertCustomer,
         getActiveProducts,
         updateOrderStatus,
         getOrderById,
         getUserIdByPhone,
         getLatestActiveOrderWithItems,
         getUserWithAddress,
         updateUserLastAddress }          from "@/server/db";
import { getSession,
         setSession,
         clearSession,
         cleanupExpiredSessions,
         peekExpiredSession }            from "@/lib/session";
import { parseCustomerMessage }          from "@/lib/ai/customer-parser";
import { sendWhatsAppMessage,
         sendInteractiveButtons,
         uploadWhatsAppMedia,
         sendWhatsAppImageMessage }      from "@/lib/whatsapp";
import { parseConfirmationIntent,
         parsePaymentStateIntent }        from "@/lib/ai/confirmation-parser";
import { greetingMessage,
         cancelOrderMessage,
         confirmationPendingMessage,
         modifyOrderInConfirmationMessage,
         modifyOrderHandoffMessage,
         addressRequestMessage,
         addressConfirmMessage,
         qrPaymentCaption,
         qrResendFailedMessage,
         sessionExpiredMessage,
         sessionRenewedMessage,
         pendingPaymentReminderMessage,
         orderCancelledMessage,
         nonTextMessageResponse,
         ownerModifyOrderNotification,
         productNotAvailableMessage,
         CONFIRM_PENDING_BUTTONS,
         ADDRESS_CONFIRM_BUTTONS,
         GREETING_BUTTONS,
         PAYMENT_REMINDER_BUTTONS,
         ownerHelpCategoryText }        from "@/lib/response-template";
import { getMidtransQrString }           from "@/lib/midtrans";
import { handleBrowseIntent }            from "@/lib/handlers/browse";
import { handleStatusIntent }            from "@/lib/handlers/status";
import { handleOrderIntent }            from "@/lib/handlers/order-new";
import { handleClarificationAnswer }   from "@/lib/handlers/clarification";
import { processOrderConfirmation }    from "@/lib/handlers/confirm-order";
import { handleCartOrder }               from "@/lib/handlers/cart-order";
import { handleOwnerCommand,
         handleOwnerOrderSelection,
         executeOwnerOrderAction }       from "@/lib/handlers/owner";
import { handleRepeatLastIntent }        from "@/lib/handlers/repeat-last";
import { handleProductDetailIntent }     from "@/lib/handlers/product-detail";
import { suggestClosestProduct }         from "@/lib/ai/product-suggester";
import type { DbTenant }                 from "@/lib/types/db";
import type { WAWebhookBody, WAMessage,
              WATextMessage,
              WAOrderMessage,
              WAInteractiveMessage }     from "@/lib/types/whatsapp";
import QRCode from "qrcode";

// ─── GET: Webhook verification dari Meta ─────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Dedup: cegah double-processing saat Meta retry webhook (timeout >20s)
const _processedMsgIds = new Set<string>();
const _msgIdTs         = new Map<string, number>();
const MSG_ID_TTL       = 5 * 60 * 1000; // 5 menit

function cleanupMsgIds() {
  const now = Date.now();
  for (const [id, ts] of _msgIdTs) {
    if (now - ts > MSG_ID_TTL) { _processedMsgIds.delete(id); _msgIdTs.delete(id); }
  }
}

// Cleanup setiap 50 request — cegah memory leak tanpa overhead per-request
let _reqCount = 0;

// ─── POST: Semua pesan masuk dari Meta ───────────────────────────────────────
export async function POST(request: NextRequest) {
  if (++_reqCount % 50 === 0) { cleanupExpiredSessions(); cleanupMsgIds(); }
  try {
    const body  = (await request.json()) as WAWebhookBody;
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // Status update (delivered/read) — abaikan
    if (!value?.messages?.length) {
      return NextResponse.json({ status: "ok" });
    }

    const phoneNumberId: string = value.metadata.phone_number_id;
    const message: WAMessage    = value.messages[0];
    const senderPhone: string   = message.from;

    // ── Dedup: skip jika message sudah diproses (Meta retry) ─────────────────
    if (_processedMsgIds.has(message.id)) {
      return NextResponse.json({ status: "ok" });
    }
    _processedMsgIds.add(message.id);
    _msgIdTs.set(message.id, Date.now());

    // ── Lookup tenant ────────────────────────────────────────────────────────
    const tenant = await getTenantByWaPhoneId(phoneNumberId);

    if (!tenant) {
      console.warn("[Webhook] Tenant not found:", phoneNumberId);
      return NextResponse.json({ status: "ok" });
    }

    // ── Upsert customer ──────────────────────────────────────────────────────
    if (tenant.owner_phone !== senderPhone) {
      await upsertCustomer(tenant.id, senderPhone);
    }

    // ── Cart order dari WA Catalog (tidak butuh state check atau Gemini) ─────
    if (message.type === "order") {
      await handleCartOrder(tenant, senderPhone, message as WAOrderMessage);
      return NextResponse.json({ status: "ok" });
    }

    // ── Extract msgText: plain text ATAU interactive button reply ─────────────
    // Map button IDs ke teks agar state machine tidak perlu tahu bedanya
    const BUTTON_TO_TEXT: Record<string, string> = {
      yes:       "ya",
      cancel:    "batal",
      resend_qr: "kirim ulang QR",
      view_menu: "menu",
    };

    let msgText: string;
    if (message.type === "interactive") {
      const intr = (message as WAInteractiveMessage).interactive;

      if (intr?.type === "list_reply") {
        const listId = intr.list_reply.id;
        if (tenant.owner_phone === senderPhone) {
          if (listId.startsWith("select_order:")) {
            const orderId = listId.slice("select_order:".length);
            await handleOwnerOrderSelection(tenant, senderPhone, orderId);
          } else if (listId.startsWith("help:")) {
            const category = listId.slice("help:".length);
            await sendWhatsAppMessage(senderPhone, ownerHelpCategoryText(category));
          }
        }
        return NextResponse.json({ status: "ok" });
      }

      if (intr?.type === "button_reply") {
        const btnId = intr.button_reply.id;

        // Encoded owner actions: mark_paid:{uuid}, mark_fulfilled:{uuid}, mark_done:{uuid}
        const ownerActionMatch = btnId.match(/^(mark_paid|mark_fulfilled|mark_done):(.+)$/);
        if (ownerActionMatch && tenant.owner_phone === senderPhone) {
          await executeOwnerOrderAction(
            tenant, senderPhone,
            ownerActionMatch[1] as "mark_paid" | "mark_fulfilled" | "mark_done",
            ownerActionMatch[2],
          );
          return NextResponse.json({ status: "ok" });
        }

        if (btnId === "cancel_action") {
          await sendWhatsAppMessage(senderPhone, "Dibatalkan 👍");
          return NextResponse.json({ status: "ok" });
        }

        msgText = BUTTON_TO_TEXT[btnId] ?? btnId;
      } else {
        await sendWhatsAppMessage(senderPhone, nonTextMessageResponse());
        return NextResponse.json({ status: "ok" });
      }
    } else if (message.type === "text") {
      msgText = (message as WATextMessage).text.body;
    } else {
      await sendWhatsAppMessage(senderPhone, nonTextMessageResponse());
      return NextResponse.json({ status: "ok" });
    }

    // Check for expired session BEFORE getSession resets it
    const { wasActive } = peekExpiredSession(tenant.id, senderPhone);
    if (wasActive) {
      await sendWhatsAppMessage(senderPhone, sessionRenewedMessage());
      // no return — continue processing user's message
    }

    // Get current session
    const session    = getSession(tenant.id, senderPhone);

    // ── STATE MACHINE — cek dulu sebelum Gemini ──────────────────────────────
    if (session.state === "awaiting_confirmation") {
      const signal = await parseConfirmationIntent(msgText);

      if (signal === "confirm") {
        const userWithAddr  = await getUserWithAddress(tenant.id, senderPhone);
        const savedAddress  = userWithAddr?.last_address ?? null;

        setSession(tenant.id, senderPhone, {
          ...session,
          state:                 "awaiting_address",
          pending_saved_address: savedAddress ?? undefined,
          last_updated:          Date.now(),
        });

        if (savedAddress) {
          await sendInteractiveButtons(
            senderPhone,
            addressConfirmMessage(savedAddress),
            [...ADDRESS_CONFIRM_BUTTONS],
          );
        } else {
          await sendWhatsAppMessage(senderPhone, addressRequestMessage());
        }
        return NextResponse.json({ status: "ok" });
      }

      if (signal === "cancel") {
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(senderPhone, orderCancelledMessage());
        return NextResponse.json({ status: "ok" });
      }

      // signal === "ambiguous" → coba parse sebagai tambah item ke pesanan aktif
      const productsForAdd = await getActiveProducts(tenant.id);
      const parsedAdd = await parseCustomerMessage(msgText, productsForAdd, {
        store_name:     tenant.name,
        store_category: tenant.category ?? "toko online",
        current_order:  session.pending_order?.items.map(i => ({
          name: i.name, qty: i.qty, size: i.size,
        })),
      });
      if (parsedAdd.intent === "order_new" && parsedAdd.items.length > 0) {
        await handleOrderIntent(
          tenant, senderPhone, productsForAdd, parsedAdd.items,
          session.pending_order?.items ?? []
        );
      } else if (parsedAdd.intent === "modify_order") {
        await sendWhatsAppMessage(senderPhone, modifyOrderInConfirmationMessage());
      } else {
        await sendInteractiveButtons(
          senderPhone,
          confirmationPendingMessage(
            session.pending_order?.items,
            session.pending_order?.total,
          ),
          [...CONFIRM_PENDING_BUTTONS],
        );
      }
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_address") {
      const savedAddress = session.pending_saved_address;
      let finalAddress: string | undefined;

      if (savedAddress) {
        // Customer has a saved address — parse reply as confirm/cancel/new text
        const addrSignal = await parseConfirmationIntent(msgText);
        if (addrSignal === "cancel") {
          clearSession(tenant.id, senderPhone);
          await sendWhatsAppMessage(senderPhone, orderCancelledMessage());
          return NextResponse.json({ status: "ok" });
        }
        if (addrSignal === "confirm") {
          finalAddress = savedAddress;
        } else {
          // ambiguous — verify it's actually address text, not a customer command
          const typed = msgText.trim();
          if (!typed) {
            await sendInteractiveButtons(
              senderPhone,
              addressConfirmMessage(savedAddress),
              [...ADDRESS_CONFIRM_BUTTONS],
            );
            return NextResponse.json({ status: "ok" });
          }
          const addrProds = await getActiveProducts(tenant.id);
          const addrCheck = await parseCustomerMessage(typed, addrProds, {
            store_name: tenant.name, store_category: tenant.category ?? "toko online",
          });
          if (addrCheck.intent !== "low_confidence") {
            await sendInteractiveButtons(
              senderPhone,
              addressConfirmMessage(savedAddress),
              [...ADDRESS_CONFIRM_BUTTONS],
            );
            return NextResponse.json({ status: "ok" });
          }
          finalAddress = typed;
        }
      } else {
        // No saved address — parse cancel first, then accept plain text as address
        const addrCancel = await parseConfirmationIntent(msgText);
        if (addrCancel === "cancel") {
          clearSession(tenant.id, senderPhone);
          await sendWhatsAppMessage(senderPhone, orderCancelledMessage());
          return NextResponse.json({ status: "ok" });
        }
        const typed = msgText.trim();
        if (!typed) {
          await sendWhatsAppMessage(senderPhone, addressRequestMessage());
          return NextResponse.json({ status: "ok" });
        }
        const addrProds = await getActiveProducts(tenant.id);
        const addrCheck = await parseCustomerMessage(typed, addrProds, {
          store_name: tenant.name, store_category: tenant.category ?? "toko online",
        });
        if (addrCheck.intent !== "low_confidence") {
          await sendWhatsAppMessage(senderPhone, addressRequestMessage());
          return NextResponse.json({ status: "ok" });
        }
        finalAddress = typed;
      }

      try {
        await processOrderConfirmation(tenant, senderPhone, session, finalAddress);
        // Persist address for next order — only if changed, best-effort, fire-and-forget
        const isNewAddress = finalAddress !== session.pending_saved_address;
        if (isNewAddress) {
          const userId = await getUserIdByPhone(tenant.id, senderPhone);
          if (userId && finalAddress) {
            updateUserLastAddress(userId, finalAddress).catch((err) =>
              console.error("[webhook/awaiting_address] updateUserLastAddress failed:", err)
            );
          }
        }
      } catch (err) {
        console.error("[Webhook] processOrderConfirmation (awaiting_address) failed:", err);
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(senderPhone, "Terjadi kesalahan saat memproses pesanan kak 🙏 Coba lagi ya.");
      }
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_clarification") {
      await handleClarificationAnswer(tenant, senderPhone, msgText, session);
      return NextResponse.json({ status: "ok" });
    }

    if (session.state === "awaiting_payment") {
      const paymentSignal = await parsePaymentStateIntent(msgText);

      if (paymentSignal === "cancel") {
        if (session.current_order_id) {
          try {
            await updateOrderStatus(session.current_order_id, "CANCELLED");
          } catch (err) {
            console.error("[Webhook] cancel order in awaiting_payment failed:", err);
          }
        }
        clearSession(tenant.id, senderPhone);
        await sendWhatsAppMessage(senderPhone, orderCancelledMessage());
        return NextResponse.json({ status: "ok" });
      }

      if (paymentSignal === "resend_qr" && session.current_order_id) {
        const order = await getOrderById(session.current_order_id);
        if (order?.midtrans_id) {
          const qrString = await getMidtransQrString(order.midtrans_id);
          if (qrString) {
            try {
              const qrBuffer = await QRCode.toBuffer(qrString, {
                type: "png", width: 400, margin: 2,
                color: { dark: "#000000", light: "#FFFFFF" },
              });
              const mediaId = await uploadWhatsAppMedia(qrBuffer, "image/png");
              const result  = await sendWhatsAppImageMessage(
                senderPhone, mediaId,
                qrPaymentCaption(order.total_amount, order.midtrans_id)
              );
              if (result.success) return NextResponse.json({ status: "ok" });
            } catch (err) {
              console.warn("[webhook/awaiting_payment] QR resend failed:", err);
            }
          }
          // qrString null OR image send failed → fallback text
          await sendWhatsAppMessage(senderPhone, qrResendFailedMessage(order.midtrans_id));
          return NextResponse.json({ status: "ok" });
        }
        // no midtrans_id → fall through to normal processing
      }

      // paymentSignal === "other" OR resend_qr without valid order → fall through
      // No early return — customer can browse, check status, etc.
      // Order stays open in Midtrans until it expires naturally
    }

    // ── OWNER vs CUSTOMER ────────────────────────────────────────────────────
    if (tenant.owner_phone === senderPhone) {
      await handleOwnerCommand(tenant, senderPhone, msgText, session);
      return NextResponse.json({ status: "ok" });
    }

    // ── CUSTOMER INTENT PARSING ──────────────────────────────────────────────
    const products = await getActiveProducts(tenant.id);

    const parsed = await parseCustomerMessage(msgText, products, {
      store_name:     tenant.name,
      store_category: tenant.category ?? "toko online",
      current_order:  session.pending_order?.items.map(i => ({
        name: i.name, qty: i.qty, size: i.size,
      })),
    });

    // ── INTENT ROUTER ────────────────────────────────────────────────────────
    switch (parsed.intent) {
      case "greeting":
        await sendInteractiveButtons(
          senderPhone,
          greetingMessage(tenant.name),
          [...GREETING_BUTTONS],
        );
        break;

      case "browse":
        await handleBrowseIntent(tenant, senderPhone, session);
        break;

      case "order_new": {
        // Guard: block if customer already has unpaid AWAITING_PAYMENT order
        const custUserId = await getUserIdByPhone(tenant.id, senderPhone);
        if (custUserId) {
          const activeOrder = await getLatestActiveOrderWithItems(tenant.id, custUserId);
          if (activeOrder && activeOrder.status === "AWAITING_PAYMENT") {
            const displayId = activeOrder.midtrans_id ?? activeOrder.id.slice(-6).toUpperCase();
            await sendInteractiveButtons(
              senderPhone,
              pendingPaymentReminderMessage(displayId),
              [...PAYMENT_REMINDER_BUTTONS],
            );
            break;
          }
        }
        await handleOrderIntent(tenant, senderPhone, products, parsed.items);
        break;
      }

      case "order_status":
        await handleStatusIntent(tenant, senderPhone, session);
        break;

      case "repeat_last":
        await handleRepeatLastIntent(tenant, senderPhone, session);
        break;

      case "product_detail":
        await handleProductDetailIntent(tenant, senderPhone, products, parsed.product_index ?? 0);
        break;

      case "cancel_order": {
        // If customer has an active unpaid order, actually cancel it
        const cancelUserId = await getUserIdByPhone(tenant.id, senderPhone);
        if (cancelUserId) {
          const activeOrder = await getLatestActiveOrderWithItems(tenant.id, cancelUserId);
          if (activeOrder && activeOrder.status === "AWAITING_PAYMENT") {
            try {
              await updateOrderStatus(activeOrder.id, "CANCELLED");
            } catch (err) {
              console.error("[Webhook] cancel_order: updateOrderStatus failed:", err);
            }
            clearSession(tenant.id, senderPhone);
            await sendWhatsAppMessage(senderPhone, orderCancelledMessage());
            break;
          }
        }
        await sendWhatsAppMessage(senderPhone, cancelOrderMessage());
        break;
      }

      case "modify_order":
        await sendWhatsAppMessage(senderPhone, modifyOrderHandoffMessage());
        await sendWhatsAppMessage(
          tenant.owner_phone,
          ownerModifyOrderNotification(senderPhone)
        );
        break;

      // low confidence → suggest produk terdekat + tampilkan katalog
      case "low_confidence":
      default: {
        const suggestion = await suggestClosestProduct(products, msgText);
        const suggestedProduct =
          suggestion.found && suggestion.product_index > 0 && suggestion.product_index <= products.length
            ? products[suggestion.product_index - 1]
            : null;
        await sendWhatsAppMessage(
          senderPhone,
          productNotAvailableMessage(
            suggestedProduct?.name,
            suggestedProduct?.price,
            suggestedProduct?.unit
          )
        );
        await handleBrowseIntent(tenant, senderPhone);
        break;
      }
    }

  } catch (err) {
    // JANGAN return non-200 → Meta akan retry → potensi order duplikat
    console.error("[Webhook] Unhandled error:", err);
  }

  return NextResponse.json({ status: "ok" }); // selalu 200
}
