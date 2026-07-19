/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-sync.ts
 *
 * Sync service for SAG variant inventory.
 *
 * Computes current stock from MOVIMIENTOS_ITEMS + MOVIMIENTOS + FUENTES.
 * Returns in-memory variant maps — no DB writes in this sprint.
 *
 * Sprint: SAG-VARIANTS-01
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type { SagLookupMaps } from "./sag-master-lookups-types";
import {
  normalizeVariantRows,
  aggregateVariantInventory,
} from "./sag-variants-normalizer";
import type {
  SagVariantRawRow,
  SagVariantSyncResult,
} from "./sag-variants-types";
import { SAG_VARIANT_INVENTORY_QUERY } from "./sag-variants-types";

// ── Main sync function ──────────────────────────────────────────────────────

export async function syncSagVariants(
  config: PyaApiConfig,
  maps: SagLookupMaps,
  options: { dryRun?: boolean; productCode?: string } = {},
): Promise<SagVariantSyncResult> {
  const t0 = Date.now();
  const { dryRun = true, productCode } = options;

  // Build query — optionally filter to a single product
  let query = SAG_VARIANT_INVENTORY_QUERY;
  if (productCode) {
    // Insert product filter into WHERE clause
    query = query.replace(
      "AND A.sc_maneja_kardex = 'S'",
      `AND A.sc_maneja_kardex = 'S'\n  AND A.k_sc_codigo_articulo = '${productCode}'`,
    );
  }

  // eslint-disable-next-line no-console
  console.log("[SAG-VARIANTS] Fetching variant inventory from SAG...");

  const rawRows = await consultaSagJson(config, query) as SagVariantRawRow[];

  // eslint-disable-next-line no-console
  console.log(`[SAG-VARIANTS] Received ${rawRows.length} raw variant rows`);

  // Normalize
  const { normalized, errors } = normalizeVariantRows(rawRows, maps);

  // Aggregate across warehouses
  const inventory = aggregateVariantInventory(normalized);

  // Compute distinct counts
  const productSet = new Set(normalized.map(v => v.productCode));
  const variantSet = new Set(normalized.map(v => `${v.productCode}|${v.sizeCode}|${v.colorCode}`));
  const warehouseSet = new Set(normalized.map(v => v.warehouseId));

  return {
    totalRows: rawRows.length,
    distinctProducts: productSet.size,
    distinctVariants: variantSet.size,
    distinctWarehouses: warehouseSet.size,
    variants: normalized,
    inventory,
    durationMs: Date.now() - t0,
    dryRun,
    errors,
  };
}

// ── Get variants for a specific product ─────────────────────────────────────

export async function getProductVariantsFromSag(
  config: PyaApiConfig,
  maps: SagLookupMaps,
  productCode: string,
): Promise<SagVariantSyncResult> {
  return syncSagVariants(config, maps, { dryRun: true, productCode });
}
