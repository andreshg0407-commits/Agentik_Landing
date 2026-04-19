/**
 * lib/whatsapp/outbound.ts
 *
 * Outbound WhatsApp message delivery layer.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  CURRENT STATE: STUB — messages are NOT sent to WhatsApp.   ║
 * ║                                                              ║
 * ║  The reply is generated and persisted in WhatsAppMessage    ║
 * ║  (role=ASSISTANT, waMessageId=null).                        ║
 * ║  The Meta Cloud API send call is not implemented yet.       ║
 * ║                                                              ║
 * ║  Enabling real delivery requires:                           ║
 * ║   1. META_GRAPH_API_TOKEN env var (permanent system token)  ║
 * ║   2. Un-comment the fetch() call in sendTextMessage()       ║
 * ║   3. Store the returned wamid in WhatsAppMessage.waMessageId║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Why keep this separate from reply.ts?
 *   - Reply generation is pure/deterministic (testable without network).
 *   - Outbound is I/O with external state (Meta API, rate limits, errors).
 *   - Keeping them apart means reply generation can be unit-tested
 *     and the send layer can be swapped (Twilio, 360Dialog, etc.) independently.
 */

// ── Result type ───────────────────────────────────────────────────────────────

export interface OutboundResult {
  /** Reply content that was generated. */
  content:   string;
  /** Whether the content was actually delivered to WhatsApp. Always false until wired. */
  delivered: false;
  /**
   * Meta wamid for the sent message.
   * Will be set and stored in WhatsAppMessage.waMessageId once delivery is live.
   */
  wamid:     null;
}

// ── Send stub ─────────────────────────────────────────────────────────────────

/**
 * Prepares an outbound text message for delivery.
 *
 * Currently: returns the content without sending. The caller persists
 * the reply via persistAssistantMessage() regardless of delivery.
 *
 * When ready to enable live delivery, un-comment the fetch() block below
 * and update the return type to reflect real wamid + delivered=true.
 *
 * @param phoneNumberId  The tenant's Meta phone_number_id (from WhatsAppConfig).
 * @param toPhone        Recipient phone in E.164 format.
 * @param content        Message text to send (supports WhatsApp *bold* and _italic_).
 */
export async function sendTextMessage(
  _phoneNumberId: string,
  _toPhone:       string,
  content:        string,
): Promise<OutboundResult> {
  // ── NOT YET LIVE — fetch() block below is the production path ────────────
  //
  // const token = process.env.META_GRAPH_API_TOKEN;
  // if (token) {
  //   const res = await fetch(
  //     `https://graph.facebook.com/v19.0/${_phoneNumberId}/messages`,
  //     {
  //       method:  "POST",
  //       headers: {
  //         "Authorization": `Bearer ${token}`,
  //         "Content-Type":  "application/json",
  //       },
  //       body: JSON.stringify({
  //         messaging_product: "whatsapp",
  //         recipient_type:    "individual",
  //         to:                _toPhone,
  //         type:              "text",
  //         text:              { preview_url: false, body: content },
  //       }),
  //     },
  //   );
  //   const data = await res.json();
  //   const wamid = data?.messages?.[0]?.id ?? null;
  //   return { content, delivered: true, wamid };
  // }
  // ─────────────────────────────────────────────────────────────────────────

  return {
    content,
    delivered: false,
    wamid:     null,
  };
}
