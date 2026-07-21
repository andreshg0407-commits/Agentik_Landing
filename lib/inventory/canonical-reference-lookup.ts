/**
 * lib/inventory/canonical-reference-lookup.ts
 *
 * COMERCIAL-CANONICAL-INVENTORY-REFERENCE-LOOKUP-01
 *
 * Single canonical capability to resolve any explicit list of references
 * against the full inventory universe.
 *
 * Consumers (Maletas, Pedidos, Cobertura) call this with their reference list
 * and receive a complete stock + classification record per reference.
 *
 * Uses resolveCompatibleCommercialStock() — the same pure resolver
 * that Inventario uses — so both modules produce identical values.
 *
 * Data flow:
 *   1 batch ProductEntity query (by sku)
 *   1 batch PIL query (aggregated by productId + warehouseId via SQL)
 *   1 batch CCS query (latest snapshot per refCode)
 *   0 SOAP calls
 *   0 N+1 queries
 *
 * Pure server-side. No React.
 */

import { normalizeReferenceCode } from "@/lib/comercial/data-layer/shared/normalizers";
import { resolveLifecycleState } from "./reference-lifecycle";
import {
  classifyReferenceWithDomainGate,
} from "./commercial-reference-classifier";
import type { ReferenceBusinessDomain } from "./reference-business-domain";
import type { ReferenceLifecycleState } from "./reference-lifecycle";
import type {
  CommercialReferenceStatus,
  StockDistributionFlag,
} from "./commercial-reference-status";
import {
  resolveWarehouseByPk,
  isProductionOnlyWarehouse,
  isImportStagingWarehouse,
  isImportContainerWarehouse,
  isCcsCompatibleWithDomain,
  type CommercialStockPolicyName,
} from "./warehouse-master";
import {
  resolveCompatibleCommercialStock,
  type StockSource,
  type ContributingWarehouse,
  type WarehouseBalance,
} from "./compatible-commercial-stock-resolver";

// ── Public types ──────────────────────────────────────────────────────────

export type LookupState =
  | "RESOLVED"
  | "PRODUCT_NOT_FOUND"
  | "STOCK_DATA_NOT_FOUND"
  | "REFERENCE_COLLISION"
  | "EXTERNAL_DOMAIN";

export type StockDataState = "CERTIFIED" | "ABSENT";

// Re-export from resolver for consumer convenience
export type { StockSource, ContributingWarehouse };

export interface CanonicalReferenceLookupRecord {
  requestedReference: string;
  normalizedReference: string;
  matchedReference: string | null;
  productId: string | null;
  businessDomain: ReferenceBusinessDomain;
  inScope: boolean;
  exclusionReason: string | null;
  lifecycleState: ReferenceLifecycleState;
  commercialReferenceStatus: CommercialReferenceStatus;
  commercialStockPolicy: CommercialStockPolicyName | null;
  compatibleCommercialStock: number;
  contributingWarehouses: ContributingWarehouse[];
  stockSource: StockSource;
  sourceCompatibilityValidated: boolean;
  totalCommercialTextileStock: number;
  totalCommercialImportStock: number;
  totalProductionStock: number;
  totalStagingStock: number;
  totalContainerStock: number;
  totalOtherStock: number;
  stockDataState: StockDataState;
  stockDistribution: StockDistributionFlag;
  lastRelevantActivityAt: Date | null;
  dataQualityFlags: string[];
  lookupState: LookupState;
}

export interface CanonicalReferenceLookupInput {
  organizationId: string;
  references: string[];
}

export interface CanonicalReferenceLookupResult {
  records: Map<string, CanonicalReferenceLookupRecord>;
  stats: {
    requested: number;
    resolved: number;
    productNotFound: number;
    stockDataNotFound: number;
    externalDomain: number;
    referenceCollision: number;
    queryTimeMs: number;
  };
}

// ── DB interface ──────────────────────────────────────────────────────────

interface DbClient {
  productEntity: { findMany(args: any): Promise<any[]> };
  productInventoryLevel: { findMany(args: any): Promise<any[]> };
  commercialCoverageSnapshot: { findMany(args: any): Promise<any[]> };
  $queryRawUnsafe(query: string, ...args: any[]): Promise<any[]>;
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function loadCanonicalReferencesByReferenceList(
  db: DbClient,
  input: CanonicalReferenceLookupInput,
): Promise<CanonicalReferenceLookupResult> {
  const start = Date.now();
  const { organizationId, references } = input;

  // ── Step 0: Normalize ─────────────────────────────────────────────────
  const normalizedMap = new Map<string, string>();
  const requestedToNorm = new Map<string, string>();
  const collisions = new Set<string>();

  for (const ref of references) {
    const result = normalizeReferenceCode(ref);
    const norm = result.ok && result.value ? result.value : ref.trim().toUpperCase();
    if (normalizedMap.has(norm) && normalizedMap.get(norm) !== ref) {
      collisions.add(norm);
    }
    normalizedMap.set(norm, ref);
    requestedToNorm.set(ref, norm);
  }

  const uniqueRefs = [...new Set(references)];

  // ── Step 1: Batch ProductEntity ───────────────────────────────────────
  const peRows: any[] = await db.productEntity.findMany({
    where: { organizationId, sku: { in: uniqueRefs } },
    select: {
      id: true, sku: true, productLine: true, grupoSag: true,
      subgrupoSag: true, lineaSag: true, lastModifiedSag: true, lastSaleSag: true,
    },
  });

  const peBySku = new Map<string, any>();
  for (const pe of peRows) peBySku.set(pe.sku, pe);

  const peByNorm = new Map<string, any>();
  for (const pe of peRows) {
    const normResult = normalizeReferenceCode(pe.sku);
    const norm = normResult.ok && normResult.value ? normResult.value : pe.sku;
    if (!peByNorm.has(norm)) peByNorm.set(norm, pe);
  }

  // ── Step 2: Batch PIL (SQL-aggregated net per productId + warehouseId) ─
  const productIds = peRows.map((pe: any) => pe.id);
  let pilAggRows: { productId: string; warehouseId: string; net_qty: number }[] = [];
  if (productIds.length > 0) {
    const rawRows = await db.$queryRawUnsafe(
      `SELECT "productId", "warehouseId", SUM(quantity)::float AS net_qty
       FROM "ProductInventoryLevel"
       WHERE "productId" = ANY($1::text[])
       GROUP BY "productId", "warehouseId"`,
      productIds,
    );
    pilAggRows = (rawRows as any[]).map((r: any) => ({
      productId: r.productId as string,
      warehouseId: String(r.warehouseId),
      net_qty: Number(r.net_qty) || 0,
    }));
  }

  // Group by product
  const pilByProduct = new Map<string, WarehouseBalance[]>();
  for (const row of pilAggRows) {
    const arr = pilByProduct.get(row.productId) ?? [];
    arr.push({ warehouseId: row.warehouseId, netQuantity: row.net_qty });
    pilByProduct.set(row.productId, arr);
  }

  // ── Step 3: Batch CCS ────────────────────────────────────────────────
  const ccsRows: any[] = uniqueRefs.length > 0
    ? await db.commercialCoverageSnapshot.findMany({
        where: { organizationId, refCode: { in: uniqueRefs } },
        select: { refCode: true, disponible: true },
        orderBy: { snapshotAt: "desc" as const },
        distinct: ["refCode"],
      })
    : [];

  const ccsByRef = new Map<string, number>();
  for (const ccs of ccsRows) ccsByRef.set(ccs.refCode, Number(ccs.disponible) || 0);

  // ── Step 4: Build records ─────────────────────────────────────────────
  const records = new Map<string, CanonicalReferenceLookupRecord>();
  let resolved = 0, productNotFound = 0, stockDataNotFound = 0, externalDomain = 0, referenceCollision = 0;

  for (const ref of uniqueRefs) {
    const norm = requestedToNorm.get(ref) ?? ref;
    const pe = peBySku.get(ref) ?? peByNorm.get(norm);

    if (!pe) {
      records.set(ref, buildNotFoundRecord(ref, norm));
      productNotFound++;
      continue;
    }

    if (collisions.has(norm)) {
      records.set(ref, { ...buildNotFoundRecord(ref, norm), lookupState: "REFERENCE_COLLISION" });
      referenceCollision++;
      continue;
    }

    const lifecycle = resolveLifecycleState({
      lastModifiedAt: pe.lastModifiedSag ? new Date(pe.lastModifiedSag) : null,
      lastSaleDate: pe.lastSaleSag ? new Date(pe.lastSaleSag) : null,
    });

    const warehouseBalances = pilByProduct.get(pe.id) ?? [];

    // CCS
    const ccsDisponible = ccsByRef.get(ref) ?? ccsByRef.get(pe.sku);
    const hasCcs = ccsDisponible !== undefined;

    // Resolve domain (without stock override — need domain first)
    const gate = classifyReferenceWithDomainGate({
      lifecycleState: lifecycle.lifecycleState,
      lastModifiedAt: pe.lastModifiedSag ? new Date(pe.lastModifiedSag) : null,
      lastSaleDate: pe.lastSaleSag ? new Date(pe.lastSaleSag) : null,
      inventoryLevels: warehouseBalances.filter(b => b.netQuantity > 0)
        .map(b => ({ warehouseId: b.warehouseId, quantity: b.netQuantity })),
      productLine: pe.productLine ?? null,
      grupoSag: pe.grupoSag ?? null,
      lineaSag: pe.lineaSag ?? null,
      subgrupoSag: pe.subgrupoSag ?? null,
    });

    // ── Use shared resolver ──────────────────────────────────────────
    const stockResult = resolveCompatibleCommercialStock({
      businessDomain: gate.domain,
      ccsDisponible: hasCcs ? ccsDisponible : undefined,
      warehouseBalances,
    });

    // Re-run classifier with validated commercial stock
    const gateWithStock = classifyReferenceWithDomainGate({
      lifecycleState: lifecycle.lifecycleState,
      lastModifiedAt: pe.lastModifiedSag ? new Date(pe.lastModifiedSag) : null,
      lastSaleDate: pe.lastSaleSag ? new Date(pe.lastSaleSag) : null,
      inventoryLevels: warehouseBalances.filter(b => b.netQuantity > 0)
        .map(b => ({ warehouseId: b.warehouseId, quantity: b.netQuantity })),
      productLine: pe.productLine ?? null,
      grupoSag: pe.grupoSag ?? null,
      lineaSag: pe.lineaSag ?? null,
      subgrupoSag: pe.subgrupoSag ?? null,
      compatibleCommercialStockOverride: stockResult.compatibleCommercialStock,
    });

    if (!gateWithStock.inScope) externalDomain++;
    else resolved++;

    // ── Compute stock breakdown per warehouse type (net) ─────────────
    let textileStock = 0, importStock = 0, productionStock = 0;
    let stagingStock = 0, containerStock = 0, otherStock = 0;

    for (const bal of warehouseBalances) {
      const wh = resolveWarehouseByPk(bal.warehouseId);
      if (!wh) { otherStock += bal.netQuantity; continue; }
      switch (wh.businessType) {
        case "COMMERCIAL_TEXTILE": textileStock += bal.netQuantity; break;
        case "COMMERCIAL_AVAILABLE_IMPORT": importStock += bal.netQuantity; break;
        case "PRODUCTION_ONLY": productionStock += bal.netQuantity; break;
        case "IMPORT_STAGING": stagingStock += bal.netQuantity; break;
        case "IMPORT_CONTAINER": containerStock += bal.netQuantity; break;
        case "VENDOR": case "STORE": otherStock += bal.netQuantity; break;
        case "EXCLUDED": break;
      }
    }

    const hasPIL = warehouseBalances.length > 0;
    const stockDataState: StockDataState = (hasCcs || hasPIL) ? "CERTIFIED" : "ABSENT";

    // Data quality flags: merge resolver flags + additional
    const dataQualityFlags = [...stockResult.dataQualityFlags];
    if (!pe.lastModifiedSag) dataQualityFlags.push("MISSING_LAST_MODIFIED");
    if (!pe.lastSaleSag) dataQualityFlags.push("MISSING_LAST_SALE");

    const lookupState: LookupState = !gateWithStock.inScope
      ? "EXTERNAL_DOMAIN"
      : !hasCcs && !hasPIL
        ? "STOCK_DATA_NOT_FOUND"
        : "RESOLVED";

    if (lookupState === "STOCK_DATA_NOT_FOUND") {
      stockDataNotFound++;
      resolved--;
    }

    records.set(ref, {
      requestedReference: ref,
      normalizedReference: norm,
      matchedReference: pe.sku,
      productId: pe.id,
      businessDomain: gateWithStock.domain,
      inScope: gateWithStock.inScope,
      exclusionReason: gateWithStock.exclusionReason,
      lifecycleState: lifecycle.lifecycleState,
      commercialReferenceStatus: gateWithStock.classification.status,
      commercialStockPolicy: stockResult.commercialStockPolicy,
      compatibleCommercialStock: stockResult.compatibleCommercialStock,
      contributingWarehouses: stockResult.contributingWarehouses,
      stockSource: stockResult.stockSource,
      sourceCompatibilityValidated: stockResult.sourceCompatibilityValidated,
      totalCommercialTextileStock: textileStock,
      totalCommercialImportStock: importStock,
      totalProductionStock: productionStock,
      totalStagingStock: stagingStock,
      totalContainerStock: containerStock,
      totalOtherStock: otherStock,
      stockDataState,
      stockDistribution: gateWithStock.classification.stockDistribution,
      lastRelevantActivityAt: lifecycle.lastRelevantActivityAt,
      dataQualityFlags,
      lookupState,
    });
  }

  return {
    records,
    stats: {
      requested: references.length,
      resolved,
      productNotFound,
      stockDataNotFound,
      externalDomain,
      referenceCollision,
      queryTimeMs: Date.now() - start,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildNotFoundRecord(ref: string, norm: string): CanonicalReferenceLookupRecord {
  return {
    requestedReference: ref,
    normalizedReference: norm,
    matchedReference: null,
    productId: null,
    businessDomain: "UNKNOWN",
    inScope: false,
    exclusionReason: "PRODUCT_NOT_FOUND",
    lifecycleState: "NO_ACTIVITY_DATA",
    commercialReferenceStatus: "UNKNOWN",
    commercialStockPolicy: null,
    compatibleCommercialStock: 0,
    contributingWarehouses: [],
    stockSource: "NONE",
    sourceCompatibilityValidated: false,
    totalCommercialTextileStock: 0,
    totalCommercialImportStock: 0,
    totalProductionStock: 0,
    totalStagingStock: 0,
    totalContainerStock: 0,
    totalOtherStock: 0,
    stockDataState: "ABSENT",
    stockDistribution: "NO_ACTIVITY_DATA",
    lastRelevantActivityAt: null,
    dataQualityFlags: ["PRODUCT_NOT_FOUND"],
    lookupState: "PRODUCT_NOT_FOUND",
  };
}
