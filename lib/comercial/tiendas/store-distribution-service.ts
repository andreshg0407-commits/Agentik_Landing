/**
 * lib/comercial/tiendas/store-distribution-service.ts
 *
 * Canonical store distribution service.
 * Builds the read model that answers: what each store has, needs, excess, transfer.
 *
 * Data sources (reads persisted DB — no SOAP):
 *   - warehouse-master.ts → canonical store identity (4 operational stores)
 *   - ProductInventoryLevel (Prisma) → stock per variant per warehouse
 *   - ProductEntity → handlingUnit (sizeClass), productLine (business line)
 *   - store-policy-service → StorePolicyRule[]
 *   - active-inventory → inferProductClass, findApplicableRule
 *   - store-policy-pack-config → thresholds
 *   - store-business-lines → resolveBusinessLineId, BUSINESS_LINE_MAP
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: AGENTIK-STORES-CANONICAL-DISTRIBUTION-01
 */

import "server-only";

import type {
  StoreInventoryVariant,
  MainWarehouseAvailability,
  StoreLocation,
} from "./store-replenishment-types";

import type {
  StoreDistributionItem,
  StoreDistributionAction,
  StoreDistributionDataQuality,
  DistributionRuleSource,
  DistributionWorld,
  ClassificationQuality,
  CommittedUnitsQuality,
  Rule36Evidence,
  EffectiveStoreConfig,
  EffectiveScarcityConfig,
  RuleImpactPreview,
  CanonicalStoreCard,
  CanonicalStoreDistribution,
  CanonicalStoreDetail,
  StoreDetailKpis,
  StoreDistributionKpis,
  StoreDistributionHealthStatus,
  ReplacementCandidate,
  ReplacementResult,
} from "./store-distribution-types";

import type { StorePolicyRule, StoreSizeClass, StoreProductClass } from "./store-policy-types";

import { listStorePolicies } from "./store-policy-service";
import { inferProductClass, findApplicableRule } from "./active-inventory";
import {
  CASTILLITOS_GLOBAL_LOW_STOCK,
  CASTILLITOS_SPECIAL_PRODUCTS,
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_REPLACEMENT_CONFIG,
} from "./store-policy-pack-config";
import type { ReplacementMatchMode as ReplacementMatchModeConfig } from "./store-policy-pack-config";
import { BUSINESS_LINE_MAP, resolveBusinessLineId } from "./store-business-lines";
import { resolveVariantSizeColor } from "./variant-attribute-resolver";
import {
  getStoreWarehousePks,
  getCommercialTextilePks,
  resolveWarehouseByPk,
} from "@/lib/inventory/warehouse-master";
import { prisma } from "@/lib/prisma";

// ── TTL cache (same pattern as store-replenishment-service.ts) ──────────────

interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const TTL_DISTRIBUTION = 2 * 60 * 1000; // 2 min

/**
 * Invalidate all distribution caches for an org.
 * Called after saving config changes via store-distribution-actions.
 */
export function invalidateDistributionCacheForOrg(orgId: string): void {
  cache.delete(`storeDistribution:${orgId}`);
  cache.delete(`distData:${orgId}`);
}

// ── Canonical store identity ────────────────────────────────────────────────
// Maps warehouse-master kaNlBodega to canonical identity.
// Slugs MUST match ACTIVE_STORE_SLUGS and CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds.

interface CanonicalStoreIdentity {
  slug: string;
  name: string;
  city: string;
}

export const CANONICAL_STORE_IDENTITY: Record<string, CanonicalStoreIdentity> = {
  "31": { slug: "centro",     name: "Centro",     city: "Medellin" },
  "11": { slug: "san_diego",  name: "San Diego",  city: "Medellin" },
  "32": { slug: "gran_plaza", name: "Gran Plaza",  city: "Medellin" },
  "39": { slug: "caldas",     name: "Caldas",     city: "Caldas" },
};

// Main warehouse PK from warehouse-master (BODEGA PRINCIPAL, kaNlBodega=10)
const MAIN_WAREHOUSE_PK = "10";

/**
 * Resolve the 4 operational stores for Castillitos.
 * Uses warehouse-master as single source of truth.
 */
function resolveOperationalStoresForTenant(): StoreLocation[] {
  const storePks = getStoreWarehousePks();
  const stores: StoreLocation[] = [];

  for (const pk of storePks) {
    const wh = resolveWarehouseByPk(pk);
    const identity = CANONICAL_STORE_IDENTITY[pk];
    if (!wh || !identity) continue;

    stores.push({
      id:               identity.slug,
      name:             identity.name,
      sagWarehouseCode: pk,
      responsibleName:  "Sin asignar",
      status:           "activa",
      storeType:        "tienda",
      city:             identity.city,
      lastSyncAt:       null, // set after PIL query
    });
  }

  return stores;
}

// ── handlingUnit → sizeClass mapping ────────────────────────────────────────

const HANDLING_UNIT_TO_SIZE_CLASS: Record<string, StoreSizeClass> = {
  PEQUENO: "small",
  MEDIANO: "medium",
  GRANDE:  "large",
};

function resolveCanonicalSizeClass(handlingUnit: string | null | undefined): StoreSizeClass | null {
  if (!handlingUnit) return null;
  return HANDLING_UNIT_TO_SIZE_CLASS[handlingUnit] ?? null;
}

// ── Hero image batch loader ─────────────────────────────────────────────────

async function loadHeroImageMap(orgId: string): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const heroLinks = await db.productAssetLink.findMany({
      where: { organizationId: orgId, role: "hero" },
      select: { productId: true, assetId: true },
    });
    if (heroLinks.length > 0) {
      const assets = await db.generatedAsset.findMany({
        where: { id: { in: heroLinks.map((l: { assetId: string }) => l.assetId) }, assetUrl: { not: null } },
        select: { id: true, assetUrl: true },
      });
      const assetMap = new Map<string, string>();
      for (const a of assets) { if (a.assetUrl) assetMap.set(a.id, a.assetUrl); }
      for (const link of heroLinks) {
        const url = assetMap.get(link.assetId);
        if (url) imageMap.set(link.productId, url);
      }
    }
  } catch {
    // Images are non-critical — degrade gracefully
  }
  return imageMap;
}

// ── Classification helpers ──────────────────────────────────────────────────

function resolveWorld(lineId: string): DistributionWorld {
  const bl = BUSINESS_LINE_MAP[lineId];
  if (!bl) return "TEXTILE";
  return bl.ruleMode === "accessory_import" ? "IMPORT" : "TEXTILE";
}

function resolveClassificationQuality(lineId: string): ClassificationQuality {
  const bl = BUSINESS_LINE_MAP[lineId];
  return bl ? "CONFIRMED" : "INFERRED";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check if a variant is a special product.
 */
function isSpecialProduct(referenceCode: string, productName: string): boolean {
  const upper = (referenceCode + " " + productName).toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns.some(p => {
    const normalizedPattern = p.replace(/_/g, " ");
    return upper.includes(normalizedPattern) || upper.includes(p);
  });
}

interface ScarcityParams {
  enabled:    boolean;
  threshold:  number;
  allowedIds: string[];
  allowedNames: string[];
}

function getScarcityParams(): ScarcityParams {
  return {
    enabled:      true,
    threshold:    CASTILLITOS_GLOBAL_LOW_STOCK.threshold,
    allowedIds:   CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds,
    allowedNames: CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreNames,
  };
}

// ── Main warehouse availability index ───────────────────────────────────────

interface MainStockIndex {
  /** key = `${referenceCode}|${size}|${color}` */
  byVariant: Map<string, number>;
  /** key = referenceCode → total across all variants */
  byReference: Map<string, number>;
  totalUnits: number;
}

function buildMainStockIndex(mainStock: MainWarehouseAvailability[]): MainStockIndex {
  const byVariant = new Map<string, number>();
  const byReference = new Map<string, number>();
  let totalUnits = 0;
  for (const s of mainStock) {
    const available = Math.max(0, s.availableUnits - s.reservedUnits);
    totalUnits += available;
    const key = `${s.referenceCode}|${s.size}|${s.color}`;
    byVariant.set(key, (byVariant.get(key) ?? 0) + available);
    byReference.set(s.referenceCode, (byReference.get(s.referenceCode) ?? 0) + available);
  }
  return { byVariant, byReference, totalUnits };
}

function getMainAvailable(index: MainStockIndex, ref: string, size: string, color: string): number {
  return index.byVariant.get(`${ref}|${size}|${color}`) ?? 0;
}

/**
 * Get total main warehouse stock for a reference (all variants).
 * Used by Rule 36 — NOT total across all stores+main.
 */
function getMainReferenceStock(index: MainStockIndex, referenceCode: string): number {
  return index.byReference.get(referenceCode) ?? 0;
}

// ── Line-aware textile threshold resolution ─────────────────────────────────

function getTextileDefaults(lineId: string) {
  if (lineId === "latin_kids") {
    return LATIN_KIDS_TEXTILE_COVERAGE;
  }
  return CASTILLITOS_TEXTILE_COVERAGE;
}

// ── Resolve thresholds for a variant ────────────────────────────────────────

interface ResolvedThresholds {
  minUnits: number;
  idealUnits: number;
  maxUnits: number;
  resolvedBy: DistributionRuleSource;
  dataQuality: StoreDistributionDataQuality;
}

function resolveThresholds(
  variant: StoreInventoryVariant,
  policyRules: StorePolicyRule[],
  productClassOverride?: StoreProductClass,
): ResolvedThresholds {
  const pc = productClassOverride ?? inferProductClass(variant);
  const rule = findApplicableRule(variant, policyRules);

  if (rule) {
    return {
      minUnits:    rule.minQty,
      idealUnits:  rule.idealQty,
      maxUnits:    rule.maxQty,
      resolvedBy:  rule.scope,
      dataQuality: "CONFIRMED",
    };
  }

  // Default thresholds by product class — line-aware for textile
  if (pc === "textile") {
    const config = getTextileDefaults(variant.line);
    return {
      minUnits:    config.minimumUnits,
      idealUnits:  config.idealUnits,
      maxUnits:    config.maximumUnits,
      resolvedBy:  "textile_default",
      dataQuality: "PARTIAL",
    };
  }

  if (pc === "accessory" || pc === "bulky") {
    return {
      minUnits:    0,
      idealUnits:  0,
      maxUnits:    0,
      resolvedBy:  "default",
      dataQuality: "REQUIRES_CONFIGURATION",
    };
  }

  return {
    minUnits:    0,
    idealUnits:  0,
    maxUnits:    0,
    resolvedBy:  "default",
    dataQuality: "REQUIRES_CONFIGURATION",
  };
}

// ── Resolve action ──────────────────────────────────────────────────────────

function resolveAction(
  currentUnits: number,
  deficit: number,
  excess: number,
  mainAvailable: number,
  thresholds: ResolvedThresholds,
): { action: StoreDistributionAction; reason: string } {
  if (thresholds.resolvedBy === "default" && thresholds.minUnits === 0) {
    return { action: "SIN_REGLA", reason: "Sin regla de surtido configurada para esta referencia" };
  }

  if (excess > 0) {
    return {
      action: "RETIRAR",
      reason: `Exceso de ${excess} unidades sobre el maximo de ${thresholds.maxUnits}`,
    };
  }

  if (deficit > 0) {
    if (mainAvailable >= deficit) {
      return {
        action: "SURTIR",
        reason: `Faltan ${deficit} unidades (tiene ${currentUnits}, min ${thresholds.minUnits}). Bodega principal tiene ${mainAvailable} disponibles`,
      };
    }
    if (mainAvailable > 0) {
      return {
        action: "SURTIR",
        reason: `Faltan ${deficit} unidades pero bodega principal solo tiene ${mainAvailable}. Transferencia parcial posible`,
      };
    }
    return {
      action: "SIN_STOCK_ORIGEN",
      reason: `Faltan ${deficit} unidades (tiene ${currentUnits}, min ${thresholds.minUnits}). Bodega principal sin stock`,
    };
  }

  return { action: "MANTENER", reason: "Stock dentro del rango configurado" };
}

// ── Build canonical classification fields ────────────────────────────────────

interface CanonicalFields {
  world:                 DistributionWorld;
  canonicalLine:         string;
  group:                 string;
  subgroup:              string;
  sizeClass:             StoreSizeClass | null;
  classificationSource:  string;
  classificationQuality: ClassificationQuality;
}

function buildCanonicalFields(
  variant: StoreInventoryVariant,
  sizeClass: StoreSizeClass | null,
  grupoSag: string | null,
): CanonicalFields {
  const world = resolveWorld(variant.line);
  const quality = resolveClassificationQuality(variant.line);

  return {
    world,
    canonicalLine:         variant.line,
    group:                 grupoSag || "SIN_GRUPO_SAG",
    subgroup:              variant.category || "SIN_SUBGRUPO_SAG",
    sizeClass,
    classificationSource:  "BUSINESS_LINE_MAP",
    classificationQuality: quality,
  };
}

// ── Substitution index for O(1)/O(k) lookups (DECIMOSEXTO) ──────────────

interface SubstitutionIndex {
  /** key = `${canonicalLine}|${group}|${subgroup}` → Set<referenceCode> */
  byGroupAndSubgroup: Map<string, Set<string>>;
  /** key = `${canonicalLine}|${subgroup}` → Set<referenceCode> */
  bySubgroup: Map<string, Set<string>>;
  /** key = referenceCode → { canonicalLine, group, subgroup, productName, imageUrl } */
  refMeta: Map<string, { canonicalLine: string; group: string; subgroup: string; productName: string; imageUrl: string | null }>;
}

function buildSubstitutionIndex(
  allInventory: StoreInventoryVariant[],
  mainStockIndex: MainStockIndex,
  grupoByRef: Map<string, string | null>,
  heroImageMap: Map<string, string>,
  refToProductId: Map<string, string>,
): SubstitutionIndex {
  const byGroupAndSubgroup = new Map<string, Set<string>>();
  const bySubgroup = new Map<string, Set<string>>();
  const refMeta = new Map<string, { canonicalLine: string; group: string; subgroup: string; productName: string; imageUrl: string | null }>();

  // Include all refs known in main warehouse too (they may not appear in store inventory)
  const allRefs = new Set<string>();
  for (const v of allInventory) allRefs.add(v.referenceCode);
  for (const ref of mainStockIndex.byReference.keys()) allRefs.add(ref);

  for (const v of allInventory) {
    const line = v.line;
    const group = grupoByRef.get(v.referenceCode) || "SIN_GRUPO_SAG";
    const subgroup = v.category || "SIN_SUBGRUPO_SAG";

    if (!refMeta.has(v.referenceCode)) {
      const pid = refToProductId.get(v.referenceCode) ?? "";
      refMeta.set(v.referenceCode, {
        canonicalLine: line,
        group,
        subgroup,
        productName: v.productName,
        imageUrl: heroImageMap.get(pid) ?? null,
      });
    }

    const gsKey = `${line}|${group}|${subgroup}`;
    if (!byGroupAndSubgroup.has(gsKey)) byGroupAndSubgroup.set(gsKey, new Set());
    byGroupAndSubgroup.get(gsKey)!.add(v.referenceCode);

    const sKey = `${line}|${subgroup}`;
    if (!bySubgroup.has(sKey)) bySubgroup.set(sKey, new Set());
    bySubgroup.get(sKey)!.add(v.referenceCode);
  }

  return { byGroupAndSubgroup, bySubgroup, refMeta };
}

// ── Rule 36 check for substitution candidates (SEXTO) ───────────────────

function isRule36Blocked(
  referenceCode: string,
  mainStockIndex: MainStockIndex,
  storeSlug: string,
  scarcity: ScarcityParams,
): boolean {
  if (!scarcity.enabled) return false;
  if (scarcity.allowedIds.includes(storeSlug)) return false;
  const mainRefStock = getMainReferenceStock(mainStockIndex, referenceCode);
  return mainRefStock <= scarcity.threshold;
}

// ── Substitution engine (TERCERO-SEXTO) ─────────────────────────────────

function findReplacementCandidates(
  referenceCode: string,
  storeSlug: string,
  canonicalLine: string,
  group: string,
  subgroup: string,
  shortageQty: number,
  maxCandidates: number,
  matchMode: ReplacementMatchModeConfig,
  subIndex: SubstitutionIndex,
  mainStockIndex: MainStockIndex,
  storeStockByRef: Map<string, number>,
  scarcity: ScarcityParams,
  maxUnitsPerRef: number,
  assignedRefs: Set<string>,
): ReplacementCandidate[] {
  // Find compatible references from index
  let candidateRefs: Set<string>;
  if (matchMode === "SAME_GROUP_AND_SUBGROUP") {
    candidateRefs = subIndex.byGroupAndSubgroup.get(`${canonicalLine}|${group}|${subgroup}`) ?? new Set();
  } else {
    candidateRefs = subIndex.bySubgroup.get(`${canonicalLine}|${subgroup}`) ?? new Set();
  }

  const scored: Array<{
    ref: string;
    mainStock: number;
    storeStock: number;
    meta: { canonicalLine: string; group: string; subgroup: string; productName: string; imageUrl: string | null };
  }> = [];

  for (const ref of candidateRefs) {
    if (ref === referenceCode) continue;
    if (assignedRefs.has(ref)) continue;

    const meta = subIndex.refMeta.get(ref);
    if (!meta) continue;
    // Line isolation (DÉCIMO)
    if (meta.canonicalLine !== canonicalLine) continue;

    const mainStock = mainStockIndex.byReference.get(ref) ?? 0;
    if (mainStock <= 0) continue;

    // Rule 36 blocks candidates (SEXTO)
    if (isRule36Blocked(ref, mainStockIndex, storeSlug, scarcity)) continue;

    const storeStock = storeStockByRef.get(ref) ?? 0;
    if (storeStock >= maxUnitsPerRef) continue;

    scored.push({ ref, mainStock, storeStock, meta });
  }

  // Priority: (1) refs store doesn't have, (2) highest main stock, (3) lowest store stock
  scored.sort((a, b) => {
    const aNew = a.storeStock === 0 ? 0 : 1;
    const bNew = b.storeStock === 0 ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    if (b.mainStock !== a.mainStock) return b.mainStock - a.mainStock;
    return a.storeStock - b.storeStock;
  });

  const candidates: ReplacementCandidate[] = [];
  let remainingShortage = shortageQty;

  for (const s of scored) {
    if (candidates.length >= maxCandidates) break;
    if (remainingShortage <= 0) break;

    // OCTAVO: suggestedQty = min(remainingShortage, mainStock, maxUnits - storeStock)
    const candidateMaxTransfer = Math.max(0, maxUnitsPerRef - s.storeStock);
    const suggestedQty = Math.min(remainingShortage, s.mainStock, candidateMaxTransfer, maxUnitsPerRef);
    if (suggestedQty <= 0) continue;

    remainingShortage -= suggestedQty;
    assignedRefs.add(s.ref);

    const matchEvidence = matchMode === "SAME_GROUP_AND_SUBGROUP"
      ? `Mismo grupo (${s.meta.group}) y subgrupo (${s.meta.subgroup})`
      : `Mismo subgrupo (${s.meta.subgroup})`;

    candidates.push({
      referenceCode:             s.ref,
      description:               s.meta.productName,
      imageUrl:                  s.meta.imageUrl,
      canonicalLine:             s.meta.canonicalLine,
      group:                     s.meta.group,
      subgroup:                  s.meta.subgroup,
      storeStock:                s.storeStock,
      mainWarehouseAvailableQty: s.mainStock,
      suggestedQty,
      reason:                    `Reemplazo sugerido: ${suggestedQty} uds de ${s.ref} para cubrir faltante de ${referenceCode}`,
      evidence:                  matchEvidence,
      quality:                   "CONFIRMED",
      classificationSource:      "BUSINESS_LINE_MAP",
      groupSource:               "ProductEntity.grupoSag",
      subgroupSource:            "ProductEntity.subgrupoSag",
      dataQuality:               s.meta.group === "SIN_GRUPO_SAG" || s.meta.subgroup === "SIN_SUBGRUPO_SAG" ? "INFERRED" : "CONFIRMED",
    });
  }

  return candidates;
}

// ── Build distribution items for a single store ─────────────────────────────

function buildStoreItems(
  storeSlug: string,
  inventory: StoreInventoryVariant[],
  policyRules: StorePolicyRule[],
  mainStockIndex: MainStockIndex,
  sizeClassByRef: Map<string, StoreSizeClass | null>,
  grupoByRef: Map<string, string | null>,
  scarcity: ScarcityParams = getScarcityParams(),
  heroImageMap?: Map<string, string>,
  refToProductId?: Map<string, string>,
  subIndex?: SubstitutionIndex,
): StoreDistributionItem[] {
  const items: StoreDistributionItem[] = [];

  // Track Rule 36 per reference
  const rule36Cache = new Map<string, boolean>();
  // Track refs assigned as replacement targets in this store
  const assignedReplacementRefs = new Set<string>();

  // ── PRIMERO: Consolidate per-reference stock for textile evaluation ────
  const refStockInStore = new Map<string, number>();
  for (const v of inventory) {
    refStockInStore.set(v.referenceCode, (refStockInStore.get(v.referenceCode) ?? 0) + v.currentUnits);
  }

  for (const v of inventory) {
    if (v.currentUnits === 0) {
      const hasRule = findApplicableRule(v, policyRules) !== null;
      if (!hasRule) continue;
    }

    const rawPc = inferProductClass(v);
    const sizeClass = sizeClassByRef.get(v.referenceCode) ?? null;
    const grupo = grupoByRef.get(v.referenceCode) ?? null;
    const canonical = buildCanonicalFields(v, sizeClass, grupo);
    const pc: StoreProductClass = canonical.world === "IMPORT" ? "accessory" : rawPc;
    const thresholds = resolveThresholds(v, policyRules, pc);

    const variantFields = {
      referenceCode:          v.referenceCode,
      productName:            v.productName,
      size:                   v.size,
      color:                  v.color,
      line:                   v.line,
      productClass:           pc,
      world:                  canonical.world,
      canonicalLine:          canonical.canonicalLine,
      group:                  canonical.group,
      subgroup:               canonical.subgroup,
      sizeClass:              canonical.sizeClass,
      classificationSource:   canonical.classificationSource,
      classificationQuality:  canonical.classificationQuality,
      committedUnitsQuality:  "NOT_AVAILABLE" as CommittedUnitsQuality,
      imageUrl:               (heroImageMap && refToProductId ? heroImageMap.get(refToProductId.get(v.referenceCode) ?? "") : null) ?? null,
    };

    // ── Special product override ────────────────────────────────────────
    if (isSpecialProduct(v.referenceCode, v.productName)) {
      const specialIdeal = CASTILLITOS_SPECIAL_PRODUCTS.idealByStore[storeSlug]
        ?? CASTILLITOS_SPECIAL_PRODUCTS.defaultIdeal;

      if (specialIdeal > 0) {
        items.push({
          ...variantFields,
          currentUnits:           v.currentUnits,
          minUnits:               specialIdeal,
          idealUnits:             specialIdeal,
          maxUnits:               specialIdeal + 1,
          resolvedBy:             "special_product",
          deficit:                Math.max(0, specialIdeal - v.currentUnits),
          excess:                 Math.max(0, v.currentUnits - (specialIdeal + 1)),
          mainWarehouseAvailable: getMainAvailable(mainStockIndex, v.referenceCode, v.size, v.color),
          transferableUnits:      0,
          action:                 "REQUIERE_CONFIGURACION",
          actionReason:           "Producto especial identificado por texto. Requiere configuracion explicita (subgrupoSag o lista de referencias) antes de generar surtido automatico",
          dataQuality:            "REQUIRES_CONFIGURATION",
          replacement:            null,
        });
        continue;
      } else {
        if (v.currentUnits > 0) {
          items.push({
            ...variantFields,
            currentUnits:           v.currentUnits,
            minUnits:               0,
            idealUnits:             0,
            maxUnits:               0,
            resolvedBy:             "special_product",
            deficit:                0,
            excess:                 v.currentUnits,
            mainWarehouseAvailable: 0,
            transferableUnits:      0,
            action:                 "RETIRAR",
            actionReason:           "Producto especial (identificado por texto) no asignado a esta tienda",
            dataQuality:            "PARTIAL",
            replacement:            null,
          });
          continue;
        }
        continue;
      }
    }

    // ── Rule 36: Global low stock — TEXTILE only ────────────────────────
    if (canonical.world === "TEXTILE" && scarcity.enabled && !scarcity.allowedIds.includes(storeSlug)) {
      let isLowGlobal = rule36Cache.get(v.referenceCode);
      if (isLowGlobal === undefined) {
        const mainRefStock = getMainReferenceStock(mainStockIndex, v.referenceCode);
        isLowGlobal = mainRefStock <= scarcity.threshold;
        rule36Cache.set(v.referenceCode, isLowGlobal);
      }

      if (isLowGlobal && v.currentUnits > 0) {
        const mainRefStock = getMainReferenceStock(mainStockIndex, v.referenceCode);
        const evidence: Rule36Evidence = {
          stockPrincipal:    mainRefStock,
          umbral:            scarcity.threshold,
          tiendasPermitidas: scarcity.allowedNames,
          tiendaEvaluada:    storeSlug,
          reglaAplicada:     true,
          accionResultante:  "RETIRAR",
        };

        items.push({
          ...variantFields,
          currentUnits:           v.currentUnits,
          minUnits:               0,
          idealUnits:             0,
          maxUnits:               0,
          resolvedBy:             "global_low_stock",
          deficit:                0,
          excess:                 v.currentUnits,
          mainWarehouseAvailable: 0,
          transferableUnits:      0,
          action:                 "RETIRAR",
          actionReason:           `Stock bodega principal ${evidence.stockPrincipal} <= ${evidence.umbral} unidades. Concentrar en ${evidence.tiendasPermitidas.join(" y ")}. Tienda ${evidence.tiendaEvaluada} no es prioritaria`,
          dataQuality:            "CONFIRMED",
          replacement:            null,
        });
        continue;
      }
    }

    // ── PRIMERO: Reference-level evaluation for textile ──────────────────
    // Textile rule: min 8, max 12 evaluated per REFERENCE (consolidated).
    const effectiveRefStock = refStockInStore.get(v.referenceCode) ?? v.currentUnits;
    let refDeficit: number;
    let refExcess: number;

    if (canonical.world === "TEXTILE" && thresholds.resolvedBy !== "default") {
      refDeficit = Math.max(0, thresholds.minUnits - effectiveRefStock);
      refExcess = Math.max(0, effectiveRefStock - thresholds.maxUnits);
    } else {
      refDeficit = Math.max(0, thresholds.minUnits - v.currentUnits);
      refExcess = Math.max(0, v.currentUnits - thresholds.maxUnits);
    }

    const mainAvailable = getMainAvailable(mainStockIndex, v.referenceCode, v.size, v.color);
    const mainRefAvailable = getMainReferenceStock(mainStockIndex, v.referenceCode);

    // ── SEGUNDO: Same-reference replenishment ───────────────────────────
    // shortageQty = target(12) - effectiveStoreStock (textile, per reference)
    const shortageQty = canonical.world === "TEXTILE" && thresholds.resolvedBy !== "default"
      ? Math.max(0, thresholds.maxUnits - effectiveRefStock)
      : Math.max(0, thresholds.minUnits - v.currentUnits);

    const transferableUnits = Math.min(shortageQty > 0 ? shortageQty : refDeficit, mainAvailable);

    let { action, reason } = resolveAction(
      canonical.world === "TEXTILE" ? effectiveRefStock : v.currentUnits,
      refDeficit,
      refExcess,
      mainRefAvailable,
      thresholds,
    );

    // ── TERCERO-SEXTO: Substitution when no same-ref stock ──────────────
    let replacement: ReplacementResult | null = null;

    if (action === "SIN_STOCK_ORIGEN" && canonical.world === "TEXTILE" && subIndex) {
      const lineConfig = canonical.canonicalLine === "latin_kids"
        ? CASTILLITOS_REPLACEMENT_CONFIG.latinKids
        : CASTILLITOS_REPLACEMENT_CONFIG.castillitos;

      if (lineConfig.allowReplacementWhenNoStock) {
        const candidates = findReplacementCandidates(
          v.referenceCode, storeSlug, canonical.canonicalLine,
          canonical.group, canonical.subgroup,
          shortageQty > 0 ? shortageQty : refDeficit,
          lineConfig.maxCandidates, lineConfig.replacementMatchMode,
          subIndex, mainStockIndex, refStockInStore, scarcity,
          thresholds.maxUnits, assignedReplacementRefs,
        );

        if (candidates.length > 0) {
          const coveredQty = candidates.reduce((sum, c) => sum + c.suggestedQty, 0);
          replacement = {
            replacementRequired:           true,
            replacementReason:             `Sin stock de ${v.referenceCode} en bodega principal. Sustituto${candidates.length > 1 ? "s" : ""} del mismo ${lineConfig.replacementMatchMode === "SAME_GROUP_AND_SUBGROUP" ? "grupo y subgrupo" : "subgrupo"}`,
            replacementShortageQty:        shortageQty > 0 ? shortageQty : refDeficit,
            replacementCandidates:         candidates,
            selectedReplacementCandidate:  candidates[0],
            replacementConfidence:         candidates[0].dataQuality === "CONFIRMED" ? 0.85 : 0.6,
            replacementRuleSource:         lineConfig.replacementMatchMode,
            replacementCoveredQty:         coveredQty,
          };
          action = "SUGERIR_REEMPLAZO";
          reason = `Sin stock de referencia original. ${candidates.length} sustituto${candidates.length > 1 ? "s" : ""} encontrado${candidates.length > 1 ? "s" : ""} (${coveredQty} uds)`;
        } else {
          // SEXTO — Check if candidates were blocked by scarcity (Rule 36)
          const matchKey = lineConfig.replacementMatchMode === "SAME_GROUP_AND_SUBGROUP"
            ? `${canonical.canonicalLine}|${canonical.group}|${canonical.subgroup}`
            : `${canonical.canonicalLine}|${canonical.subgroup}`;
          const candidatePool = lineConfig.replacementMatchMode === "SAME_GROUP_AND_SUBGROUP"
            ? subIndex.byGroupAndSubgroup.get(matchKey)
            : subIndex.bySubgroup.get(matchKey);
          if (candidatePool && candidatePool.size > 1) {
            // There were potential candidates in the pool — they were blocked
            let blockedByScarcity = 0;
            for (const ref of candidatePool) {
              if (ref === v.referenceCode) continue;
              const mainStock = mainStockIndex.byReference.get(ref) ?? 0;
              if (mainStock > 0 && isRule36Blocked(ref, mainStockIndex, storeSlug, scarcity)) {
                blockedByScarcity++;
              }
            }
            if (blockedByScarcity > 0) {
              reason = `Faltan ${refDeficit > 0 ? refDeficit : shortageQty} unidades. Bodega principal sin stock. Se encontraron ${blockedByScarcity} referencia${blockedByScarcity > 1 ? "s" : ""} compatible${blockedByScarcity > 1 ? "s" : ""} pero con stock <= ${scarcity.threshold} uds, reservado para ${scarcity.allowedNames.join(" y ")} por regla de escasez`;
            }
          }
        }
      }
    }

    items.push({
      ...variantFields,
      currentUnits:           v.currentUnits,
      minUnits:               thresholds.minUnits,
      idealUnits:             thresholds.idealUnits,
      maxUnits:               thresholds.maxUnits,
      resolvedBy:             thresholds.resolvedBy,
      deficit:                refDeficit,
      excess:                 refExcess,
      mainWarehouseAvailable: mainAvailable,
      transferableUnits,
      action,
      actionReason:           reason,
      dataQuality:            thresholds.dataQuality,
      replacement,
    });
  }

  return items;
}

// ── Compute detail KPIs ─────────────────────────────────────────────────────

function computeDetailKpis(items: StoreDistributionItem[]): StoreDetailKpis {
  let totalRefs = 0;
  let totalUnits = 0;
  let criticalNeeds = 0;
  let excessItems = 0;
  let withRules = 0;
  let withoutRules = 0;

  const seenRefs = new Set<string>();

  for (const item of items) {
    if (!seenRefs.has(item.referenceCode)) {
      seenRefs.add(item.referenceCode);
      totalRefs++;
    }
    totalUnits += item.currentUnits;

    if (item.action === "SURTIR" || item.action === "SIN_STOCK_ORIGEN" || item.action === "SUGERIR_REEMPLAZO") criticalNeeds++;
    if (item.action === "RETIRAR") excessItems++;

    if (item.resolvedBy !== "default" && item.resolvedBy !== "textile_default") {
      withRules++;
    } else {
      withoutRules++;
    }
  }

  const expected = items.filter(i => i.minUnits > 0).length;
  const atOrAboveMin = items.filter(i => i.minUnits > 0 && i.currentUnits >= i.minUnits).length;
  const coveragePercent = expected > 0 ? Math.round((atOrAboveMin / expected) * 100) : -1;

  return { totalReferences: totalRefs, totalUnits, criticalNeeds, excessItems, coveragePercent, withRules, withoutRules };
}

// ── Derive health status ────────────────────────────────────────────────────

function deriveHealthStatus(kpis: StoreDetailKpis, hasPolicyRules: boolean): StoreDistributionHealthStatus {
  if (!hasPolicyRules && kpis.withRules === 0) return "sin_reglas";
  if (kpis.criticalNeeds >= 10) return "critica";
  if (kpis.criticalNeeds > 0 || kpis.excessItems > 0) return "requiere_surtido";
  return "ok";
}

// ── Build card from items ───────────────────────────────────────────────────

function buildCard(
  store: StoreLocation,
  items: StoreDistributionItem[],
  hasPolicyRules: boolean,
): CanonicalStoreCard {
  const kpis = computeDetailKpis(items);
  return {
    store,
    totalReferences:  kpis.totalReferences,
    totalUnits:       kpis.totalUnits,
    criticalNeeds:    kpis.criticalNeeds,
    excessItems:      kpis.excessItems,
    coveragePercent:  kpis.coveragePercent,
    actionRequired:   kpis.criticalNeeds > 0 || kpis.excessItems > 0,
    healthStatus:     deriveHealthStatus(kpis, hasPolicyRules),
  };
}

// ── PIL-direct data loader ──────────────────────────────────────────────────

interface DistributionData {
  stores:           StoreLocation[];
  storeInventory:   StoreInventoryVariant[];
  mainStock:        MainWarehouseAvailability[];
  sizeClassByRef:   Map<string, StoreSizeClass | null>;
  grupoByRef:       Map<string, string | null>;
  refToProductId:   Map<string, string>;
  refToProductName: Map<string, string>;
  lastSyncAt:       string | null;
}

const TTL_DATA = 3 * 60 * 1000; // 3 min — shared between build + detail

/**
 * Load all distribution data from persisted PIL records.
 * Single batch query — no SOAP, no SagCurrentProvider.
 * Cached for 3 min so detail calls after build are near-instant.
 */
async function loadDistributionData(orgId: string): Promise<DistributionData> {
  const dataCacheKey = `distData:${orgId}`;
  const cachedData = getCached<DistributionData>(dataCacheKey);
  if (cachedData) return cachedData;

  const stores = resolveOperationalStoresForTenant();
  const storePks = stores.map(s => s.sagWarehouseCode);
  const allPks = [...storePks, MAIN_WAREHOUSE_PK];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  // Single PIL query for all relevant warehouses.
  // Uses select (not include) for variant — skips expensive variantAttributes join.
  // resolveVariantSizeColor prefers variant.attributes (JSON, 100% coverage for textiles).
  const levels: Array<{
    warehouseId: string;
    quantity: number;
    reservedQty: number;
    externalRef: string | null;
    updatedAt: Date | null;
    product?: {
      id: string;
      name: string;
      sku: string | null;
      grupoSag: string | null;
      subgrupoSag: string | null;
      productLine: string | null;
      handlingUnit: string | null;
    } | null;
    variant?: {
      sku: string | null;
      name: string | null;
      attributes: unknown;
    } | null;
  }> = await db.productInventoryLevel.findMany({
    where: { organizationId: orgId, warehouseId: { in: allPks } },
    include: {
      product: { select: { id: true, name: true, sku: true, grupoSag: true, subgrupoSag: true, productLine: true, handlingUnit: true } },
      variant: { select: { sku: true, name: true, attributes: true } },
    },
  });

  const now = new Date().toISOString();
  const storeIdByPk = new Map(stores.map(s => [s.sagWarehouseCode, s.id]));

  const storeInventory: StoreInventoryVariant[] = [];
  const mainStock: MainWarehouseAvailability[] = [];
  const sizeClassByRef = new Map<string, StoreSizeClass | null>();
  const grupoByRef = new Map<string, string | null>();
  const refToProductId = new Map<string, string>();
  const refToProductName = new Map<string, string>();
  let lastSyncAt: string | null = null;

  for (const lv of levels) {
    const resolved = resolveVariantSizeColor(lv.variant);
    const ref = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
    if (!ref) continue;
    const refUpper = ref.toUpperCase();
    const name = lv.product?.name ?? refUpper;

    // Build sizeClass map from handlingUnit
    if (lv.product?.handlingUnit && !sizeClassByRef.has(refUpper)) {
      sizeClassByRef.set(refUpper, resolveCanonicalSizeClass(lv.product.handlingUnit));
    }

    // Build grupoSag map
    if (!grupoByRef.has(refUpper)) {
      grupoByRef.set(refUpper, lv.product?.grupoSag ?? null);
    }

    // Build ref→productId map
    if (lv.product?.id && !refToProductId.has(refUpper)) {
      refToProductId.set(refUpper, lv.product.id);
    }

    // Build ref→productName map
    if (!refToProductName.has(refUpper)) {
      refToProductName.set(refUpper, name);
    }

    // Track lastSyncAt
    if (lv.updatedAt) {
      const ts = lv.updatedAt.toISOString();
      if (!lastSyncAt || ts > lastSyncAt) lastSyncAt = ts;
    }

    if (lv.warehouseId === MAIN_WAREHOUSE_PK) {
      // Main warehouse stock
      mainStock.push({
        warehouseCode: MAIN_WAREHOUSE_PK,
        referenceCode: refUpper,
        size:          resolved.size,
        color:         resolved.color,
        availableUnits: lv.quantity,
        reservedUnits:  lv.reservedQty,
        updatedAt:      lv.updatedAt?.toISOString() ?? now,
      });
    } else {
      // Store inventory
      const storeId = storeIdByPk.get(lv.warehouseId);
      if (!storeId) continue; // should not happen since we only queried operational PKs

      storeInventory.push({
        storeId,
        warehouseCode: lv.warehouseId,
        referenceCode: refUpper,
        productName:   name,
        category:      lv.product?.subgrupoSag || "SIN_SUBGRUPO_SAG",
        line:          resolveBusinessLineId(lv.product?.productLine),
        size:          resolved.size,
        color:         resolved.color,
        currentUnits:  Math.max(0, lv.quantity - lv.reservedQty),
        minUnits:      0,
        idealUnits:    0,
        updatedAt:     lv.updatedAt?.toISOString() ?? now,
      });
    }
  }

  // Update store lastSyncAt
  for (const store of stores) {
    store.lastSyncAt = lastSyncAt;
  }

  const result = { stores, storeInventory, mainStock, sizeClassByRef, grupoByRef, refToProductId, refToProductName, lastSyncAt };
  setCache(dataCacheKey, result, TTL_DATA);
  return result;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the full canonical store distribution read model.
 * Single batch load — no per-store queries, no SOAP.
 */
export async function buildCanonicalStoreDistribution(orgId: string): Promise<CanonicalStoreDistribution> {
  const cacheKey = `storeDistribution:${orgId}`;
  const cached = getCached<CanonicalStoreDistribution>(cacheKey);
  if (cached) return cached;

  console.time("[DISTRIBUTION] buildCanonicalStoreDistribution");

  const [data, rawPolicies, heroImageMap] = await Promise.all([
    loadDistributionData(orgId),
    listStorePolicies(orgId),
    loadHeroImageMap(orgId),
  ]);

  const policyRules = rawPolicies.flatMap(p => p.rules);
  const mainStockIndex = buildMainStockIndex(data.mainStock);

  // Build substitution index once for all stores (DECIMOSEXTO)
  const subIndex = buildSubstitutionIndex(
    data.storeInventory, mainStockIndex, data.grupoByRef,
    heroImageMap, data.refToProductId,
  );

  let totalCritical = 0;
  let totalExcess = 0;
  let totalSurtir = 0;
  const cards: CanonicalStoreCard[] = [];

  for (const store of data.stores) {
    const storeSlug = store.id;
    const hasPolicyRules = policyRules.some(r => r.active && r.storeId === store.id);
    const storeInv = data.storeInventory.filter(v => v.storeId === store.id);

    const items = buildStoreItems(
      storeSlug, storeInv, policyRules, mainStockIndex,
      data.sizeClassByRef, data.grupoByRef, getScarcityParams(),
      heroImageMap, data.refToProductId, subIndex,
    );
    const card = buildCard(store, items, hasPolicyRules);

    totalCritical += card.healthStatus === "critica" ? 1 : 0;
    totalExcess += card.excessItems;
    totalSurtir += items.filter(i => i.action === "SURTIR").length;

    cards.push(card);
  }

  // Sort: critica first, then requiere_surtido, then ok, then sin_reglas
  const STATUS_ORDER: Record<string, number> = { critica: 0, requiere_surtido: 1, ok: 2, sin_reglas: 3 };
  cards.sort((a, b) => (STATUS_ORDER[a.healthStatus] ?? 9) - (STATUS_ORDER[b.healthStatus] ?? 9));

  const kpis: StoreDistributionKpis = {
    tiendasActivas:       cards.length,
    tiendasCriticas:      totalCritical,
    referenciasPorSurtir: totalSurtir,
    referenciasConExceso: totalExcess,
    propuestasPendientes: 0,
  };

  const result: CanonicalStoreDistribution = {
    stores:             cards,
    kpis,
    mainWarehouseStock: mainStockIndex.totalUnits,
    lastSyncAt:         data.lastSyncAt,
    computedAt:         new Date().toISOString(),
  };

  setCache(cacheKey, result, TTL_DISTRIBUTION);
  console.timeEnd("[DISTRIBUTION] buildCanonicalStoreDistribution");
  return result;
}

/**
 * Get canonical distribution detail for a single store.
 */
export async function getCanonicalStoreDetail(orgId: string, storeId: string): Promise<CanonicalStoreDetail | null> {
  console.time("[DISTRIBUTION] getCanonicalStoreDetail");

  const [data, rawPolicies, heroImageMap] = await Promise.all([
    loadDistributionData(orgId),
    listStorePolicies(orgId),
    loadHeroImageMap(orgId),
  ]);

  const policyRules = rawPolicies.flatMap(p => p.rules);
  const mainStockIndex = buildMainStockIndex(data.mainStock);

  const store = data.stores.find(s => s.id === storeId);
  if (!store) {
    console.timeEnd("[DISTRIBUTION] getCanonicalStoreDetail");
    return null;
  }

  const storeSlug = store.id;
  const storeInv = data.storeInventory.filter(v => v.storeId === store.id);

  const subIndex = buildSubstitutionIndex(
    data.storeInventory, mainStockIndex, data.grupoByRef,
    heroImageMap, data.refToProductId,
  );

  const items = buildStoreItems(
    storeSlug, storeInv, policyRules, mainStockIndex,
    data.sizeClassByRef, data.grupoByRef, getScarcityParams(),
    heroImageMap, data.refToProductId, subIndex,
  );
  const kpis = computeDetailKpis(items);

  console.timeEnd("[DISTRIBUTION] getCanonicalStoreDetail");
  return { store, items, kpis };
}
