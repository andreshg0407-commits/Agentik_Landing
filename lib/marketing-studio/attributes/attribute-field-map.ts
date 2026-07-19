/**
 * lib/marketing-studio/attributes/attribute-field-map.ts
 *
 * AGENTIK-ATTRIBUTE-IMPORT-01 — SAG Field Map
 *
 * Configurable, tenant-extensible mapping of external ERP/SAG field names
 * to Agentik attribute definitions.
 *
 * ── Design rules ──────────────────────────────────────────────────────────────
 *   - BASE_SAG_FIELD_MAP covers common SAG fields shared across tenants
 *   - TENANT_FIELD_MAPS adds or overrides per-tenant
 *   - getFieldMap(tenantSlug) merges both layers
 *   - lookupField(rawField, tenantSlug) normalizes and resolves in one call
 *   - No hardcoded Castillitos logic leaks into the base map
 *
 * ── Key normalization ─────────────────────────────────────────────────────────
 *   Raw SAG field "TALLA", "Talla", "talla " → lookup key "talla"
 *   Done via normalizeFieldKey() before map lookup.
 *
 * ── Adding a new ERP ──────────────────────────────────────────────────────────
 *   1. Add entries to TENANT_FIELD_MAPS[tenantSlug]
 *   2. Or create a new source-specific map and merge in getFieldMap()
 *   The normalization service is source-agnostic — it receives ExternalProductData
 *   with a "source" tag and calls getFieldMap(tenantSlug) regardless of ERP.
 */

import type { FieldMapEntry } from "./attribute-import-types";

// ── Base SAG field map ─────────────────────────────────────────────────────────
// Covers the most common SAG fields found across tenant implementations.
// Keys are normalized (lowercase, underscored) — lookupField() normalizes
// the incoming raw field before matching.

export const BASE_SAG_FIELD_MAP: Record<string, FieldMapEntry> = {
  // Variantes
  talla:            { agentikKey: "talla",            agentikLabel: "Talla",            type: "select",    confidence: "high" },
  color:            { agentikKey: "color",            agentikLabel: "Color",            type: "select",    confidence: "high" },

  // Clasificación
  linea:            { agentikKey: "linea",            agentikLabel: "Línea",            type: "select",    confidence: "high" },
  categoria:        { agentikKey: "categoria",        agentikLabel: "Categoría",        type: "select",    confidence: "high" },
  marca:            { agentikKey: "marca",            agentikLabel: "Marca",            type: "select",    confidence: "high" },
  genero:           { agentikKey: "genero",           agentikLabel: "Género",           type: "select",    confidence: "high" },
  material:         { agentikKey: "material",         agentikLabel: "Material",         type: "select",    confidence: "high" },

  // Identificadores
  referencia:       { agentikKey: "referencia",       agentikLabel: "Referencia",       type: "text",      confidence: "high" },
  codigo:           { agentikKey: "codigo",           agentikLabel: "Código",           type: "text",      confidence: "high" },
  codigo_barras:    { agentikKey: "codigo_barras",    agentikLabel: "Código de barras", type: "text",      confidence: "high" },

  // Medidas y físicos
  peso:             { agentikKey: "peso",             agentikLabel: "Peso",             type: "dimension", confidence: "high" },
  alto:             { agentikKey: "alto",             agentikLabel: "Alto",             type: "dimension", confidence: "high" },
  ancho:            { agentikKey: "ancho",            agentikLabel: "Ancho",            type: "dimension", confidence: "high" },
  largo:            { agentikKey: "largo",            agentikLabel: "Largo",            type: "dimension", confidence: "high" },
  unidad_medida:    { agentikKey: "unidad_medida",    agentikLabel: "Unidad de medida", type: "select",    confidence: "medium" },

  // Textos descriptivos
  descripcion:      { agentikKey: "descripcion",      agentikLabel: "Descripción",      type: "text",      confidence: "medium" },
  composicion:      { agentikKey: "composicion",      agentikLabel: "Composición",      type: "text",      confidence: "medium" },

  // Temporalidad
  temporada:        { agentikKey: "temporada",        agentikLabel: "Temporada",        type: "select",    confidence: "high" },
  coleccion:        { agentikKey: "coleccion",        agentikLabel: "Colección",        type: "select",    confidence: "high" },
};

// ── Tenant-specific extensions ────────────────────────────────────────────────
// Each tenant can add fields or override base entries.
// Keys follow the same normalized convention (lowercase, underscored).

const TENANT_FIELD_MAPS: Record<string, Record<string, FieldMapEntry>> = {
  castillitos: {
    // Castillitos SAG fields not in base map
    edad_recom:      { agentikKey: "edad_recomendada", agentikLabel: "Edad recomendada", type: "select", confidence: "high" },
    edad_recomendada:{ agentikKey: "edad_recomendada", agentikLabel: "Edad recomendada", type: "select", confidence: "high" },
    tipo_prenda:     { agentikKey: "tipo_prenda",      agentikLabel: "Tipo de prenda",   type: "select", confidence: "high" },
    grupo:           { agentikKey: "grupo",            agentikLabel: "Grupo",            type: "select", confidence: "medium" },
    subgrupo:        { agentikKey: "subgrupo",         agentikLabel: "Subgrupo",         type: "select", confidence: "medium" },
    // Inventory-derived attributes (used when SAG sends stock per talla/color)
    stock_talla:     { agentikKey: "stock_talla",      agentikLabel: "Stock por talla",  type: "text",   confidence: "medium" },
    stock_color:     { agentikKey: "stock_color",      agentikLabel: "Stock por color",  type: "text",   confidence: "medium" },
  },
};

// ── Normalization helper ───────────────────────────────────────────────────────

const DIACRITIC_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u",
  ñ: "n", Ñ: "n",
};

/**
 * Normalize a raw SAG field name for map lookup.
 * "TALLA", " Talla ", "talla" → "talla"
 * "Línea de Producto" → "linea_de_producto"
 */
function normalizeFieldKey(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/[áéíóúüÁÉÍÓÚÜñÑ]/g, ch => DIACRITIC_MAP[ch] ?? ch)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the merged field map for a tenant.
 * Tenant entries override base entries with the same key.
 */
export function getFieldMap(tenantSlug: string): Record<string, FieldMapEntry> {
  return {
    ...BASE_SAG_FIELD_MAP,
    ...(TENANT_FIELD_MAPS[tenantSlug] ?? {}),
  };
}

/**
 * Look up a raw external field in the field map.
 * Normalizes the field name before lookup.
 * Returns null if the field is not mapped → caller routes to review queue.
 */
export function lookupField(
  rawField:   string,
  tenantSlug: string,
): FieldMapEntry | null {
  const map = getFieldMap(tenantSlug);
  const key = normalizeFieldKey(rawField);
  return map[key] ?? null;
}

/**
 * Returns all field keys registered for a tenant (base + tenant-specific).
 * Useful for UI-level "supported fields" documentation.
 */
export function listSupportedFields(tenantSlug: string): string[] {
  return Object.keys(getFieldMap(tenantSlug));
}
