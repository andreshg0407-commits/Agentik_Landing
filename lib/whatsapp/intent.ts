/**
 * lib/whatsapp/intent.ts
 *
 * Intent classification scaffold for the Agentik WhatsApp module.
 *
 * Current implementation: keyword-based matching (fast, zero latency, no LLM cost).
 * This is intentionally a scaffold — the function signature and WaIntent type
 * are the stable contract. The body can be swapped for an LLM call or a
 * fine-tuned classifier without touching any caller.
 *
 * Supported intents (match prisma WaIntent enum):
 *   FAQ         — general questions about the business
 *   APPOINTMENT — scheduling, availability, booking
 *   SALES       — pricing, products, orders, quotes
 *   SUPPORT     — problems, complaints, returns
 *   HANDOFF     — explicit request to speak with a human
 *   UNKNOWN     — no keyword match
 *
 * Priority order: HANDOFF > APPOINTMENT > SALES > SUPPORT > FAQ > UNKNOWN.
 * Handoff is checked first so a user saying "quiero hablar con alguien sobre
 * un precio" is correctly routed to a human rather than classified as SALES.
 *
 * Keywords are in Spanish (primary) with some common English variants.
 * Extend KEYWORD_MAP to add more without changing the function signature.
 */

import type { WaIntent } from "./types";

// ── Keyword map ───────────────────────────────────────────────────────────────

const KEYWORD_MAP: ReadonlyArray<{ intent: WaIntent; keywords: string[] }> = [
  {
    intent:   "HANDOFF",
    keywords: [
      "hablar con",
      "hablar con alguien",
      "agente",
      "asesor",
      "representante",
      "persona",
      "humano",
      "operador",
      "quiero hablar",
      "necesito hablar",
      "comunicarme con",
      "speak to",
      "human agent",
    ],
  },
  {
    intent:   "APPOINTMENT",
    keywords: [
      "cita",
      "agendar",
      "agenda",
      "reservar",
      "reserva",
      "turno",
      "horario disponible",
      "disponibilidad",
      "cuándo puedo",
      "cuándo tienen",
      "appointment",
      "schedule",
      "booking",
    ],
  },
  {
    intent:   "SALES",
    keywords: [
      "precio",
      "costo",
      "cuánto cuesta",
      "cuánto vale",
      "comprar",
      "quiero comprar",
      "pedido",
      "cotización",
      "cotizar",
      "producto",
      "artículo",
      "catálogo",
      "oferta",
      "descuento",
      "disponible",
      "stock",
      "tiene",
      "venden",
      "envío",
      "domicilio",
      "price",
      "order",
      "buy",
    ],
  },
  {
    intent:   "SUPPORT",
    keywords: [
      "problema",
      "error",
      "falla",
      "fallo",
      "no funciona",
      "no sirve",
      "ayuda",
      "soporte",
      "queja",
      "reclamo",
      "devolución",
      "devolver",
      "reembolso",
      "cambio",
      "garantía",
      "support",
      "issue",
      "broken",
      "refund",
    ],
  },
  {
    intent:   "FAQ",
    keywords: [
      "cómo",
      "qué es",
      "información",
      "info",
      "dirección",
      "ubicación",
      "dónde están",
      "dónde quedan",
      "horario",
      "horarios",
      "atienden",
      "abierto",
      "cerrado",
      "políticas",
      "política",
      "requisito",
      "requisitos",
      "cuáles son",
      "how",
      "what",
      "where",
      "when",
    ],
  },
];

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classifies the intent of a plain-text message.
 *
 * @param text  Normalized message content from normalize.ts.
 * @returns     A WaIntent value. Always returns a non-null string.
 *
 * Future extension points:
 *   - Replace body with `await classifyWithLLM(text, orgContext)` when ready.
 *   - Accept per-org custom keywords from WhatsAppConfig.intentConfig.
 *   - Add confidence score for routing decisions (escalate if confidence < threshold).
 */
export function classifyIntent(text: string): WaIntent {
  if (!text || text.startsWith("[")) {
    // Media messages (images, audio, etc.) default to SUPPORT
    // so a human or follow-up prompt can handle them.
    return "SUPPORT";
  }

  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const { intent, keywords } of KEYWORD_MAP) {
    if (keywords.some(kw => normalized.includes(kw))) {
      return intent;
    }
  }

  return "UNKNOWN";
}

/**
 * Returns a human-readable Spanish label for each intent.
 * Used in admin UI and conversation logs.
 */
export const INTENT_LABEL: Record<WaIntent, string> = {
  FAQ:         "Consulta general",
  APPOINTMENT: "Cita / agenda",
  SALES:       "Ventas",
  SUPPORT:     "Soporte",
  HANDOFF:     "Transferencia a humano",
  UNKNOWN:     "Sin clasificar",
};
