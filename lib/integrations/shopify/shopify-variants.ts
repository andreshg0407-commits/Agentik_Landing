/**
 * lib/integrations/shopify/shopify-variants.ts
 *
 * MS-11 — Shopify Variant Engine
 *
 * Transforms Agentik ProductVariant records into the Shopify Admin API
 * option + variant structure (up to 3 option axes).
 *
 * ── Shopify variant model ──────────────────────────────────────────────────────
 *   Product has Options (e.g. Color, Size) with unique values
 *   Each Variant has option1/option2/option3 mapping to option values
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Pure computation — no Prisma, no fetch, no side effects.
 *   Tolerates missing attributes with safe fallbacks.
 */

// ── Input types ───────────────────────────────────────────────────────────────

export interface AgentikVariantInput {
  id:         string;
  name:       string;
  sku:        string | null;
  status:     string;
  attributes: Record<string, string> | null;  // e.g. { color: "Red", size: "M" }
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface ShopifyOptionDefinition {
  name:   string;   // e.g. "Color"
  values: string[]; // unique values for this option
}

export interface ShopifyVariantPayloadFull {
  sku:                 string | null;
  title:               string;
  price:               string;
  option1:             string | null;
  option2:             string | null;
  option3:             string | null;
  inventory_policy:    "deny" | "continue";
  inventory_quantity:  number;
  requires_shipping:   boolean;
  taxable:             boolean;
  weight:              number | null;
  weight_unit:         "kg" | "g" | "lb" | "oz";
}

export interface ShopifyVariantTransformResult {
  options:  ShopifyOptionDefinition[];
  variants: ShopifyVariantPayloadFull[];
  warnings: string[];
}

// ── Attribute key to Shopify option name map ──────────────────────────────────

const ATTRIBUTE_LABEL_MAP: Record<string, string> = {
  color:     "Color",
  colour:    "Color",
  size:      "Talla",
  talla:     "Talla",
  material:  "Material",
  volumen:   "Volumen",
  volume:    "Volumen",
  flavor:    "Sabor",
  sabor:     "Sabor",
  pack:      "Pack",
  style:     "Estilo",
  estilo:    "Estilo",
  finish:    "Acabado",
  acabado:   "Acabado",
  format:    "Formato",
  formato:   "Formato",
  weight:    "Peso",
  peso:      "Peso",
};

function toOptionLabel(key: string): string {
  return ATTRIBUTE_LABEL_MAP[key.toLowerCase()] ?? capitalize(key);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── SKU duplicate detection ───────────────────────────────────────────────────

function deduplicateSkus(
  variants: AgentikVariantInput[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of variants) {
    if (v.sku) {
      counts.set(v.sku, (counts.get(v.sku) ?? 0) + 1);
    }
  }
  return counts;
}

// ── Main transformer ──────────────────────────────────────────────────────────

export function transformAgentikVariantsToShopify(
  variants:     AgentikVariantInput[],
  defaultPrice: string,   // fallback price from ProductEntity
): ShopifyVariantTransformResult {
  const warnings: string[] = [];
  const active = variants.filter(v => v.status === "active");

  if (active.length === 0) {
    // Return a single default variant
    return {
      options:  [{ name: "Tipo", values: ["Default"] }],
      variants: [{
        sku:                null,
        title:              "Default",
        price:              defaultPrice,
        option1:            "Default",
        option2:            null,
        option3:            null,
        inventory_policy:   "deny",
        inventory_quantity: 0,
        requires_shipping:  true,
        taxable:            true,
        weight:             null,
        weight_unit:        "kg",
      }],
      warnings: ["No active variants found — using default variant"],
    };
  }

  // ── 1. Discover option axes from attributes ──────────────────────────────
  const axisSet = new Set<string>();
  for (const v of active) {
    const attrs = normalizeAttributes(v.attributes);
    for (const key of Object.keys(attrs)) {
      axisSet.add(key.toLowerCase());
    }
  }

  // Shopify supports max 3 option axes
  const axes = [...axisSet].slice(0, 3);
  if (axisSet.size > 3) {
    warnings.push(`Product has ${axisSet.size} attribute axes — only first 3 mapped to Shopify options`);
  }

  // ── 2. Build option definitions ──────────────────────────────────────────
  const optionValuesMap = new Map<string, Set<string>>();
  for (const axis of axes) {
    optionValuesMap.set(axis, new Set());
  }

  for (const v of active) {
    const attrs = normalizeAttributes(v.attributes);
    for (const axis of axes) {
      const val = attrs[axis];
      if (val) optionValuesMap.get(axis)!.add(String(val));
    }
  }

  const options: ShopifyOptionDefinition[] = axes.map(axis => ({
    name:   toOptionLabel(axis),
    values: [...(optionValuesMap.get(axis) ?? new Set())],
  }));

  if (options.length === 0) {
    options.push({ name: "Tipo", values: active.map((_, i) => `Variante ${i + 1}`) });
  }

  // ── 3. Detect duplicate SKUs ──────────────────────────────────────────────
  const skuCounts = deduplicateSkus(active);
  for (const [sku, count] of skuCounts) {
    if (count > 1) {
      warnings.push(`Duplicate SKU detected: ${sku} (used ${count} times)`);
    }
  }

  // ── 4. Build variant payloads ─────────────────────────────────────────────
  const result: ShopifyVariantPayloadFull[] = active.map((v, i) => {
    const attrs   = normalizeAttributes(v.attributes);
    const option1 = axes[0] ? (attrs[axes[0]] ? String(attrs[axes[0]]) : `Variante ${i + 1}`) : null;
    const option2 = axes[1] ? (attrs[axes[1]] ? String(attrs[axes[1]]) : null) : null;
    const option3 = axes[2] ? (attrs[axes[2]] ? String(attrs[axes[2]]) : null) : null;

    // Title: join option values
    const titleParts = [option1, option2, option3].filter(Boolean);
    const title = titleParts.length > 0 ? titleParts.join(" / ") : v.name;

    return {
      sku:                v.sku ?? null,
      title,
      price:              defaultPrice,
      option1,
      option2,
      option3,
      inventory_policy:   "deny",
      inventory_quantity: 0,
      requires_shipping:  true,
      taxable:            true,
      weight:             null,
      weight_unit:        "kg",
    };
  });

  return { options, variants: result, warnings };
}

function normalizeAttributes(
  attrs: Record<string, string> | null,
): Record<string, string> {
  if (!attrs || typeof attrs !== "object") return {};
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(attrs)) {
    if (typeof val === "string" || typeof val === "number") {
      normalized[key.toLowerCase()] = String(val);
    }
  }
  return normalized;
}
