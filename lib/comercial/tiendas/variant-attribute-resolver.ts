/**
 * lib/comercial/tiendas/variant-attribute-resolver.ts
 *
 * Official resolver for talla/color from ProductVariant data.
 * Reads from multiple sources in priority order:
 *   1. ProductVariant.attributes (JSON column) — 100% coverage
 *   2. ProductVariant.name ("TALLA / COLOR")
 *   3. ProductVariant.sku ("REF|TALLA|COLOR_CODE")
 *   4. ProductVariantAttribute[] (relational table)
 *   5. Sentinel fallback
 *
 * Sprint: TIENDAS-TEXTILE-ATTRIBUTES-FIX-01
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type VariantAttributeSource =
  | "json_attributes"
  | "variant_name"
  | "variant_sku"
  | "relational_attributes"
  | "fallback";

export interface ResolvedSizeColor {
  size: string;
  color: string;
  source: VariantAttributeSource;
}

/** Shape of the variant data we need — matches Prisma select output */
export interface VariantInput {
  attributes?: unknown;
  name?: string | null;
  sku?: string | null;
  variantAttributes?: Array<{ key: string; value: string | null }>;
}

// ── Normalization ────────────────────────────────────────────────────────────

function norm(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Source 1: JSON attributes column ─────────────────────────────────────────

function fromJsonAttributes(attrs: unknown): { size: string; color: string } | null {
  if (!attrs || typeof attrs !== "object") return null;
  const a = attrs as Record<string, unknown>;

  const size = norm(String(a.tallaName ?? a.talla ?? ""));
  const color = norm(String(a.colorName ?? a.color ?? ""));

  if (size || color) return { size, color };
  return null;
}

// ── Source 2: ProductVariant.name ("TALLA / COLOR") ──────────────────────────

function fromVariantName(name: string | null | undefined): { size: string; color: string } | null {
  if (!name) return null;
  const idx = name.indexOf("/");
  if (idx < 0) return null;

  const size = norm(name.slice(0, idx));
  const color = norm(name.slice(idx + 1));

  if (size || color) return { size, color };
  return null;
}

// ── Source 3: ProductVariant.sku ("REF|TALLA|COLOR_CODE") ────────────────────

function fromVariantSku(sku: string | null | undefined): { size: string; color: string } | null {
  if (!sku) return null;
  const parts = sku.split("|");
  if (parts.length < 3) return null;

  const size = norm(parts[1]);
  const color = norm(parts[2]);

  if (size || color) return { size, color };
  return null;
}

// ── Source 4: Relational ProductVariantAttribute[] ───────────────────────────

function fromRelationalAttributes(
  attrs: Array<{ key: string; value: string | null }> | undefined,
): { size: string; color: string } | null {
  if (!attrs || attrs.length === 0) return null;

  const size = norm(attrs.find(a => a.key === "talla")?.value);
  const color = norm(attrs.find(a => a.key === "color")?.value);

  if (size || color) return { size, color };
  return null;
}

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve talla/color from a ProductVariant using the official priority chain.
 */
export function resolveVariantSizeColor(variant: VariantInput | null | undefined): ResolvedSizeColor {
  if (!variant) {
    return { size: "SIN_TALLA", color: "SIN_COLOR", source: "fallback" };
  }

  // 1. JSON attributes (primary — 100% coverage for textiles)
  const json = fromJsonAttributes(variant.attributes);
  if (json && json.size && json.color) {
    return { size: json.size, color: json.color, source: "json_attributes" };
  }

  // 2. Variant name ("TALLA / COLOR")
  const name = fromVariantName(variant.name);
  if (name && name.size && name.color) {
    return { size: name.size, color: name.color, source: "variant_name" };
  }

  // 3. Variant SKU ("REF|TALLA|COLOR_CODE")
  const sku = fromVariantSku(variant.sku);
  if (sku && sku.size && sku.color) {
    return { size: sku.size, color: sku.color, source: "variant_sku" };
  }

  // 4. Relational attributes (legacy — low coverage)
  const rel = fromRelationalAttributes(variant.variantAttributes);
  if (rel && rel.size && rel.color) {
    return { size: rel.size, color: rel.color, source: "relational_attributes" };
  }

  // 5. Partial data from any source (prefer best available)
  const partialSize = json?.size || name?.size || sku?.size || rel?.size || "";
  const partialColor = json?.color || name?.color || sku?.color || rel?.color || "";

  if (partialSize || partialColor) {
    const source: VariantAttributeSource = json?.size ? "json_attributes"
      : name?.size ? "variant_name"
      : sku?.size ? "variant_sku"
      : "relational_attributes";
    return {
      size: partialSize || "SIN_TALLA",
      color: partialColor || "SIN_COLOR",
      source,
    };
  }

  // 6. Sentinel fallback
  return { size: "SIN_TALLA", color: "SIN_COLOR", source: "fallback" };
}
