/**
 * lib/comercial/derrotero-semantics.ts
 *
 * AGENTIK-DERROTERO-MEASUREMENT-SEMANTICS-01
 *
 * Single source of truth for HOW a derrotero is measured.
 *
 * The two commercial scopes measure fulfillment with DIFFERENT units:
 *
 *   TIENDAS (STORE)             → UNITS
 *     The rule is satisfied by the TOTAL number of units of the evaluated
 *     group (grupo+subgrupo for Castillitos, subgrupo for Latin Kids).
 *     Example: "PIJAMA NIÑA BB CL — min 8 / max 12 units" can be satisfied by
 *       · 1 reference with 8 units
 *       · 4 references with 2 units each
 *       · 8 references with 1 unit each
 *     The number of distinct references is IRRELEVANT for rule fulfillment.
 *
 *   MALETAS (SALES_PORTFOLIO)   → REFERENCES
 *     The rule is satisfied by the number of DISTINCT references present.
 *     Example: "PIJAMA NIÑA BB CL — objetivo 3 referencias" requires 3
 *     distinct references. 12 units of a single reference count as 1/3.
 *     Unit quantities NEVER substitute missing references.
 *
 * HARD RULE (roadmap principle #2 — "No mezclar semánticas"):
 *   Evaluators for one scope MUST NOT be reused for the other.
 *   Taxonomy (SAG grupo/subgrupo/sizeClass) MAY be shared; measurement
 *   algorithms MAY NOT.
 *
 * Pure types + pure functions — no Prisma, no UI imports, no side effects.
 */

// ── Scope and measurement unit ───────────────────────────────────────────────

/** Where the derrotero applies. */
export type DerroteroScope =
  | "STORE"            // tiendas / puntos de venta físicos
  | "SALES_PORTFOLIO"; // maletas (mostrario de vendedor viajero)

/** How fulfillment is measured. */
export type DerroteroMeasurementUnit =
  | "UNITS"        // total units of the evaluated group
  | "REFERENCES";  // count of DISTINCT references

/**
 * Canonical scope → measurement unit binding.
 * This mapping is BUSINESS LAW, not a default: a STORE derrotero measured in
 * REFERENCES (or a SALES_PORTFOLIO one measured in UNITS) is a semantic bug.
 */
export const MEASUREMENT_UNIT_BY_SCOPE: Record<DerroteroScope, DerroteroMeasurementUnit> = {
  STORE: "UNITS",
  SALES_PORTFOLIO: "REFERENCES",
} as const;

/** Resolve the mandatory measurement unit for a scope. */
export function measurementUnitForScope(scope: DerroteroScope): DerroteroMeasurementUnit {
  return MEASUREMENT_UNIT_BY_SCOPE[scope];
}

/**
 * Guard: throws when a declared measurement unit contradicts its scope.
 * Call at construction boundaries (adapters, loaders) — never in hot loops.
 */
export function assertScopeMeasurementCoherence(
  scope: DerroteroScope,
  measurementUnit: DerroteroMeasurementUnit,
): void {
  const expected = MEASUREMENT_UNIT_BY_SCOPE[scope];
  if (measurementUnit !== expected) {
    throw new Error(
      `[derrotero-semantics] Scope ${scope} must be measured in ${expected}, got ${measurementUnit}. ` +
      `Tiendas se miden en UNIDADES; maletas se miden en REFERENCIAS.`,
    );
  }
}

// ── UNITS evaluation (STORE scope) ──────────────────────────────────────────

export interface UnitsRuleThresholds {
  /** Minimum total units for the evaluated group */
  readonly minUnits: number;
  /** Ideal total units for the evaluated group */
  readonly idealUnits: number;
  /** Maximum total units for the evaluated group */
  readonly maxUnits: number;
}

export type UnitsRuleStatus =
  | "BELOW_MINIMUM"   // totalUnits < minUnits
  | "WITHIN_RANGE"    // minUnits <= totalUnits <= maxUnits
  | "OVER_MAXIMUM";   // totalUnits > maxUnits

export interface UnitsRuleEvaluation {
  readonly measurementUnit: "UNITS";
  readonly totalUnits: number;
  readonly status: UnitsRuleStatus;
  /** Units missing to reach the minimum (0 when at/above min) */
  readonly deficitToMin: number;
  /** Units missing to reach the ideal (0 when at/above ideal) */
  readonly deficitToIdeal: number;
  /** Units above the maximum (0 when at/below max) */
  readonly excessOverMax: number;
  /** True when the rule minimum is satisfied */
  readonly fulfilled: boolean;
}

/**
 * Evaluate a STORE derrotero rule by TOTAL UNITS of the evaluated group.
 *
 * `unitsByReference` accepts either the aggregate total (number) or the
 * per-reference breakdown (units are summed; reference identity is ignored
 * for fulfillment, which is exactly the STORE semantic).
 */
export function evaluateUnitsRule(
  unitsByReference: number | ReadonlyArray<number>,
  thresholds: UnitsRuleThresholds,
): UnitsRuleEvaluation {
  const totalUnits = typeof unitsByReference === "number"
    ? unitsByReference
    : unitsByReference.reduce((sum, u) => sum + Math.max(0, u), 0);

  const status: UnitsRuleStatus =
    totalUnits < thresholds.minUnits ? "BELOW_MINIMUM"
    : totalUnits > thresholds.maxUnits ? "OVER_MAXIMUM"
    : "WITHIN_RANGE";

  return {
    measurementUnit: "UNITS",
    totalUnits,
    status,
    deficitToMin: Math.max(0, thresholds.minUnits - totalUnits),
    deficitToIdeal: Math.max(0, thresholds.idealUnits - totalUnits),
    excessOverMax: Math.max(0, totalUnits - thresholds.maxUnits),
    fulfilled: totalUnits >= thresholds.minUnits,
  };
}

// ── REFERENCES evaluation (SALES_PORTFOLIO scope) ───────────────────────────

/**
 * Normalize a reference code for identity comparison.
 * SAG references are case-insensitive and may carry stray whitespace.
 */
export function normalizeReferenceCode(reference: string): string {
  return reference.trim().toUpperCase();
}

/**
 * Count DISTINCT references. Multiple rows/units of the same reference
 * count exactly once — this is the core maletas semantic.
 */
export function countDistinctReferences(references: ReadonlyArray<string>): number {
  return distinctReferences(references).length;
}

/** Distinct, normalized-identity reference list (original casing of first occurrence). */
export function distinctReferences(references: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of references) {
    const key = normalizeReferenceCode(ref);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(ref.trim());
  }
  return out;
}

export interface ReferencesRuleEvaluation {
  readonly measurementUnit: "REFERENCES";
  readonly targetReferences: number;
  readonly currentReferences: number;
  /** References missing to reach the target (0 when at/above target) */
  readonly shortage: number;
  /** References above the target (0 when at/below target) */
  readonly excess: number;
  /** True when currentReferences >= targetReferences */
  readonly fulfilled: boolean;
}

/**
 * Evaluate a SALES_PORTFOLIO (maleta) derrotero rule by DISTINCT references.
 * Unit quantities are deliberately NOT accepted here: they cannot substitute
 * missing references.
 */
export function evaluateReferencesRule(
  references: ReadonlyArray<string>,
  targetReferences: number,
): ReferencesRuleEvaluation {
  const currentReferences = countDistinctReferences(references);
  return {
    measurementUnit: "REFERENCES",
    targetReferences,
    currentReferences,
    shortage: Math.max(0, targetReferences - currentReferences),
    excess: Math.max(0, currentReferences - targetReferences),
    fulfilled: currentReferences >= targetReferences,
  };
}
