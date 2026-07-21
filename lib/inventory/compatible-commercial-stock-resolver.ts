/**
 * lib/inventory/compatible-commercial-stock-resolver.ts
 *
 * COMERCIAL-CANONICAL-INVENTORY-REFERENCE-LOOKUP-01
 *
 * Single pure function that resolves compatible commercial stock for ANY reference.
 * Used by:
 *   - canonical-reference-lookup.ts (Maletas, Pedidos)
 *   - inventory-canonical-status-loader.ts (Inventario)
 *   - inventory-control-service.ts (Inventario accessories)
 *
 * No Prisma. No React. No server-only. No queries. Fully deterministic.
 *
 * Stock policy per domain (from warehouse-master):
 *   TEXTILE: sum PIL from includeInCommercialInventory warehouses (B01, ka_nl=10)
 *            CCS override allowed (CCS built from textile bodegas)
 *   IMPORT:  sum PIL from includeInImportInventory warehouses (B24, ka_nl=33)
 *            CCS override NOT allowed (CCS from textile bodegas, incompatible)
 *
 * PIL semantics: net quantity per warehouse (includes negatives), clamped to 0.
 */

import type { ReferenceBusinessDomain } from "./reference-business-domain";
import {
  getCommercialStockPolicy,
  isCcsCompatibleWithDomain,
  resolveWarehouseByPk,
  type CommercialStockPolicyName,
} from "./warehouse-master";

// ── Input ─────────────────────────────────────────────────────────────────

export interface WarehouseBalance {
  /** ka_nl_bodega (ProductInventoryLevel.warehouseId) */
  warehouseId: string;
  /** Net quantity (sum of all PIL rows for this product+warehouse, can be negative) */
  netQuantity: number;
}

export interface CommercialStockResolverInput {
  /** Resolved business domain */
  businessDomain: ReferenceBusinessDomain;
  /** CCS disponible if a CCS record exists, undefined otherwise */
  ccsDisponible: number | undefined;
  /** Pre-aggregated per-warehouse balances from PIL */
  warehouseBalances: WarehouseBalance[];
}

// ── Output ────────────────────────────────────────────────────────────────

export type StockSource = "CCS" | "PIL" | "NONE";

export interface ContributingWarehouse {
  kaNlBodega: string;
  ssCodigo: string;
  ssNombre: string;
  businessType: string;
  netQuantity: number;
}

export interface CommercialStockResolverResult {
  /** Compatible commercial stock per domain policy, clamped to >= 0 */
  compatibleCommercialStock: number;
  /** Which commercial stock policy was applied */
  commercialStockPolicy: CommercialStockPolicyName | null;
  /** Source of compatibleCommercialStock */
  stockSource: StockSource;
  /** True if the stock source was validated against domain policy */
  sourceCompatibilityValidated: boolean;
  /** Warehouses that contributed to compatibleCommercialStock */
  contributingWarehouses: ContributingWarehouse[];
  /** Data quality flags emitted by the resolver */
  dataQualityFlags: string[];
}

// ── Resolver ──────────────────────────────────────────────────────────────

/**
 * Resolve compatible commercial stock for a reference.
 *
 * Pure function. No queries. Deterministic.
 *
 * 1. Resolve stock policy for the business domain
 * 2. Check CCS compatibility with domain
 * 3. If CCS compatible + exists → use CCS
 * 4. Otherwise → sum PIL from authorized warehouses (net, including negatives)
 * 5. Clamp to >= 0
 */
export function resolveCompatibleCommercialStock(
  input: CommercialStockResolverInput,
): CommercialStockResolverResult {
  const { businessDomain, ccsDisponible, warehouseBalances } = input;
  const hasCcs = ccsDisponible !== undefined;

  const stockPolicy = getCommercialStockPolicy(businessDomain);
  if (!stockPolicy) {
    return {
      compatibleCommercialStock: 0,
      commercialStockPolicy: null,
      stockSource: "NONE",
      sourceCompatibilityValidated: false,
      contributingWarehouses: [],
      dataQualityFlags: [],
    };
  }

  const dataQualityFlags: string[] = [];
  const ccsCompatible = hasCcs && isCcsCompatibleWithDomain(businessDomain);

  if (ccsCompatible) {
    // CCS is compatible with domain — use it as truth
    const ccsVal = Math.max(0, ccsDisponible!);
    // CCS is aggregated — report authorized warehouses as contributing
    const contributingWarehouses: ContributingWarehouse[] = [];
    for (const wh of stockPolicy.authorizedWarehouses) {
      contributingWarehouses.push({
        kaNlBodega: wh.kaNlBodega,
        ssCodigo: wh.ssCodigo,
        ssNombre: wh.ssNombre,
        businessType: wh.businessType,
        netQuantity: 0, // CCS is aggregated, individual not available
      });
    }
    return {
      compatibleCommercialStock: ccsVal,
      commercialStockPolicy: stockPolicy.policy,
      stockSource: "CCS",
      sourceCompatibilityValidated: true,
      contributingWarehouses,
      dataQualityFlags,
    };
  }

  // CCS not available or incompatible — use PIL from authorized warehouses
  if (hasCcs && !ccsCompatible) {
    dataQualityFlags.push("CCS_DOMAIN_INCOMPATIBLE");
  }

  let pilNetTotal = 0;
  const contributingWarehouses: ContributingWarehouse[] = [];
  const hasPIL = warehouseBalances.length > 0;

  for (const bal of warehouseBalances) {
    if (stockPolicy.authorizedPks.has(bal.warehouseId)) {
      const wh = resolveWarehouseByPk(bal.warehouseId);
      if (!wh) continue;
      pilNetTotal += bal.netQuantity;
      contributingWarehouses.push({
        kaNlBodega: wh.kaNlBodega,
        ssCodigo: wh.ssCodigo,
        ssNombre: wh.ssNombre,
        businessType: wh.businessType,
        netQuantity: bal.netQuantity,
      });
    }
  }

  if (!hasCcs && hasPIL) dataQualityFlags.push("NO_CCS_USING_PIL");
  if (!hasCcs && !hasPIL) dataQualityFlags.push("NO_STOCK_DATA");

  return {
    compatibleCommercialStock: Math.max(0, pilNetTotal),
    commercialStockPolicy: stockPolicy.policy,
    stockSource: hasPIL ? "PIL" : "NONE",
    sourceCompatibilityValidated: true,
    contributingWarehouses,
    dataQualityFlags,
  };
}
