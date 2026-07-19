/**
 * lib/comercial/pedidos/order-product-types.ts
 *
 * Types for product search and variant selection in the Pedidos POS flow.
 * No Prisma — runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-POS-02
 * Sprint: COMERCIAL-PEDIDOS-PRODUCTOS-MOBILE-03
 * Hotfix: COMMERCIAL-PRODUCT-STOCK-SCARCITY-01
 */

// ── Search result (one per reference) ─────────────────────────────────────────

export type OrderInventoryStatus = "high" | "medium" | "low" | "out" | "unsynced" | "no_variants";

/**
 * Whether a product is sellable from the wholesale wizard.
 * Products with 0 variants are NOT sellable — they were imported from SAG
 * without talla/color data (see COMMERCIAL-STOCK-DATA-AUDIT-01).
 */
export function isProductSellable(p: Pick<OrderProductSearchResult, "variantCount" | "variants">): boolean {
  // A product needs at least 1 variant with non-empty size or color to build a matrix
  if (p.variantCount === 0) return false;
  if (p.variants.length === 0) return false;
  // Check if variants have actual size/color data (not just fallback "?-?" placeholders)
  return p.variants.some(v => v.size || v.color);
}

export interface OrderProductSearchResult {
  referenceCode:  string;
  productName:    string;
  sku:            string;
  /** Numeric group ID from SAG (ka_ni_grupo) */
  category:       string;
  /** Resolved group name (e.g. "IMPORTACION", "LT NIÑA KIDS") — empty if not resolved */
  categoryName:   string;
  /** Numeric line ID from SAG (ka_nl_linea) */
  line:           string;
  /** Resolved line name (e.g. "LATIN KIDS", "CASTILLITOS") — empty if not resolved */
  lineName:       string;
  unitPrice:      number;
  variants:       OrderProductVariant[];
  /** Product thumbnail URL from Biblioteca, Shopify, or catalog — null = no image */
  thumbnailUrl:   string | null;
  /** When this product was last synced from SAG — null = never */
  lastSyncAt:     string | null;
  /** Enriched description with resolved group/line/subgroup/brand names */
  description:    string;
  /** Total available units across all variants (from inventory snapshot) — null = not synced */
  availableQty:   number | null;
  /** Total number of product variants */
  variantCount:   number;
  /** Whether this reference has any stock at all */
  inStock:        boolean;
  /** Inventory status based on thresholds: high >= 20, medium >= 5, low > 0, out = 0 */
  inventoryStatus: OrderInventoryStatus;
}

// ── Variant (size × color combination) ────────────────────────────────────────

export interface OrderProductVariant {
  variantId:           string;
  size:                string;
  color:               string;
  availability:        OrderVariantAvailability;
  /** Inventory status for visual system (green/yellow/red) */
  inventoryStatus:     OrderInventoryStatus;
}

// ── Availability per variant ──────────────────────────────────────────────────

export interface OrderVariantAvailability {
  /** null = not synced, show "pendiente de sincronizacion" */
  availableUnits:      number | null;
  sourceWarehouseCode: string | null;
  lastSyncAt:          string | null;
}

// ── Commercial stock state (SCARCITY-01) ─────────────────────────────────────

export type CommercialStockStateName =
  | "available"
  | "line_low"
  | "last_units"
  | "few_variants"
  | "unknown"
  | "out";

export type CommercialStockSeverity = "success" | "warning" | "danger" | "neutral";

export interface CommercialStockState {
  state:              CommercialStockStateName;
  label:              string;
  severity:           CommercialStockSeverity;
  shouldShowInSearch: boolean;
  helperText:         string;
}

// ── Line minimums (from config — COMMERCIAL-INTEGRATION-01) ─────────────────

import { CASTILLITOS_STOCK_THRESHOLDS } from "./order-policy-pack-config";

const LINE_MINIMUMS: Record<string, number> = CASTILLITOS_STOCK_THRESHOLDS.lineMinimums;

function resolveLineCode(product: Pick<OrderProductSearchResult, "lineName" | "categoryName" | "referenceCode">): string | null {
  const upper = (product.lineName || product.categoryName || "").toUpperCase();
  if (upper.includes("LATIN") || upper.startsWith("LT")) return "LT";
  if (upper.includes("CASTILLITOS") || upper.startsWith("CS")) return "CS";
  // Also check reference prefix
  const ref = product.referenceCode.toUpperCase();
  if (ref.startsWith("LT")) return "LT";
  if (ref.startsWith("CS") || ref.startsWith("CJ")) return "CS";
  return null;
}

export function getCommercialStockState(
  product: Pick<OrderProductSearchResult, "availableQty" | "variantCount" | "lineName" | "categoryName" | "referenceCode">,
): CommercialStockState {
  const total = product.availableQty;
  const variants = product.variantCount;
  const lineCode = resolveLineCode(product);
  const minForLine = lineCode ? LINE_MINIMUMS[lineCode] ?? 0 : 0;

  // 0. No variants imported (HIDE-NO-VARIANTS-01)
  if (variants === 0) {
    return {
      state: "unknown",
      label: "Pendiente variantes SAG",
      severity: "neutral",
      shouldShowInSearch: false,
      helperText: "Producto importado desde SAG, sin tallas/colores disponibles en Agentik",
    };
  }

  // 1. Unknown stock (null)
  if (total === null || total === undefined) {
    return {
      state: "unknown",
      label: "Stock no sincronizado",
      severity: "neutral",
      shouldShowInSearch: true,
      helperText: "Inventario no sincronizado",
    };
  }

  // 2. Zero stock
  if (total <= 0) {
    return {
      state: "out",
      label: "Sin stock",
      severity: "danger",
      shouldShowInSearch: false,
      helperText: "Sin inventario disponible",
    };
  }

  // 3. Last units (≤ config threshold)
  if (total <= CASTILLITOS_STOCK_THRESHOLDS.lastUnitsThreshold) {
    return {
      state: "last_units",
      label: "Ultimas unidades",
      severity: "danger",
      shouldShowInSearch: true,
      helperText: `${total} uds disponibles — ultimas unidades`,
    };
  }

  // 4. Few variants (only 1 variant with stock) + low stock
  const variantsWithStock = variants; // variantCount from search already counts those with stock
  if (variantsWithStock <= CASTILLITOS_STOCK_THRESHOLDS.fewVariantsThreshold && total <= CASTILLITOS_STOCK_THRESHOLDS.lastUnitsThreshold) {
    return {
      state: "last_units",
      label: "Ultimas unidades",
      severity: "danger",
      shouldShowInSearch: true,
      helperText: `${total} uds disponibles — solo 1 variante`,
    };
  }
  if (variantsWithStock <= CASTILLITOS_STOCK_THRESHOLDS.fewVariantsThreshold) {
    return {
      state: "few_variants",
      label: "Pocas variantes",
      severity: "warning",
      shouldShowInSearch: true,
      helperText: `${total} uds disponibles — solo 1 variante`,
    };
  }

  // 5. Line-specific minimum
  if (minForLine > 0 && total < minForLine) {
    return {
      state: "line_low",
      label: `Stock bajo ${lineCode}`,
      severity: "warning",
      shouldShowInSearch: true,
      helperText: `${total} uds disponibles — minimo ${lineCode} ${minForLine}`,
    };
  }

  // 6. Available
  return {
    state: "available",
    label: "Disponible",
    severity: "success",
    shouldShowInSearch: true,
    helperText: `${total} uds disponibles`,
  };
}

// ── Line candidate (what the selector produces before adding to order) ────────

export interface OrderLineCandidate {
  referenceCode:  string;
  productName:    string;
  size:           string;
  color:          string;
  quantity:       number;
  availableUnits: number | null;
  unitPrice:      number;
  thumbnailUrl:   string | null;
}
