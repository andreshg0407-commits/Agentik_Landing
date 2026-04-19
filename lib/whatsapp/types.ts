/**
 * lib/whatsapp/types.ts
 *
 * Shared TypeScript types for the Agentik WhatsApp module.
 *
 * These mirror the Prisma enums defined in schema.prisma so the rest
 * of the module can be fully typed without depending on `@prisma/client`
 * (which requires a code-generated client after `prisma generate`).
 *
 * The DB interaction layer (config.ts, conversation.ts) uses `(prisma as any)`
 * following the same pattern as other recently-added models in this codebase.
 */

// ── Enums (mirrors prisma schema) ─────────────────────────────────────────────

export type WaConversationStatus =
  | "ACTIVE"
  | "RESOLVED"
  | "HANDED_OFF"
  | "TIMED_OUT";

export type WaMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type WaIntent =
  | "FAQ"
  | "APPOINTMENT"
  | "SALES"
  | "SUPPORT"
  | "HANDOFF"
  | "UNKNOWN";

// ── Domain types ──────────────────────────────────────────────────────────────

/** Stored per-org WhatsApp configuration. */
export interface WaConfig {
  id:             string;
  organizationId: string;
  phoneNumberId:  string;
  wabaId:         string;
  webhookSecret:  string;
  displayName:    string;
  welcomeMessage: string | null;
  /** Extensible JSON config:
   *   { faq: [{q, a}], appointment: { calendarUrl }, escalation: { email } } */
  intentConfig:   Record<string, unknown> | null;
  /**
   * Brand voice and style config:
   *   { tone, useEmoji, closingStyle, forbiddenPhrases, signaturePhrases,
   *     salesStyleHints, escalationStyle }
   */
  brandConfig:    Record<string, unknown> | null;
  active:         boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

/** A WhatsApp conversation thread between the bot and one contact. */
export interface WaConversation {
  id:             string;
  organizationId: string;
  configId:       string;
  contactPhone:   string;
  contactName:    string | null;
  status:         WaConversationStatus;
  lastIntent:     WaIntent | null;
  handedOff:      boolean;
  handoffTo:      string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

/** An individual WhatsApp message within a conversation. */
export interface WaMessage {
  id:             string;
  conversationId: string;
  organizationId: string;
  role:           WaMessageRole;
  content:        string;
  intent:         WaIntent | null;
  rawPayload:     unknown | null;
  waMessageId:    string | null;
  createdAt:      Date;
}

// ── Normalized incoming message ───────────────────────────────────────────────

/**
 * Result of normalizing a raw Meta Cloud API webhook entry.
 * All message types (text, image, voice, button reply, etc.) are
 * reduced to a single text string in `content`.
 */
export interface NormalizedIncomingMessage {
  waMessageId:   string;
  phoneNumberId: string;    // Meta phone_number_id from webhook metadata
  contactPhone:  string;    // E.164, e.g. "+573001234567"
  contactName:   string | null;
  content:       string;    // normalized plain-text
  messageType:   WaRawMessageType;
  timestamp:     Date;
  raw:           unknown;   // full webhook entry for rawPayload storage
}

export type WaRawMessageType =
  | "text"
  | "button_reply"
  | "list_reply"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "sticker"
  | "reaction"
  | "other";

// ── Config upsert input ───────────────────────────────────────────────────────

export interface WaConfigInput {
  phoneNumberId:  string;
  wabaId:         string;
  webhookSecret:  string;
  displayName:    string;
  welcomeMessage?: string | null;
  intentConfig?:  Record<string, unknown> | null;
  brandConfig?:   Record<string, unknown> | null;
  active?:        boolean;
}

// ── Typed intentConfig structure ──────────────────────────────────────────────
//
// `WhatsAppConfig.intentConfig` is stored as untyped Json in Prisma.
// This typed interface is used by the reply engine after safe parsing.
// All fields are optional so partial configs work without errors.
//
// Example minimal config:
//   { displayName: "Mi Tienda", hours: { schedule: "L-V 9am-6pm" },
//     faq: [{ keywords: ["precio"], a: "Escríbenos para cotizar." }] }

export interface WaFaqEntry {
  /** Trigger keywords — matched against the normalized user message. */
  keywords?: string[];
  /** Full question text — used as display label in admin UI. */
  q?:        string;
  /** Answer returned to the user when this entry matches. Required. */
  a:         string;
}

export interface WaIntentConfig {
  /** FAQ entries — matched by keyword, returned verbatim. */
  faq?: WaFaqEntry[];

  /** Business hours. Shown for FAQ/UNKNOWN intents when no FAQ matches. */
  hours?: {
    /** Human-readable schedule, e.g. "Lunes a Viernes 8am–6pm, Sábados 9am–1pm" */
    schedule: string;
    /** IANA timezone, e.g. "America/Bogota". Defaults to UTC if omitted. */
    timezone?: string;
  };

  /** Physical location. Included in location/FAQ replies. */
  location?: {
    address: string;
    city?:   string;
    /** Google Maps or similar URL. */
    mapUrl?: string;
  };

  /** Appointment / booking config. Used when intent = APPOINTMENT. */
  appointment?: {
    /** Direct booking link shown as a call-to-action. */
    calendarUrl?:  string;
    /** Human-readable booking instructions when no calendarUrl exists. */
    instructions?: string;
    /** Available appointment times, e.g. "Lunes a Viernes 8am–4pm". */
    schedule?:     string;
  };

  /** Sales / catalog config. Used when intent = SALES. */
  sales?: {
    /** Product catalog or price-list URL. */
    catalogUrl?:  string;
    /** Free-text pricing summary, e.g. "Desde $50,000". */
    priceRange?:  string;
    /** Custom call-to-action for sales queries. */
    contactInfo?: string;
  };

  /** Support config. Used when intent = SUPPORT. */
  support?: {
    email?:        string;
    phone?:        string;
    /** Instructions for submitting a support request. */
    instructions?: string;
  };

  /** Escalation / handoff config. Used when intent = HANDOFF. */
  escalation?: {
    /** Custom handoff message. Overrides the default template. */
    message?: string;
    /** Contact info to show in the handoff message. */
    contact?: string;
    /** When human agents are available. */
    hours?:   string;
  };

  /** Low-confidence fallback config. Used when intent = UNKNOWN with no FAQ match. */
  fallback?: {
    /** Custom fallback message. Overrides the default template. */
    message?: string;
  };
}

// ── Brand voice ───────────────────────────────────────────────────────────────

/**
 * Conversational tone applied to all generated replies.
 *   friendly     — warm, casual Spanish (default)
 *   premium      — formal, polished; removes casual openers/exclamations
 *   urgent       — short, action-oriented; strips filler phrases
 *   consultative — adds advisory framing ("Según tu consulta, …")
 */
export type WaTone = "friendly" | "premium" | "urgent" | "consultative";

/**
 * Tenant brand voice configuration.
 * Stored in WhatsAppConfig.brandConfig and applied as a deterministic post-processor
 * on every generated reply. No LLM dependency required.
 */
export interface WaBrandVoice {
  /** Conversational tone. Default: "friendly". */
  tone?:             WaTone;
  /** Set to false to strip all emoji from replies. Default: true (emoji kept). */
  useEmoji?:         boolean;
  /** Fixed closing phrase appended to every reply. e.g. "¡Hasta pronto! 👋" */
  closingStyle?:     string;
  /** Phrases that must never appear in replies (removed deterministically). */
  forbiddenPhrases?: string[];
  /**
   * Pool of signature phrases. One is picked deterministically (by reply length
   * modulo pool size) and appended after the reply body.
   * e.g. ["— Equipo Castillitos", "Con cariño, tu equipo de confianza"]
   */
  signaturePhrases?: string[];
  /**
   * Free-text sales style hint injected into SALES replies when present.
   * e.g. "Menciona siempre la garantía de satisfacción 30 días"
   */
  salesStyleHints?:  string;
  /** Controls the tone of handoff/escalation messages. */
  escalationStyle?:  "warm" | "efficient" | "premium";
}
