/**
 * lib/copilot/copilot-intent-resolver.ts
 *
 * Agentik — Copilot Intelligence — Intent Resolver
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Rule-based business intent classifier.
 * No AI. No LLM. No Prisma. No server-only.
 *
 * Classifies Spanish-language business queries into intent domains
 * using weighted keyword scoring per domain.
 *
 * MULTI_DOMAIN is triggered when 2+ specific domains score above threshold
 * OR when explicit company-level language is detected with no single domain winner.
 */

import type { CopilotIntent } from "./copilot-types";

// ── Normalizer ────────────────────────────────────────────────────────────────

/**
 * Normalize text: lowercase, remove accents, collapse whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip combining diacritical marks
    .replace(/[¿¡?!,;:.()'"]/g, " ")  // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// ── Keyword scoring ───────────────────────────────────────────────────────────

/**
 * Count how many keywords from the list appear in the normalized text.
 * Whole-word matches score 2; substring matches score 1.
 */
function scoreKeywords(text: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (!text.includes(kw)) continue;
    // Prefer whole-word boundary match
    const wordBoundary = new RegExp(`(^|\\s)${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`);
    score += wordBoundary.test(text) ? 2 : 1;
  }
  return score;
}

// ── Domain keyword vocabularies ───────────────────────────────────────────────

/** Finance / Treasury / Reconciliation */
const FINANCE_KEYWORDS: string[] = [
  "caja", "tesoreria", "conciliacion", "presupuesto", "liquidez",
  "flujo de caja", "flujo", "cash", "balance", "financiero", "finanzas",
  "efectivo", "deuda", "capital", "resultado financiero", "estado financiero",
  "diferencia contable", "coberturas", "cobros hoy", "cobranzas del dia",
  "cierre financiero", "cierre", "planeacion financiera", "planeacion",
  "banco", "bancos", "cuenta bancaria", "cuentas bancarias", "saldo bancario",
  "transferencia", "conciliar", "disponible", "reserva de caja",
  // NOTE: "credito" excluded — too generic; appears in both finance and collections context
];

/** Marketing / Content / Campaigns */
const MARKETING_KEYWORDS: string[] = [
  "campana", "marketing", "contenido", "redes", "publicacion", "pauta",
  "foto", "imagen", "instagram", "tiktok", "shopify", "catalogo",
  "publicar", "post", "social", "campanas", "anuncio", "anuncios",
  "creatividad", "diseño", "biblioteca", "foto estudio", "canal digital",
  "meta", "facebook", "whatsapp marketing", "email marketing",
];

/** Commercial / Sales / Clients */
const COMMERCIAL_KEYWORDS: string[] = [
  // "cliente"/"clientes" retained — primary commercial term; overlap with collections is resolved
  // at the intent level (2+ domains → MULTI_DOMAIN).
  "cliente", "clientes", "clientes en riesgo", "clientes nuevos", "clientes activos",
  "venta", "ventas", "pedido", "pedidos", "margen", "comercial",
  "vendedor", "vendedores", "oportunidad", "canal de venta",
  // NOTE: "negocio" excluded — too generic for company-level queries
  "volumen de ventas", "ticket promedio", "cartera comercial",
  "captacion", "pipeline comercial", "ventas del mes", "cuota de ventas",
  "conversion", "propuesta comercial", "cotizacion", "maleta", "maletas",
];

/** Collections / Cartera / Overdue */
const COLLECTIONS_KEYWORDS: string[] = [
  "factura", "cartera", "vencida", "vencido", "cobranza", "cobro",
  "mora", "pago pendiente", "cuentas por cobrar", "cobros", "deudor",
  "facturas vencidas", "facturas pendientes", "mora alta", "deuda vencida",
  "recuperacion de cartera", "gestionar cobros", "credito vencido",
  "dias de mora", "antigüedad de cartera", "antiguedad de cartera",
];

/** Multi-domain / Company-level / General status queries */
const MULTI_DOMAIN_KEYWORDS: string[] = [
  "como va", "como esta", "como estamos", "resumen", "panorama",
  "situacion", "empresa", "todo", "integral", "overview", "general",
  "consolidado", "informe general", "estado general", "reporte ejecutivo",
  "que pasa", "que esta pasando", "dame un resumen", "como vamos",
  "estatus general", "status general", "vision general", "como andamos",
  // Executive concern queries — "what should I worry about", "what problems do we have"
  "problemas", "problema grave", "que problemas", "preocupaciones",
  "alertas criticas", "riesgos", "lo mas importante", "prioridades",
  "que me deberia preocupar", "que hay urgente",
];

// ── Domain score map ──────────────────────────────────────────────────────────

interface DomainScores {
  FINANCE:     number;
  MARKETING:   number;
  COMMERCIAL:  number;
  COLLECTIONS: number;
  MULTI:       number; // multi-domain language
}

function scoreDomains(normalizedText: string): DomainScores {
  return {
    FINANCE:     scoreKeywords(normalizedText, FINANCE_KEYWORDS),
    MARKETING:   scoreKeywords(normalizedText, MARKETING_KEYWORDS),
    COMMERCIAL:  scoreKeywords(normalizedText, COMMERCIAL_KEYWORDS),
    COLLECTIONS: scoreKeywords(normalizedText, COLLECTIONS_KEYWORDS),
    MULTI:       scoreKeywords(normalizedText, MULTI_DOMAIN_KEYWORDS),
  };
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Classify the business intent of a user message.
 *
 * Algorithm:
 *   1. Normalize the message
 *   2. Score each domain via keyword matching
 *   3. Identify domains that scored above the threshold (>= 1)
 *   4. If 2+ specific domains scored → MULTI_DOMAIN
 *   5. If 1 specific domain scored → that domain
 *   6. If 0 specific domains scored + multi-domain language detected → MULTI_DOMAIN
 *   7. Otherwise → GENERAL
 *
 * @param userMessage  Raw user message in any language (Spanish optimized).
 * @returns            CopilotIntent — never throws.
 */
export function resolveCopilotIntent(userMessage: string): CopilotIntent {
  if (!userMessage || userMessage.trim().length === 0) return "GENERAL";

  const text   = normalize(userMessage);
  const scores = scoreDomains(text);

  // Collect domains with a positive score
  const THRESHOLD = 1;
  const matched: CopilotIntent[] = [];

  if (scores.FINANCE     >= THRESHOLD) matched.push("FINANCE");
  if (scores.MARKETING   >= THRESHOLD) matched.push("MARKETING");
  if (scores.COMMERCIAL  >= THRESHOLD) matched.push("COMMERCIAL");
  if (scores.COLLECTIONS >= THRESHOLD) matched.push("COLLECTIONS");

  // 2+ specific domains → MULTI_DOMAIN
  if (matched.length >= 2) return "MULTI_DOMAIN";

  // Exactly 1 specific domain — but check MULTI signal strength first.
  // If multi-domain language scores >= the specific domain, treat as MULTI_DOMAIN.
  // (e.g. "Situación general del negocio" — MULTI=2, COMMERCIAL=2 → MULTI_DOMAIN)
  // This prevents generic terms like "negocio" from overriding a clear general intent.
  if (matched.length === 1) {
    // Only override with MULTI_DOMAIN if the multi-domain signal is STRICTLY stronger
    // than the specific domain (avoids "¿Cómo está la caja?" → MULTI_DOMAIN when both score 2).
    const specificScore = Math.max(scores.FINANCE, scores.MARKETING, scores.COMMERCIAL, scores.COLLECTIONS);
    if (scores.MULTI >= THRESHOLD && scores.MULTI > specificScore) return "MULTI_DOMAIN";
    return matched[0]!;
  }

  // No specific domain — check for general company-level language
  if (scores.MULTI >= THRESHOLD) return "MULTI_DOMAIN";

  return "GENERAL";
}

// ── Debug utility (non-production) ───────────────────────────────────────────

/**
 * Returns raw domain scores for a user message.
 * Useful for testing and explaining intent resolution decisions.
 */
export function debugIntentScores(userMessage: string): {
  normalized: string;
  scores:     DomainScores;
  intent:     CopilotIntent;
} {
  const normalized = normalize(userMessage);
  const scores     = scoreDomains(normalized);
  const intent     = resolveCopilotIntent(userMessage);
  return { normalized, scores, intent };
}
