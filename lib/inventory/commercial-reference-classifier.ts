/**
 * lib/inventory/commercial-reference-classifier.ts
 *
 * COMERCIAL-INVENTORY-CANONICAL-STATUS-01
 *
 * Adapter that bridges:
 *   Warehouse Master + Lifecycle → CommercialReferenceStatus
 *
 * Pure TypeScript. No Prisma. No React. No server-only.
 * No queries. No duplicated logic.
 */

import type { ReferenceLifecycleState } from "./reference-lifecycle";
import { resolveLastRelevantActivity } from "./reference-lifecycle";
import {
  isCommercialTextileWarehouse,
  isCommercialAvailableImportWarehouse,
  isProductionOnlyWarehouse,
  isImportContainerWarehouse,
  isImportStagingWarehouse,
  isVendorWarehouse,
  isStoreWarehouse,
} from "./warehouse-master";
import {
  resolveCommercialReferenceStatus,
  type CommercialReferenceContext,
  type CommercialReferenceResult,
} from "./commercial-reference-status";
import {
  resolveReferenceBusinessDomain,
  isReferenceInCastillitosCommercialScope,
  getExclusionReason,
  type ReferenceBusinessDomain,
  type DomainResolverInput,
} from "./reference-business-domain";

// ── Input from raw inventory data ───────────────────────────────────────────

export interface RawInventoryLevel {
  warehouseId: string;
  quantity: number;
}

export interface ClassifierInput {
  lifecycleState: ReferenceLifecycleState;
  lastModifiedAt: Date | null;
  lastSaleDate: Date | null;
  inventoryLevels: RawInventoryLevel[];
  dataQualityFlags?: string[];
  /**
   * When provided, overrides PIL-based commercial stock with a CCS-sourced
   * value (e.g. disponibleReal from CommercialCoverageSnapshot).
   *
   * PIL commercial warehouses have 63% negative rows (accounting entries),
   * making PIL unreliable for commercial availability. CCS is the source of truth.
   */
  compatibleCommercialStockOverride?: number;
}

/** Extended input that includes product metadata for domain resolution */
export interface DomainAwareClassifierInput extends ClassifierInput {
  /** SAG product line ID (productLine field) */
  productLine: string | null;
  /** SAG group (grupoSag field) */
  grupoSag: string | null;
  /** SAG line name (lineaSag field) */
  lineaSag?: string | null;
  /** SAG subgroup (subgrupoSag field) */
  subgrupoSag?: string | null;
}

/** Result that includes domain gate information */
export interface DomainGateResult {
  /** Business domain resolved from product metadata */
  domain: ReferenceBusinessDomain;
  /** True if the reference is within Castillitos commercial scope */
  inScope: boolean;
  /** Non-null if the reference was excluded by the domain gate */
  exclusionReason: string | null;
  /** Commercial classification — only meaningful when inScope=true */
  classification: CommercialReferenceResult;
}

// ── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classify a reference by building CommercialReferenceContext from raw data
 * and delegating to resolveCommercialReferenceStatus().
 *
 * WARNING: This does NOT check business domain. Use classifyReferenceWithDomainGate()
 * for the full pipeline that excludes Jupiter Pets and other out-of-scope domains.
 */
export function classifyReference(input: ClassifierInput): CommercialReferenceResult {
  const ctx = buildContext(input);
  return resolveCommercialReferenceStatus(ctx);
}

/**
 * Full classification pipeline with upstream business domain gate.
 *
 * 1. Resolve business domain from product metadata (grupoSag, productLine)
 * 2. If out of scope → return exclusion result without running the classifier
 * 3. If in scope → delegate to classifyReference()
 *
 * Domain is NEVER inferred from warehouse stock location.
 */
export function classifyReferenceWithDomainGate(input: DomainAwareClassifierInput): DomainGateResult {
  const domainInput: DomainResolverInput = {
    lineaSag: input.lineaSag ?? null,
    productLine: input.productLine,
    grupoSag: input.grupoSag,
    subgrupoSag: input.subgrupoSag ?? null,
  };

  const domain = resolveReferenceBusinessDomain(domainInput);
  const inScope = isReferenceInCastillitosCommercialScope(domain);
  const exclusionReason = getExclusionReason(domain);

  if (!inScope) {
    return {
      domain,
      inScope: false,
      exclusionReason,
      classification: {
        status: "UNKNOWN",
        reason: `Excluido por dominio de negocio: ${domain} — ${exclusionReason}`,
        stockDistribution: "NO_ACTIVITY_DATA",
      },
    };
  }

  const classification = classifyReference(input);
  return { domain, inScope: true, exclusionReason: null, classification };
}

/**
 * Build CommercialReferenceContext from raw inventory + lifecycle data.
 * Exported for inspection/testing.
 */
export function buildContext(input: ClassifierInput): CommercialReferenceContext {
  const hasCcsOverride = input.compatibleCommercialStockOverride !== undefined;
  let totalCommercialStock = 0;
  let totalProductionStock = 0;
  let totalContainerStock = 0;
  let totalStagingStock = 0;
  let totalOtherStock = 0;
  const warehouseIds: string[] = [];

  for (const lvl of input.inventoryLevels) {
    const qty = lvl.quantity;
    if (qty <= 0) continue;

    if (!warehouseIds.includes(lvl.warehouseId)) {
      warehouseIds.push(lvl.warehouseId);
    }

    if (isCommercialTextileWarehouse(lvl.warehouseId) || isCommercialAvailableImportWarehouse(lvl.warehouseId)) {
      // When CCS override is provided, skip PIL-based commercial sum — CCS is truth
      if (!hasCcsOverride) totalCommercialStock += qty;
    } else if (isProductionOnlyWarehouse(lvl.warehouseId)) {
      totalProductionStock += qty;
    } else if (isImportContainerWarehouse(lvl.warehouseId)) {
      totalContainerStock += qty;
    } else if (isImportStagingWarehouse(lvl.warehouseId)) {
      totalStagingStock += qty;
    } else if (isVendorWarehouse(lvl.warehouseId) || isStoreWarehouse(lvl.warehouseId)) {
      totalOtherStock += qty;
    }
    // EXCLUDED warehouses are silently ignored — no bucket
  }

  // Use CCS-sourced commercial stock when available (PIL has unreliable negatives)
  if (hasCcsOverride) {
    totalCommercialStock = Math.max(0, input.compatibleCommercialStockOverride!);
  }

  const lastRelevantActivity = resolveLastRelevantActivity({
    lastModifiedAt: input.lastModifiedAt,
    lastSaleDate: input.lastSaleDate,
  });

  const lifecycleState = mapLifecycleState(input.lifecycleState);

  return {
    lifecycleState,
    warehouseIds,
    totalCommercialStock,
    totalProductionStock,
    totalContainerStock,
    totalStagingStock,
    totalOtherStock,
    lastRelevantActivity,
    dataQualityFlags: input.dataQualityFlags ?? [],
  };
}

function mapLifecycleState(
  state: ReferenceLifecycleState,
): CommercialReferenceContext["lifecycleState"] {
  switch (state) {
    case "ACTIVE": return "ACTIVE";
    case "LOW_ACTIVITY": return "LOW_ACTIVITY";
    case "DORMANT": return "DORMANT";
    case "ARCHIVE_REVIEW": return "ARCHIVE_REVIEW";
    case "NO_ACTIVITY_DATA": return "NO_ACTIVITY_DATA";
    default: return "NO_ACTIVITY_DATA";
  }
}
