/**
 * lib/copilot/memory/memory-classifier.ts
 *
 * Agentik — Copilot Memory Engine — Memory Classification Engine
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * Rule-based classifier that determines:
 *   1. Whether content deserves to be stored as a memory.
 *   2. What type/importance/scope/tags to assign.
 *
 * No AI. No LLM. No embeddings. No external calls.
 * Deterministic, keyword-weighted, always returns a result.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { MemoryClassification, MemoryType, MemoryImportance, MemoryScope } from "./memory-types";

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[¿¡?!,;:.()'"\-]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// ── Trivial content detection ─────────────────────────────────────────────────

/**
 * Short phrase patterns that indicate trivial, non-memorable content.
 * Matched against the normalized text (whole-text or phrase-dominant).
 */
const TRIVIAL_EXACT: string[] = [
  "hola", "buenas", "buenos dias", "buenas tardes", "buenas noches",
  "gracias", "muchas gracias", "ok", "okay", "bien", "muy bien",
  "perfecto", "dale", "de acuerdo", "entendido", "claro", "por supuesto",
  "test", "prueba", "probando", "ejemplo", "testing",
  "si", "no", "tal vez", "quizas",
  "me puedes ayudar", "ayuda", "help",
  "que haces", "como estas", "que tal", "como va todo",
];

/**
 * Keyword fragments that, if the entire content is dominated by them,
 * indicate trivial content (chat noise).
 */
const TRIVIAL_FRAGMENTS: string[] = [
  "hola", "buenas", "gracias", "ok", "bien", "perfecto", "dale", "entendido",
  "test", "prueba",
];

function isTrivialContent(normalized: string): { trivial: boolean; reason: string } {
  // Rule 1: Too short to be meaningful
  if (normalized.length < 15) {
    return { trivial: true, reason: "content too short (< 15 chars)" };
  }

  // Rule 2: Exact trivial phrase match
  if (TRIVIAL_EXACT.includes(normalized)) {
    return { trivial: true, reason: "common greeting or acknowledgment" };
  }

  // Rule 3: Content is dominated by a trivial fragment (≤ 3 words total, all trivial)
  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 4) {
    const trivialWordCount = words.filter(w => TRIVIAL_FRAGMENTS.some(f => w.includes(f))).length;
    if (trivialWordCount / words.length >= 0.75) {
      return { trivial: true, reason: "phrase dominated by trivial keywords" };
    }
  }

  return { trivial: false, reason: "" };
}

// ── Strategic keyword vocabularies ───────────────────────────────────────────

/** Facts about integrations, systems, platforms, business priorities */
const STRATEGIC_KEYWORDS: string[] = [
  "usa", "utiliza", "integra", "sistema", "plataforma", "configurado",
  "conecta con", "trabaja con", "implemento", "activado", "habilitado",
  "estrategia", "prioritario", "linea de negocio", "servicio de",
  "pendiente de integracion", "pendiente de activacion",
  "api", "webhook", "conector", "sag", "shopify", "meta", "tiktok",
  "banco", "pagosnet", "transferencia", "flujo de aprobacion",
  "modelo de negocio", "segmento", "canal principal",
];

/** Day-to-day operational facts */
const OPERATIONAL_KEYWORDS: string[] = [
  "pendiente", "en proceso", "en curso", "completado", "finalizado",
  "estado de", "avance de", "progreso de", "bloqueado", "detenido",
  "esta semana", "este mes", "hoy", "ayer", "manana",
  "revisar", "aprobar", "rechazado", "publicado",
  "reporte", "informe", "cierre", "conciliacion",
];

/** User or agent preferences */
const PREFERENCE_KEYWORDS: string[] = [
  "prefiere", "le gusta", "quiere que", "siempre usar", "configuracion",
  "prefiero", "me gusta", "quiero que", "formato", "estilo",
  "agente especializado", "vista por modulo", "por defecto",
  "tono", "idioma", "resumen corto", "detalle completo",
];

/** Observed patterns over time */
const LEARNING_KEYWORDS: string[] = [
  "patron", "siempre que", "cada vez que", "normalmente", "tendencia",
  "suele", "acostumbra", "regularmente", "tipicamente",
  "cuando hay", "si pasa", "ante esto", "al detectar",
  "aprendizaje", "observacion",
];

/** Importance signals */
const CRITICAL_SIGNALS: string[] = [
  "critico", "urgente", "bloqueante", "sin esto no", "prioridad maxima",
  "fundamental", "esencial para", "no funciona sin",
];

const HIGH_SIGNALS: string[] = [
  "prioritario", "prioritaria", "importante", "principal", "clave", "esencial",
  "alto impacto", "relevante", "debe", "tiene que",
];

const LOW_SIGNALS: string[] = [
  "opcional", "menor", "en algún momento", "cuando se pueda",
  "nice to have", "futuro", "a largo plazo",
];

// ── Keyword scorer ────────────────────────────────────────────────────────────

function scoreKeywords(text: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (!text.includes(kw)) continue;
    const wb = new RegExp(`(^|\\s)${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`);
    score += wb.test(text) ? 2 : 1;
  }
  return score;
}

// ── Tag extraction ────────────────────────────────────────────────────────────

const TAG_MAP: Array<{ keyword: string; tag: string }> = [
  { keyword: "sag",       tag: "sag" },
  { keyword: "shopify",   tag: "shopify" },
  { keyword: "meta",      tag: "meta" },
  { keyword: "tiktok",    tag: "tiktok" },
  { keyword: "banc",      tag: "banking" },   // matches banco, bancaria, bancario
  { keyword: "pagosnet",  tag: "payments" },
  { keyword: "conciliacion", tag: "reconciliation" },
  { keyword: "tesoreria", tag: "treasury" },
  { keyword: "presupuesto", tag: "budget" },
  { keyword: "campana",   tag: "marketing" },
  { keyword: "cliente",   tag: "commercial" },
  { keyword: "factura",   tag: "collections" },
  { keyword: "cartera",   tag: "collections" },
  { keyword: "integracion", tag: "integration" },
  { keyword: "api",       tag: "integration" },
  { keyword: "estrategia", tag: "strategy" },
  { keyword: "prefiere",  tag: "preference" },
  { keyword: "patron",    tag: "pattern" },
];

function extractTags(normalized: string): string[] {
  const tags = new Set<string>();
  for (const { keyword, tag } of TAG_MAP) {
    if (normalized.includes(keyword)) tags.add(tag);
  }
  return Array.from(tags);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Determine if content should be stored as a memory entry.
 *
 * @param content  Raw content string (any language, Spanish optimized).
 * @returns        true if the content is worth storing.
 */
export function shouldStoreMemory(content: string): boolean {
  if (!content || content.trim().length === 0) return false;
  const normalized = normalize(content);
  const { trivial } = isTrivialContent(normalized);
  return !trivial;
}

/**
 * Classify content for memory storage.
 *
 * Algorithm:
 *   1. Normalize text.
 *   2. Check for trivial content → reject.
 *   3. Score each type's keywords.
 *   4. Highest score wins. Tie → OPERATIONAL.
 *   5. Determine importance from signal keywords.
 *   6. Determine scope (TENANT default).
 *   7. Extract tags.
 *
 * @param content  Raw content to classify.
 * @returns        MemoryClassification — never throws.
 */
export function classifyMemory(content: string): MemoryClassification {
  if (!content || content.trim().length === 0) {
    return {
      shouldStore:   false,
      type:          "OPERATIONAL",
      importance:    "LOW",
      scope:         "TENANT",
      suggestedTags: [],
      rejectReason:  "empty content",
    };
  }

  const normalized = normalize(content);
  const trivialCheck = isTrivialContent(normalized);

  if (trivialCheck.trivial) {
    return {
      shouldStore:   false,
      type:          "OPERATIONAL",
      importance:    "LOW",
      scope:         "TENANT",
      suggestedTags: [],
      rejectReason:  trivialCheck.reason,
    };
  }

  // Score each memory type
  const scores: Record<MemoryType, number> = {
    STRATEGIC:   scoreKeywords(normalized, STRATEGIC_KEYWORDS),
    OPERATIONAL: scoreKeywords(normalized, OPERATIONAL_KEYWORDS),
    PREFERENCE:  scoreKeywords(normalized, PREFERENCE_KEYWORDS),
    LEARNING:    scoreKeywords(normalized, LEARNING_KEYWORDS),
  };

  // Pick highest-scoring type (OPERATIONAL as tiebreaker)
  const type: MemoryType = (["STRATEGIC", "PREFERENCE", "LEARNING", "OPERATIONAL"] as MemoryType[])
    .reduce((best, candidate) =>
      scores[candidate] > scores[best] ? candidate : best,
    "OPERATIONAL" as MemoryType);

  // Determine importance
  const criticalScore = scoreKeywords(normalized, CRITICAL_SIGNALS);
  const highScore     = scoreKeywords(normalized, HIGH_SIGNALS);
  const lowScore      = scoreKeywords(normalized, LOW_SIGNALS);

  let importance: MemoryImportance = "MEDIUM";
  if (criticalScore >= 1)                        importance = "CRITICAL";
  else if (highScore >= 2)                       importance = "HIGH";
  else if (highScore >= 1 && type === "STRATEGIC") importance = "HIGH";
  else if (lowScore >= 1 && highScore === 0)     importance = "LOW";

  // STRATEGIC facts about core systems are always at least HIGH
  if (type === "STRATEGIC" && importance === "MEDIUM") importance = "HIGH";

  // Determine scope
  let scope: MemoryScope = "TENANT";
  if (type === "PREFERENCE" || type === "LEARNING") scope = "TENANT";
  // Future: detect MODULE/AGENT scope from module keywords

  const suggestedTags = extractTags(normalized);

  return {
    shouldStore: true,
    type,
    importance,
    scope,
    suggestedTags,
  };
}
