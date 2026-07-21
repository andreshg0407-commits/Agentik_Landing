/**
 * lib/comercial/maletas/maletas-canonical-inventory.ts
 *
 * COMERCIAL-MALETAS-CANONICAL-INVENTORY-CONSUMPTION-01
 *
 * Canonical inventory classification for the Maletas domain.
 *
 * Strategy: batch classifier that accepts ONLY the references Maletas needs,
 * queries PE + PIL for the subset, reuses CCS data already loaded by Maletas
 * as compatibleCommercialStockOverride, and runs classifyReferenceWithDomainGate()
 * in memory.
 *
 * Guarantees:
 *   - At most 1 PE query (batch by SKU set)
 *   - At most 1 PIL query (batch by productId set, non-commercial warehouses only)
 *   - Zero SOAP calls
 *   - Zero N+1
 *   - Does NOT load the full 4,004-ref Inventory snapshot
 *   - Does NOT build Inventory panels
 *   - Pure TypeScript helpers — no Prisma, no React
 *
 * Server-only: the batch classifier queries Prisma.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { ReferenceBusinessDomain } from "@/lib/inventory/reference-business-domain";
import type { ReferenceLifecycleState } from "@/lib/inventory/reference-lifecycle";
import { resolveLifecycleState } from "@/lib/inventory/reference-lifecycle";
import type { CommercialReferenceStatus, StockDistributionFlag } from "@/lib/inventory/commercial-reference-status";
import { classifyReferenceWithDomainGate } from "@/lib/inventory/commercial-reference-classifier";
import type { CanonicalLine } from "@/lib/inventory/inventory-control-types";
import {
  isProductionOnlyWarehouse,
  isImportContainerWarehouse,
  isImportStagingWarehouse,
  isVendorWarehouse,
  isStoreWarehouse,
  getCommercialTextilePks,
  getCommercialAvailableImportPks,
} from "@/lib/inventory/warehouse-master";

// ── Contract ────────────────────────────────────────────────────────────────

export interface CanonicalMaletaInventoryRef {
  productId: string | null;
  reference: string;
  description: string | null;
  businessDomain: ReferenceBusinessDomain;
  inCommercialScope: boolean;
  lifecycleState: ReferenceLifecycleState;
  commercialReferenceStatus: CommercialReferenceStatus;
  stockDistribution: StockDistributionFlag;
  canonicalLine: CanonicalLine;
  grupoSag: string | null;
  subgrupoSag: string | null;
  sizeClass: string | null;
  compatibleCommercialStock: number;
  commercialTextileStock: number;
  commercialImportStock: number;
  productionStock: number;
  stagingStock: number;
  containerStock: number;
  lastSaleSag: Date | null;
  lastModifiedSag: Date | null;
  lastRelevantActivityAt: Date | null;
  inactivityDays: number | null;
  dataQualityFlags: string[];
  exclusionReason: string | null;
}

// ── Batch classifier input ──────────────────────────────────────────────────

export interface MaletaCcsRecord {
  /** Reference code (SKU) */
  reference: string;
  /** CCS disponible (B01+B04 for textile, B24 for import) — source of truth */
  disponible: number;
  /** CCS line ("CS" | "LT" | etc.) */
  line: string | null;
  /** CCS subgrupoSag */
  subgrupoSag: string | null;
  /** CCS description */
  description: string | null;
}

export interface ClassifyMaletaReferencesInput {
  organizationId: string;
  /** CCS records already loaded by the Maletas loader */
  ccsRecords: MaletaCcsRecord[];
  /** Additional references NOT in CCS (e.g. F34 presence-only refs with no CCS coverage) */
  additionalReferences?: string[];
}

// ── Internal PE row ─────────────────────────────────────────────────────────

interface PeRow {
  id: string;
  sku: string;
  productLine: string | null;
  grupoSag: string | null;
  subgrupoSag: string | null;
  lineaSag: string | null;
  handlingUnit: string | null;
  lastModifiedSag: Date | null;
  lastSaleSag: Date | null;
}

// ── Batch classifier ────────────────────────────────────────────────────────

/**
 * Classify a subset of references for the Maletas domain.
 *
 * 1. Collects all unique references from CCS + additionalReferences
 * 2. Batch-loads PE rows for those SKUs (1 query)
 * 3. Batch-loads non-commercial PIL for the matched productIds (1 query)
 * 4. Runs classifyReferenceWithDomainGate() in memory per reference
 * 5. Returns Map<reference, CanonicalMaletaInventoryRef>
 */
/** Performance timings from the last batch classification run */
export let lastClassifyPerformanceMs = { peQueryMs: 0, pilQueryMs: 0, classifyLoopMs: 0 };

export async function classifyMaletaReferencesBatch(
  input: ClassifyMaletaReferencesInput,
): Promise<Map<string, CanonicalMaletaInventoryRef>> {
  const { organizationId, ccsRecords, additionalReferences } = input;

  // 1. Collect all unique references
  const allRefs = new Set<string>();
  const ccsMap = new Map<string, MaletaCcsRecord>();
  for (const rec of ccsRecords) {
    allRefs.add(rec.reference);
    ccsMap.set(rec.reference, rec);
  }
  if (additionalReferences) {
    for (const ref of additionalReferences) allRefs.add(ref);
  }

  if (allRefs.size === 0) return new Map();

  const refArray = [...allRefs];

  // 2. Batch-load ProductEntity for the subset (1 query)
  const db = prisma as any;
  const tPeStart = Date.now();
  const peRows: PeRow[] = await loadProductEntitiesBatch(db, organizationId, refArray);
  const tPeEnd = Date.now();
  const peByRef = new Map<string, PeRow>();
  const productIds: string[] = [];
  for (const pe of peRows) {
    peByRef.set(pe.sku, pe);
    productIds.push(pe.id);
  }

  // 3. Batch-load non-commercial PIL for the matched productIds (1 query)
  const tPilStart = Date.now();
  const pilByProduct = await loadNonCommercialPilBatch(db, organizationId, productIds);
  const tPilEnd = Date.now();

  // 4. Classify each reference in memory
  const tClassifyLoopStart = Date.now();
  const result = new Map<string, CanonicalMaletaInventoryRef>();

  for (const ref of refArray) {
    const pe = peByRef.get(ref) ?? null;
    const ccs = ccsMap.get(ref) ?? null;
    const pils = pe ? (pilByProduct.get(pe.id) ?? []) : [];

    // Lifecycle from PE dates
    const lifecycle = resolveLifecycleState({
      lastModifiedAt: pe?.lastModifiedSag ?? null,
      lastSaleDate: pe?.lastSaleSag ?? null,
    });

    // CCS-sourced commercial stock is the override (PIL has 63% negatives)
    const compatibleCommercialStock = ccs ? Math.max(0, ccs.disponible) : 0;

    // Domain gate classification
    const gate = classifyReferenceWithDomainGate({
      lifecycleState: lifecycle.lifecycleState,
      lastModifiedAt: pe?.lastModifiedSag ?? null,
      lastSaleDate: pe?.lastSaleSag ?? null,
      inventoryLevels: pils.map(p => ({ warehouseId: p.warehouseId, quantity: p.quantity })),
      productLine: pe?.productLine ?? null,
      grupoSag: pe?.grupoSag ?? (ccs?.subgrupoSag ? null : null),
      lineaSag: pe?.lineaSag ?? null,
      subgrupoSag: pe?.subgrupoSag ?? ccs?.subgrupoSag ?? null,
      compatibleCommercialStockOverride: ccs ? ccs.disponible : undefined,
    });

    // Non-commercial stock breakdown from PIL
    let productionStock = 0;
    let stagingStock = 0;
    let containerStock = 0;
    for (const p of pils) {
      if (isProductionOnlyWarehouse(p.warehouseId)) productionStock += p.quantity;
      else if (isImportContainerWarehouse(p.warehouseId)) containerStock += p.quantity;
      else if (isImportStagingWarehouse(p.warehouseId)) stagingStock += p.quantity;
      // vendor/store stock not tracked for Maletas — they care about central availability
    }

    // Canonical line from domain
    const canonicalLine = resolveCanonicalLineFromDomain(gate.domain, pe?.productLine ?? null);

    // Is import?
    const isImport = gate.domain === "CASTILLITOS_IMPORT";

    // Data quality
    const dataQualityFlags: string[] = [];
    if (!pe) dataQualityFlags.push("MISSING_PRODUCT_ENTITY");
    if (pe && !pe.lastModifiedSag) dataQualityFlags.push("MISSING_LAST_MODIFIED");
    if (pe && !pe.lastSaleSag) dataQualityFlags.push("MISSING_LAST_SALE");
    if (!ccs) dataQualityFlags.push("NO_CCS_RECORD");

    result.set(ref, {
      productId: pe?.id ?? null,
      reference: ref,
      description: ccs?.description ?? null,
      businessDomain: gate.domain,
      inCommercialScope: gate.inScope,
      lifecycleState: lifecycle.lifecycleState,
      commercialReferenceStatus: gate.classification.status,
      stockDistribution: gate.classification.stockDistribution,
      canonicalLine,
      grupoSag: pe?.grupoSag ?? null,
      subgrupoSag: pe?.subgrupoSag ?? ccs?.subgrupoSag ?? null,
      sizeClass: pe?.handlingUnit ?? null,
      compatibleCommercialStock,
      commercialTextileStock: isImport ? 0 : compatibleCommercialStock,
      commercialImportStock: isImport ? compatibleCommercialStock : 0,
      productionStock,
      stagingStock,
      containerStock,
      lastSaleSag: pe?.lastSaleSag ?? null,
      lastModifiedSag: pe?.lastModifiedSag ?? null,
      lastRelevantActivityAt: lifecycle.lastRelevantActivityAt,
      inactivityDays: lifecycle.inactivityDays,
      dataQualityFlags,
      exclusionReason: gate.exclusionReason,
    });
  }

  const tClassifyLoopEnd = Date.now();
  lastClassifyPerformanceMs = {
    peQueryMs: tPeEnd - tPeStart,
    pilQueryMs: tPilEnd - tPilStart,
    classifyLoopMs: tClassifyLoopEnd - tClassifyLoopStart,
  };

  return result;
}

// ── Data loaders (batch, never N+1) ─────────────────────────────────────────

async function loadProductEntitiesBatch(
  db: any,
  organizationId: string,
  references: string[],
): Promise<PeRow[]> {
  if (references.length === 0) return [];
  try {
    const placeholders = references.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await db.$queryRawUnsafe(
      `SELECT id, sku, "productLine", "grupoSag", "subgrupoSag", "lineaSag",
              "handlingUnit", "lastModifiedSag", "lastSaleSag"
       FROM "ProductEntity"
       WHERE "organizationId" = $1 AND sku IN (${placeholders})`,
      organizationId,
      ...references,
    ) as any[];
    return rows.map((r: any) => ({
      id: r.id as string,
      sku: r.sku as string,
      productLine: r.productLine as string | null,
      grupoSag: r.grupoSag as string | null,
      subgrupoSag: r.subgrupoSag as string | null,
      lineaSag: r.lineaSag as string | null,
      handlingUnit: r.handlingUnit as string | null,
      lastModifiedSag: r.lastModifiedSag ? new Date(r.lastModifiedSag) : null,
      lastSaleSag: r.lastSaleSag ? new Date(r.lastSaleSag) : null,
    }));
  } catch {
    return [];
  }
}

async function loadNonCommercialPilBatch(
  db: any,
  organizationId: string,
  productIds: string[],
): Promise<Map<string, { warehouseId: string; quantity: number }[]>> {
  const result = new Map<string, { warehouseId: string; quantity: number }[]>();
  if (productIds.length === 0) return result;

  try {
    const commercialPks = [
      ...getCommercialTextilePks(),
      ...getCommercialAvailableImportPks(),
    ];

    // Build parameterized query: $1=orgId, $2..$(n+1)=productIds, $(n+2)..=commercialPks
    const pidPlaceholders = productIds.map((_, i) => `$${i + 2}`).join(", ");
    const comOffset = productIds.length + 2;
    const comPlaceholders = commercialPks.map((_, i) => `$${comOffset + i}`).join(", ");

    const rows = await db.$queryRawUnsafe(
      `SELECT "productId", "warehouseId", quantity
       FROM "ProductInventoryLevel"
       WHERE "organizationId" = $1
         AND "productId" IN (${pidPlaceholders})
         AND quantity > 0
         AND "warehouseId" NOT IN (${comPlaceholders})`,
      organizationId,
      ...productIds,
      ...commercialPks,
    ) as any[];

    for (const r of rows) {
      const pid = r.productId as string;
      const list = result.get(pid) ?? [];
      list.push({
        warehouseId: r.warehouseId as string,
        quantity: Number(r.quantity ?? 0),
      });
      result.set(pid, list);
    }
  } catch {
    // fail closed — no PIL data = no non-commercial stock
  }

  return result;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function resolveCanonicalLineFromDomain(
  domain: ReferenceBusinessDomain,
  productLine: string | null,
): CanonicalLine {
  switch (domain) {
    case "CASTILLITOS_TEXTILE": return "CASTILLITOS";
    case "LATIN_KIDS_TEXTILE": return "LATIN_KIDS";
    case "CASTILLITOS_IMPORT": return "IMPORTACION";
    default:
      // Fallback for UNKNOWN/JUPITER_PETS — try productLine
      if (productLine === "1") return "LATIN_KIDS";
      if (productLine === "2" || productLine === "3" || productLine === "4" || productLine === "6") return "CASTILLITOS";
      if (productLine === "5") return "IMPORTACION";
      return "SIN_CLASIFICAR";
  }
}

// ── Decision constants (separated by responsibility) ─────────────────────────
// Each constant set governs a single decision domain. Never reuse across domains.

/** Minimum units to remain in a maleta without triggering removal. */
export const MALETA_REMOVAL_LIMITS: Record<string, number> = {
  CASTILLITOS: 20,
  LATIN_KIDS: 30,
  IMPORTACION: 10,
};

/** Minimum units (strict >) for a reference to qualify as a NEW coverage opportunity. */
export const MALETA_COVERAGE_MINIMUMS: Record<string, number> = {
  CASTILLITOS: 100,
  LATIN_KIDS: 200,
  IMPORTACION: 10,
};

/** Subgroup-aggregate thresholds for production decisions (used by functional-evaluation). */
export const PRODUCTION_SUBGROUP_THRESHOLDS: Record<string, number> = {
  CASTILLITOS: 100,
  LATIN_KIDS: 200,
};

// ── Maleta eligibility helpers (pure — no Prisma, no React) ─────────────────

/**
 * TRUE if the reference is commercially available in the canonical system.
 *
 * Answers: "Does this reference have sellable commercial inventory?"
 * This does NOT mean it qualifies as a coverage opportunity for a maleta.
 *
 * Requires:
 *   - In commercial scope
 *   - Status is ACTIVE_AVAILABLE or LOW_ACTIVITY_AVAILABLE
 *   - Compatible commercial stock > 0
 *   - No exclusion reason
 */
export function isCommerciallyAvailableForMaletas(ref: CanonicalMaletaInventoryRef): boolean {
  if (!ref.inCommercialScope) return false;
  if (ref.exclusionReason) return false;
  if (ref.compatibleCommercialStock <= 0) return false;
  return (
    ref.commercialReferenceStatus === "ACTIVE_AVAILABLE" ||
    ref.commercialReferenceStatus === "LOW_ACTIVITY_AVAILABLE"
  );
}

/**
 * Context for coverage eligibility evaluation.
 * Scoped to a SINGLE vendor/bag — never a global universe.
 */
export interface MaletaCoverageContext {
  /** Vendor being evaluated */
  vendorId: string;
  /** Bag being evaluated (optional — defaults to vendor-level) */
  bagId?: string;
  /** References currently present in THIS vendor's bag only */
  currentVendorReferences: ReadonlySet<string>;
  /** Reference being evaluated for replacement (if any) — must not suggest itself */
  riskReference?: string;
}

/**
 * TRUE if the reference qualifies as a NEW coverage opportunity for a specific maleta.
 *
 * Answers: "Can this reference enter as a new sample in THIS vendor's bag
 * and be sold with confidence?"
 *
 * This is STRICTER than isCommerciallyAvailableForMaletas because it requires
 * sufficient stock to sustain field sales, not just any positive quantity.
 *
 * Exclusion is vendor-specific: a ref present in Carlos's bag CAN be a candidate
 * for Orlando's bag if Orlando doesn't have it.
 *
 * Does NOT validate need-matching (grupo/subgrupo/sizeClass compatibility).
 * Use matchesMaletaCoverageNeed() for that.
 *
 * Requires:
 *   - Commercially available (scope + status + stock > 0)
 *   - Stock exceeds the line-specific coverage minimum (strict >)
 *   - Valid classification (grupo + subgrupo)
 *   - Not already in THIS vendor's bag
 *   - Not the same reference being evaluated for risk
 */
export function isEligibleForMaletaCoverage(
  ref: CanonicalMaletaInventoryRef,
  context: MaletaCoverageContext,
): boolean {
  if (!isCommerciallyAvailableForMaletas(ref)) return false;

  // Must not already be in THIS vendor's bag
  if (context.currentVendorReferences.has(ref.reference)) return false;

  // Must not be the same reference at risk
  if (context.riskReference === ref.reference) return false;

  // Must have valid classification
  if (!ref.grupoSag || !ref.subgrupoSag) return false;

  // Must exceed line-specific coverage minimum (strict >)
  const threshold = MALETA_COVERAGE_MINIMUMS[ref.canonicalLine];
  if (threshold === undefined) return false;
  if (ref.compatibleCommercialStock <= threshold) return false;

  return true;
}

// ── Need-matching ──────────────────────────────────────────────────────────

/**
 * A concrete need that a coverage candidate must satisfy.
 * Built from a ref that is in state "reemplazar" or has a removal reason.
 */
export interface MaletaCoverageNeed {
  /** The reference at risk */
  riskReference: string;
  /** Vendor that has this need */
  vendorId: string;
  /** Bag that has this need (optional) */
  bagId?: string;
  /** Domain of the ref at risk */
  businessDomain: ReferenceBusinessDomain;
  /** Canonical line of the ref at risk */
  canonicalLine: CanonicalLine;
  /** Grupo SAG of the ref at risk (null if unknown) */
  grupoSag: string | null;
  /** Subgrupo SAG of the ref at risk (null if unknown) */
  subgrupoSag: string | null;
  /** Size class of the ref at risk (IMPORT only) */
  sizeClass: string | null;
}

/**
 * TRUE if a candidate reference matches a specific coverage need.
 *
 * Rules per domain:
 *   Castillitos:  same canonicalLine + same grupoSag + same subgrupoSag
 *   Latin Kids:   same canonicalLine + same subgrupoSag
 *   Importación:  same canonicalLine + same sizeClass
 */
export function matchesMaletaCoverageNeed(
  candidate: CanonicalMaletaInventoryRef,
  need: MaletaCoverageNeed,
): boolean {
  // Must be same canonical line
  if (candidate.canonicalLine !== need.canonicalLine) return false;

  switch (need.canonicalLine) {
    case "CASTILLITOS":
      // Same grupo + same subgrupo
      if (!need.grupoSag || !need.subgrupoSag) return false;
      return candidate.grupoSag === need.grupoSag && candidate.subgrupoSag === need.subgrupoSag;

    case "LATIN_KIDS":
      // Same subgrupo (grupo not required)
      if (!need.subgrupoSag) return false;
      return candidate.subgrupoSag === need.subgrupoSag;

    case "IMPORTACION":
      // Same sizeClass
      if (!need.sizeClass) return false;
      return candidate.sizeClass === need.sizeClass;

    default:
      return false;
  }
}

/**
 * Result of matching a candidate to a need.
 */
export interface MaletaCoverageMatch {
  candidateReference: string;
  riskReference: string;
  vendorId: string;
  bagId?: string;
  matchReason: string;
  candidateStock: number;
  candidateDomain: ReferenceBusinessDomain;
  candidateLine: CanonicalLine;
}

/**
 * TRUE if the reference can conceptually exist in a maleta.
 *
 * This does NOT check stock levels — only structural eligibility.
 * A reference that passes this check may still need removal if stock is
 * below the operational limit (evaluated separately via resolveMaletaRemovalReason).
 *
 * Requires:
 *   - In commercial scope
 *   - Not DORMANT
 *   - Not ARCHIVE_REVIEW
 *   - Not UNKNOWN
 *   - Not external integration
 */
export function isEligibleForMaletaPresence(ref: CanonicalMaletaInventoryRef): boolean {
  if (!ref.inCommercialScope) return false;
  if (ref.exclusionReason) return false;
  const blocked: CommercialReferenceStatus[] = ["DORMANT", "ARCHIVE_REVIEW", "UNKNOWN"];
  return !blocked.includes(ref.commercialReferenceStatus);
}

// ── Removal reason ──────────────────────────────────────────────────────────

export type MaletaRemovalReason =
  | "EXTERNAL_INTEGRATION"
  | "DOMAIN_MISMATCH"
  | "ARCHIVE_REVIEW"
  | "DORMANT_REFERENCE"
  | "UNKNOWN_ACTIVITY"
  | "NON_COMMERCIAL_STOCK"
  | "OUT_OF_STOCK"
  | "BELOW_OPERATIONAL_LIMIT"
  | null;

/**
 * Resolve why a reference should be removed from a maleta.
 *
 * Precedence (mandatory, never reordered):
 *   1. External integration (Jupiter Pets, etc.)
 *   2. Domain mismatch (UNKNOWN domain)
 *   3. Archive review (>730 days inactive)
 *   4. Dormant (366-730 days inactive)
 *   5. Unknown activity (no dates)
 *   6. Non-commercial stock only (stock exists but not in commercial warehouses)
 *   7. Out of stock (zero compatible commercial stock)
 *   8. Below operational limit (stock > 0 but <= operationalLimit)
 *   9. null (no removal needed)
 *
 * @param operationalLimit - minimum units required (use MALETA_REMOVAL_LIMITS[canonicalLine])
 */
export function resolveMaletaRemovalReason(
  ref: CanonicalMaletaInventoryRef,
  operationalLimit: number,
): MaletaRemovalReason {
  // 1. External integration
  if (ref.exclusionReason === "EXCLUDED_EXTERNAL_INTEGRATION") return "EXTERNAL_INTEGRATION";

  // 2. Domain mismatch
  if (ref.exclusionReason === "EXCLUDED_UNKNOWN_DOMAIN" || ref.businessDomain === "UNKNOWN") return "DOMAIN_MISMATCH";

  // 3. Archive review
  if (ref.commercialReferenceStatus === "ARCHIVE_REVIEW") return "ARCHIVE_REVIEW";

  // 4. Dormant
  if (ref.commercialReferenceStatus === "DORMANT") return "DORMANT_REFERENCE";

  // 5. Unknown activity
  if (ref.commercialReferenceStatus === "UNKNOWN") return "UNKNOWN_ACTIVITY";

  // 6. Non-commercial stock
  if (
    ref.compatibleCommercialStock <= 0 &&
    (ref.productionStock > 0 || ref.stagingStock > 0 || ref.containerStock > 0)
  ) {
    return "NON_COMMERCIAL_STOCK";
  }

  // 7. Out of stock
  if (ref.compatibleCommercialStock <= 0) return "OUT_OF_STOCK";

  // 8. Below operational limit (stock > 0 but not enough)
  if (ref.compatibleCommercialStock <= operationalLimit) return "BELOW_OPERATIONAL_LIMIT";

  // 9. No removal needed
  return null;
}

// ── Structural production eligibility ─────────────────────────────────────────

/**
 * TRUE if the reference is structurally eligible for production consideration.
 *
 * This is a GATE — it does NOT decide that production should be created.
 * The final decision requires the supply waterfall (resolveMaletaSupplyAction).
 *
 * Checks:
 *   - Textile domain (never import)
 *   - In commercial scope, not excluded
 *   - Not DORMANT, ARCHIVE_REVIEW, or UNKNOWN
 *   - Valid grupoSag and subgrupoSag (not null, not sentinel)
 *   - No data quality conflicts
 */
export function isStructurallyEligibleForMaletaProduction(ref: CanonicalMaletaInventoryRef): boolean {
  if (!ref.inCommercialScope) return false;
  if (ref.exclusionReason) return false;

  // Textile only — never generate production for import
  if (ref.businessDomain !== "CASTILLITOS_TEXTILE" && ref.businessDomain !== "LATIN_KIDS_TEXTILE") return false;

  // Not historical/unknown
  const blocked: CommercialReferenceStatus[] = ["DORMANT", "ARCHIVE_REVIEW", "UNKNOWN"];
  if (blocked.includes(ref.commercialReferenceStatus)) return false;

  // Must have valid classification (no sentinel grupo/subgrupo)
  if (!ref.grupoSag || !ref.subgrupoSag) return false;
  const sentinels = ["OTRO", "SIN_CLASIFICAR", "DESCONOCIDO", "N/A", ""];
  if (sentinels.includes(ref.grupoSag.toUpperCase())) return false;
  if (sentinels.includes(ref.subgrupoSag.toUpperCase())) return false;

  // Data quality gate
  if (ref.dataQualityFlags.includes("MISSING_PRODUCT_ENTITY")) return false;

  return true;
}

// ── Supply waterfall ─────────────────────────────────────────────────────────

/**
 * The canonical supply action resolved by the waterfall.
 */
export type MaletaSupplyAction =
  | "COVER_FROM_WAREHOUSE"
  | "COVER_FROM_ACTIVE_OP"
  | "WAIT_FOR_PRODUCTION_IN_PROCESS"
  | "CREATE_NEW_PRODUCTION_NEED"
  | "NO_ACTION_DATA_ISSUE";

/**
 * Input for the supply waterfall.
 */
export interface MaletaSupplyWaterfallInput {
  /** The canonical ref being evaluated */
  ref: CanonicalMaletaInventoryRef;
  /** Are there warehouse candidates (stock > coverage threshold) for this need? */
  hasWarehouseCandidates: boolean;
  /** Are there active OP candidates for the same grupo/subgrupo? */
  hasActiveOpCandidates: boolean;
}

/**
 * Resolve the canonical supply action for a maleta need.
 *
 * Waterfall (mandatory order):
 *   1. Warehouse coverage exists → COVER_FROM_WAREHOUSE
 *   2. Active OP exists → COVER_FROM_ACTIVE_OP
 *   3. Production in process (productionStock > 0) → WAIT_FOR_PRODUCTION_IN_PROCESS
 *   4. Structurally eligible for production → CREATE_NEW_PRODUCTION_NEED
 *   5. Otherwise → NO_ACTION_DATA_ISSUE
 */
export function resolveMaletaSupplyAction(input: MaletaSupplyWaterfallInput): MaletaSupplyAction {
  const { ref, hasWarehouseCandidates, hasActiveOpCandidates } = input;

  // 1. Warehouse coverage
  if (hasWarehouseCandidates) return "COVER_FROM_WAREHOUSE";

  // 2. Active OP
  if (hasActiveOpCandidates) return "COVER_FROM_ACTIVE_OP";

  // 3. Production in process
  if (ref.productionStock > 0) return "WAIT_FOR_PRODUCTION_IN_PROCESS";

  // 4. Structurally eligible → new production need
  if (isStructurallyEligibleForMaletaProduction(ref)) {
    // Must also have zero commercial stock to actually need production
    if (ref.compatibleCommercialStock <= 0) return "CREATE_NEW_PRODUCTION_NEED";
  }

  // 5. Data issue or ineligible
  return "NO_ACTION_DATA_ISSUE";
}
