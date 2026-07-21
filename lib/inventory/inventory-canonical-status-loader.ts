/**
 * lib/inventory/inventory-canonical-status-loader.ts
 *
 * COMERCIAL-INVENTARIO-CANONICAL-STATUS-INTEGRATION-01 — Canonical Status Loader
 *
 * Server-only service that enriches an InventoryControlSnapshot with canonical
 * classification from the Business Domain Gate + Lifecycle + CommercialReferenceStatus.
 *
 * All queries are batch. Zero N+1. Zero SOAP calls.
 * Does NOT modify the original snapshot.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { InventoryControlSnapshot, InventoryItem, CanonicalLine, NonCommercialPilRow } from "./inventory-control-types";
import type { CommercialReferenceStatus, StockDistributionFlag } from "./commercial-reference-status";
import type { ReferenceBusinessDomain } from "./reference-business-domain";
import type { ReferenceLifecycleState } from "./reference-lifecycle";
import { resolveLifecycleState } from "./reference-lifecycle";
import { classifyReferenceWithDomainGate, type DomainGateResult } from "./commercial-reference-classifier";
import {
  resolveInventoryPanelDestination,
  resolveVaultSubcategory,
  resolveVaultActionLabel,
  type PanelDestination,
  type VaultSubcategory,
} from "./inventory-panel-destination";
import {
  isProductionOnlyWarehouse,
  isImportContainerWarehouse,
  isImportStagingWarehouse,
  isVendorWarehouse,
  isStoreWarehouse,
  getCommercialTextilePks,
  getCommercialAvailableImportPks,
  isCcsCompatibleWithDomain,
} from "./warehouse-master";
import {
  resolveCompatibleCommercialStock,
  type WarehouseBalance,
} from "./compatible-commercial-stock-resolver";
import {
  resolveReferenceBusinessDomain,
} from "./reference-business-domain";

// ── Output types (serializable for client) ──────────────────────────────────

export interface CanonicalInventoryItemStatus {
  productId: string | null;
  reference: string;
  description: string;
  canonicalLine: CanonicalLine;
  businessDomain: ReferenceBusinessDomain;
  lifecycleState: ReferenceLifecycleState;
  commercialReferenceStatus: CommercialReferenceStatus;
  stockDistribution: StockDistributionFlag;
  compatibleCommercialStock: number;
  totalCommercialTextileStock: number;
  totalCommercialImportStock: number;
  totalProductionStock: number;
  totalStagingStock: number;
  totalContainerStock: number;
  totalOtherStock: number;
  lastModifiedSag: string | null;
  lastSaleSag: string | null;
  lastRelevantActivityAt: string | null;
  inactivityDays: number | null;
  dataQualityFlags: string[];
  exclusionReason: string | null;
  panelDestination: PanelDestination;
  vaultSubcategory: VaultSubcategory | null;
  vaultActionLabel: string | null;
  /** Original InventoryItem — preserved for UI rendering */
  originalItem: InventoryItem;
}

export interface CanonicalInventorySnapshot {
  /** Original snapshot (unchanged) */
  original: InventoryControlSnapshot;
  /** All items with canonical classification */
  canonicalItems: CanonicalInventoryItemStatus[];
  /** Items grouped by panel destination */
  panels: Record<PanelDestination, CanonicalInventoryItemStatus[]>;
  /** Status distribution counts */
  statusDistribution: Record<CommercialReferenceStatus, number>;
  /** Domain distribution counts */
  domainDistribution: Record<ReferenceBusinessDomain, number>;
  /** External excluded count (Jupiter Pets etc.) */
  externalExcludedCount: number;
  /** Computed timestamp */
  computedAt: string;
}

// ── Internal types ──────────────────────────────────────────────────────────

interface PilRow {
  productId: string;
  warehouseId: string;
  quantity: number;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Enrich an InventoryControlSnapshot with canonical classification.
 *
 * Steps:
 *   1. Collect all SKUs from snapshot items
 *   2. Batch-load ProductEntity (domain + lifecycle fields)
 *   3. Batch-load ProductInventoryLevel (per-warehouse stock)
 *   4. For each item: resolve domain → lifecycle → classifyWithDomainGate → panelDestination
 *   5. Return enriched snapshot
 */
export async function enrichWithCanonicalClassification(
  organizationId: string,
  snapshot: InventoryControlSnapshot,
): Promise<CanonicalInventorySnapshot> {
  // 1. Use pre-loaded PIL from snapshot if available (avoids duplicate query).
  // Falls back to direct query for backward compatibility.
  let pilAggRows: NonCommercialPilRow[];
  if (snapshot._nonCommercialPil) {
    pilAggRows = snapshot._nonCommercialPil;
  } else {
    const db = prisma as any;
    const commercialPks = [
      ...getCommercialTextilePks(),
      ...getCommercialAvailableImportPks(),
    ];
    const placeholders = commercialPks.map((_, i) => `$${i + 2}`).join(", ");
    pilAggRows = (await db.$queryRawUnsafe(
      `SELECT "productId", "warehouseId", quantity
       FROM "ProductInventoryLevel"
       WHERE "organizationId" = $1 AND quantity > 0
         AND "warehouseId" NOT IN (${placeholders})`,
      organizationId,
      ...commercialPks,
    ) as any[]).map((r: any) => ({
      productId: r.productId as string,
      warehouseId: r.warehouseId as string,
      quantity: Number(r.quantity ?? 0),
    }));
  }

  // Group PIL by productId (only non-commercial warehouses, only positive stock)
  const pilByProduct = new Map<string, PilRow[]>();
  for (const row of pilAggRows) {
    const list = pilByProduct.get(row.productId) ?? [];
    list.push({
      productId: row.productId,
      warehouseId: row.warehouseId,
      quantity: row.quantity,
    });
    pilByProduct.set(row.productId, list);
  }

  // 1b. Load aggregated PIL per warehouse for IMPORT refs (productLine=5).
  // Import refs need B24 (COMMERCIAL_AVAILABLE_IMPORT) stock via the shared resolver.
  // This query returns NET per (productId, warehouseId) including negative quantities.
  const importProductIds = snapshot.items
    .filter(i => i.isAccessory && i.productId)
    .map(i => i.productId!);
  const importPilByProduct = new Map<string, WarehouseBalance[]>();
  if (importProductIds.length > 0) {
    try {
      const db = prisma as any;
      const rawRows: any[] = await db.$queryRawUnsafe(
        `SELECT "productId", "warehouseId", SUM(quantity)::float AS net_qty
         FROM "ProductInventoryLevel"
         WHERE "productId" = ANY($1::text[])
         GROUP BY "productId", "warehouseId"`,
        importProductIds,
      );
      for (const r of rawRows) {
        const pid = r.productId as string;
        const arr = importPilByProduct.get(pid) ?? [];
        arr.push({ warehouseId: String(r.warehouseId), netQuantity: Number(r.net_qty) || 0 });
        importPilByProduct.set(pid, arr);
      }
    } catch { /* graceful — import refs will show 0 */ }
  }

  // 4. Classify each item
  const canonicalItems: CanonicalInventoryItemStatus[] = [];

  for (const item of snapshot.items) {
    // PE data comes from snapshot items (loaded by buildInventoryControlSnapshot)
    const pils = item.productId ? (pilByProduct.get(item.productId) ?? []) : [];

    // Lifecycle — uses dates from snapshot item (pre-loaded from PE)
    const lifecycle = resolveLifecycleState({
      lastModifiedAt: item.lastModifiedSag ?? null,
      lastSaleDate: item.lastSaleSag ?? null,
    });

    // ── Resolve business domain ─────────────────────────────────────────
    const domainInput = {
      lineaSag: item.lineaSag ?? null,
      productLine: item.productLine ?? null,
      grupoSag: (item.grupoSag as string | null) ?? null,
      subgrupoSag: item.subgrupoSag ?? null,
    };
    const businessDomain = resolveReferenceBusinessDomain(domainInput);

    // ── Resolve compatible commercial stock via shared resolver ──────────
    // For TEXTILE: CCS disponibleReal is the source (compatible with textile policy)
    // For IMPORT: PIL B24 net is the source (CCS incompatible, B26/B27 excluded)
    const ccsCompatible = isCcsCompatibleWithDomain(businessDomain);
    const ccsDisponible = ccsCompatible && item.inventoryVisibility !== "NO_DATA"
      ? item.disponibleReal
      : undefined;

    // For import refs, use aggregated PIL per warehouse for resolver
    const importBalances = (item.isAccessory && item.productId)
      ? (importPilByProduct.get(item.productId) ?? [])
      : [];

    // Build warehouse balances for resolver (non-commercial PIL + import commercial PIL)
    const warehouseBalances: WarehouseBalance[] = [
      ...pils.map(p => ({ warehouseId: p.warehouseId, netQuantity: p.quantity })),
      ...importBalances,
    ];

    const stockResult = resolveCompatibleCommercialStock({
      businessDomain,
      ccsDisponible,
      warehouseBalances,
    });

    const compatibleCommercialStock = stockResult.compatibleCommercialStock;

    // Domain gate classification with validated stock
    const gateResult: DomainGateResult = classifyReferenceWithDomainGate({
      lifecycleState: lifecycle.lifecycleState,
      lastModifiedAt: item.lastModifiedSag ?? null,
      lastSaleDate: item.lastSaleSag ?? null,
      inventoryLevels: pils.map(p => ({ warehouseId: p.warehouseId, quantity: p.quantity })),
      productLine: item.productLine ?? null,
      grupoSag: (item.grupoSag as string | null) ?? null,
      lineaSag: item.lineaSag ?? null,
      subgrupoSag: item.subgrupoSag ?? null,
      compatibleCommercialStockOverride: compatibleCommercialStock,
    });

    // Non-commercial stock from PIL (already filtered: only non-commercial warehouses, qty > 0)
    let totalProductionStock = 0;
    let totalStagingStock = 0;
    let totalContainerStock = 0;
    let totalOtherStock = 0;

    for (const p of pils) {
      if (isProductionOnlyWarehouse(p.warehouseId)) totalProductionStock += p.quantity;
      else if (isImportContainerWarehouse(p.warehouseId)) totalContainerStock += p.quantity;
      else if (isImportStagingWarehouse(p.warehouseId)) totalStagingStock += p.quantity;
      else if (isVendorWarehouse(p.warehouseId) || isStoreWarehouse(p.warehouseId)) totalOtherStock += p.quantity;
    }

    const { classification } = gateResult;

    // Data quality flags: merge resolver flags + additional
    const dataQualityFlags = [...stockResult.dataQualityFlags];
    if (!item.productId) dataQualityFlags.push("MISSING_PRODUCT_ENTITY");
    if (!item.lastModifiedSag) dataQualityFlags.push("MISSING_LAST_MODIFIED");
    if (!item.lastSaleSag) dataQualityFlags.push("MISSING_LAST_SALE");

    // Panel destination
    const hasCertifiedCommercialHistory = item.inventoryVisibility !== "NO_DATA";
    const panelDest = resolveInventoryPanelDestination({
      exclusionReason: gateResult.exclusionReason,
      commercialReferenceStatus: classification.status,
      stockDistribution: classification.stockDistribution,
      compatibleCommercialStock,
      canonicalLine: item.canonicalLine,
      hasCertifiedCommercialHistory,
    });

    // Vault subcategory
    const vaultSub = panelDest === "VAULT"
      ? resolveVaultSubcategory(classification.status, classification.stockDistribution)
      : null;

    const vaultAction = vaultSub ? resolveVaultActionLabel(vaultSub) : null;

    // Commercial textile/import breakdown from resolver
    const totalCommercialTextileStock = item.isAccessory ? 0 : compatibleCommercialStock;
    const totalCommercialImportStock = item.isAccessory ? compatibleCommercialStock : 0;

    canonicalItems.push({
      productId: item.productId,
      reference: item.reference,
      description: item.description,
      canonicalLine: item.canonicalLine,
      businessDomain: gateResult.domain,
      lifecycleState: lifecycle.lifecycleState,
      commercialReferenceStatus: classification.status,
      stockDistribution: classification.stockDistribution,
      compatibleCommercialStock,
      totalCommercialTextileStock,
      totalCommercialImportStock,
      totalProductionStock,
      totalStagingStock,
      totalContainerStock,
      totalOtherStock,
      lastModifiedSag: item.lastModifiedSag?.toISOString() ?? null,
      lastSaleSag: item.lastSaleSag?.toISOString() ?? null,
      lastRelevantActivityAt: lifecycle.lastRelevantActivityAt?.toISOString() ?? null,
      inactivityDays: lifecycle.inactivityDays,
      dataQualityFlags,
      exclusionReason: gateResult.exclusionReason,
      panelDestination: panelDest,
      vaultSubcategory: vaultSub,
      vaultActionLabel: vaultAction,
      originalItem: item,
    });
  }

  // 5. Build grouped panels
  const panels: Record<PanelDestination, CanonicalInventoryItemStatus[]> = {
    CASTILLITOS: [],
    LATIN_KIDS: [],
    IMPORTACION: [],
    SIN_CLASIFICAR: [],
    AGOTADOS: [],
    VAULT: [],
    EXTERNAL_EXCLUDED: [],
  };

  for (const ci of canonicalItems) {
    panels[ci.panelDestination].push(ci);
  }

  // 6. Status distribution
  const statusDistribution: Record<CommercialReferenceStatus, number> = {
    ACTIVE_AVAILABLE: 0,
    ACTIVE_NON_COMMERCIAL: 0,
    LOW_ACTIVITY_AVAILABLE: 0,
    LOW_ACTIVITY_NON_COMMERCIAL: 0,
    DORMANT: 0,
    ARCHIVE_REVIEW: 0,
    UNKNOWN: 0,
  };
  for (const ci of canonicalItems) {
    statusDistribution[ci.commercialReferenceStatus]++;
  }

  // 7. Domain distribution
  const domainDistribution: Record<ReferenceBusinessDomain, number> = {
    CASTILLITOS_TEXTILE: 0,
    LATIN_KIDS_TEXTILE: 0,
    CASTILLITOS_IMPORT: 0,
    JUPITER_PETS: 0,
    UNKNOWN: 0,
  };
  for (const ci of canonicalItems) {
    domainDistribution[ci.businessDomain]++;
  }

  return {
    original: snapshot,
    canonicalItems,
    panels,
    statusDistribution,
    domainDistribution,
    externalExcludedCount: panels.EXTERNAL_EXCLUDED.length,
    computedAt: new Date().toISOString(),
  };
}
