/**
 * lib/comercial/tiendas/classification-normalization.ts
 *
 * Pure normalization functions for canonical classification fields.
 * No side effects, no DB, no SOAP. Safe for both server and test contexts.
 *
 * Sprint: AGENTIK-STORES-INVENTORY-CLASSIFICATION-COMPLETENESS-01
 */

// ── Sentinels ─────────────────────────────────────────────────────────────────

export const SENTINEL_GROUP = "SIN_GRUPO_SAG";
export const SENTINEL_SUBGROUP = "SIN_SUBGRUPO_SAG";
export const SENTINEL_SIZE = "SIN_TALLA";
export const SENTINEL_COLOR = "SIN_COLOR";

// ── Core normalizer ─────────────────────────────────────────────────────────

function normalizeString(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")        // collapse whitespace
    .replace(/[_]+/g, " ")       // underscores → spaces
    .replace(/-+/g, "-");        // collapse hyphens
}

// ── Group ─────────────────────────────────────────────────────────────────────

/**
 * Normalize a canonical group value from ProductEntity.grupoSag.
 * Returns SENTINEL_GROUP when the value is absent or not meaningful.
 */
export function normalizeCanonicalGroup(raw: string | null | undefined): string {
  const v = normalizeString(raw);
  if (!v) return SENTINEL_GROUP;
  if (v === "SIN GRUPO" || v === "SIN GRUPO SAG" || v === SENTINEL_GROUP) return SENTINEL_GROUP;
  return v;
}

// ── Subgroup ──────────────────────────────────────────────────────────────────

/**
 * Normalize a canonical subgroup value from ProductEntity.subgrupoSag.
 * Returns SENTINEL_SUBGROUP when the value is absent or not meaningful.
 */
export function normalizeCanonicalSubgroup(raw: string | null | undefined): string {
  const v = normalizeString(raw);
  if (!v) return SENTINEL_SUBGROUP;
  if (v === "SIN SUBGRUPO" || v === "SIN SUBGRUPO SAG" || v === SENTINEL_SUBGROUP) return SENTINEL_SUBGROUP;
  return v;
}

// ── Size class ────────────────────────────────────────────────────────────────

export type NormalizedSizeClass = "small" | "medium" | "large" | null;

const SIZE_CLASS_MAP: Record<string, NormalizedSizeClass> = {
  PEQUENO: "small",
  PEQUEÑO: "small",
  SMALL: "small",
  MEDIANO: "medium",
  MEDIUM: "medium",
  GRANDE: "large",
  LARGE: "large",
};

/**
 * Normalize a size class from ProductEntity.handlingUnit.
 * Returns null when the value is absent or unrecognized.
 */
export function normalizeCanonicalSizeClass(raw: string | null | undefined): NormalizedSizeClass {
  if (raw == null) return null;
  const v = normalizeString(raw);
  if (!v) return null;
  return SIZE_CLASS_MAP[v] ?? null;
}

// ── Variant size ──────────────────────────────────────────────────────────────

/**
 * Normalize a variant size (talla) value.
 * Returns SENTINEL_SIZE when absent.
 */
export function normalizeVariantSize(raw: string | null | undefined): string {
  const v = normalizeString(raw);
  if (!v) return SENTINEL_SIZE;
  if (v === "SIN TALLA" || v === SENTINEL_SIZE) return SENTINEL_SIZE;
  return v;
}

// ── Variant color ─────────────────────────────────────────────────────────────

/**
 * Normalize a variant color value.
 * Returns SENTINEL_COLOR when absent.
 */
export function normalizeVariantColor(raw: string | null | undefined): string {
  const v = normalizeString(raw);
  if (!v) return SENTINEL_COLOR;
  if (v === "SIN COLOR" || v === SENTINEL_COLOR) return SENTINEL_COLOR;
  return v;
}
