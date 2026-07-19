/**
 * lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-normalizer.ts
 *
 * Transforms SAG variant inventory data into Prisma-ready upsert payloads.
 *
 * Input:  SagVariantNormalized[] (from sag-variants-sync.ts)
 * Output: Grouped structures ready for DB upsert — one ProductVariant + N ProductInventoryLevel per variant.
 *
 * Sprint: SAG-INVENTORY-SYNC-01
 */

import type { SagVariantNormalized } from "../catalog/sag-variants-types";

// ── Prisma-ready payloads ───────────────────────────────────────────────────

export interface VariantUpsertPayload {
  /** Product code (maps to ProductEntity.externalId where externalSource="sag") */
  productCode:  string;
  /** Unique variant key: "{productCode}|{sizeCode}|{colorCode}" */
  variantKey:   string;
  /** Display name: "{sizeCode} / {colorName}" */
  variantName:  string;
  sizeCode:     string;
  sizeName:     string;
  colorCode:    string;
  colorName:    string;
  /** Inventory levels per warehouse */
  levels:       InventoryLevelPayload[];
}

export interface InventoryLevelPayload {
  /** Warehouse ID as string (SAG ka_nl_bodega) */
  warehouseId:    string;
  warehouseCode:  string;
  warehouseName:  string;
  /** Computed stock from SAG */
  quantity:       number;
  /** Always 0 from SAG — reservation is Agentik-side */
  reserved:       number;
}

// ── Normalization result ────────────────────────────────────────────────────

export interface InventoryNormalizeResult {
  /** Grouped variant payloads ready for upsert */
  variants:           VariantUpsertPayload[];
  /** Distinct product codes */
  distinctProducts:   number;
  /** Distinct warehouses */
  distinctWarehouses: number;
}

// ── Main normalizer ─────────────────────────────────────────────────────────

/**
 * Groups flat SAG variant rows into variant-level upsert payloads.
 *
 * Each variant = unique (productCode, sizeCode, colorCode).
 * Each variant has N inventory levels (one per warehouse).
 */
export function normalizeForUpsert(
  rows: SagVariantNormalized[],
): InventoryNormalizeResult {
  const variantMap = new Map<string, VariantUpsertPayload>();
  const productSet = new Set<string>();
  const warehouseSet = new Set<string>();

  for (const row of rows) {
    const variantKey = `${row.productCode}|${row.sizeCode}|${row.colorCode}`;
    productSet.add(row.productCode);
    warehouseSet.add(String(row.warehouseId));

    let variant = variantMap.get(variantKey);
    if (!variant) {
      variant = {
        productCode: row.productCode,
        variantKey,
        variantName: buildVariantName(row.sizeCode, row.colorName),
        sizeCode:    row.sizeCode,
        sizeName:    row.sizeName,
        colorCode:   row.colorCode,
        colorName:   row.colorName,
        levels:      [],
      };
      variantMap.set(variantKey, variant);
    }

    variant.levels.push({
      warehouseId:   String(row.warehouseId),
      warehouseCode: row.warehouseCode,
      warehouseName: row.warehouseName,
      quantity:      row.available,
      reserved:      0,
    });
  }

  return {
    variants:           Array.from(variantMap.values()),
    distinctProducts:   productSet.size,
    distinctWarehouses: warehouseSet.size,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildVariantName(sizeCode: string, colorName: string): string {
  const parts: string[] = [];
  if (sizeCode) parts.push(sizeCode);
  if (colorName) parts.push(colorName);
  return parts.join(" / ") || "Default";
}
