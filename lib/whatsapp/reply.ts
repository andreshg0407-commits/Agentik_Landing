/**
 * lib/whatsapp/reply.ts
 *
 * Conversational reply generator for the Agentik WhatsApp module.
 *
 * Design philosophy:
 *   1. Deterministic first — config-driven, zero latency, zero LLM cost.
 *   2. Config-based answers cover 80% of small-business use cases
 *      (hours, location, FAQ, appointments, pricing).
 *   3. Graceful fallback to a safe short reply + human handoff offer.
 *   4. No LLM call in this sprint — the function signature is the stable
 *      contract; swapping the body for an LLM call later requires zero
 *      caller changes.
 *
 * Reply generation order:
 *   HANDOFF intent → handoff reply (always, immediately)
 *   First contact  → prepend welcomeMessage
 *   FAQ intent     → keyword FAQ lookup → fallback to generic FAQ reply
 *   APPOINTMENT    → calendar link / instructions from config
 *   SALES          → catalog link / pricing / contact from config
 *   SUPPORT        → support contact from config
 *   UNKNOWN        → FAQ lookup → low-confidence fallback + handoff offer
 *
 * All text is in Spanish by default (target market: Colombia).
 * Tenants can override any template via intentConfig.escalation.message,
 * intentConfig.fallback.message, etc.
 *
 * Multi-tenant: no business name or content is hardcoded here.
 * Everything comes from WaConfig (displayName, welcomeMessage) and
 * WaIntentConfig (faq, hours, location, appointment, sales, support,
 * escalation, fallback).
 */

import type { WaConfig, WaIntent, WaIntentConfig, WaFaqEntry, WaBrandVoice } from "./types";
import { parseIntentConfig, parseBrandConfig } from "./config";
import type { WaContactMemory } from "./memory";

// ── Public interface ──────────────────────────────────────────────────────────

export interface GenerateReplyOptions {
  config:         WaConfig;
  intent:         WaIntent;
  userText:       string;
  isFirstMessage: boolean;
  /** Contact memory for personalization. Null for brand-new contacts. */
  memory?:        WaContactMemory | null;
  /** WhatsApp display name of the contact (from normalized.contactName). */
  contactName?:   string | null;
  /**
   * Set to true when the original message was a voice note.
   * The userText will already be the transcript (or "[audio]" if unavailable).
   */
  isAudio?:       boolean;
}

export interface GeneratedReply {
  content:       string;
  /** Whether this reply triggers a conversation handoff to a human. */
  triggersHandoff: boolean;
}

/**
 * Generates the assistant reply for an incoming WhatsApp message.
 *
 * Fully deterministic — no I/O, no async, no side effects.
 * The caller persists the reply and updates conversation state.
 *
 * @param opts.config          Tenant WhatsApp config (displayName, welcomeMessage, intentConfig).
 * @param opts.intent          Classified intent of the incoming message.
 * @param opts.userText        Normalized plain-text from the incoming message.
 * @param opts.isFirstMessage  True when this is the very first message in the conversation.
 */
export function generateReply(opts: GenerateReplyOptions): GeneratedReply {
  const { config, intent, userText, isFirstMessage, memory, contactName, isAudio } = opts;
  const ic = parseIntentConfig(config.intentConfig);
  const bv = parseBrandConfig(config.brandConfig);

  // ── 1. HANDOFF — always handled first, overrides all other logic ────────────
  if (intent === "HANDOFF") {
    const raw = buildHandoffReply(config, ic, bv);
    return {
      content:         applyBrandVoice(raw, bv),
      triggersHandoff: true,
    };
  }

  // ── 2. Greeting prefix ─────────────────────────────────────────────────────
  // Returning contacts (memory exists from a prior thread) get a personalized
  // returning greeting instead of / in addition to the static welcomeMessage.
  // New contacts get the welcomeMessage on their very first message.
  let welcome = "";
  if (isFirstMessage) {
    if (memory && memory.totalConversations >= 1) {
      // Returning contact starting a new conversation thread
      welcome = buildReturningGreeting(memory, contactName ?? null) + "\n\n";
    } else if (config.welcomeMessage) {
      // Brand-new contact
      welcome = config.welcomeMessage.trim() + "\n\n";
    }
  }

  // ── 3. Audio acknowledgement ───────────────────────────────────────────────
  // When a voice note was transcribed, add a subtle acknowledgement prefix so
  // the reply feels contextually aware. Skipped when transcript was unavailable
  // (userText still starts with "[audio]").
  const audioPrefix =
    isAudio && userText && !userText.startsWith("[")
      ? "_(Escuché tu nota de voz)_ "
      : "";

  // ── 4. Intent routing ──────────────────────────────────────────────────────
  let body: string;

  switch (intent) {
    case "FAQ": {
      const faqAnswer = lookupFAQ(ic.faq, userText);
      body = faqAnswer ?? buildInfoBlock(config, ic) ?? buildFallbackReply(config, ic);
      break;
    }

    case "APPOINTMENT":
      body = buildAppointmentReply(config, ic);
      break;

    case "SALES":
      body = buildSalesReply(config, ic, bv, memory, contactName ?? null);
      break;

    case "SUPPORT":
      body = buildSupportReply(config, ic);
      break;

    case "UNKNOWN":
    default: {
      const faqAnswer = lookupFAQ(ic.faq, userText);
      body = faqAnswer ?? buildFallbackReply(config, ic);
      break;
    }
  }

  const raw = (welcome + audioPrefix + body).trim();
  return {
    content:         applyBrandVoice(raw, bv),
    triggersHandoff: false,
  };
}

// ── Handoff ───────────────────────────────────────────────────────────────────

function buildHandoffReply(config: WaConfig, ic: WaIntentConfig, bv: WaBrandVoice): string {
  // Tenant can fully override the handoff message
  if (ic.escalation?.message) {
    return ic.escalation.message;
  }

  // Escalation style from brand voice
  const style = bv.escalationStyle ?? "warm";

  const openings: Record<string, string> = {
    warm:      `Entendido. Un asesor de *${config.displayName}* te atenderá en breve. 🙏`,
    efficient: `Tu solicitud fue recibida. Un asesor de *${config.displayName}* te contactará pronto.`,
    premium:   `Hemos registrado tu solicitud. Un especialista de *${config.displayName}* estará contigo en breve.`,
  };

  const lines: string[] = [openings[style] ?? openings.warm];

  if (ic.escalation?.contact) {
    lines.push(`📞 También puedes contactarnos directamente: ${ic.escalation.contact}`);
  }
  if (ic.escalation?.hours) {
    lines.push(`🕐 Horario de atención: ${ic.escalation.hours}`);
  }

  if (style !== "efficient") {
    lines.push("Mientras tanto, puedes seguir escribiendo y lo veremos.");
  }

  return lines.join("\n");
}

// ── Appointment ───────────────────────────────────────────────────────────────

function buildAppointmentReply(config: WaConfig, ic: WaIntentConfig): string {
  const appt = ic.appointment;

  if (!appt) {
    return (
      `¡Recibido! Tu solicitud de cita con *${config.displayName}* fue registrada. ` +
      `Un asesor confirmará disponibilidad contigo en breve. ✅`
    );
  }

  const lines: string[] = [`¡Claro! Podemos ayudarte a agendar con *${config.displayName}*. 📅`];

  if (appt.calendarUrl) {
    lines.push(`\n👉 Reserva tu cita aquí: ${appt.calendarUrl}`);
  } else if (appt.instructions) {
    lines.push(`\n${appt.instructions}`);
  }

  if (appt.schedule) {
    lines.push(`🕐 Disponibilidad: ${appt.schedule}`);
  }

  return lines.join("\n");
}

// ── Sales ─────────────────────────────────────────────────────────────────────

function buildSalesReply(
  config:      WaConfig,
  ic:          WaIntentConfig,
  bv:          WaBrandVoice,
  memory:      WaContactMemory | null | undefined,
  contactName: string | null,
): string {
  const sales = ic.sales;

  // Returning customer with a previous product interest — acknowledge it
  const returningHint =
    memory?.lastProductMention && memory.lastSuccessfulOutcome === "SALES"
      ? `\n_(Antes preguntaste por *${memory.lastProductMention}* — cuéntanos si buscas algo diferente esta vez.)_`
      : "";

  if (!sales) {
    return (
      `¡Gracias por tu interés en *${config.displayName}*! 🛍️\n` +
      `Tu consulta fue registrada. Un asesor se comunicará contigo pronto.` +
      returningHint
    );
  }

  const lines: string[] = [`¡Hola! Te ayudamos con tu consulta de *${config.displayName}*. 🛍️`];

  if (sales.catalogUrl) {
    lines.push(`\n📋 Nuestro catálogo: ${sales.catalogUrl}`);
  }
  if (sales.priceRange) {
    lines.push(`💰 Precios: ${sales.priceRange}`);
  }
  if (sales.contactInfo) {
    lines.push(`\n${sales.contactInfo}`);
  } else {
    lines.push(`\nTu consulta fue registrada. Un asesor se comunicará contigo pronto. 😊`);
  }

  // Brand-voice sales style hint — appended as a closing line when present
  if (bv.salesStyleHints) {
    lines.push(`\n_${bv.salesStyleHints}_`);
  }

  if (returningHint) lines.push(returningHint);

  return lines.join("\n");
}

// ── Support ───────────────────────────────────────────────────────────────────

function buildSupportReply(config: WaConfig, ic: WaIntentConfig): string {
  const support = ic.support;

  const lines: string[] = [
    `Lamentamos los inconvenientes. El equipo de *${config.displayName}* ya está revisando tu caso. 🙏`,
  ];

  if (support?.instructions) {
    lines.push(`\n${support.instructions}`);
  }
  if (support?.email) {
    lines.push(`📧 También puedes escribirnos a: ${support.email}`);
  }
  if (support?.phone) {
    lines.push(`📞 O llamarnos al: ${support.phone}`);
  }

  if (!support?.instructions && !support?.email && !support?.phone) {
    lines.push(
      `\nPor favor cuéntanos con más detalle qué ocurrió y ` +
      `un asesor te contactará a la brevedad.`,
    );
  }

  return lines.join("\n");
}

// ── General info block (FAQ fallback) ─────────────────────────────────────────

/**
 * Builds a compact info block from whatever is in the config.
 * Shown for FAQ intent when no FAQ keyword matches — gives the user
 * something useful (hours, location) rather than a generic fallback.
 * Returns null if config has no info to show.
 */
function buildInfoBlock(config: WaConfig, ic: WaIntentConfig): string | null {
  const lines: string[] = [];

  if (ic.hours?.schedule) {
    lines.push(`🕐 *Horarios:* ${ic.hours.schedule}`);
  }
  if (ic.location?.address) {
    const addr = [ic.location.address, ic.location.city].filter(Boolean).join(", ");
    lines.push(`📍 *Dirección:* ${addr}`);
    if (ic.location.mapUrl) {
      lines.push(`   ${ic.location.mapUrl}`);
    }
  }

  if (lines.length === 0) return null;

  return (
    `Información de *${config.displayName}*:\n\n` +
    lines.join("\n") +
    `\n\n¿Hay algo más en lo que podamos ayudarte?`
  );
}

// ── Fallback (low-confidence) ─────────────────────────────────────────────────

/**
 * Safe low-confidence fallback — always produces a usable reply.
 * Tenants can override the message via intentConfig.fallback.message.
 * Ends with a handoff offer so the user always has an exit.
 */
function buildFallbackReply(config: WaConfig, ic: WaIntentConfig): string {
  if (ic.fallback?.message) {
    return ic.fallback.message;
  }

  return (
    `Hola, gracias por escribir a *${config.displayName}*. 😊\n\n` +
    `No estoy seguro de cómo ayudarte con eso. ` +
    `¿Podrías darme más detalles? También puedo conectarte con un asesor si lo prefieres. ` +
    `Solo escribe *"asesor"* cuando quieras.`
  );
}

// ── Returning contact greeting ────────────────────────────────────────────────

/**
 * Builds a short personalized greeting for a contact who has written before.
 * Safely surfaces up to one piece of previous-interaction context.
 */
function buildReturningGreeting(
  memory:      WaContactMemory,
  contactName: string | null,
): string {
  const firstName = (contactName ?? memory.contactName ?? "").split(" ")[0].trim() || null;
  const nameStr   = firstName ? `, ${firstName}` : "";

  if (memory.lastSuccessfulOutcome === "APPOINTMENT" && memory.lastAppointmentRequest) {
    return `¡Hola de nuevo${nameStr}! 😊 La última vez agendamos algo para *${memory.lastAppointmentRequest}*. ¿En qué te podemos ayudar hoy?`;
  }
  if (memory.lastSuccessfulOutcome === "SALES") {
    return `¡Bienvenido de nuevo${nameStr}! 👋 Qué gusto verte por aquí otra vez.`;
  }
  if (memory.lastHandoffAt) {
    return `¡Hola de nuevo${nameStr}! 😊 ¿En qué te podemos ayudar hoy?`;
  }
  return `¡Hola de nuevo${nameStr}! 👋`;
}

// ── Brand voice transformer ───────────────────────────────────────────────────

/**
 * Applies the tenant's brand voice settings to a generated reply as a
 * deterministic post-processor. Never calls any external service.
 *
 * Application order:
 *   1. Remove forbidden phrases
 *   2. Strip emoji (when useEmoji === false)
 *   3. Apply tone-based transformations
 *   4. Append signature phrase (deterministic: reply.length % pool.length)
 *   5. Append closing style
 */
export function applyBrandVoice(text: string, bv: WaBrandVoice | undefined): string {
  if (!bv || Object.keys(bv).length === 0) return text;

  let result = text;

  // 1. Remove forbidden phrases
  for (const phrase of bv.forbiddenPhrases ?? []) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(escaped, "gi"), "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  // 2. Emoji control
  if (bv.useEmoji === false) {
    result = result
      // Basic emoji ranges
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
      // Misc symbols, dingbats, etc.
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      // Variation selectors
      .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  // 3. Tone-specific transformations
  switch (bv.tone) {
    case "premium":
      // Remove casual exclamation openers while preserving content
      result = result
        .replace(/^¡(Hola|Recibido|Claro|Perfecto|Listo|Genial|Bienvenido|Hola de nuevo)[,!]\s*/i, "")
        .replace(/^¡/, "");
      break;

    case "urgent":
      // Remove common filler phrases to keep the message concise and action-oriented
      result = result
        .replace(/Con mucho gusto[,.]?\s*/gi, "")
        .replace(/Muchas gracias por contactarnos[,.]?\s*/gi, "")
        .replace(/Un placer atenderte[,.]?\s*/gi, "");
      break;

    case "consultative":
      // Prepend advisory framing when the reply opens with a direct statement
      if (
        result.length > 20 &&
        !/^(Con base en|Basándonos|Según|De acuerdo a)/i.test(result)
      ) {
        result = "Según tu consulta, " + result.charAt(0).toLowerCase() + result.slice(1);
      }
      break;

    // "friendly" (default) — no transformation
  }

  // 4. Signature phrase (deterministic pick — no randomness)
  const sigs = bv.signaturePhrases;
  if (sigs?.length) {
    const idx = result.length % sigs.length;
    result = result.trimEnd() + "\n\n" + sigs[idx];
  }

  // 5. Closing style
  if (bv.closingStyle) {
    result = result.trimEnd() + "\n\n" + bv.closingStyle;
  }

  return result.trim();
}

// ── FAQ keyword lookup ────────────────────────────────────────────────────────

/**
 * Finds the best-matching FAQ entry for the user's message text.
 *
 * Matching strategy (in order):
 *   1. Any keyword from entry.keywords appears in the normalized message.
 *   2. A significant word (>= 4 chars) from entry.q appears in the message.
 *
 * Returns the answer string of the first match, or null if no match.
 * Case-insensitive and accent-insensitive.
 */
export function lookupFAQ(
  entries: WaFaqEntry[] | undefined,
  userText: string,
): string | null {
  if (!entries || entries.length === 0) return null;

  const normalized = normalizeText(userText);

  for (const entry of entries) {
    if (!entry.a) continue; // skip malformed entries

    // Strategy 1: explicit keyword list
    if (Array.isArray(entry.keywords) && entry.keywords.length > 0) {
      if (entry.keywords.some(kw => normalized.includes(normalizeText(kw)))) {
        return entry.a;
      }
    }

    // Strategy 2: significant words from question text
    if (entry.q) {
      const qWords = normalizeText(entry.q)
        .split(/\s+/)
        .filter(w => w.length >= 4);
      if (qWords.some(w => normalized.includes(w))) {
        return entry.a;
      }
    }
  }

  return null;
}

// ── String helpers ────────────────────────────────────────────────────────────

/**
 * Lowercase + remove diacritics + collapse whitespace.
 * Used for accent-insensitive, punctuation-tolerant keyword matching.
 */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/[^\w\s]/g, " ")        // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}
