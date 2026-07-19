/**
 * lib/comercial/pedidos/inventory-link-normalizer.ts
 *
 * Normalization functions for matching CRMQuoteLine fields
 * against ProductVariant/ProductEntity identifiers.
 *
 * Pure domain logic — no Prisma, no server-only imports.
 *
 * Sprint: COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04
 */

// ── Reference normalization ──────────────────────────────────────────────────

/**
 * Normalizes a product reference/SKU for matching.
 * Trims, uppercases, collapses whitespace.
 */
export function normalizeReference(ref: string | null | undefined): string {
  return (ref ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Size normalization ───────────────────────────────────────────────────────

/**
 * Normalizes a size/talla value for matching.
 * Trims, uppercases, collapses whitespace.
 */
export function normalizeSize(size: string | null | undefined): string {
  return (size ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Color normalization ──────────────────────────────────────────────────────

/**
 * Normalizes a color code for matching.
 * Trims, uppercases, collapses whitespace.
 */
export function normalizeColor(color: string | null | undefined): string {
  return (color ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Composite key ────────────────────────────────────────────────────────────

/**
 * Builds the composite variant SKU used by Castillitos SAG imports:
 * `{reference}|{talla}|{color}`
 *
 * This matches the ProductVariant.sku format created by the SAG adapter.
 */
export function buildVariantCompositeKey(
  reference: string | null | undefined,
  size: string | null | undefined,
  color: string | null | undefined,
): string {
  return `${normalizeReference(reference)}|${normalizeSize(size)}|${normalizeColor(color)}`;
}
