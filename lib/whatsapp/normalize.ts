/**
 * lib/whatsapp/normalize.ts
 *
 * Incoming message normalization layer for the Meta Cloud API webhook format.
 *
 * Meta sends webhook payloads that vary significantly by message type
 * (text, image, button_reply, list_reply, audio, video, location…).
 * This module reduces all of them to a single NormalizedIncomingMessage
 * shape so the rest of the pipeline can be message-type-agnostic.
 *
 * Non-message webhook entries (status updates, read receipts, errors)
 * are filtered out — normalize() returns null for those.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

import type {
  NormalizedIncomingMessage,
  WaRawMessageType,
} from "./types";

// ── Raw Meta webhook payload types ────────────────────────────────────────────
// Typed just enough to extract the fields we need — not exhaustive.

interface MetaWebhookPayload {
  object: string;
  entry:  MetaEntry[];
}

interface MetaEntry {
  id:      string;
  changes: MetaChange[];
}

interface MetaChange {
  field: string;
  value: MetaChangeValue;
}

interface MetaChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id:       string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id:   string;
  }>;
  messages?: MetaRawMessage[];
  // status updates (read, delivered, sent) — intentionally ignored
  statuses?: unknown[];
  errors?:   unknown[];
}

interface MetaRawMessage {
  from:      string;
  id:        string;
  timestamp: string;
  type:      string;
  // text
  text?: { body: string };
  // interactive (button_reply / list_reply)
  interactive?: {
    type:         "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?:   { id: string; title: string; description?: string };
  };
  // image / video / document
  image?:    { id: string; caption?: string };
  video?:    { id: string; caption?: string };
  document?: { id: string; filename?: string; caption?: string };
  // audio
  audio?:    { id: string };
  // location
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  // sticker
  sticker?:  { id: string };
  // reaction
  reaction?: { message_id: string; emoji: string };
}

// ── Main normalization function ────────────────────────────────────────────────

/**
 * Parses a raw Meta webhook body and returns a NormalizedIncomingMessage
 * for the first user message found, or null if there is no processable message
 * (e.g. status update, read receipt, empty payload).
 *
 * This deliberately processes only the first message per webhook call.
 * Meta typically delivers one message per POST; batching is rare and
 * would require queueing which is out of scope for this foundation sprint.
 */
export function normalizeMetaWebhook(
  body: unknown,
): NormalizedIncomingMessage | null {
  if (!isMetaWebhookPayload(body)) return null;
  if (body.object !== "whatsapp_business_account") return null;

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const { value } = change;
      const messages = value.messages;
      if (!messages || messages.length === 0) continue;

      const rawMsg = messages[0];
      const phoneNumberId = value.metadata.phone_number_id;
      const contactPhone  = toE164(rawMsg.from);
      const contactName   = value.contacts?.[0]?.profile?.name ?? null;
      const timestamp     = new Date(parseInt(rawMsg.timestamp, 10) * 1000);

      const { content, messageType } = extractContent(rawMsg);

      return {
        waMessageId:   rawMsg.id,
        phoneNumberId,
        contactPhone,
        contactName,
        content,
        messageType,
        timestamp,
        raw: change, // store the entire change entry for audit
      };
    }
  }

  return null;
}

// ── Content extraction ────────────────────────────────────────────────────────

function extractContent(
  msg: MetaRawMessage,
): { content: string; messageType: WaRawMessageType } {
  switch (msg.type) {
    case "text":
      return {
        content:     msg.text?.body ?? "",
        messageType: "text",
      };

    case "interactive": {
      const interactive = msg.interactive;
      if (!interactive) return { content: "", messageType: "other" };

      if (interactive.type === "button_reply" && interactive.button_reply) {
        return {
          content:     interactive.button_reply.title,
          messageType: "button_reply",
        };
      }
      if (interactive.type === "list_reply" && interactive.list_reply) {
        return {
          content:     interactive.list_reply.title,
          messageType: "list_reply",
        };
      }
      return { content: "", messageType: "other" };
    }

    case "image":
      return {
        content:     msg.image?.caption ? `[imagen] ${msg.image.caption}` : "[imagen]",
        messageType: "image",
      };

    case "video":
      return {
        content:     msg.video?.caption ? `[video] ${msg.video.caption}` : "[video]",
        messageType: "video",
      };

    case "document":
      return {
        content:     msg.document?.caption
          ? `[documento] ${msg.document.caption}`
          : msg.document?.filename
          ? `[documento] ${msg.document.filename}`
          : "[documento]",
        messageType: "document",
      };

    case "audio":
      return { content: "[audio]", messageType: "audio" };

    case "sticker":
      return { content: "[sticker]", messageType: "sticker" };

    case "reaction":
      return {
        content:     msg.reaction?.emoji ?? "[reacción]",
        messageType: "reaction",
      };

    case "location": {
      const loc = msg.location;
      const parts: string[] = ["[ubicación]"];
      if (loc?.name)    parts.push(loc.name);
      if (loc?.address) parts.push(loc.address);
      return {
        content:     parts.join(" · "),
        messageType: "location",
      };
    }

    default:
      return { content: `[${msg.type}]`, messageType: "other" };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Ensures the phone number starts with "+".
 * Meta sends numbers without the "+" prefix (e.g. "573001234567").
 */
function toE164(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function isMetaWebhookPayload(v: unknown): v is MetaWebhookPayload {
  return (
    typeof v === "object" &&
    v !== null &&
    "object" in v &&
    "entry" in v &&
    Array.isArray((v as MetaWebhookPayload).entry)
  );
}
