/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-normalizer.ts
 *
 * Normalizes raw SAG variant/inventory rows into typed objects.
 * Resolves talla/color/bodega codes to names using lookup maps.
 *
 * Sprint: SAG-VARIANTS-01
 */

import type {
  SagVariantRawRow,
  SagVariantNormalized,
  SagVariantInventory,
  SagVariantWarehouseInventory,
} from "./sag-variants-types";
import type { SagLookupMaps } from "./sag-master-lookups-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Normalize ───────────────────────────────────────────────────────────────

export interface NormalizeVariantsResult {
  normalized: SagVariantNormalized[];
  errors:     number;
}

export function normalizeVariantRows(
  rows: SagVariantRawRow[],
  maps: SagLookupMaps,
): NormalizeVariantsResult {
  const normalized: SagVariantNormalized[] = [];
  let errors = 0;

  for (const row of rows) {
    const productCode = str(row.k_sc_codigo_articulo).toUpperCase();
    if (!productCode) {
      errors++;
      continue;
    }

    const sizeCode = str(row.ss_talla);
    const colorCode = str(row.ss_color);
    const warehouseId = num(row.ka_nl_bodega);
    const saldo = num(row.saldo);
    const skuId = num(row.ka_nl_sku);

    // Resolve names from lookup maps
    const colorEntry = findByCode(maps.colors, colorCode);
    const warehouseEntry = findByIdOrCode(maps.warehouses, warehouseId);

    normalized.push({
      productCode,
      referenceCode: productCode,
      skuId,
      sizeCode,
      sizeName: sizeCode, // Size codes ARE the display names in Castillitos (e.g. "6-9", "T2")
      colorCode,
      colorName: colorEntry?.name ?? colorCode,
      warehouseId,
      warehouseCode: warehouseEntry?.code ?? String(warehouseId),
      warehouseName: warehouseEntry?.name ?? `Bodega ${warehouseId}`,
      available: saldo,
    });
  }

  return { normalized, errors };
}

// ── Aggregate variants across warehouses ────────────────────────────────────

export function aggregateVariantInventory(
  variants: SagVariantNormalized[],
): SagVariantInventory[] {
  // Group by productCode + sizeCode + colorCode
  const groupMap = new Map<string, {
    productCode: string;
    sizeCode: string;
    sizeName: string;
    colorCode: string;
    colorName: string;
    warehouses: SagVariantWarehouseInventory[];
    total: number;
  }>();

  for (const v of variants) {
    const key = `${v.productCode}|${v.sizeCode}|${v.colorCode}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        productCode: v.productCode,
        sizeCode: v.sizeCode,
        sizeName: v.sizeName,
        colorCode: v.colorCode,
        colorName: v.colorName,
        warehouses: [],
        total: 0,
      };
      groupMap.set(key, group);
    }

    group.warehouses.push({
      warehouseId: v.warehouseId,
      warehouseCode: v.warehouseCode,
      warehouseName: v.warehouseName,
      available: v.available,
    });
    group.total += v.available;
  }

  return Array.from(groupMap.values()).map(g => ({
    productCode: g.productCode,
    sizeCode: g.sizeCode,
    sizeName: g.sizeName,
    colorCode: g.colorCode,
    colorName: g.colorName,
    totalAvailable: g.total,
    warehouses: g.warehouses,
  }));
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

function findByCode(
  map: Map<string, { code: string; name: string }>,
  code: string,
): { code: string; name: string } | undefined {
  for (const entry of map.values()) {
    if (entry.code === code) return entry;
  }
  return undefined;
}

function findByIdOrCode(
  map: Map<string, { sagId: number; code: string; name: string }>,
  id: number,
): { code: string; name: string } | undefined {
  // Try by sagId first (map key is string of sagId)
  const byId = map.get(String(id));
  if (byId) return byId;
  // Fallback: search by code
  for (const entry of map.values()) {
    if (entry.code === String(id)) return entry;
  }
  return undefined;
}
