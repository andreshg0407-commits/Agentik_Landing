/**
 * lib/comercial/tiendas/store-effective-rule-registry.ts
 *
 * AGENTIK-STORES-DYNAMIC-DERROTERO-RULES-01
 *
 * Effective Rule Registry for the Derrotero.
 *
 * Transforms Policy Pack defaults + persisted StorePolicyRule[] into the
 * SINGLE authoritative list of effective coverage rules for a store.
 *
 * Design laws:
 *   1. ONE function (buildEffectiveStoreRules) → ONE effective rule list.
 *   2. Target identity derived via buildCoverageRuleTargetKey() — NEVER stored
 *      as free text. If a persisted rule has structureKey, it's ignored in
 *      favor of the derived key.
 *   3. effect=OVERRIDE replaces pack base. effect=DISABLE suppresses pack base.
 *      effect=ADD introduces a new rule. active=false means the persisted entry
 *      does not participate (pack base keeps applying).
 *   4. Legacy rules (no ruleKind/effect) are normalized to OVERRIDE.
 *   5. Discriminated union types for domain correctness.
 *   6. Pure module — no DB, no Prisma, no server-only, no side effects.
 *
 * Sprint: AGENTIK-STORES-DYNAMIC-DERROTERO-RULES-01
 */

import type {
  StorePolicyRule,
  StorePolicyRuleKind,
  StorePolicyRuleEffect,
  StoreSizeClass,
} from "./store-policy-types";

import type { TextileCoverageConfig, AccessoryCoverageConfig, SpecialProductConfig, AgingDiscountBandConfig } from "./store-policy-pack-config";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "../maletas/assortment-catalog/castillitos-mallet-assortment-catalog";

const HANDLING_UNIT_TO_SIZE_CLASS: Record<string, string> = {
  PEQUENO: "small",
  MEDIANO: "medium",
  GRANDE: "large",
};

// ═════════════════════════════════════════════════════════════════════════════
// Discriminated union: effective rule types
// ═════════════════════════════════════════════════════════════════════════════

interface EffectiveRuleBase {
  readonly targetKey: string;
  readonly ruleKind: StorePolicyRuleKind;
  readonly label: string;
  readonly minimum: number;
  readonly ideal: number;
  readonly maximum: number | null;
  readonly priority: number;
  readonly source: "PACK_DEFAULT" | "POLICY_OVERRIDE" | "POLICY_ADD";
  /** The persisted rule ID when source is POLICY_OVERRIDE or POLICY_ADD. */
  readonly persistedRuleId: string | null;
}

export interface EffectiveTextileStructureRule extends EffectiveRuleBase {
  readonly ruleKind: "TEXTILE_STRUCTURE";
  readonly line: string;
  readonly group: string;
  readonly subgroup: string;
}

export interface EffectiveAccessorySizeRule extends EffectiveRuleBase {
  readonly ruleKind: "ACCESSORY_SIZE";
  readonly line: string;
  readonly sizeClass: StoreSizeClass;
}

export interface EffectiveSpecialProductRule extends EffectiveRuleBase {
  readonly ruleKind: "SPECIAL_PRODUCT";
  readonly specialPattern: string;
  /** Per-store ideal from the special product config. */
  readonly storeIdealUnits: number;
}

export type EffectiveRule =
  | EffectiveTextileStructureRule
  | EffectiveAccessorySizeRule
  | EffectiveSpecialProductRule;

// ── AGING_DISCOUNT effective rule (AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01)

/**
 * Effective aging discount band — own shape, NOT extending EffectiveRuleBase
 * because aging discounts use minDays/maxDays/discountPercent, not
 * minimum/ideal/maximum coverage thresholds.
 */
export interface EffectiveAgingDiscountRule {
  readonly targetKey: string;
  readonly ruleKind: "AGING_DISCOUNT";
  readonly minDays: number;
  readonly maxDays: number | null;
  readonly discountPercent: number;
  readonly priority: number;
  readonly source: "PACK_DEFAULT" | "POLICY_OVERRIDE" | "POLICY_ADD";
  readonly persistedRuleId: string | null;
}

export interface EffectiveAgingDiscountPolicy {
  readonly bands: readonly EffectiveAgingDiscountRule[];
  readonly validatedAt: string;
}

export interface AgingDiscountPolicyValidationError {
  readonly message: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Canonical identity normalization
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalize a single dimension value for IDENTITY purposes only.
 *
 * Used exclusively inside buildCoverageRuleTargetKey() to ensure that
 * PACK defaults, OVERRIDE, DISABLE, and ADD rules that refer to the same
 * commercial concept produce the same targetKey regardless of incidental
 * casing, whitespace, or Unicode representation differences.
 *
 * Rules:
 *   1. Trim leading/trailing whitespace.
 *   2. Collapse internal whitespace to a single space.
 *   3. Unicode NFC normalization (canonical composition).
 *   4. Lowercase for case-insensitive deterministic identity.
 *
 * Does NOT:
 *   - Strip diacritics (Ñ ≠ N, preserves semantic distinctness).
 *   - Apply fuzzy matching or heuristics.
 *   - Alter the original label used for presentation.
 */
export function normalizeCoverageRuleIdentityPart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .toLowerCase();
}

// ═════════════════════════════════════════════════════════════════════════════
// Target key derivation — SINGLE canonical function
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Derive a deterministic, stable target identity from a rule's selector
 * dimensions. This is the SOLE source of target identity — never store
 * as editable free text.
 *
 * All dimension values are normalized via normalizeCoverageRuleIdentityPart()
 * so that PACK defaults, OVERRIDE, DISABLE, and ADD rules with different
 * casing/whitespace/Unicode representation produce identical keys.
 *
 * The label for human presentation is preserved separately on the
 * EffectiveRule — identity and presentation never mix.
 *
 * Format:
 *   TEXTILE:  "TEXTILE:{line}:{group}:{subgroup}"
 *   ACC:      "ACC:{line}:{sizeClass}"
 *   SPECIAL:  "SPECIAL:{specialPattern}"
 */
export function buildCoverageRuleTargetKey(
  ruleKind: StorePolicyRuleKind,
  dimensions: {
    line?: string;
    group?: string;
    subgroup?: string;
    sizeClass?: string;
    specialPattern?: string;
    minDays?: number;
    maxDays?: number | null;
  },
): string {
  const n = normalizeCoverageRuleIdentityPart;
  switch (ruleKind) {
    case "TEXTILE_STRUCTURE":
      return `TEXTILE:${n(dimensions.line ?? "")}:${n(dimensions.group ?? "")}:${n(dimensions.subgroup ?? "")}`;
    case "ACCESSORY_SIZE":
      return `ACC:${n(dimensions.line ?? "")}:${n(dimensions.sizeClass ?? "")}`;
    case "SPECIAL_PRODUCT":
      return `SPECIAL:${n(dimensions.specialPattern ?? "")}`;
    case "AGING_DISCOUNT":
      return `AGING:${dimensions.minDays ?? 0}:${dimensions.maxDays === null || dimensions.maxDays === undefined ? "OPEN" : dimensions.maxDays}`;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Legacy normalization
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Infer ruleKind from a legacy StorePolicyRule that has no ruleKind field.
 * Uses scope + available fields to determine the most likely kind.
 */
function inferRuleKind(rule: StorePolicyRule): StorePolicyRuleKind {
  if (rule.minDays !== undefined || rule.discountPercent !== undefined) return "AGING_DISCOUNT";
  if (rule.specialPattern) return "SPECIAL_PRODUCT";
  if (rule.scope === "class_size" && rule.sizeClass) return "ACCESSORY_SIZE";
  return "TEXTILE_STRUCTURE";
}

/**
 * Normalize a persisted StorePolicyRule (potentially legacy) into a
 * canonical form with ruleKind and effect populated.
 *
 * Legacy rules without effect are interpreted as OVERRIDE.
 * Legacy rules without ruleKind are inferred from scope/fields.
 *
 * This is the SINGLE normalization point — consumers never do their own
 * fallback logic.
 */
export function normalizeStorePolicyRule(raw: StorePolicyRule): StorePolicyRule {
  return {
    ...raw,
    ruleKind: raw.ruleKind ?? inferRuleKind(raw),
    effect: raw.effect ?? "OVERRIDE",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Validation
// ═════════════════════════════════════════════════════════════════════════════

export interface RuleValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validate a StorePolicyRule for domain correctness.
 * Returns an empty array if valid, or a list of errors.
 */
export function validateStorePolicyRule(rule: StorePolicyRule): readonly RuleValidationError[] {
  const errors: RuleValidationError[] = [];

  // Common validations
  if (!rule.id) errors.push({ field: "id", message: "id is required" });
  if (!rule.storeId) errors.push({ field: "storeId", message: "storeId is required" });

  const kind = rule.ruleKind ?? inferRuleKind(rule);
  const effect = rule.effect ?? "OVERRIDE";

  if (!["TEXTILE_STRUCTURE", "ACCESSORY_SIZE", "SPECIAL_PRODUCT", "AGING_DISCOUNT"].includes(kind)) {
    errors.push({ field: "ruleKind", message: `invalid ruleKind: ${kind}` });
  }
  if (!["OVERRIDE", "DISABLE", "ADD"].includes(effect)) {
    errors.push({ field: "effect", message: `invalid effect: ${effect}` });
  }

  // Threshold validations — coverage kinds only (skip for DISABLE and AGING_DISCOUNT)
  if (effect !== "DISABLE" && kind !== "AGING_DISCOUNT") {
    if (typeof rule.minQty !== "number" || isNaN(rule.minQty) || rule.minQty < 0) {
      errors.push({ field: "minQty", message: "minQty must be a non-negative number" });
    }
    if (typeof rule.idealQty !== "number" || isNaN(rule.idealQty) || rule.idealQty < 0) {
      errors.push({ field: "idealQty", message: "idealQty must be a non-negative number" });
    }
    if (rule.maxQty !== null && rule.maxQty !== undefined) {
      if (typeof rule.maxQty !== "number" || isNaN(rule.maxQty) || rule.maxQty < 0) {
        errors.push({ field: "maxQty", message: "maxQty must be a non-negative number or null" });
      }
    }

    // Coherence: min <= ideal, ideal <= max (when max is not null)
    if (typeof rule.minQty === "number" && typeof rule.idealQty === "number") {
      if (rule.minQty > rule.idealQty) {
        errors.push({ field: "minQty", message: "minQty must be <= idealQty" });
      }
    }
    if (typeof rule.idealQty === "number" && rule.maxQty !== null && rule.maxQty !== undefined && typeof rule.maxQty === "number") {
      if (rule.idealQty > rule.maxQty) {
        errors.push({ field: "idealQty", message: "idealQty must be <= maxQty when maxQty is not null" });
      }
    }
  }

  // Validity period coherence
  if (rule.validFrom && rule.validTo && rule.validFrom > rule.validTo) {
    errors.push({ field: "validFrom", message: "validFrom must be <= validTo" });
  }

  // Kind-specific validations
  switch (kind) {
    case "TEXTILE_STRUCTURE":
      if (!rule.line) errors.push({ field: "line", message: "line is required for TEXTILE_STRUCTURE" });
      if (!rule.subgroup) errors.push({ field: "subgroup", message: "subgroup is required for TEXTILE_STRUCTURE" });
      break;
    case "ACCESSORY_SIZE":
      if (!rule.sizeClass) errors.push({ field: "sizeClass", message: "sizeClass is required for ACCESSORY_SIZE" });
      if (!["small", "medium", "large"].includes(rule.sizeClass ?? "")) {
        errors.push({ field: "sizeClass", message: `invalid sizeClass: ${rule.sizeClass}` });
      }
      break;
    case "SPECIAL_PRODUCT":
      if (!rule.specialPattern) errors.push({ field: "specialPattern", message: "specialPattern is required for SPECIAL_PRODUCT" });
      break;
    case "AGING_DISCOUNT":
      if (effect !== "DISABLE") {
        if (typeof rule.minDays !== "number" || isNaN(rule.minDays) || rule.minDays < 0) {
          errors.push({ field: "minDays", message: "minDays must be a non-negative number" });
        }
        if (rule.maxDays !== null && rule.maxDays !== undefined) {
          if (typeof rule.maxDays !== "number" || isNaN(rule.maxDays) || rule.maxDays < 0) {
            errors.push({ field: "maxDays", message: "maxDays must be a non-negative number or null" });
          }
          if (typeof rule.minDays === "number" && typeof rule.maxDays === "number" && rule.maxDays < rule.minDays) {
            errors.push({ field: "maxDays", message: "maxDays must be >= minDays" });
          }
        }
        if (typeof rule.discountPercent !== "number" || isNaN(rule.discountPercent) || rule.discountPercent < 0 || rule.discountPercent > 100) {
          errors.push({ field: "discountPercent", message: "discountPercent must be between 0 and 100" });
        }
      }
      break;
  }

  return errors;
}

// ═════════════════════════════════════════════════════════════════════════════
// Policy Pack base rule builders
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Input contract for buildEffectiveStoreRules.
 * Aggregates all pack defaults needed to build the base rule universe.
 */
export interface PolicyPackDefaults {
  readonly castillitosTextile: TextileCoverageConfig;
  readonly latinKidsTextile: TextileCoverageConfig;
  readonly accessoryCoverage: AccessoryCoverageConfig;
  readonly specialProducts: SpecialProductConfig;
  /** The storeId for resolving per-store special product ideals. */
  readonly storeId: string;
}

/**
 * Catalog entry: each structure from the hardcoded catalogs that produces
 * a pack default rule.
 */
export interface PackStructureEntry {
  readonly structureKey: string;
  readonly label: string;
  readonly groupLabel: string | null;
  readonly line: string;
  readonly priority: number;
  /** ACC: size class for target resolution; null for textiles. */
  readonly accSize: string | null;
  /** SAG grupo for CS textiles. */
  readonly group: string | null;
  /** Subgroup name. */
  readonly subgroup: string;
}

function buildTextileBaseRule(
  entry: PackStructureEntry,
  config: TextileCoverageConfig,
): EffectiveTextileStructureRule {
  const targetKey = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
    line: entry.line,
    group: entry.group ?? "",
    subgroup: entry.subgroup,
  });
  return {
    targetKey,
    ruleKind: "TEXTILE_STRUCTURE",
    label: entry.label,
    minimum: config.minimumUnits,
    ideal: config.idealUnits,
    maximum: config.maximumUnits,
    priority: entry.priority,
    source: "PACK_DEFAULT",
    persistedRuleId: null,
    line: entry.line,
    group: entry.group ?? "",
    subgroup: entry.subgroup,
  };
}

function buildAccessoryBaseRule(
  entry: PackStructureEntry,
  config: AccessoryCoverageConfig,
): EffectiveAccessorySizeRule | null {
  if (!entry.accSize) return null;
  const sizeClass = entry.accSize as StoreSizeClass;
  const target = config.idealBySize[sizeClass] ?? 0;
  const targetKey = buildCoverageRuleTargetKey("ACCESSORY_SIZE", {
    line: entry.line,
    sizeClass,
  });
  return {
    targetKey,
    ruleKind: "ACCESSORY_SIZE",
    label: entry.label,
    minimum: target,
    ideal: target,
    maximum: null,
    priority: entry.priority,
    source: "PACK_DEFAULT",
    persistedRuleId: null,
    line: entry.line,
    sizeClass,
  };
}

function buildSpecialBaseRules(
  config: SpecialProductConfig,
  storeId: string,
): EffectiveSpecialProductRule[] {
  return config.referencePatterns.map((pattern, i) => {
    const storeIdeal = config.idealByStore[storeId] ?? config.defaultIdeal;
    const targetKey = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", { specialPattern: pattern });
    return {
      targetKey,
      ruleKind: "SPECIAL_PRODUCT" as const,
      label: pattern,
      minimum: storeIdeal,
      ideal: storeIdeal,
      maximum: null,
      priority: 1000 + i,
      source: "PACK_DEFAULT" as const,
      persistedRuleId: null,
      specialPattern: pattern,
      storeIdealUnits: storeIdeal,
    };
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Temporal validity (same law as assembler)
// ═════════════════════════════════════════════════════════════════════════════

function isRuleInForce(rule: StorePolicyRule, evaluationDate: string): boolean {
  if (rule.validFrom && rule.validFrom > evaluationDate) return false;
  if (rule.validTo && rule.validTo < evaluationDate) return false;
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// Conflict resolution
// ═════════════════════════════════════════════════════════════════════════════

export class EffectiveRuleConflictError extends Error {
  readonly targetKey: string;
  readonly ruleIds: readonly string[];
  constructor(targetKey: string, ruleIds: readonly string[]) {
    super(`Conflicting persisted rules for target ${targetKey}: ${ruleIds.join(", ")}`);
    this.name = "EffectiveRuleConflictError";
    this.targetKey = targetKey;
    this.ruleIds = ruleIds;
  }
}

/**
 * Among multiple active persisted rules for the same targetKey,
 * pick the one with highest priority (lowest number wins, like CSS
 * specificity — more specific = lower priority number).
 * If priority ties, the one with the most recent id (lexicographic) wins.
 * Throws EffectiveRuleConflictError if resolution is impossible.
 */
function resolveConflict(rules: StorePolicyRule[]): StorePolicyRule {
  if (rules.length === 1) return rules[0];
  const sorted = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.id.localeCompare(a.id); // most recent ID wins tie
  });
  return sorted[0];
}

// ═════════════════════════════════════════════════════════════════════════════
// Main: buildEffectiveStoreRules
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build the SINGLE authoritative list of effective coverage rules for a store.
 *
 * Resolution:
 *   1. Build base rules from Policy Pack (structures + specials).
 *   2. Normalize all persisted rules.
 *   3. Filter: only active + in-force rules participate.
 *   4. Group persisted rules by targetKey.
 *   5. Resolve conflicts (multiple active rules for same target).
 *   6. Apply effects:
 *      - OVERRIDE: replace base thresholds with persisted values.
 *      - DISABLE: remove base rule from effective universe.
 *      - ADD: add new rule (must not collide with base unless explicit).
 *   7. Return merged effective rule list.
 *
 * @param packDefaults   Policy Pack threshold defaults.
 * @param catalogEntries All structure entries from the hardcoded catalogs.
 * @param persistedRules Persisted StorePolicyRule[] for this store.
 * @param evaluationDate ISO string for temporal validity evaluation.
 */
export function buildEffectiveStoreRules(
  packDefaults: PolicyPackDefaults,
  catalogEntries: readonly PackStructureEntry[],
  persistedRules: readonly StorePolicyRule[],
  evaluationDate: string,
): readonly EffectiveRule[] {
  // 1. Build base rules from pack
  const baseByTarget = new Map<string, EffectiveRule>();

  for (const entry of catalogEntries) {
    if (entry.line === "castillitos") {
      const rule = buildTextileBaseRule(entry, packDefaults.castillitosTextile);
      baseByTarget.set(rule.targetKey, rule);
    } else if (entry.line === "latin_kids") {
      const rule = buildTextileBaseRule(entry, packDefaults.latinKidsTextile);
      baseByTarget.set(rule.targetKey, rule);
    } else if (entry.line === "accesorios_importacion") {
      const rule = buildAccessoryBaseRule(entry, packDefaults.accessoryCoverage);
      if (rule) baseByTarget.set(rule.targetKey, rule);
    }
  }

  for (const special of buildSpecialBaseRules(packDefaults.specialProducts, packDefaults.storeId)) {
    baseByTarget.set(special.targetKey, special);
  }

  // 2. Normalize + filter persisted rules (exclude AGING_DISCOUNT — separate pipeline)
  const normalized = persistedRules
    .map(normalizeStorePolicyRule)
    .filter(r => r.active && isRuleInForce(r, evaluationDate) && r.ruleKind !== "AGING_DISCOUNT");

  // 3. Separate broad-scope rules (line, class_size) from specific rules
  const broadRules: StorePolicyRule[] = [];
  const specificByTarget = new Map<string, StorePolicyRule[]>();
  for (const r of normalized) {
    if (isBroadScope(r)) {
      broadRules.push(r);
    } else {
      const kind = r.ruleKind!;
      const targetKey = buildCoverageRuleTargetKey(kind, {
        line: r.line,
        group: r.group,
        subgroup: r.subgroup,
        sizeClass: r.sizeClass,
        specialPattern: r.specialPattern,
      });
      const existing = specificByTarget.get(targetKey);
      if (existing) existing.push(r);
      else specificByTarget.set(targetKey, [r]);
    }
  }

  // 4a. Apply broad-scope overrides (line, class_size) to ALL matching base rules
  for (const rule of broadRules) {
    const effect = rule.effect as StorePolicyRuleEffect;
    const matchingKeys = findBroadMatches(rule, baseByTarget);
    for (const targetKey of matchingKeys) {
      switch (effect) {
        case "DISABLE":
          baseByTarget.delete(targetKey);
          break;
        case "OVERRIDE": {
          const base = baseByTarget.get(targetKey);
          if (base) baseByTarget.set(targetKey, applyOverride(base, rule));
          break;
        }
        // ADD is not meaningful for broad scope — skip
      }
    }
  }

  // 4b. Apply specific rules (resolve conflicts per targetKey)
  for (const [targetKey, rules] of specificByTarget) {
    const winner = resolveConflict(rules);
    const effect = winner.effect as StorePolicyRuleEffect;

    switch (effect) {
      case "DISABLE":
        // Suppress base rule
        baseByTarget.delete(targetKey);
        break;

      case "OVERRIDE": {
        const base = baseByTarget.get(targetKey);
        if (base) {
          // Replace with overridden thresholds, preserving base structure
          baseByTarget.set(targetKey, applyOverride(base, winner));
        }
        // If no base exists, OVERRIDE is a no-op (nothing to override)
        break;
      }

      case "ADD": {
        // Create a new effective rule from the persisted rule
        const newRule = buildEffectiveFromAdd(winner);
        if (newRule) {
          baseByTarget.set(targetKey, newRule);
        }
        break;
      }
    }
  }

  // 5. Return sorted by priority
  return [...baseByTarget.values()].sort((a, b) => a.priority - b.priority);
}

// ═════════════════════════════════════════════════════════════════════════════
// Broad-scope matching helpers
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A rule is "broad scope" if it targets an entire line or class_size —
 * meaning it should apply to ALL base rules in that line/sizeClass.
 */
function isBroadScope(rule: StorePolicyRule): boolean {
  const kind = rule.ruleKind ?? inferRuleKind(rule);
  // Special products and ADDs are always specific — never broad
  if (kind === "SPECIAL_PRODUCT") return false;
  if (rule.effect === "ADD") return false;
  const scope = rule.scope;
  if (scope === "line" && rule.line && !rule.group && !rule.subgroup) return true;
  if (scope === "class_size" && rule.sizeClass) return true;
  return false;
}

/**
 * Find all base rule targetKeys that match a broad-scope persisted rule.
 *   - scope="line": matches all TEXTILE base rules in that line.
 *   - scope="class_size": matches all ACCESSORY base rules with that sizeClass.
 */
function findBroadMatches(
  rule: StorePolicyRule,
  baseByTarget: Map<string, EffectiveRule>,
): string[] {
  const n = normalizeCoverageRuleIdentityPart;
  const matches: string[] = [];

  if (rule.scope === "line" && rule.line) {
    const normalizedLine = n(rule.line);
    for (const [key, base] of baseByTarget) {
      if (base.ruleKind === "TEXTILE_STRUCTURE" && n(base.line) === normalizedLine) {
        matches.push(key);
      }
    }
  } else if (rule.scope === "class_size" && rule.sizeClass) {
    const normalizedSize = n(rule.sizeClass);
    for (const [key, base] of baseByTarget) {
      if (base.ruleKind === "ACCESSORY_SIZE" && n(base.sizeClass) === normalizedSize) {
        matches.push(key);
      }
    }
  }

  return matches;
}

// ═════════════════════════════════════════════════════════════════════════════
// Effect application helpers
// ═════════════════════════════════════════════════════════════════════════════

function applyOverride(base: EffectiveRule, override: StorePolicyRule): EffectiveRule {
  const common = {
    ...base,
    minimum: override.minQty ?? base.minimum,
    ideal: override.idealQty ?? base.ideal,
    maximum: override.maxQty !== undefined ? override.maxQty : base.maximum,
    source: "POLICY_OVERRIDE" as const,
    persistedRuleId: override.id,
    priority: override.priority ?? base.priority,
  };

  switch (base.ruleKind) {
    case "TEXTILE_STRUCTURE":
      return { ...common, ruleKind: "TEXTILE_STRUCTURE", line: base.line, group: base.group, subgroup: base.subgroup };
    case "ACCESSORY_SIZE":
      return { ...common, ruleKind: "ACCESSORY_SIZE", line: base.line, sizeClass: base.sizeClass };
    case "SPECIAL_PRODUCT":
      return { ...common, ruleKind: "SPECIAL_PRODUCT", specialPattern: base.specialPattern, storeIdealUnits: override.idealQty ?? base.ideal };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// maxQty=null canonical interpretation (guardrail 1 §5)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Resolve maximum for evaluation: maxQty=null means exclusively "SIN MÁXIMO"
 * (no cap). For engines that require a numeric ceiling, this returns
 * Number.MAX_SAFE_INTEGER. This is the SINGLE canonical interpretation point.
 *
 * Usage:
 *   engine.evaluate({ maxUnits: resolveMaximumForEvaluation(rule.maximum) })
 */
export function resolveMaximumForEvaluation(maxQty: number | null): number {
  return maxQty ?? Number.MAX_SAFE_INTEGER;
}

function buildEffectiveFromAdd(rule: StorePolicyRule): EffectiveRule | null {
  const kind = rule.ruleKind!;

  switch (kind) {
    case "TEXTILE_STRUCTURE": {
      if (!rule.line || !rule.subgroup) return null;
      const targetKey = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
        line: rule.line,
        group: rule.group,
        subgroup: rule.subgroup,
      });
      return {
        targetKey,
        ruleKind: "TEXTILE_STRUCTURE",
        label: rule.subgroup,
        minimum: rule.minQty ?? 0,
        ideal: rule.idealQty ?? 0,
        maximum: rule.maxQty ?? null,
        priority: rule.priority,
        source: "POLICY_ADD",
        persistedRuleId: rule.id,
        line: rule.line,
        group: rule.group ?? "",
        subgroup: rule.subgroup,
      };
    }
    case "ACCESSORY_SIZE": {
      if (!rule.sizeClass) return null;
      const targetKey = buildCoverageRuleTargetKey("ACCESSORY_SIZE", {
        line: rule.line ?? "accesorios_importacion",
        sizeClass: rule.sizeClass,
      });
      return {
        targetKey,
        ruleKind: "ACCESSORY_SIZE",
        label: rule.sizeClass,
        minimum: rule.minQty ?? 0,
        ideal: rule.idealQty ?? 0,
        maximum: rule.maxQty ?? null,
        priority: rule.priority,
        source: "POLICY_ADD",
        persistedRuleId: rule.id,
        line: rule.line ?? "accesorios_importacion",
        sizeClass: rule.sizeClass,
      };
    }
    case "SPECIAL_PRODUCT": {
      if (!rule.specialPattern) return null;
      const targetKey = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", {
        specialPattern: rule.specialPattern,
      });
      return {
        targetKey,
        ruleKind: "SPECIAL_PRODUCT",
        label: rule.specialPattern,
        minimum: rule.idealQty ?? 0,
        ideal: rule.idealQty ?? 0,
        maximum: null,
        priority: rule.priority,
        source: "POLICY_ADD",
        persistedRuleId: rule.id,
        specialPattern: rule.specialPattern,
        storeIdealUnits: rule.idealQty ?? 0,
      };
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Pack catalog adapter (guardrail 5 §5)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build PackStructureEntry[] from the 3 hardcoded catalogs.
 * Same data as buildStructureLookup() in the assembler, but in the
 * registry's format. This is the SINGLE adapter from catalog → registry.
 *
 * Returns 46 entries: 32 CS + 11 LK + 3 ACC.
 */
export function buildPackCatalogEntries(): readonly PackStructureEntry[] {
  const entries: PackStructureEntry[] = [];

  // CS — Castillitos textiles (grupo+subgrupo = structure identity)
  for (const group of buildCastillitosTextilCatalog().groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      entries.push({
        structureKey: `CS|${group.sagGrupo}|${entry.subgroupName}`,
        label: entry.subgroupName,
        groupLabel: group.groupName,
        line: "castillitos",
        priority: entry.priority,
        accSize: null,
        group: group.sagGrupo,
        subgroup: entry.subgroupName,
      });
    }
  }

  // LK — Latin Kids textiles (subgrupo = structure identity)
  for (const group of buildLatinKidsTextilCatalog().groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      entries.push({
        structureKey: `LK|${entry.subgroupName}`,
        label: entry.subgroupName,
        groupLabel: null,
        line: "latin_kids",
        priority: entry.priority,
        accSize: null,
        group: null,
        subgroup: entry.subgroupName,
      });
    }
  }

  // ACC — Importacion/Accesorios (sizeClass = structure identity)
  for (const group of buildImportAccesoriosCatalog().groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const sc = entry.subgroupCode
        ? HANDLING_UNIT_TO_SIZE_CLASS[entry.subgroupCode.toUpperCase()] ?? null
        : null;
      entries.push({
        structureKey: `ACC|${entry.subgroupName}`,
        label: entry.subgroupName,
        groupLabel: "ACCESORIOS",
        line: "accesorios_importacion",
        priority: entry.priority,
        accSize: sc,
        group: null,
        subgroup: entry.subgroupName,
      });
    }
  }

  return entries;
}

// ═════════════════════════════════════════════════════════════════════════════
// AGING DISCOUNT POLICY (AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Validate an aging discount policy (set of bands) for completeness.
 *
 * A valid policy:
 *   - Starts at day 0
 *   - Has no gaps between bands
 *   - Has no overlapping bands
 *   - Has exactly one open-ended band (maxDays === null) at the end
 *   - All bands have valid minDays/maxDays/discountPercent
 */
export function validateAgingDiscountPolicy(
  bands: readonly EffectiveAgingDiscountRule[],
): readonly AgingDiscountPolicyValidationError[] {
  const errors: AgingDiscountPolicyValidationError[] = [];
  if (bands.length === 0) {
    errors.push({ message: "Policy must have at least one band" });
    return errors;
  }

  const sorted = [...bands].sort((a, b) => a.minDays - b.minDays);

  // Must start at day 0
  if (sorted[0].minDays !== 0) {
    errors.push({ message: `First band must start at day 0, starts at ${sorted[0].minDays}` });
  }

  // Per-band validation
  for (const band of sorted) {
    if (typeof band.minDays !== "number" || isNaN(band.minDays) || band.minDays < 0) {
      errors.push({ message: `Band ${band.targetKey}: minDays must be non-negative` });
    }
    if (band.maxDays !== null) {
      if (typeof band.maxDays !== "number" || isNaN(band.maxDays) || band.maxDays < band.minDays) {
        errors.push({ message: `Band ${band.targetKey}: maxDays must be >= minDays or null` });
      }
    }
    if (typeof band.discountPercent !== "number" || isNaN(band.discountPercent) || band.discountPercent < 0 || band.discountPercent > 100) {
      errors.push({ message: `Band ${band.targetKey}: discountPercent must be 0–100` });
    }
  }

  // Check gaps and overlaps
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.maxDays === null) {
      errors.push({ message: `Band ${current.targetKey}: open-ended band must be last, but ${next.targetKey} follows` });
      continue;
    }

    const expectedNext = current.maxDays + 1;
    if (next.minDays > expectedNext) {
      errors.push({ message: `Gap between bands: ${current.maxDays}–${next.minDays - 1} has no rule` });
    }
    if (next.minDays < expectedNext) {
      errors.push({ message: `Overlap between bands: ${current.targetKey} and ${next.targetKey} overlap at day ${next.minDays}` });
    }
  }

  // Last band must be open-ended
  const last = sorted[sorted.length - 1];
  if (last.maxDays !== null) {
    errors.push({ message: `Last band ${last.targetKey} must be open-ended (maxDays=null)` });
  }

  return errors;
}

/**
 * Build the effective aging discount policy for a store.
 *
 * Resolution:
 *   1. Convert default bands from Policy Pack → EffectiveAgingDiscountRule[] (PACK_DEFAULT)
 *   2. Filter persisted AGING_DISCOUNT rules: active + in-force + matching storeId
 *   3. Apply effects: OVERRIDE replaces, DISABLE suppresses, ADD introduces
 *   4. Validate resulting policy (no gaps, no overlaps)
 *   5. Return validated policy
 *
 * If validation fails, returns the policy with errors — caller decides
 * whether to reject or fall back.
 */
export function buildEffectiveAgingDiscountPolicy(
  defaultBands: readonly AgingDiscountBandConfig[],
  persistedRules: readonly StorePolicyRule[],
  storeId: string,
  evaluationDate: string,
): { policy: EffectiveAgingDiscountPolicy; errors: readonly AgingDiscountPolicyValidationError[] } {
  // 1. Build defaults
  const bandsByTarget = new Map<string, EffectiveAgingDiscountRule>();

  for (let i = 0; i < defaultBands.length; i++) {
    const band = defaultBands[i];
    const targetKey = buildCoverageRuleTargetKey("AGING_DISCOUNT", {
      minDays: band.minDays,
      maxDays: band.maxDays,
    });
    bandsByTarget.set(targetKey, {
      targetKey,
      ruleKind: "AGING_DISCOUNT",
      minDays: band.minDays,
      maxDays: band.maxDays,
      discountPercent: band.discountPercent,
      priority: i * 100,
      source: "PACK_DEFAULT",
      persistedRuleId: null,
    });
  }

  // 2. Filter persisted AGING_DISCOUNT rules for this store
  const agingRules = persistedRules
    .map(normalizeStorePolicyRule)
    .filter(r =>
      r.ruleKind === "AGING_DISCOUNT"
      && r.active
      && isRuleInForce(r, evaluationDate)
      && r.storeId === storeId,
    );

  // 3. Group by targetKey and resolve conflicts
  const byTarget = new Map<string, StorePolicyRule[]>();
  for (const r of agingRules) {
    const targetKey = buildCoverageRuleTargetKey("AGING_DISCOUNT", {
      minDays: r.minDays,
      maxDays: r.maxDays,
    });
    const existing = byTarget.get(targetKey);
    if (existing) existing.push(r);
    else byTarget.set(targetKey, [r]);
  }

  for (const [targetKey, rules] of byTarget) {
    const winner = resolveConflict(rules);
    const effect = winner.effect as StorePolicyRuleEffect;

    switch (effect) {
      case "DISABLE":
        bandsByTarget.delete(targetKey);
        break;

      case "OVERRIDE": {
        const base = bandsByTarget.get(targetKey);
        if (base) {
          bandsByTarget.set(targetKey, {
            ...base,
            discountPercent: winner.discountPercent ?? base.discountPercent,
            source: "POLICY_OVERRIDE",
            persistedRuleId: winner.id,
            priority: winner.priority ?? base.priority,
          });
        }
        break;
      }

      case "ADD": {
        bandsByTarget.set(targetKey, {
          targetKey,
          ruleKind: "AGING_DISCOUNT",
          minDays: winner.minDays ?? 0,
          maxDays: winner.maxDays ?? null,
          discountPercent: winner.discountPercent ?? 0,
          priority: winner.priority,
          source: "POLICY_ADD",
          persistedRuleId: winner.id,
        });
        break;
      }
    }
  }

  // 4. Sort by minDays and validate
  const sortedBands = [...bandsByTarget.values()].sort((a, b) => a.minDays - b.minDays);
  const errors = validateAgingDiscountPolicy(sortedBands);

  const policy: EffectiveAgingDiscountPolicy = {
    bands: sortedBands,
    validatedAt: evaluationDate,
  };

  return { policy, errors };
}

/**
 * Evaluate aging discount for a single reference.
 *
 * Pure function: takes a daysInStore fact and an effective policy,
 * returns the discount evaluation.
 *
 * Does NOT compute aging — only applies policy to a fact.
 */
export function evaluateAgingDiscount(
  referenceCode: string,
  daysInStore: number | null,
  agingSource: "TRANSFER" | "SIN_FECHA",
  policy: EffectiveAgingDiscountPolicy,
): import("./store-discount-types").AgingDiscountEvaluation {
  if (daysInStore === null || agingSource === "SIN_FECHA") {
    return {
      referenceCode,
      daysInStore: null,
      agingSource: "SIN_FECHA",
      matchedRuleId: null,
      discountPercent: null,
      status: "SIN_FECHA",
      reason: "Sin fecha de ingreso disponible. No se puede calcular descuento.",
    };
  }

  const matched = policy.bands.find(band =>
    daysInStore >= band.minDays && (band.maxDays === null || daysInStore <= band.maxDays),
  );

  if (!matched) {
    return {
      referenceCode,
      daysInStore,
      agingSource,
      matchedRuleId: null,
      discountPercent: null,
      status: "NO_RULE",
      reason: `${daysInStore} dias en tienda. No hay regla de descuento aplicable.`,
    };
  }

  const percent = matched.discountPercent;
  const reason = percent === 0
    ? `${daysInStore} dias en tienda. Sin descuento (menos de ${(policy.bands.find(b => b.discountPercent > 0)?.minDays ?? 90)} dias).`
    : `${daysInStore} dias en tienda. Descuento recomendado: ${percent}%.`;

  return {
    referenceCode,
    daysInStore,
    agingSource,
    matchedRuleId: matched.targetKey,
    discountPercent: percent,
    status: "EVALUATED",
    reason,
  };
}
