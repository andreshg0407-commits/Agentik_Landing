/**
 * lib/copilot/intent-resolver/intent-aliases.ts
 *
 * AGENTIK-INTENT-RESOLVER-02 — Business synonym dictionary + phrase aliases.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Two complementary systems:
 *
 * 1. SYNONYM_MAP — concept-level normalization.
 *    Maps variant forms (conjugated verbs, plural nouns, domain synonyms)
 *    to canonical forms. Applied to BOTH the user input AND keywords
 *    before scoring, so "rebaja" and "descuento" become the same token.
 *    Keys must be in fully normalized form (lowercase, no accents, no punctuation).
 *
 * 2. INTENT_PHRASE_ALIASES — intent-level phrase matching.
 *    Maps candidateId → list of full phrases that should strongly boost
 *    that candidate. Handles conjugated verb phrases that the synonym map
 *    cannot fully cover. Applied after synonym normalization.
 *
 * To add a new domain: add entries to SYNONYM_MAP and INTENT_PHRASE_ALIASES.
 * The resolver core does not need to change.
 */
import "server-only";

// ── Synonym map ───────────────────────────────────────────────────────────────

/**
 * Maps normalized variant forms to their canonical form.
 *
 * Rules:
 *   - All keys in lowercase, no accents, no punctuation (pre-normalized form)
 *   - Multi-word phrases go FIRST (sorted by length descending at apply time)
 *   - Canonical values should also be normalized
 *   - Add both singular and plural forms where relevant
 *
 * Domains covered: verbs, discount/promo, coupon/code, order/shipment,
 *                  return/refund, SEO, category/collection, product.
 */
export const SYNONYM_MAP: Record<string, string> = {

  // ── Multi-word phrases (must be checked before single-word synonyms) ────────

  "haz visible":             "publicar",
  "envia a shopify":         "publicar",
  "lleva a la tienda":       "publicar",
  "codigo promocional":      "codigo descuento",
  "codigos promocionales":   "codigos descuento",
  "texto alternativo":       "alt text",
  "palabras clave":          "keywords",

  // ── Verb conjugations ───────────────────────────────────────────────────────

  // publicar family
  "publica":   "publicar",
  "sube":      "publicar",
  "subir":     "publicar",
  "monta":     "publicar",
  "montar":    "publicar",
  "lleva":     "publicar",
  // hacer family
  "haz":       "hacer",
  // generar family
  "genera":    "generar",
  // mostrar family
  "muestra":   "mostrar",
  "muestrame": "mostrar",
  "ensename":  "mostrar",
  "ver":       "mostrar",
  "listar":    "mostrar",
  "lista":     "mostrar",
  // buscar family
  "busca":     "encontrar",
  "buscar":    "encontrar",
  "encontrar": "encontrar",
  // sincronizar family
  "sincroniza": "sincronizar",
  // optimizar family
  "optimiza":   "optimizar",
  "completar":  "completar",
  "completa":   "completar",

  // ── Discount / promotion ────────────────────────────────────────────────────

  "rebaja":      "descuento",
  "rebajas":     "descuentos",
  "oferta":      "descuento",
  "ofertas":     "descuentos",
  "promocion":   "descuento",
  "promociones": "descuentos",

  // ── Coupon / code ───────────────────────────────────────────────────────────

  "cupon":   "codigo",
  "cupones": "codigos",

  // ── Order ───────────────────────────────────────────────────────────────────

  "orden":   "pedido",
  "ordenes": "pedidos",
  "compra":  "pedido",
  "compras": "pedidos",

  // ── Shipment ────────────────────────────────────────────────────────────────

  "despacho": "envio",
  "despachos": "envios",
  "guia":     "envio",
  "guias":    "envios",

  // ── Return / refund ─────────────────────────────────────────────────────────

  "retorno":    "devolucion",
  "retornos":   "devoluciones",
  "reintegro":  "reembolso",
  "reintegros": "reembolsos",

  // ── SEO / metadata ──────────────────────────────────────────────────────────

  "metadatos":    "seo",
  "optimizacion": "seo",
  "metadata":     "seo",

  // ── Category / collection ───────────────────────────────────────────────────

  "coleccion":   "categoria",
  "colecciones": "categorias",
  "grupo":       "categoria",
  "grupos":      "categorias",

  // ── Product ─────────────────────────────────────────────────────────────────

  "referencia":  "producto",
  "referencias": "productos",
  "articulo":    "producto",
  "articulos":   "productos",
  "item":        "producto",
  "items":       "productos",

};

// ── Intent phrase aliases ─────────────────────────────────────────────────────

/**
 * Per-intent phrase aliases.
 *
 * Key: candidateId (matches INTENT_REGISTRY key)
 * Value: list of human-language phrases that should strongly boost this candidate.
 *
 * Phrases are stored in natural language (with accents) — they are normalized
 * at match time. This makes them easier to read and maintain.
 *
 * Scoring: if ANY phrase alias matches (all its tokens are in the input token set),
 * the candidate receives a 0.30 boost on top of its keyword score.
 */
export const INTENT_PHRASE_ALIASES: Record<string, string[]> = {

  publish_pending_products: [
    "sube los faltantes",
    "sube los que faltan",
    "sube los productos",
    "monta los productos",
    "monta el catálogo",
    "lleva los productos a la tienda",
    "haz visibles los productos",
    "sincroniza el catálogo pendiente",
    "sincroniza los pendientes",
    "referencias pendientes",
    "subir las referencias pendientes",
    "los que faltan publicar",
    "productos que no están publicados",
    "sube los que están pendientes",
    "sincroniza las referencias pendientes",
    "sincroniza referencias",
    "publicar los faltantes",
  ],

  find_failed_payments: [
    "pagos con problemas",
    "cobros rechazados",
    "órdenes con pago fallido",
    "ordenes con pago fallido",
    "pedidos sin pago",
    "transacciones con error",
    "pedidos con pagos fallidos",
    "muéstrame los pedidos con pagos fallidos",
    "muestrame los pedidos con pagos fallidos",
    "ver pedidos con pago fallido",
  ],

  find_delayed_shipments: [
    "envíos con retraso",
    "envios con retraso",
    "despachos retrasados",
    "guías sin movimiento",
    "guias sin movimiento",
    "tracking sin movimiento",
    "pedidos sin trackear",
    "pedidos demorados",
    "enséñame los envíos retrasados",
    "enseñame los envíos retrasados",
    "ver despachos retrasados",
  ],

  create_discount: [
    "crear una rebaja",
    "hacer una rebaja",
    "haz una rebaja",
    "crear una oferta",
    "hacer una oferta",
    "haz una oferta",
    "nuevo descuento",
    "hacer un descuento",
    "haz un descuento",
    "crear promoción de descuento",
    "crear promocion de descuento",
    "haz una promoción",
    "haz una promocion",
    "hacer una promoción",
    "hacer una promocion",
  ],

  generate_discount_codes: [
    "crear cupones",
    "generar cupones",
    "crear códigos",
    "crear codigos",
    "códigos de descuento en lote",
    "codigos de descuento en lote",
    "cupones en masa",
    "códigos en lote",
    "codigos en lote",
    "genera cupones",
    "genera códigos",
    "genera codigos",
    "generar códigos de descuento",
    "generar codigos de descuento",
  ],

  complete_seo: [
    "mejorar el seo",
    "optimizar los metadatos",
    "completar los metadatos",
    "seo de los productos",
    "optimiza el seo",
    "completar seo de productos pendientes",
    "optimizar seo de productos sin publicar",
    "seo de los productos pendientes",
    "metadatos faltantes",
    "optimiza el seo de los productos",
  ],

  find_pending_refunds: [
    "reembolsos sin procesar",
    "devoluciones de dinero pendientes",
    "refunds pendientes",
    "mostrar reembolsos pendientes",
    "cuántos reembolsos están pendientes",
    "cuantos reembolsos estan pendientes",
  ],

  get_sales_overview: [
    "cómo van las ventas",
    "como van las ventas",
    "resumen de la tienda",
    "qué tal las ventas",
    "qué tal la tienda",
    "ver estadísticas de la tienda",
    "ver estadisticas de la tienda",
  ],

  find_orders_at_risk: [
    "pedidos de alto riesgo",
    "orders riesgosos",
    "pedidos con riesgo elevado",
    "pedidos sospechosos",
  ],

  find_unpublished_products: [
    "qué productos no están publicados",
    "que productos no estan publicados",
    "cuáles no están publicados",
    "cuales no estan publicados",
    "productos que faltan publicar",
    "qué falta publicar",
    "que falta publicar",
  ],

  complete_alt_text: [
    "alt text de las imágenes",
    "alt text de las imagenes",
    "descripción de imágenes",
    "descripcion de imagenes",
    "texto alternativo de imágenes",
    "texto alternativo de imagenes",
    "completar alt text",
  ],

};

// ── Normalization helpers ─────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply the SYNONYM_MAP to an already-normalized text string.
 * Multi-word phrases are processed before single words (longest first).
 *
 * @param normalizedText - Input already processed by `normalizeText()` from parser
 * @returns Synonym-normalized text where variant forms are replaced by canonical forms
 */
export function normalizeWithSynonyms(normalizedText: string): string {
  // Sort entries by key length descending: multi-word phrases first
  const entries = Object.entries(SYNONYM_MAP).sort((a, b) => b[0].length - a[0].length);

  let result = normalizedText;
  for (const [form, canonical] of entries) {
    if (form.includes(" ")) {
      // Multi-word: plain string replacement (text is already normalized)
      result = result.split(form).join(canonical);
    } else {
      // Single word: use word boundary to avoid partial matches
      result = result.replace(new RegExp(`\\b${escapeRegex(form)}\\b`, "g"), canonical);
    }
  }
  return result;
}

/**
 * Same as `normalizeWithSynonyms` but also records which replacements were made.
 * Used by `explainIntentResolution()` for observability.
 */
export function normalizeWithSynonymsTracked(
  normalizedText: string,
): { result: string; applied: Record<string, string> } {
  const entries = Object.entries(SYNONYM_MAP).sort((a, b) => b[0].length - a[0].length);
  const applied: Record<string, string> = {};

  let result = normalizedText;
  for (const [form, canonical] of entries) {
    const before = result;
    if (form.includes(" ")) {
      result = result.split(form).join(canonical);
    } else {
      result = result.replace(new RegExp(`\\b${escapeRegex(form)}\\b`, "g"), canonical);
    }
    if (result !== before) {
      applied[form] = canonical;
    }
  }

  return { result, applied };
}

/**
 * Check which phrase aliases (from INTENT_PHRASE_ALIASES) match the given
 * synonym-normalized input token set for a candidate.
 *
 * A phrase alias "matches" when ALL of its tokens (after synonym normalization)
 * are present in the input token set.
 *
 * @param candidateId    - The candidate to check aliases for
 * @param inputTokenSet  - Pre-built set of synonym-normalized input tokens
 * @param normalizeText  - Normalization function (imported from parser to avoid circular deps)
 * @returns List of matched alias phrases (raw form, not normalized)
 */
export function getMatchingAliases(
  candidateId:   string,
  inputTokenSet: Set<string>,
  normalizeAndSynonymize: (s: string) => string,
): string[] {
  const aliases = INTENT_PHRASE_ALIASES[candidateId] ?? [];
  const matched: string[] = [];

  for (const alias of aliases) {
    const normalized = normalizeAndSynonymize(alias);
    const aliasTokens = normalized.split(/\s+/).filter(Boolean);
    if (aliasTokens.length > 0 && aliasTokens.every(t => inputTokenSet.has(t))) {
      matched.push(alias);
    }
  }

  return matched;
}
