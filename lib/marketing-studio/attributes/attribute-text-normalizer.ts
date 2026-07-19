/**
 * lib/marketing-studio/attributes/attribute-text-normalizer.ts
 *
 * AGENTIK-ATTRIBUTE-IMPORT-01 — Text Normalization
 *
 * Pure text normalization utilities for attribute key and value matching.
 * Used by the normalization service to detect duplicates:
 *   "color", "COLOR", "Color " → same key
 *   "Azul", "AZUL", "azul"    → same value
 *
 * No deps, no side effects, fully testable.
 */

const DIACRITIC_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u",
  ñ: "n", Ñ: "n",
};

function stripDiacritics(text: string): string {
  return text.replace(/[áéíóúüÁÉÍÓÚÜñÑ]/g, ch => DIACRITIC_MAP[ch] ?? ch);
}

// ── Key normalization ─────────────────────────────────────────────────────────

/**
 * Normalize an attribute key for comparison.
 * "color", "COLOR", " Color " → "color"
 * "Edad recomendada" → "edad_recomendada"
 * Max 64 chars.
 */
export function normalizeAttributeKey(raw: string): string {
  if (!raw) return "";
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

// ── Value normalization ───────────────────────────────────────────────────────

/**
 * Normalize an attribute value for comparison (case/diacritic insensitive).
 * "AZUL", "Azul", "azul" → "azul"
 * Used only for matching — canonical display uses toTitleCase().
 */
export function normalizeAttributeValue(raw: string): string {
  if (!raw) return "";
  return stripDiacritics(raw).toLowerCase().trim();
}

// ── Display formatting ────────────────────────────────────────────────────────

/**
 * Convert a raw SAG value to human-readable title case.
 * "AZUL MARINO" → "Azul Marino"
 * "s/n" → "S/N"
 * Applied when storing a new option value.
 */
export function toTitleCase(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ── Match helpers ─────────────────────────────────────────────────────────────

/**
 * True if two attribute values are the same after normalization.
 * "AZUL" matches "Azul", "azul", "AZUL ".
 */
export function valueMatchesExisting(incoming: string, existing: string): boolean {
  return normalizeAttributeValue(incoming) === normalizeAttributeValue(existing);
}

/**
 * True if two attribute keys are the same after normalization.
 * "COLOR" matches "color", "Color".
 */
export function keyMatchesExisting(incoming: string, existing: string): boolean {
  return normalizeAttributeKey(incoming) === normalizeAttributeKey(existing);
}
