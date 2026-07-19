/**
 * lib/copilot/intent-resolver/intent-entities.ts
 *
 * AGENTIK-INTENT-RESOLVER-02 — Deterministic entity extractor.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Extracts structured information from raw user utterances using regex rules.
 *
 * This module is STANDALONE — it imports nothing from other intent files.
 * Future AI layers can call `extractEntities()` directly and augment the result
 * without replacing it. This is the stable, auditable base.
 *
 * Supported entity types:
 *   - discountPercent   — "20%", "15 por ciento"
 *   - count             — "50 códigos", "100 cupones"
 *   - collection        — "juguetes", "ropa", "bebés"  (explicit or inferred)
 *   - endDate           — "30 de junio", "hasta julio", "fin de mes"
 *   - prefix            — "SAVE2026", "PROMO-"
 *   - minDays           — "más de 7 días" (for delayed shipment queries)
 *   - threshold         — quality score threshold
 *   - productName       — text in quotes
 *   - sku               — uppercase alphanumeric 6–16 chars (e.g. "AB-1234")
 *   - statusKeywords    — "pendientes", "publicados", "fallidos", "retrasados", "agotados"
 *   - targetScope       — derived from context: "pendingProducts", "unpublishedProducts", etc.
 */
import "server-only";

// ── Entity types ──────────────────────────────────────────────────────────────

export interface ExtractedEntities {
  discountPercent?: number;
  count?:           number;
  collection?:      string;
  endDate?:         string;
  prefix?:          string;
  minDays?:         number;
  threshold?:       number;
  productName?:     string;
  sku?:             string;
  /** Status keywords found in the input: "pendientes", "fallidos", "retrasados", "agotados", etc. */
  statusKeywords:   string[];
  /** High-level target scope derived from context */
  targetScope?:     string;
}

/**
 * Semantic entity signals used by the scorer to assign entity-context bonuses.
 * Each signal indicates the presence of a type of entity.
 */
export type EntitySignal =
  | "discount"
  | "count"
  | "collection"
  | "status_pending"
  | "status_failed"
  | "status_delayed"
  | "status_refund"
  | "seo"
  | "date";

// ── Status keyword vocabulary ─────────────────────────────────────────────────

const STATUS_KEYWORDS: Record<string, string> = {
  "pendientes":   "pendientes",
  "pendiente":    "pendientes",
  "publicados":   "publicados",
  "publicado":    "publicados",
  "fallidos":     "fallidos",
  "fallido":      "fallidos",
  "rechazados":   "fallidos",
  "rechazado":    "fallidos",
  "retrasados":   "retrasados",
  "retrasado":    "retrasados",
  "demorados":    "retrasados",
  "demorado":     "retrasados",
  "agotados":     "agotados",
  "agotado":      "agotados",
  "sin publicar": "sin_publicar",
  "sin precio":   "sin_precio",
  "sin imagen":   "sin_imagen",
  "sin seo":      "sin_seo",
};

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Extract structured entities from a raw user utterance.
 *
 * All rules are deterministic regex patterns — no NLP, no AI.
 * Designed to be composable: a future AI layer can call this first and
 * then augment or override individual fields.
 *
 * @param rawInput - The original user text (before any normalization)
 * @returns ExtractedEntities object; statusKeywords is always an array (may be empty)
 */
export function extractEntities(rawInput: string): ExtractedEntities {
  const entities: ExtractedEntities = { statusKeywords: [] };

  // ── Discount percentage ────────────────────────────────────────────────────
  // "20%", "del 20 %", "un 15%", "15 por ciento"
  const pctMatch = rawInput.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    entities.discountPercent = parseFloat(pctMatch[1]);
  } else {
    const pctTextMatch = rawInput.match(/(\d+)\s+por\s+ciento/i);
    if (pctTextMatch) {
      entities.discountPercent = parseInt(pctTextMatch[1], 10);
    }
  }

  // ── Count (before collection to avoid conflict with "50 en juguetes") ──────
  // "50 códigos", "100 cupones", "20 discount codes", "genera 50"
  const countMatch = rawInput.match(
    /(\d+)\s+(?:códigos?|c[oó]digos?|cupones?|codes?|discount\s+codes?)/i,
  );
  if (countMatch) {
    entities.count = parseInt(countMatch[1], 10);
  } else {
    const countFallback = rawInput.match(/(?:genera|generar|crea|crear)\s+(\d+)/i);
    if (countFallback) {
      entities.count = parseInt(countFallback[1], 10);
    }
  }

  // ── Discount code prefix ───────────────────────────────────────────────────
  // "códigos SAVE2026", "prefix PROMO", "prefijo VERANO"
  const prefixExplicit = rawInput.match(/(?:prefijo|prefix)\s+([A-Z0-9\-_]{2,20})/i);
  if (prefixExplicit) {
    entities.prefix = prefixExplicit[1].toUpperCase();
  } else {
    // Uppercase word after count that looks like a code (≥4 uppercase chars)
    const prefixInline = rawInput.match(
      /(?:genera|crea|generar|crear)\s+\d+\s+(?:códigos?|c[oó]digos?|cupones?)?\s*([A-Z]{3,20}[0-9A-Z\-_]*)/,
    );
    if (prefixInline) {
      entities.prefix = prefixInline[1].toUpperCase();
    }
  }

  // ── Collection / category (multiple patterns, priority order) ─────────────

  // Pattern 1: explicit keyword  "categoría juguetes", "colección verano"
  const catExplicitMatch = rawInput.match(
    /(?:categor[íi]a|colecci[oó]n|secci[oó]n)\s+(?:de\s+)?([a-záéíóúñüa-z\w]{2,30})/i,
  );
  if (catExplicitMatch) {
    entities.collection = catExplicitMatch[1].toLowerCase().trim();
  }

  // Pattern 2: after percentage  "15% en juguetes"
  if (!entities.collection) {
    const pctColMatch = rawInput.match(/\d+\s*%\s+en\s+([a-záéíóúñüa-z\w]{2,25})/i);
    if (pctColMatch) {
      entities.collection = pctColMatch[1].toLowerCase().trim();
    }
  }

  // Pattern 3: discount/promotion "en" noun  "descuento en ropa"
  if (!entities.collection) {
    const discountInMatch = rawInput.match(
      /(?:descuento|rebaja|oferta|promoci[oó]n)[^a-z]*en\s+(?:la\s+)?([a-záéíóúñüa-z\w]{2,25})(?:\s|$)/i,
    );
    if (discountInMatch) {
      entities.collection = discountInMatch[1].toLowerCase().trim();
    }
  }

  // ── End date ───────────────────────────────────────────────────────────────
  // "hasta junio 30", "al 30 de junio", "hasta fin de mes", "mañana"
  const dateExplicit = rawInput.match(
    /(?:hasta|al|until|before)\s+(.{3,40}?)(?:\s+(?:y|o|,)|$)/i,
  );
  if (dateExplicit) {
    const candidate = dateExplicit[1].trim();
    // Only accept if it contains a month name, "fin", "mañana", or digits
    const hasDateContent =
      MONTH_NAMES.some(m => candidate.toLowerCase().includes(m)) ||
      /\d/.test(candidate) ||
      /fin\s+de|mañana|tomorrow/i.test(candidate);
    if (hasDateContent) {
      entities.endDate = candidate;
    }
  }

  // ── Minimum days ───────────────────────────────────────────────────────────
  // "más de 7 días", "5 días sin movimiento", "con 10 días de retraso"
  const daysMatch = rawInput.match(/(?:m[aá]s\s+de\s+)?(\d+)\s+d[íi]as?/i);
  if (daysMatch) {
    entities.minDays = parseInt(daysMatch[1], 10);
  }

  // ── Quality threshold ──────────────────────────────────────────────────────
  // "calidad menor de 60", "score menor a 50", "por debajo del 70"
  const thresholdMatch = rawInput.match(
    /(?:menor\s+(?:de|a|al)|por\s+debajo\s+(?:de|del)\s*(?:\d+\s*%\s+|)?)\s*(\d+)/i,
  );
  if (thresholdMatch && entities.discountPercent === undefined) {
    entities.threshold = parseInt(thresholdMatch[1], 10);
  }

  // ── Product name in quotes ─────────────────────────────────────────────────
  // "el producto 'Camiseta Básica'", "busca "Jeans Premium""
  const quotedMatch = rawInput.match(/["'«]([^"'»]{2,60})["'»]/);
  if (quotedMatch) {
    entities.productName = quotedMatch[1].trim();
  }

  // ── SKU ───────────────────────────────────────────────────────────────────
  // Uppercase letters + digits, optionally with hyphens, 4–16 chars
  // Must look like a code: e.g. "AB-1234", "SKU001", "CAM-BAS-M"
  const skuMatch = rawInput.match(/\b([A-Z]{1,4}[-_]?[A-Z0-9]{3,12})\b/);
  if (skuMatch && !entities.prefix) {
    // Only capture if it looks like a structured SKU, not a common word
    const candidate = skuMatch[1];
    if (/\d/.test(candidate) || candidate.includes("-")) {
      entities.sku = candidate;
    }
  }

  // ── Status keywords ───────────────────────────────────────────────────────
  const lowerInput = rawInput.toLowerCase();
  const seenStatuses = new Set<string>();

  // Check multi-word statuses first
  for (const [kw, canonical] of Object.entries(STATUS_KEYWORDS)) {
    if (kw.includes(" ") && lowerInput.includes(kw) && !seenStatuses.has(canonical)) {
      seenStatuses.add(canonical);
      entities.statusKeywords.push(canonical);
    }
  }
  // Then single-word statuses
  for (const [kw, canonical] of Object.entries(STATUS_KEYWORDS)) {
    if (!kw.includes(" ")) {
      const re = new RegExp(`\\b${kw}\\b`, "i");
      if (re.test(rawInput) && !seenStatuses.has(canonical)) {
        seenStatuses.add(canonical);
        entities.statusKeywords.push(canonical);
      }
    }
  }

  // ── Target scope (derived) ─────────────────────────────────────────────────
  const lower = rawInput.toLowerCase();
  if (/(productos?|referencias?|art[íi]culos?)\s+(pendientes?|sin\s+publicar)/.test(lower)) {
    entities.targetScope = "pendingProducts";
  } else if (/(productos?|referencias?|art[íi]culos?)\s+publicados?/.test(lower)) {
    entities.targetScope = "publishedProducts";
  } else if (/(productos?|referencias?|art[íi]culos?)\s+sin\s+seo/.test(lower)) {
    entities.targetScope = "productsWithoutSeo";
  } else if (/(productos?|referencias?|art[íi]culos?)\s+sin\s+imagen/.test(lower)) {
    entities.targetScope = "productsWithoutImages";
  } else if (/(productos?|referencias?|art[íi]culos?)\s+sin\s+precio/.test(lower)) {
    entities.targetScope = "productsWithoutPrice";
  }

  return entities;
}

// ── Entity → scoring signals ──────────────────────────────────────────────────

/**
 * Convert extracted entities to a set of semantic signals for the scorer.
 *
 * The scorer uses these signals to assign entity-context bonuses to candidates
 * in relevant domains without hardcoding entity logic in the scoring engine.
 */
export function getEntitySignals(entities: ExtractedEntities): EntitySignal[] {
  const signals: EntitySignal[] = [];

  if (entities.discountPercent !== undefined)                             signals.push("discount");
  if (entities.count !== undefined)                                       signals.push("count");
  if (entities.collection)                                                signals.push("collection");
  if (entities.endDate)                                                   signals.push("date");
  if (entities.statusKeywords.includes("pendientes") ||
      entities.statusKeywords.includes("sin_publicar"))                   signals.push("status_pending");
  if (entities.statusKeywords.includes("fallidos"))                       signals.push("status_failed");
  if (entities.statusKeywords.includes("retrasados"))                     signals.push("status_delayed");
  if (entities.statusKeywords.some(s => ["reembolsos", "devoluciones"].includes(s)))
                                                                          signals.push("status_refund");
  if (entities.targetScope?.includes("Seo") ||
      entities.statusKeywords.includes("sin_seo"))                        signals.push("seo");

  return signals;
}
