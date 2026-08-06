/**
 * lib/comercial/tiendas/store-distribution-types.ts
 *
 * Read model types for the canonical store distribution layer.
 * Answers: what each store has, what it needs, what's excess, what to transfer.
 *
 * Pure types — no runtime logic, no Prisma, no imports beyond sibling types.
 *
 * Sprint: AGENTIK-STORES-CANONICAL-DISTRIBUTION-01
 */

import type { StoreLocation } from "./store-replenishment-types";
import type { StoreProductClass, StorePolicyScope, StoreSizeClass } from "./store-policy-types";

// ── World / line classification ─────────────────────────────────────────────

export type DistributionWorld = "TEXTILE" | "IMPORT";

export type ClassificationQuality = "CONFIRMED" | "INFERRED" | "UNAVAILABLE";

export type CommittedUnitsQuality =
  | "CONFIRMED_ZERO"         // Verified: no pending transfers or reservations
  | "NOT_AVAILABLE"          // System does not track committedUnits
  | "NOT_ATTRIBUTABLE";      // Data exists but cannot be attributed per warehouse/reference

// ── Action types ────────────────────────────────────────────────────────────

export type StoreDistributionAction =
  | "SURTIR"                  // deficit > 0, main warehouse has stock
  | "RETIRAR"                 // excess > 0, or Rule 36 excludes this store
  | "MANTENER"                // within range
  | "MONITOREAR"              // near min but not critical
  | "SIN_STOCK_ORIGEN"        // deficit > 0, main warehouse empty, no substitute found
  | "SUGERIR_REEMPLAZO"       // deficit > 0, no same-ref stock, substitute candidate found
  | "SIN_REGLA"               // no applicable rule
  | "SIN_DATOS"               // no PIL data
  | "REQUIERE_CONFIGURACION"; // ambiguous or incomplete rule

// ── Data quality ────────────────────────────────────────────────────────────

export type StoreDistributionDataQuality =
  | "CONFIRMED"               // PIL data + rule resolved
  | "PARTIAL"                 // PIL data but no rule (using defaults)
  | "UNAVAILABLE"             // no PIL for this variant
  | "REQUIRES_CONFIGURATION"; // rule exists but incomplete

// ── Rule source (extends StorePolicyScope with distribution-specific) ──────

export type DistributionRuleSource =
  | StorePolicyScope
  | "default"
  | "global_low_stock"
  | "special_product"
  | "textile_default";

// ── Replacement candidate (SUGERIR_REEMPLAZO) ──────────────────────────────

export type ReplacementMatchMode = "SAME_GROUP_AND_SUBGROUP" | "SAME_SUBGROUP" | "SAME_SIZE_CLASS";

export type ReplacementStockQuality = "OPERATIONAL_CONFIRMED" | "PHYSICAL_ONLY" | "UNKNOWN";

export interface ReplacementVariant {
  variantKey:        string;                  // "REF|SIZE|COLOR"
  size:              string | null;
  color:             string | null;
  mainWarehouseQty:  number;
  availableQty:      number | null;           // null when not tracked separately
  stockQuality:      ReplacementStockQuality;
}

export interface ReplacementCandidate {
  referenceCode:              string;
  description:                string;
  imageUrl:                   string | null;
  canonicalLine:              string;
  group:                      string;
  subgroup:                   string;
  storeStock:                 number;   // current units of this candidate in the target store
  mainWarehouseAvailableQty:  number;   // available in main warehouse
  suggestedQty:               number;   // recommended transfer quantity
  reason:                     string;   // textual explanation
  evidence:                   string;   // matching evidence trail
  quality:                    StoreDistributionDataQuality;
  classificationSource:       string;
  groupSource:                string;   // e.g. "ProductEntity.grupoSag"
  subgroupSource:             string;   // e.g. "ProductEntity.subgrupoSag"
  dataQuality:                ClassificationQuality;
  // Variant-level detail (REPLACEMENT-VARIANTS-01)
  replacementVariants:        ReplacementVariant[];
  totalVariantCount:          number;
  displayedVariantCount:      number;
  totalVariantUnits:          number;
  variantEvidenceDate:        string;   // ISO date
}

export interface ReplacementResult {
  replacementRequired:        boolean;
  replacementReason:          string;
  replacementShortageQty:     number;     // units still needed after same-ref check
  replacementCandidates:      ReplacementCandidate[];  // max 5
  selectedReplacementCandidate: ReplacementCandidate | null;
  replacementConfidence:      number;     // 0-1
  replacementRuleSource:      ReplacementMatchMode;
  replacementCoveredQty:      number;     // total qty covered by all candidates
  totalCandidatesFound:       number;     // total compatible refs found before limit
  hasMoreCandidates:          boolean;    // true when more than maxCandidates exist
  rule36BlockedCount:         number;     // count of candidates excluded by Rule 36
}

// ── Need resolution (CASCADE-FIX-01) ────────────────────────────────────────

export type NeedResolutionType =
  | "DIRECT_REPLENISHMENT"               // same ref covers full shortage
  | "PARTIAL_DIRECT_PLUS_REPLACEMENT"    // partial same ref + replacement candidates
  | "REPLACEMENT"                         // no same ref stock, replacement candidates found
  | "NO_ALTERNATIVE";                     // nothing found

export type CoverageStatus =
  | "FULLY_COVERED"       // totalCoveredQty >= totalShortageQty
  | "PARTIALLY_COVERED"   // 0 < totalCoveredQty < totalShortageQty
  | "NO_COVERAGE";        // totalCoveredQty === 0

export interface NeedResolution {
  resolutionType:         NeedResolutionType;
  coverageStatus:         CoverageStatus;
  totalShortageQty:       number;
  sameRefCoverageQty:     number;       // units from same reference
  replacementCoverageQty: number;       // units from replacement candidates
  totalCoveredQty:        number;       // sameRefCoverage + replacementCoverage
  remainingShortageQty:   number;       // totalShortage - totalCovered
  coveragePercent:        number;       // round(totalCovered / totalShortage * 100)
}

// ── Per-item distribution record ────────────────────────────────────────────

export interface StoreDistributionItem {
  referenceCode:   string;
  productName:     string;
  size:            string;
  color:           string;
  line:            string;           // business line id (castillitos, latin_kids, accesorios_importacion)
  productClass:    StoreProductClass;

  // ── Canonical classification (PRIMERO) ──────────────────────────────────
  world:                  DistributionWorld;
  canonicalLine:          string;           // castillitos | latin_kids | accesorios_importacion
  group:                  string;           // grupoSag or "SIN_GRUPO_SAG"
  subgroup:               string;           // subgrupoSag or "SIN_SUBGRUPO_SAG"
  sizeClass:              StoreSizeClass | null; // null when not available (textile) or not resolved
  classificationSource:   string;           // e.g. "SAG_PRODUCT_LINE", "BUSINESS_LINE_MAP"
  classificationQuality:  ClassificationQuality;

  // Current stock
  currentUnits:    number;

  // Resolved rule thresholds
  minUnits:        number;
  idealUnits:      number;
  maxUnits:        number;
  resolvedBy:      DistributionRuleSource;

  // Diagnostics
  deficit:         number;           // max(0, minUnits - currentUnits)
  excess:          number;           // max(0, currentUnits - maxUnits)

  // Source stock
  mainWarehouseAvailable: number;
  transferableUnits:      number;    // min(deficit, mainWarehouseAvailable)

  // Action
  action:          StoreDistributionAction;
  actionReason:    string;           // mandatory textual explanation

  // Quality
  dataQuality:     StoreDistributionDataQuality;
  committedUnitsQuality: CommittedUnitsQuality;

  // Thumbnail
  imageUrl:        string | null;

  // ── Entry date (AGENTIK-STORES-DISCOUNTS-TAB-01) ─────────────────────
  /** PIL createdAt — earliest variant entry date for this ref in this store */
  entryDate:       string | null;

  // ── Replacement (SUGERIR_REEMPLAZO) ────────────────────────────────────
  replacement:     ReplacementResult | null;

  // ── Need resolution (CASCADE-FIX-01) ─────────────────────────────────
  needResolution:  NeedResolution | null;

  // ── Variant balancing (VARIANT-BALANCING-01) ──────────────────────────
  variantAllocation: VariantAllocationSuggestion | null;
}

// ── Store variant snapshot ───────────────────────────────────────────────────

export interface StoreVariantSnapshot {
  variantKey: string;      // "REF|SIZE|COLOR"
  size:       string;
  color:      string;
  storeQty:   number;
}

// ── Variant allocation suggestion (VARIANT-BALANCING-01) ─────────────────────

export type VariantBalanceQuality =
  | "BALANCED"
  | "PARTIAL"
  | "INSUFFICIENT_STOCK"
  | "INCOMPLETE_VARIANT_DATA"
  | "NOT_APPLICABLE";

export interface VariantAllocation {
  variantKey:            string;
  size:                  string;
  color:                 string;
  storeQtyBefore:        number;
  warehouseAvailableQty: number;
  suggestedQty:          number;
  storeQtyAfter:         number;
  reason:                string;
}

export interface VariantAllocationSuggestion {
  totalRequestedQty:     number;
  totalAllocatedQty:     number;
  unallocatedQty:        number;
  allocations:           VariantAllocation[];
  balanceQuality:        VariantBalanceQuality;
  evidenceDate:          string;
}

// ── Per-store detail ────────────────────────────────────────────────────────

export interface StoreDetailKpis {
  totalReferences:    number;
  totalUnits:         number;
  criticalNeeds:      number;       // items with action SURTIR or SIN_STOCK_ORIGEN
  excessItems:        number;       // items with action RETIRAR
  coveragePercent:    number;       // items at/above min / total expected
  withRules:          number;       // items with a resolved rule
  withoutRules:       number;       // items without a rule
}

export interface CanonicalStoreDetail {
  store:  StoreLocation;
  items:  StoreDistributionItem[];
  kpis:   StoreDetailKpis;
}

// ── Store card (workspace view) ─────────────────────────────────────────────

export type StoreDistributionHealthStatus =
  | "ok"
  | "requiere_surtido"
  | "critica"
  | "sin_reglas";

export interface CanonicalStoreCard {
  store:             StoreLocation;
  totalReferences:   number;
  totalUnits:        number;
  criticalNeeds:     number;
  shortageUnits:     number;         // sum of deficit across all items (units to reach ideal)
  excessItems:       number;
  coveragePercent:   number;
  actionRequired:    boolean;
  healthStatus:      StoreDistributionHealthStatus;
}

// ── Module KPIs ─────────────────────────────────────────────────────────────

export interface StoreDistributionKpis {
  tiendasActivas:        number;
  tiendasCriticas:       number;
  referenciasPorSurtir:  number;
  referenciasConExceso:  number;
  propuestasPendientes:  number;
}

// ── Domain-separated distribution (OCTAVO) ──────────────────────────────────

export interface DomainDistributionGroup {
  totalItems:    number;
  totalSurtir:   number;
  totalRetirar:  number;
  totalMantener: number;
  items:         StoreDistributionItem[];
}

export interface TextileDomainDistribution {
  castillitos: DomainDistributionGroup;
  latinKids:   DomainDistributionGroup;
}

export interface AccessoryDomainDistribution {
  small:  DomainDistributionGroup;
  medium: DomainDistributionGroup;
  large:  DomainDistributionGroup;
}

export interface DomainDistribution {
  textile: TextileDomainDistribution;
  import:  { accessories: AccessoryDomainDistribution };
}

// ── Rule 36 evidence (TERCERO) ──────────────────────────────────────────────

export interface Rule36Evidence {
  stockPrincipal:       number;
  umbral:               number;
  tiendasPermitidas:    string[];
  tiendaEvaluada:       string;
  reglaAplicada:        boolean;
  accionResultante:     StoreDistributionAction;
}

// ── Effective config (editable, used by service) ────────────────────────────

export interface EffectiveTextileConfig {
  enabled:      boolean;
  minUnits:     number;
  maxUnits:     number;
  targetUnits:  number;
  validFrom:    string | null;
  validTo:      string | null;
  season:       string | null;
  notes:        string | null;
  source:       "tenant_default" | "store_override";
}

export interface EffectiveAccessoryConfig {
  sizeClass:    StoreSizeClass;
  targetUnits:  number;
  validFrom:    string | null;
  validTo:      string | null;
  season:       string | null;
  notes:        string | null;
  source:       "tenant_default" | "store_override";
}

export interface EffectiveScarcityConfig {
  enabled:                         boolean;
  lowStockConcentrationThreshold:  number;
  allowedStoresWhenScarce:         string[];
  allowedStoreNames:               string[];
  validFrom:                       string | null;
  validTo:                         string | null;
  season:                          string | null;
  notes:                           string | null;
  source:                          "tenant_default" | "store_override";
}

// ── Special products ─────────────────────────────────────────────────────────

export interface EffectiveSpecialProductEntry {
  pattern:    string;       // e.g. "BAÑERA", "CUNA_COLECHO", "CORRAL"
  idealUnits: number;       // per-pattern ideal for this store (0 = not authorized)
  source:     "tenant_default" | "store_override";
  validFrom:  string | null;
  validTo:    string | null;
  season:     string | null;
  notes:      string | null;
}

export interface EffectiveSpecialProductConfig {
  entries: EffectiveSpecialProductEntry[];
}

export interface EffectiveStoreConfig {
  castillitos:     EffectiveTextileConfig;
  latinKids:       EffectiveTextileConfig;
  accessories:     { small: EffectiveAccessoryConfig; medium: EffectiveAccessoryConfig; large: EffectiveAccessoryConfig };
  scarcity:        EffectiveScarcityConfig;
  specialProducts: EffectiveSpecialProductConfig;
}

// ── Impact preview (CUARTO) ─────────────────────────────────────────────────

export interface RuleImpactPreview {
  additionalSurtir:      number;
  additionalUnitsNeeded: number;
  resolvedDeficits:      number;
  newRetirar:            number;
}

// ── Config validation ──────────────────────────────────────────────────

export interface ConfigFieldError {
  field:   string;
  message: string;
}

export interface ConfigValidationResult {
  valid:  boolean;
  errors: ConfigFieldError[];
}

// ── Active stores (canonical) ─────────────────────────────────────────

export const ACTIVE_STORE_SLUGS = ["san_diego", "centro", "gran_plaza", "caldas"] as const;
export type ActiveStoreSlug = typeof ACTIVE_STORE_SLUGS[number];

// ── Server-side validation (pure — no runtime deps) ────────────────────────

/** Maximum reasonable units per reference per store */
const MAX_TEXTILE_UNITS = 100;
const MAX_ACCESSORY_UNITS = 50;
const MAX_SCARCITY_THRESHOLD = 500;
const MAX_NOTES_LENGTH = 500;
const MAX_SEASON_LENGTH = 100;

const VALID_SIZE_CLASSES = new Set(["small", "medium", "large"]);

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s));
}

export function validateDistributionConfigInput(
  config: Partial<EffectiveStoreConfig>,
): ConfigValidationResult {
  const errors: ConfigFieldError[] = [];

  function validateTextileBlock(tc: EffectiveTextileConfig, prefix: string) {
    if (!Number.isInteger(tc.minUnits) || tc.minUnits < 0)
      errors.push({ field: `${prefix}.minUnits`, message: "Debe ser entero >= 0" });
    if (!Number.isInteger(tc.targetUnits) || tc.targetUnits < tc.minUnits)
      errors.push({ field: `${prefix}.targetUnits`, message: "Debe ser entero >= minimo" });
    if (!Number.isInteger(tc.maxUnits) || tc.maxUnits < tc.targetUnits)
      errors.push({ field: `${prefix}.maxUnits`, message: "Debe ser entero >= objetivo" });
    if (tc.minUnits > MAX_TEXTILE_UNITS)
      errors.push({ field: `${prefix}.minUnits`, message: `Maximo razonable: ${MAX_TEXTILE_UNITS}` });
    if (tc.maxUnits > MAX_TEXTILE_UNITS)
      errors.push({ field: `${prefix}.maxUnits`, message: `Maximo razonable: ${MAX_TEXTILE_UNITS}` });
    if (typeof tc.enabled !== "boolean")
      errors.push({ field: `${prefix}.enabled`, message: "Debe ser boolean" });
    validateVigenciaFields(tc, prefix);
  }

  function validateVigenciaFields(obj: { validFrom?: string | null; validTo?: string | null; season?: string | null; notes?: string | null }, prefix: string) {
    if (obj.validFrom != null && !isValidIsoDate(obj.validFrom))
      errors.push({ field: `${prefix}.validFrom`, message: "Fecha ISO invalida" });
    if (obj.validTo != null && !isValidIsoDate(obj.validTo))
      errors.push({ field: `${prefix}.validTo`, message: "Fecha ISO invalida" });
    if (obj.validFrom && obj.validTo && obj.validTo < obj.validFrom)
      errors.push({ field: `${prefix}.validTo`, message: "No puede ser anterior a validFrom" });
    if (obj.season != null && typeof obj.season !== "string")
      errors.push({ field: `${prefix}.season`, message: "Debe ser texto" });
    if (obj.season != null && obj.season.length > MAX_SEASON_LENGTH)
      errors.push({ field: `${prefix}.season`, message: `Maximo ${MAX_SEASON_LENGTH} caracteres` });
    if (obj.notes != null && typeof obj.notes !== "string")
      errors.push({ field: `${prefix}.notes`, message: "Debe ser texto" });
    if (obj.notes != null && obj.notes.length > MAX_NOTES_LENGTH)
      errors.push({ field: `${prefix}.notes`, message: `Maximo ${MAX_NOTES_LENGTH} caracteres` });
  }

  if (config.castillitos) validateTextileBlock(config.castillitos, "castillitos");
  if (config.latinKids) validateTextileBlock(config.latinKids, "latinKids");

  if (config.accessories) {
    for (const key of Object.keys(config.accessories)) {
      if (!VALID_SIZE_CLASSES.has(key)) {
        errors.push({ field: `accessories.${key}`, message: `Tamano desconocido. Solo: small, medium, large` });
        continue;
      }
      const ac = config.accessories[key as keyof typeof config.accessories];
      if (ac) {
        if (!Number.isInteger(ac.targetUnits) || ac.targetUnits < 0)
          errors.push({ field: `accessories.${key}.targetUnits`, message: "Debe ser entero >= 0" });
        if (ac.targetUnits > MAX_ACCESSORY_UNITS)
          errors.push({ field: `accessories.${key}.targetUnits`, message: `Maximo razonable: ${MAX_ACCESSORY_UNITS}` });
        validateVigenciaFields(ac, `accessories.${key}`);
      }
    }
  }

  if (config.scarcity) {
    const sc = config.scarcity;
    if (!Number.isInteger(sc.lowStockConcentrationThreshold) || sc.lowStockConcentrationThreshold < 0)
      errors.push({ field: "scarcity.threshold", message: "Entero >= 0" });
    if (sc.lowStockConcentrationThreshold > MAX_SCARCITY_THRESHOLD)
      errors.push({ field: "scarcity.threshold", message: `Maximo razonable: ${MAX_SCARCITY_THRESHOLD}` });
    if (sc.enabled && (!sc.allowedStoresWhenScarce || sc.allowedStoresWhenScarce.length === 0))
      errors.push({ field: "scarcity.allowedStores", message: "Al menos una tienda cuando esta habilitado" });
    if (sc.allowedStoresWhenScarce) {
      const seen = new Set<string>();
      for (const storeSlug of sc.allowedStoresWhenScarce) {
        if (seen.has(storeSlug))
          errors.push({ field: "scarcity.allowedStores", message: `Tienda duplicada: ${storeSlug}` });
        seen.add(storeSlug);
        if (!(ACTIVE_STORE_SLUGS as readonly string[]).includes(storeSlug))
          errors.push({ field: "scarcity.allowedStores", message: `Tienda no activa o no comercial: ${storeSlug}` });
      }
    }
    validateVigenciaFields(sc, "scarcity");
  }

  return { valid: errors.length === 0, errors };
}

// ── Full distribution read model ────────────────────────────────────────────

export interface CanonicalStoreDistribution {
  stores:                CanonicalStoreCard[];
  kpis:                  StoreDistributionKpis;
  mainWarehouseStock:    number;
  lastSyncAt:            string | null;
  computedAt:            string;
}
