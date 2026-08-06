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
  ReplacementVariant,
  StoreVariantSnapshot,
  VariantAllocationSuggestion,
  NeedResolution,
  NeedResolutionType,
  CoverageStatus,
} from "./store-distribution-types";

import { buildVariantAllocation, buildReplacementBalancingInput } from "./store-variant-balancing";

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
import { resolveScarcityFromPolicies, resolveSpecialProductsFromPolicies } from "./store-distribution-actions";
import type { ResolvedSpecialRule } from "./store-unit-coverage-engine";
import type { ReplacementMatchMode as ReplacementMatchModeConfig } from "./store-policy-pack-config";
import { BUSINESS_LINE_MAP, resolveBusinessLineId } from "./store-business-lines";
import { resolveVariantSizeColor } from "./variant-attribute-resolver";
import { normalizeCanonicalGroup, normalizeCanonicalSubgroup } from "./classification-normalization";
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

// Inflight dedup: prevents concurrent calls from running the same heavy query twice
const inflight = new Map<string, Promise<unknown>>();

/**
 * Invalidate all distribution caches for an org.
 * Called after saving config changes via store-distribution-actions.
 */
export function invalidateDistributionCacheForOrg(orgId: string): void {
  cache.delete(`storeDistribution:${orgId}`);
  cache.delete(`distData:${orgId}`);
  // Also clear per-store detail caches
  for (const key of cache.keys()) {
    if (key.startsWith(`storeDetail:${orgId}:`)) cache.delete(key);
  }
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

// Main warehouse PKs from warehouse-master — split by world
// TEXTILE: BODEGA PRINCIPAL (kaNlBodega=10, ssCodigo=01)
// IMPORT:  IMPORTACIÓN      (kaNlBodega=33, ssCodigo=24)
const MAIN_WAREHOUSE_PK_TEXTILE = "10";
const MAIN_WAREHOUSE_PK_IMPORT  = "33";
const ALL_MAIN_WAREHOUSE_PKS = new Set([MAIN_WAREHOUSE_PK_TEXTILE, MAIN_WAREHOUSE_PK_IMPORT]);

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

// ── Entry date resolution (AGENTIK-STORES-DISCOUNTS-TAB-01) ─────────────────
// Source: ProductEntity.createdAtSag (dd_fch_primer_vez from SAG ARTICULOS).
// Sentinel value 1900-01-01 is treated as null (SAG default for missing dates).
// This is a product-level date, not store-level — best available proxy.

const SAG_SENTINEL_DATE = new Date("1900-01-02T00:00:00Z").getTime();

function resolveEntryDate(createdAtSag: Date | null | undefined): string | null {
  if (!createdAtSag) return null;
  if (createdAtSag.getTime() < SAG_SENTINEL_DATE) return null;
  return createdAtSag.toISOString();
}

// ── Hero image batch loader ─────────────────────────────────────────────────

export async function loadHeroImageMap(orgId: string): Promise<Map<string, string>> {
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
 * Find the first matching special rule for a variant.
 * Returns the resolved rule (with effective idealUnits) or null.
 * When no resolved rules are passed, falls back to pack defaults.
 */
function findMatchingSpecialRule(
  referenceCode: string,
  productName: string,
  resolvedRules?: readonly ResolvedSpecialRule[],
): ResolvedSpecialRule | null {
  const rules = resolvedRules ?? CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns.map(p => ({
    pattern: p,
    idealUnits: CASTILLITOS_SPECIAL_PRODUCTS.defaultIdeal,
  }));
  const upper = (referenceCode + " " + productName).toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const rule of rules) {
    const p = rule.pattern.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizedPattern = p.replace(/_/g, " ");
    if (upper.includes(normalizedPattern) || upper.includes(p)) {
      return rule;
    }
  }
  return null;
}

export interface ScarcityParams {
  enabled:    boolean;
  threshold:  number;
  allowedIds: string[];
  allowedNames: string[];
}

/**
 * Default scarcity params from tenant constant.
 * Used ONLY as fallback when no persisted override exists.
 * Operational consumers should use resolveScarcityFromPolicies() instead.
 */
export function getDefaultScarcityParams(): ScarcityParams {
  return {
    enabled:      true,
    threshold:    CASTILLITOS_GLOBAL_LOW_STOCK.threshold,
    allowedIds:   CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds,
    allowedNames: CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreNames,
  };
}

/** @deprecated Use resolveScarcityFromPolicies() with pre-loaded policies. */
export const getScarcityParams = getDefaultScarcityParams;

// ── Main warehouse availability index ───────────────────────────────────────

/** Per-variant stock record for replacement candidate detail */
export interface MainVariantRecord {
  size:  string;
  color: string;
  qty:   number;
}

export interface MainStockIndex {
  /** key = `${referenceCode}|${size}|${color}` */
  byVariant: Map<string, number>;
  /** key = referenceCode → total across all variants */
  byReference: Map<string, number>;
  /** key = referenceCode → per-variant records with qty > 0 */
  byReferenceVariants: Map<string, MainVariantRecord[]>;
  totalUnits: number;
}

export function buildMainStockIndex(mainStock: MainWarehouseAvailability[]): MainStockIndex {
  const byVariant = new Map<string, number>();
  const byReference = new Map<string, number>();
  const byReferenceVariants = new Map<string, MainVariantRecord[]>();
  let totalUnits = 0;
  for (const s of mainStock) {
    const available = Math.max(0, s.availableUnits - s.reservedUnits);
    totalUnits += available;
    const key = `${s.referenceCode}|${s.size}|${s.color}`;
    byVariant.set(key, (byVariant.get(key) ?? 0) + available);
    byReference.set(s.referenceCode, (byReference.get(s.referenceCode) ?? 0) + available);
    if (available > 0) {
      if (!byReferenceVariants.has(s.referenceCode)) byReferenceVariants.set(s.referenceCode, []);
      byReferenceVariants.get(s.referenceCode)!.push({ size: s.size, color: s.color, qty: available });
    }
  }
  return { byVariant, byReference, byReferenceVariants, totalUnits };
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

// ── Commercial size sorting (REPLACEMENT-VARIANTS-01) ────────────────────────

/** Size ordering: baby ranges → infantile numerics → generic → unknown */
const BABY_SIZE_ORDER: Record<string, number> = {
  "0-3": 1, "3-6": 2, "6-9": 3, "9-12": 4, "12-18": 5, "18-24": 6,
};
const GENERIC_SIZE_ORDER: Record<string, number> = {
  "GEN": 900, "SIN_TALLA": 999,
};

function commercialSizeRank(size: string | null): number {
  if (!size) return 1000;
  const upper = size.toUpperCase();
  if (BABY_SIZE_ORDER[size]) return BABY_SIZE_ORDER[size];
  if (GENERIC_SIZE_ORDER[upper]) return GENERIC_SIZE_ORDER[upper];
  // Numeric infantile sizes: 2, 3, 4, ..., 16
  const num = parseInt(size, 10);
  if (!isNaN(num) && num >= 1 && num <= 20) return 100 + num;
  // Accessory sizes
  if (upper === "SMALL" || upper === "PEQUEÑO") return 200;
  if (upper === "MEDIUM" || upper === "MEDIANO") return 201;
  if (upper === "LARGE" || upper === "GRANDE") return 202;
  // Alpha: XS, S, M, L, XL
  const alpha: Record<string, number> = { XS: 300, S: 301, M: 302, L: 303, XL: 304, XXL: 305 };
  if (alpha[upper]) return alpha[upper];
  return 800; // unknown
}

function sortVariantsByCommercialOrder(variants: ReplacementVariant[]): ReplacementVariant[] {
  return variants.slice().sort((a, b) => {
    const sizeA = commercialSizeRank(a.size);
    const sizeB = commercialSizeRank(b.size);
    if (sizeA !== sizeB) return sizeA - sizeB;
    const colorA = (a.color ?? "").toLowerCase();
    const colorB = (b.color ?? "").toLowerCase();
    if (colorA !== colorB) return colorA < colorB ? -1 : 1;
    return b.mainWarehouseQty - a.mainWarehouseQty; // higher qty first as tiebreaker
  });
}

/** Build sorted ReplacementVariant[] from MainStockIndex for a given reference */
export function buildCandidateVariants(
  ref: string,
  mainStockIndex: MainStockIndex,
): { variants: ReplacementVariant[]; totalUnits: number } {
  const records = mainStockIndex.byReferenceVariants.get(ref);
  if (!records || records.length === 0) return { variants: [], totalUnits: 0 };

  // Consolidate duplicates by size+color
  const consolidated = new Map<string, { size: string; color: string; qty: number }>();
  for (const r of records) {
    const key = `${r.size}|${r.color}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.qty += r.qty;
    } else {
      consolidated.set(key, { size: r.size, color: r.color, qty: r.qty });
    }
  }

  let totalUnits = 0;
  const variants: ReplacementVariant[] = [];
  for (const [, c] of consolidated) {
    if (c.qty <= 0) continue;
    totalUnits += c.qty;
    variants.push({
      variantKey: `${ref}|${c.size}|${c.color}`,
      size: c.size === "SIN_TALLA" ? null : c.size,
      color: c.color === "SIN_COLOR" ? null : c.color,
      mainWarehouseQty: c.qty,
      availableQty: c.qty, // PIL operational = qty - reserved, already computed in buildMainStockIndex
      stockQuality: "OPERATIONAL_CONFIRMED",
    });
  }

  return { variants: sortVariantsByCommercialOrder(variants), totalUnits };
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
      minUnits:    rule.minQty ?? 0,
      idealUnits:  rule.idealQty ?? 0,
      maxUnits:    rule.maxQty ?? rule.idealQty ?? 0,
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
    group:                 normalizeCanonicalGroup(grupoSag),
    subgroup:              normalizeCanonicalSubgroup(variant.category),
    sizeClass,
    classificationSource:  "BUSINESS_LINE_MAP",
    classificationQuality: quality,
  };
}

// ── Substitution index for O(1)/O(k) lookups (DECIMOSEXTO) ──────────────

export interface SubstitutionIndex {
  /** key = `${canonicalLine}|${group}|${subgroup}` → Set<referenceCode> */
  byGroupAndSubgroup: Map<string, Set<string>>;
  /** key = `${canonicalLine}|${subgroup}` → Set<referenceCode> */
  bySubgroup: Map<string, Set<string>>;
  /** key = `${sizeClass}` → Set<referenceCode> (accessories only, CASCADE-FIX-01) */
  byLineSizeClass: Map<string, Set<string>>;
  /** key = referenceCode → { canonicalLine, group, subgroup, productName, imageUrl, sizeClass } */
  refMeta: Map<string, { canonicalLine: string; group: string; subgroup: string; productName: string; imageUrl: string | null; sizeClass: string | null }>;
}

export function buildSubstitutionIndex(
  allInventory: StoreInventoryVariant[],
  mainStockIndex: MainStockIndex,
  grupoByRef: Map<string, string | null>,
  heroImageMap: Map<string, string>,
  refToProductId: Map<string, string>,
  sizeClassByRef: Map<string, StoreSizeClass | null>,
): SubstitutionIndex {
  const byGroupAndSubgroup = new Map<string, Set<string>>();
  const bySubgroup = new Map<string, Set<string>>();
  const byLineSizeClass = new Map<string, Set<string>>();
  const refMeta = new Map<string, { canonicalLine: string; group: string; subgroup: string; productName: string; imageUrl: string | null; sizeClass: string | null }>();

  // Include all refs known in main warehouse too (they may not appear in store inventory)
  const allRefs = new Set<string>();
  for (const v of allInventory) allRefs.add(v.referenceCode);
  for (const ref of mainStockIndex.byReference.keys()) allRefs.add(ref);

  for (const v of allInventory) {
    const line = v.line;
    const group = normalizeCanonicalGroup(grupoByRef.get(v.referenceCode));
    const subgroup = normalizeCanonicalSubgroup(v.category);
    const sc = sizeClassByRef.get(v.referenceCode) ?? null;

    if (!refMeta.has(v.referenceCode)) {
      const pid = refToProductId.get(v.referenceCode) ?? "";
      refMeta.set(v.referenceCode, {
        canonicalLine: line,
        group,
        subgroup,
        productName: v.productName,
        imageUrl: heroImageMap.get(pid) ?? null,
        sizeClass: sc,
      });
    }

    const gsKey = `${line}|${group}|${subgroup}`;
    if (!byGroupAndSubgroup.has(gsKey)) byGroupAndSubgroup.set(gsKey, new Set());
    byGroupAndSubgroup.get(gsKey)!.add(v.referenceCode);

    const sKey = `${line}|${subgroup}`;
    if (!bySubgroup.has(sKey)) bySubgroup.set(sKey, new Set());
    bySubgroup.get(sKey)!.add(v.referenceCode);

    // Accessories: index by sizeClass (CASCADE-FIX-01)
    if (sc) {
      const scKey = sc;
      if (!byLineSizeClass.has(scKey)) byLineSizeClass.set(scKey, new Set());
      byLineSizeClass.get(scKey)!.add(v.referenceCode);
    }
  }

  return { byGroupAndSubgroup, bySubgroup, byLineSizeClass, refMeta };
}

// ── Rule 36 check for same-reference surtido/reposición ─────────────────
// Allowed stores (centro/caldas) can surtir/reponer their own scarce refs.
// Non-allowed stores (san_diego/gran_plaza) cannot.

function isRule36BlockedForSameRef(
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

// ── Rule 36 check for replacement candidates (QUINTO) ───────────────────
// For replacements (different reference), Rule 36 is STRICT for ALL stores:
// candidate.mainWarehouseQty must be > threshold (not <=).
// Centro/caldas do NOT get a pass when using a scarce ref as replacement
// for a different reference's shortage.

function isRule36BlockedForReplacement(
  referenceCode: string,
  mainStockIndex: MainStockIndex,
  scarcity: ScarcityParams,
): boolean {
  if (!scarcity.enabled) return false;
  const mainRefStock = getMainReferenceStock(mainStockIndex, referenceCode);
  return mainRefStock <= scarcity.threshold;
}

// ── Substitution engine (TERCERO-SEXTO) ─────────────────────────────────

interface ReplacementSearchResult {
  candidates: ReplacementCandidate[];
  totalFound: number;
  rule36BlockedCount: number;
}

function findReplacementCandidates(
  referenceCode: string,
  storeSlug: string,
  canonicalLine: string,
  group: string,
  subgroup: string,
  sizeClass: string | null,
  shortageQty: number,
  maxCandidates: number,
  matchMode: ReplacementMatchModeConfig,
  subIndex: SubstitutionIndex,
  mainStockIndex: MainStockIndex,
  storeStockByRef: Map<string, number>,
  scarcity: ScarcityParams,
  maxUnitsPerRef: number,
  assignedRefs: Set<string>,
): ReplacementSearchResult {
  // Find compatible references from index
  let candidateRefs: Set<string>;
  if (matchMode === "SAME_SIZE_CLASS") {
    candidateRefs = sizeClass ? (subIndex.byLineSizeClass.get(sizeClass) ?? new Set()) : new Set();
  } else if (matchMode === "SAME_GROUP_AND_SUBGROUP") {
    candidateRefs = subIndex.byGroupAndSubgroup.get(`${canonicalLine}|${group}|${subgroup}`) ?? new Set();
  } else {
    candidateRefs = subIndex.bySubgroup.get(`${canonicalLine}|${subgroup}`) ?? new Set();
  }

  const scored: Array<{
    ref: string;
    mainStock: number;
    storeStock: number;
    meta: { canonicalLine: string; group: string; subgroup: string; productName: string; imageUrl: string | null; sizeClass: string | null };
  }> = [];

  let rule36BlockedCount = 0;

  for (const ref of candidateRefs) {
    if (ref === referenceCode) continue;
    if (assignedRefs.has(ref)) continue;

    const meta = subIndex.refMeta.get(ref);
    if (!meta) continue;
    // Line isolation (DÉCIMO) — for SAME_SIZE_CLASS, sizeClass already isolates
    if (matchMode !== "SAME_SIZE_CLASS" && meta.canonicalLine !== canonicalLine) continue;

    const mainStock = mainStockIndex.byReference.get(ref) ?? 0;
    if (mainStock <= 0) continue;

    // Rule 36 blocks replacement candidates — STRICT for ALL stores (QUINTO)
    if (isRule36BlockedForReplacement(ref, mainStockIndex, scarcity)) {
      rule36BlockedCount++;
      continue;
    }

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
      : matchMode === "SAME_SIZE_CLASS"
        ? `Mismo tamano (${s.meta.sizeClass ?? "sin clasificar"})`
        : `Mismo subgrupo (${s.meta.subgroup})`;

    // Build variant-level detail for this candidate
    const variantResult = buildCandidateVariants(s.ref, mainStockIndex);
    const now = new Date().toISOString().slice(0, 10);

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
      // Variant-level detail (REPLACEMENT-VARIANTS-01)
      replacementVariants:       variantResult.variants,
      totalVariantCount:         variantResult.variants.length,
      displayedVariantCount:     Math.min(variantResult.variants.length, 8),
      totalVariantUnits:         variantResult.totalUnits,
      variantEvidenceDate:       now,
    });
  }

  return { candidates, totalFound: scored.length, rule36BlockedCount };
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
  specialRules?: readonly ResolvedSpecialRule[],
): StoreDistributionItem[] {
  const items: StoreDistributionItem[] = [];

  // Track Rule 36 per reference
  const rule36Cache = new Map<string, boolean>();
  // Track refs assigned as replacement targets in this store
  const assignedReplacementRefs = new Set<string>();

  // ── PRIMERO: Consolidate per-reference stock for textile evaluation ────
  const refStockInStore = new Map<string, number>();
  // Build per-reference store variant snapshots for balancing
  const storeVariantsByRef = new Map<string, StoreVariantSnapshot[]>();
  for (const v of inventory) {
    refStockInStore.set(v.referenceCode, (refStockInStore.get(v.referenceCode) ?? 0) + v.currentUnits);
    // Build variant snapshot
    const svKey = `${v.referenceCode}|${v.size}|${v.color}`;
    if (!storeVariantsByRef.has(v.referenceCode)) storeVariantsByRef.set(v.referenceCode, []);
    const existing = storeVariantsByRef.get(v.referenceCode)!.find(s => s.variantKey === svKey);
    if (existing) {
      existing.storeQty += Math.max(0, v.currentUnits);
    } else {
      storeVariantsByRef.get(v.referenceCode)!.push({
        variantKey: svKey,
        size: v.size,
        color: v.color,
        storeQty: Math.max(0, v.currentUnits),
      });
    }
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
      entryDate:              v.entryDate ?? null,
    };

    // ── Special product override ────────────────────────────────────────
    const matchedSpecial = findMatchingSpecialRule(v.referenceCode, v.productName, specialRules);
    if (matchedSpecial) {
      const specialIdeal = matchedSpecial.idealUnits;

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
          needResolution:         null,
          variantAllocation:      null,
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
            needResolution:         null,
            variantAllocation:      null,
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
          needResolution:         null,
          variantAllocation:      null,
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
    // shortageQty = gap to IDEAL (not max). Max is only a guard/cap.
    // needDetected when storeQty < minUnits; shortageQty = ideal - storeQty.
    // maximumReceivableQty = max - storeQty (cap, not target).
    const shortageQty = canonical.world === "TEXTILE" && thresholds.resolvedBy !== "default"
      ? Math.max(0, thresholds.idealUnits - effectiveRefStock)
      : Math.max(0, thresholds.idealUnits - v.currentUnits);

    const maximumReceivableQty = canonical.world === "TEXTILE" && thresholds.resolvedBy !== "default"
      ? Math.max(0, thresholds.maxUnits - effectiveRefStock)
      : Math.max(0, thresholds.maxUnits - v.currentUnits);

    const transferableUnits = Math.min(
      shortageQty > 0 ? shortageQty : refDeficit,
      mainAvailable,
      maximumReceivableQty,
    );

    let { action, reason } = resolveAction(
      canonical.world === "TEXTILE" ? effectiveRefStock : v.currentUnits,
      refDeficit,
      refExcess,
      mainRefAvailable,
      thresholds,
    );

    // ── CASCADE-FIX-01: Cascade replacement resolution ─────────────────
    let replacement: ReplacementResult | null = null;
    const isTextile = canonical.world === "TEXTILE";
    const totalShortage = shortageQty > 0 ? shortageQty : refDeficit;
    const sameRefCoverage = action === "SURTIR" ? Math.min(totalShortage, mainRefAvailable) : 0;

    // Determine line config for replacement search
    const lineConfig = canonical.world === "IMPORT"
      ? CASTILLITOS_REPLACEMENT_CONFIG.accessories
      : canonical.canonicalLine === "latin_kids"
        ? CASTILLITOS_REPLACEMENT_CONFIG.latinKids
        : CASTILLITOS_REPLACEMENT_CONFIG.castillitos;

    // CASCADE: Search replacements when (a) no same-ref stock, or (b) partial same-ref stock
    const isNoStock = action === "SIN_STOCK_ORIGEN";
    const isPartialSurtir = action === "SURTIR" && mainRefAvailable > 0 && mainRefAvailable < totalShortage;

    const shouldSearchReplacements = subIndex && (
      (isNoStock && lineConfig.allowReplacementWhenNoStock) ||
      (isPartialSurtir && lineConfig.allowReplacementWhenPartial)
    );

    if (shouldSearchReplacements) {
      // For partial, search only for the remaining gap after same-ref transfer
      const replacementShortage = isPartialSurtir
        ? totalShortage - sameRefCoverage
        : totalShortage;

      const searchResult = findReplacementCandidates(
        v.referenceCode, storeSlug, canonical.canonicalLine,
        canonical.group, canonical.subgroup, canonical.sizeClass,
        replacementShortage,
        lineConfig.maxCandidates, lineConfig.replacementMatchMode,
        subIndex, mainStockIndex, refStockInStore, scarcity,
        thresholds.maxUnits, assignedReplacementRefs,
      );
      const { candidates, totalFound, rule36BlockedCount } = searchResult;

      const matchLabel = lineConfig.replacementMatchMode === "SAME_GROUP_AND_SUBGROUP"
        ? "grupo y subgrupo"
        : lineConfig.replacementMatchMode === "SAME_SIZE_CLASS"
          ? "tamano"
          : "subgrupo";

      if (candidates.length > 0) {
        const coveredQty = candidates.reduce((sum, c) => sum + c.suggestedQty, 0);
        replacement = {
          replacementRequired:           true,
          replacementReason:             isPartialSurtir
            ? `Stock parcial de ${v.referenceCode} (${sameRefCoverage} uds). ${candidates.length} sustituto${candidates.length > 1 ? "s" : ""} del mismo ${matchLabel} para cubrir las ${replacementShortage} uds restantes`
            : `Sin stock de ${v.referenceCode} en bodega principal. Sustituto${candidates.length > 1 ? "s" : ""} del mismo ${matchLabel}`,
          replacementShortageQty:        replacementShortage,
          replacementCandidates:         candidates,
          selectedReplacementCandidate:  candidates[0],
          replacementConfidence:         candidates[0].dataQuality === "CONFIRMED" ? 0.85 : 0.6,
          replacementRuleSource:         lineConfig.replacementMatchMode,
          replacementCoveredQty:         coveredQty,
          totalCandidatesFound:          totalFound,
          hasMoreCandidates:             totalFound > candidates.length,
          rule36BlockedCount,
        };

        if (isNoStock) {
          action = "SUGERIR_REEMPLAZO";
          reason = `Sin stock de referencia original. ${candidates.length} sustituto${candidates.length > 1 ? "s" : ""} encontrado${candidates.length > 1 ? "s" : ""} (${coveredQty} uds)`;
        } else {
          // Partial: action stays SURTIR, but replacement is attached
          reason = `Faltan ${totalShortage} unidades. Bodega tiene ${sameRefCoverage} (transferencia parcial). ${candidates.length} sustituto${candidates.length > 1 ? "s" : ""} para ${replacementShortage} uds restantes`;
        }
      } else {
        if (rule36BlockedCount > 0) {
          reason = `Faltan ${totalShortage} unidades. ${isNoStock ? "Bodega principal sin stock" : `Solo ${sameRefCoverage} disponibles`}. ${rule36BlockedCount} referencia${rule36BlockedCount > 1 ? "s" : ""} compatible${rule36BlockedCount > 1 ? "s" : ""} excluida${rule36BlockedCount > 1 ? "s" : ""} por regla de concentracion de inventario`;
        } else {
          const matchKey = lineConfig.replacementMatchMode === "SAME_GROUP_AND_SUBGROUP"
            ? `${canonical.canonicalLine}|${canonical.group}|${canonical.subgroup}`
            : lineConfig.replacementMatchMode === "SAME_SIZE_CLASS"
              ? canonical.sizeClass ?? ""
              : `${canonical.canonicalLine}|${canonical.subgroup}`;
          const candidatePool = lineConfig.replacementMatchMode === "SAME_GROUP_AND_SUBGROUP"
            ? subIndex.byGroupAndSubgroup.get(matchKey)
            : lineConfig.replacementMatchMode === "SAME_SIZE_CLASS"
              ? subIndex.byLineSizeClass.get(matchKey)
              : subIndex.bySubgroup.get(matchKey);
          if (!candidatePool || candidatePool.size <= 1) {
            reason = `Faltan ${totalShortage} unidades. ${isNoStock ? "Sin stock en bodega principal" : `Solo ${sameRefCoverage} disponibles`}. No se encontraron referencias compatibles del mismo ${matchLabel}`;
          }
        }
      }
    }

    // ── CASCADE-FIX-01: Build NeedResolution ────────────────────────────
    let needResolution: NeedResolution | null = null;

    if (totalShortage > 0 && (action === "SURTIR" || action === "SIN_STOCK_ORIGEN" || action === "SUGERIR_REEMPLAZO")) {
      const replacementCoverageQty = replacement?.replacementCoveredQty ?? 0;
      const totalCoveredQty = sameRefCoverage + replacementCoverageQty;
      const remainingShortageQty = Math.max(0, totalShortage - totalCoveredQty);

      let resolutionType: NeedResolutionType;
      if (sameRefCoverage >= totalShortage) {
        resolutionType = "DIRECT_REPLENISHMENT";
      } else if (sameRefCoverage > 0 && replacementCoverageQty > 0) {
        resolutionType = "PARTIAL_DIRECT_PLUS_REPLACEMENT";
      } else if (sameRefCoverage > 0 && replacementCoverageQty === 0) {
        // Partial same-ref coverage but no replacements found for the gap.
        // Still DIRECT_REPLENISHMENT — coverageStatus/coveragePercent communicate the gap.
        resolutionType = "DIRECT_REPLENISHMENT";
      } else if (sameRefCoverage === 0 && replacementCoverageQty > 0) {
        resolutionType = "REPLACEMENT";
      } else {
        resolutionType = "NO_ALTERNATIVE";
      }

      const coverageStatus: CoverageStatus = totalCoveredQty >= totalShortage
        ? "FULLY_COVERED"
        : totalCoveredQty > 0
          ? "PARTIALLY_COVERED"
          : "NO_COVERAGE";

      needResolution = {
        resolutionType,
        coverageStatus,
        totalShortageQty: totalShortage,
        sameRefCoverageQty: sameRefCoverage,
        replacementCoverageQty,
        totalCoveredQty,
        remainingShortageQty,
        coveragePercent: totalShortage > 0 ? Math.round((totalCoveredQty / totalShortage) * 100) : 0,
      };
    }

    // ── VARIANT-BALANCING-01: Build balanced variant allocation ──────────
    let variantAllocation: VariantAllocationSuggestion | null = null;

    if (action === "SURTIR" && shortageQty > 0 && isTextile) {
      // Same-reference replenishment: balance warehouse variants across the shortage
      const whVariants = buildCandidateVariants(v.referenceCode, mainStockIndex);
      variantAllocation = buildVariantAllocation({
        requestedQty: shortageQty,
        maxUnitsPerRef: thresholds.maxUnits,
        currentStoreTotal: effectiveRefStock,
        storeVariants: storeVariantsByRef.get(v.referenceCode) ?? [],
        warehouseVariants: whVariants.variants.map(wv => ({
          size: wv.size ?? "SIN_TALLA",
          color: wv.color ?? "SIN_COLOR",
          qty: wv.mainWarehouseQty,
        })),
        isTextile: true,
      });
    } else if (action === "SUGERIR_REEMPLAZO" && replacement) {
      // Replacement: balance the best candidate's variants
      const best = replacement.selectedReplacementCandidate ?? replacement.replacementCandidates[0];
      if (best) {
        variantAllocation = buildVariantAllocation(
          buildReplacementBalancingInput(
            best.suggestedQty,
            thresholds.maxUnits,
            best.storeStock,
            best.replacementVariants,
            storeVariantsByRef.get(best.referenceCode) ?? [],
            isTextile,
          ),
        );
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
      needResolution,
      variantAllocation,
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
  const shortageUnits = items.reduce((sum, i) => sum + i.deficit, 0);
  return {
    store,
    totalReferences:  kpis.totalReferences,
    totalUnits:       kpis.totalUnits,
    criticalNeeds:    kpis.criticalNeeds,
    shortageUnits,
    excessItems:      kpis.excessItems,
    coveragePercent:  kpis.coveragePercent,
    actionRequired:   kpis.criticalNeeds > 0 || kpis.excessItems > 0,
    healthStatus:     deriveHealthStatus(kpis, hasPolicyRules),
  };
}

// ── PIL-direct data loader ──────────────────────────────────────────────────

export interface DistributionData {
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
export async function loadDistributionData(orgId: string): Promise<DistributionData> {
  const dataCacheKey = `distData:${orgId}`;
  const cachedData = getCached<DistributionData>(dataCacheKey);
  if (cachedData) return cachedData;

  // Dedup: if another call is already loading this org's data, wait for it
  const inflightKey = `distData:${orgId}`;
  const existing = inflight.get(inflightKey);
  if (existing) return existing as Promise<DistributionData>;

  const promise = loadDistributionDataImpl(orgId, dataCacheKey);
  inflight.set(inflightKey, promise);
  promise.finally(() => inflight.delete(inflightKey));
  return promise;
}

async function loadDistributionDataImpl(orgId: string, dataCacheKey: string): Promise<DistributionData> {

  const stores = resolveOperationalStoresForTenant();
  const storePks = stores.map(s => s.sagWarehouseCode);
  const allPks = [...storePks, ...ALL_MAIN_WAREHOUSE_PKS];

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
    createdAt: Date | null;
    product?: {
      id: string;
      name: string;
      sku: string | null;
      grupoSag: string | null;
      subgrupoSag: string | null;
      productLine: string | null;
      handlingUnit: string | null;
      createdAtSag: Date | null;
    } | null;
    variant?: {
      sku: string | null;
      name: string | null;
      attributes: unknown;
    } | null;
  }> = await db.productInventoryLevel.findMany({
    where: { organizationId: orgId, warehouseId: { in: allPks } },
    include: {
      product: { select: { id: true, name: true, sku: true, grupoSag: true, subgrupoSag: true, productLine: true, handlingUnit: true, createdAtSag: true } },
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
    // canonicalReferenceKey = product.sku (reference base, e.g. "L-1288")
    // NOT variant.sku (e.g. "L-1288|14|KA1") — size/color are in resolved.*
    const ref = lv.product?.sku ?? lv.externalRef ?? "";
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

    if (ALL_MAIN_WAREHOUSE_PKS.has(lv.warehouseId)) {
      // Main warehouse stock (textile=10, import=33)
      mainStock.push({
        warehouseCode: lv.warehouseId,
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
        entryDate:     resolveEntryDate(lv.product?.createdAtSag),
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
  const scarcity = resolveScarcityFromPolicies(rawPolicies);

  // Build substitution index once for all stores (DECIMOSEXTO + CASCADE-FIX-01)
  const subIndex = buildSubstitutionIndex(
    data.storeInventory, mainStockIndex, data.grupoByRef,
    heroImageMap, data.refToProductId, data.sizeClassByRef,
  );

  let totalCritical = 0;
  let totalExcess = 0;
  let totalSurtir = 0;
  const cards: CanonicalStoreCard[] = [];

  for (const store of data.stores) {
    const storeSlug = store.id;
    const hasPolicyRules = policyRules.some(r => r.active && r.storeId === store.id);
    const storeInv = data.storeInventory.filter(v => v.storeId === store.id);

    const effectiveSpecial = resolveSpecialProductsFromPolicies(storeSlug, rawPolicies);
    const storeSpecialRules: ResolvedSpecialRule[] = effectiveSpecial.entries.map(e => ({
      pattern: e.pattern, idealUnits: e.idealUnits,
    }));

    const items = buildStoreItems(
      storeSlug, storeInv, policyRules, mainStockIndex,
      data.sizeClassByRef, data.grupoByRef, scarcity,
      heroImageMap, data.refToProductId, subIndex,
      storeSpecialRules,
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
  // Per-store detail cache (2 min, same TTL as distribution)
  const detailCacheKey = `storeDetail:${orgId}:${storeId}`;
  const cachedDetail = getCached<CanonicalStoreDetail>(detailCacheKey);
  if (cachedDetail) return cachedDetail;

  // Inflight dedup: share a single in-flight computation per store
  const existingFlight = inflight.get(detailCacheKey);
  if (existingFlight) return existingFlight as Promise<CanonicalStoreDetail | null>;

  const promise = getCanonicalStoreDetailImpl(orgId, storeId, detailCacheKey);
  inflight.set(detailCacheKey, promise);
  promise.finally(() => inflight.delete(detailCacheKey));
  return promise;
}

async function getCanonicalStoreDetailImpl(orgId: string, storeId: string, detailCacheKey: string): Promise<CanonicalStoreDetail | null> {
  console.time("[DISTRIBUTION] getCanonicalStoreDetail");

  const [data, rawPolicies, heroImageMap] = await Promise.all([
    loadDistributionData(orgId),
    listStorePolicies(orgId),
    loadHeroImageMap(orgId),
  ]);

  const policyRules = rawPolicies.flatMap(p => p.rules);
  const mainStockIndex = buildMainStockIndex(data.mainStock);
  const scarcity = resolveScarcityFromPolicies(rawPolicies);

  const store = data.stores.find(s => s.id === storeId);
  if (!store) {
    console.timeEnd("[DISTRIBUTION] getCanonicalStoreDetail");
    return null;
  }

  const storeSlug = store.id;
  const storeInv = data.storeInventory.filter(v => v.storeId === store.id);

  const subIndex = buildSubstitutionIndex(
    data.storeInventory, mainStockIndex, data.grupoByRef,
    heroImageMap, data.refToProductId, data.sizeClassByRef,
  );

  const effectiveSpecial = resolveSpecialProductsFromPolicies(storeSlug, rawPolicies);
  const storeSpecialRules: ResolvedSpecialRule[] = effectiveSpecial.entries.map(e => ({
    pattern: e.pattern, idealUnits: e.idealUnits,
  }));

  const items = buildStoreItems(
    storeSlug, storeInv, policyRules, mainStockIndex,
    data.sizeClassByRef, data.grupoByRef, scarcity,
    heroImageMap, data.refToProductId, subIndex,
    storeSpecialRules,
  );
  const kpis = computeDetailKpis(items);

  console.timeEnd("[DISTRIBUTION] getCanonicalStoreDetail");
  const result = { store, items, kpis };
  setCache(detailCacheKey, result, TTL_DISTRIBUTION);
  return result;
}
