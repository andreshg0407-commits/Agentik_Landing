/**
 * app/api/whatsapp/webhook/route.ts
 *
 * Meta Cloud API webhook — full conversational pipeline.
 *
 * GET  — Meta webhook verification (hub.verify_token challenge).
 * POST — Incoming message: normalize → audio → classify → reply → persist.
 *
 * ── Processing pipeline (POST) ────────────────────────────────────────────────
 *
 *  1.  Parse + normalize raw Meta payload         (normalize.ts)
 *  2.  Route to org via phoneNumberId             (config.ts)
 *  3.  Guard: WhatsApp module enabled?            (guard.ts)
 *  4.  Find or create conversation                (conversation.ts)
 *  5.  Reopen if previously resolved/timed out   (conversation.ts)
 *  6.  Check if this is the first message        (conversation.ts)
 *  6b. [audio] → attempt transcription           (audio.ts — stub until provider configured)
 *  7.  Classify intent (on transcript or text)   (intent.ts)
 *  7b. Load contact memory                       (memory.ts)
 *  8.  Persist incoming USER message (idempotent)(conversation.ts)
 *  9.  Update conversation state                 (conversation.ts)
 * 10.  Generate brand-voiced personalized reply  (reply.ts)
 * 11.  Persist ASSISTANT reply                   (conversation.ts)
 * 11b. Dispatch business actions                 (actions.ts — also writes memory signals)
 * 11c. Persist SYSTEM handoff event (if needed) (conversation.ts)
 * 11d. Update contact memory (name, new thread)  (memory.ts — fire-and-forget)
 * 12.  Outbound delivery (stub — not yet live)   (outbound.ts)
 * 13.  Return HTTP 200 to Meta
 *
 * ── Multi-tenant isolation ────────────────────────────────────────────────────
 *  Every step is scoped to the org identified in step 2.
 *
 * ── Reliability contract ──────────────────────────────────────────────────────
 *  Always returns HTTP 200 to Meta — a non-200 causes Meta to retry,
 *  which would create duplicate messages. Processing errors are logged
 *  but never surface as non-200 responses.
 */

import { NextRequest, NextResponse }      from "next/server";
import { normalizeMetaWebhook }           from "@/lib/whatsapp/normalize";
import { classifyIntent }                 from "@/lib/whatsapp/intent";
import {
  getActiveConfigByPhoneNumberId,
  getActiveConfigByWebhookSecret,
}                                         from "@/lib/whatsapp/config";
import {
  findOrCreateConversation,
  reopenConversationIfClosed,
  persistUserMessage,
  persistAssistantMessage,
  persistSystemMessage,
  updateConversationState,
  countConversationMessages,
}                                         from "@/lib/whatsapp/conversation";
import { isWhatsAppEnabled }              from "@/lib/whatsapp/guard";
import { generateReply }                  from "@/lib/whatsapp/reply";
import { sendTextMessage }                from "@/lib/whatsapp/outbound";
import { dispatchBusinessAction }         from "@/lib/whatsapp/actions";
import {
  transcribeIncomingAudio,
  extractAudioMediaId,
}                                         from "@/lib/whatsapp/audio";
import {
  getContactMemory,
  upsertContactMemory,
  incrementConversationCount,
}                                         from "@/lib/whatsapp/memory";
import type { WaIntent }                  from "@/lib/whatsapp/types";

export const runtime = "nodejs";

// ── GET — Webhook verification ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const config = await getActiveConfigByWebhookSecret(token);
  if (!config) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status:  200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ── POST — Full conversational pipeline ───────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // malformed JSON — ack
  }

  // ── Step 1: Normalize ──────────────────────────────────────────────────────
  const normalized = normalizeMetaWebhook(body);
  if (!normalized) {
    // Status update, read receipt, or other non-message entry — ack silently
    return NextResponse.json({ ok: true });
  }

  try {
    // ── Step 2: Route to org ─────────────────────────────────────────────────
    const config = await getActiveConfigByPhoneNumberId(normalized.phoneNumberId);
    if (!config) {
      return NextResponse.json({ ok: true });
    }

    // ── Step 3: Module guard ─────────────────────────────────────────────────
    const enabled = await isWhatsAppEnabled(config.organizationId);
    if (!enabled) {
      return NextResponse.json({ ok: true });
    }

    // ── Step 4: Find or create conversation ──────────────────────────────────
    const conversation = await findOrCreateConversation(
      config.organizationId,
      config.id,
      normalized.contactPhone,
      normalized.contactName ?? undefined,
    );

    // ── Step 5: Reopen closed conversations ──────────────────────────────────
    await reopenConversationIfClosed(conversation.id);

    // ── Step 6: Detect first message ─────────────────────────────────────────
    // Check BEFORE persisting so count reflects the pre-existing message state.
    const existingCount  = await countConversationMessages(conversation.id);
    const isFirstMessage = existingCount === 0;

    // ── Step 6b: Audio transcription ─────────────────────────────────────────
    // If the message is a voice note, attempt transcription.
    // On success: use transcript for classification + reply; store as content.
    // On failure / stub: fall back to "[audio]" — intent will be SUPPORT.
    const isAudio = normalized.messageType === "audio";
    let classificationText = normalized.content; // "[audio]" by default for audio

    if (isAudio) {
      const mediaId = extractAudioMediaId(normalized.raw);
      if (mediaId) {
        try {
          const result = await transcribeIncomingAudio(mediaId, config.organizationId);
          if (result?.transcript) {
            classificationText = result.transcript;
          }
        } catch (audioErr) {
          // Transcription errors are non-fatal — pipeline continues with "[audio]"
          console.error("[whatsapp/webhook] audio transcription error:", audioErr);
        }
      }
    }

    // ── Step 7: Classify intent ───────────────────────────────────────────────
    const intent = classifyIntent(classificationText);

    // ── Step 7b: Load contact memory ─────────────────────────────────────────
    // Null for brand-new contacts. Reply generator handles null gracefully.
    const memory = await getContactMemory(
      config.organizationId,
      normalized.contactPhone,
    ).catch(() => null); // memory read errors must never break the pipeline

    // ── Step 8: Persist incoming USER message (idempotent) ───────────────────
    // Store transcript as content when available — makes conversation history readable.
    await persistUserMessage(
      conversation.id,
      config.organizationId,
      classificationText,   // transcript if audio was transcribed, else original content
      intent,
      normalized.waMessageId,
      normalized.raw,       // raw preserves mediaId for future re-transcription
    );

    // ── Step 9: Update conversation state ─────────────────────────────────────
    // Capture prevIntent BEFORE we overwrite it — used for deduplication in step 11b.
    const prevIntent = conversation.lastIntent as WaIntent | null;
    const newStatus  = intent === "HANDOFF" ? "HANDED_OFF" : undefined;
    await updateConversationState(conversation.id, intent, newStatus);

    // ── Step 10: Generate brand-voiced personalized reply ────────────────────
    const generated = generateReply({
      config,
      intent,
      userText:       classificationText,
      isFirstMessage,
      memory,
      contactName:    normalized.contactName ?? null,
      isAudio,
    });

    // ── Step 11: Persist ASSISTANT reply ─────────────────────────────────────
    await persistAssistantMessage(
      conversation.id,
      config.organizationId,
      generated.content,
    );

    // ── Step 11b: Dispatch business actions (HANDOFF / APPOINTMENT / SALES) ──
    // dispatchBusinessAction also writes outcome signals to contact memory.
    await dispatchBusinessAction(
      {
        organizationId: config.organizationId,
        config,
        conversation,
        contactPhone:  normalized.contactPhone,
        contactName:   normalized.contactName ?? null,
        messageText:   classificationText,
      },
      intent,
      prevIntent,
    );

    // ── Step 11c: Persist SYSTEM handoff event (if triggered) ─────────────────
    if (generated.triggersHandoff) {
      await persistSystemMessage(
        conversation.id,
        config.organizationId,
        `Conversación transferida a un asesor humano de ${config.displayName}.`,
      );
    }

    // ── Step 11d: Fire-and-forget memory maintenance ──────────────────────────
    // Increment thread count on first message; keep contactName fresh.
    if (isFirstMessage) {
      incrementConversationCount(
        config.organizationId,
        normalized.contactPhone,
        normalized.contactName ?? null,
      ).catch(e => console.error("[whatsapp/webhook] memory count failed:", e));
    } else if (normalized.contactName) {
      // Update name on any message — WhatsApp profile names can change
      upsertContactMemory(config.organizationId, normalized.contactPhone, {
        contactName: normalized.contactName,
      }).catch(e => console.error("[whatsapp/webhook] memory name update failed:", e));
    }

    // ── Step 12: Outbound delivery (stub — not yet live) ──────────────────────
    await sendTextMessage(
      config.phoneNumberId,
      normalized.contactPhone,
      generated.content,
    );

  } catch (err) {
    // Log but never return non-200 — Meta would retry and create duplicates
    console.error("[whatsapp/webhook] pipeline error:", err);
  }

  // ── Step 13: Always ack ───────────────────────────────────────────────────
  return NextResponse.json({ ok: true });
}
