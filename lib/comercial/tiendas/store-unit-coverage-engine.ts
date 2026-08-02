/**
 * lib/comercial/tiendas/store-unit-coverage-engine.ts
 *
 * AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01 — Unit-based store coverage.
 *
 * Applies the certified measurement law (AGENTIK-DERROTERO-MEASUREMENT-
 * SEMANTICS-01) to store coverage:
 *
 *   TIENDAS (STORE) → UNITS.
 *   A coverage rule (min 8 / ideal 10 / max 12) is satisfied by the TOTAL
 *   units of the evaluated structure (grupo+subgrupo for Castillitos,
 *   subgrupo for Latin Kids, sizeClass for Importación/Accesorios).
 *   The number of distinct references is IRRELEVANT for rule fulfillment
 *   (it remains available as informational data only).
 *
 * Special rules (Castillitos policy pack):
 *   Products matching special patterns (BANERA, CUNA_COLECHO, CORRAL) have
 *   per-store unit targets. A store with ideal=0 holding units is an
 *   UNAUTHORIZED presence (high severity).
 *
 * Pure functions — no DB, no Prisma, no server-only, no side effects.
 * The service layer (store-coverage-service) resolves data and thresholds;
 * this module only measures. Tests certify this module.
 */

import {
  evaluateUnitsRule,
  type UnitsRuleThresholds,
  type UnitsRuleEvaluation,
  type UnitsRuleStatus,
} from "../derrotero-semantics";

export type { UnitsRuleThresholds, UnitsRuleEvaluation, UnitsRuleStatus };

// ── Structure-level evaluation ───────────────────────────────────────────────

/** Legacy quantitative status values kept for API/UI wire compatibility. */
export type CoverageQuantitativeStatus =
  | "SALUDABLE"
  | "CON_REFERENCIAS_BAJO_MINIMO"   // legacy name; means BELOW_MINIMUM in units
  | "SIN_REFERENCIAS";

export type CoverageStructuralStatus = "CUBIERTA" | "SIN_COBERTURA";

export interface UnitStructureCoverage {
  /** Certified unit evaluation (Sprint 1 law). */
  unitRule: UnitsRuleEvaluation;
  structuralStatus: CoverageStructuralStatus;
  quantitativeStatus: CoverageQuantitativeStatus;
}

/**
 * Evaluate one coverage structure by TOTAL UNITS against its thresholds.
 *
 * - No references with stock → SIN_COBERTURA / SIN_REFERENCIAS.
 * - Total units < min        → CUBIERTA / CON_REFERENCIAS_BAJO_MINIMO (legacy
 *                              wire value; semantics are structure units).
 * - Otherwise                → CUBIERTA / SALUDABLE (includes OVER_MAXIMUM:
 *                              excess is exposed in unitRule.excessOverMax,
 *                              surplus is not a coverage failure).
 */
export function evaluateUnitStructureCoverage(
  refUnits: ReadonlyArray<number>,
  thresholds: UnitsRuleThresholds,
): UnitStructureCoverage {
  const activeRefs = refUnits.filter(u => u > 0).length;
  const unitRule = evaluateUnitsRule(refUnits, thresholds);

  if (activeRefs === 0) {
    return {
      unitRule,
      structuralStatus: "SIN_COBERTURA",
      quantitativeStatus: "SIN_REFERENCIAS",
    };
  }

  return {
    unitRule,
    structuralStatus: "CUBIERTA",
    quantitativeStatus: unitRule.status === "BELOW_MINIMUM"
      ? "CON_REFERENCIAS_BAJO_MINIMO"
      : "SALUDABLE",
  };
}

// ── Special product rules (per-store unit targets) ───────────────────────────

export interface SpecialRuleConfig {
  /** Patterns matched against referenceCode OR productName (case-insensitive). */
  referencePatterns: string[];
  /** Ideal units per storeId (slug). */
  idealByStore: Record<string, number>;
  /** Ideal for stores not listed (0 = not authorized). */
  defaultIdeal: number;
}

export interface SpecialRuleItem {
  referenceCode: string;
  productName: string;
  currentUnits: number;
}

export type SpecialRuleStatus =
  | "CUMPLIDA"        // units === ideal (or within, ideal>0 and units>=ideal treated below)
  | "FALTANTE"        // units < ideal
  | "EXCEDENTE"       // units > ideal, ideal > 0
  | "NO_AUTORIZADA";  // ideal === 0 and units > 0 (high severity)

export interface SpecialMatchedReference {
  referenceCode: string;
  productName: string;
  units: number;
}

export interface SpecialRuleEvaluation {
  pattern: string;          // "BAÑERA" | "CUNA_COLECHO" | "CORRAL" | ...
  label: string;            // human label ("CUNA COLECHO")
  storeId: string;
  idealUnits: number;
  totalUnits: number;
  matchedReferenceCount: number;
  matchedReferences: readonly SpecialMatchedReference[];
  status: SpecialRuleStatus;
  gapUnits: number;         // FALTANTE: ideal-units · EXCEDENTE/NO_AUTORIZADA: units-ideal
  severity: "high" | "medium" | "low" | "none";
}

/**
 * Pattern match with underscore↔space normalization and Unicode NFD
 * diacritics stripping: "BAÑERA" matches "BANERA" and vice versa,
 * "CUNA_COLECHO" matches "CUNA COLECHO".
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function matchesSpecialPattern(text: string, pattern: string): boolean {
  const t = stripDiacritics(text.toUpperCase());
  const p = stripDiacritics(pattern.toUpperCase());
  return t.includes(p) || t.includes(p.replace(/_/g, " "));
}

/**
 * Aggregate special-rule coverage for one store: per pattern, total units
 * across all matching references vs the store's ideal.
 */
export function evaluateSpecialRules(
  storeId: string,
  items: readonly SpecialRuleItem[],
  config: SpecialRuleConfig,
): SpecialRuleEvaluation[] {
  const results: SpecialRuleEvaluation[] = [];

  for (const pattern of config.referencePatterns) {
    const matched = items.filter(i =>
      i.currentUnits > 0 && (
        matchesSpecialPattern(i.referenceCode, pattern) ||
        matchesSpecialPattern(i.productName, pattern)
      ),
    );
    const totalUnits = matched.reduce((s, i) => s + i.currentUnits, 0);
    const idealUnits = config.idealByStore[storeId] ?? config.defaultIdeal;

    let status: SpecialRuleStatus;
    let gapUnits: number;
    let severity: SpecialRuleEvaluation["severity"];

    if (idealUnits === 0) {
      if (totalUnits > 0) {
        status = "NO_AUTORIZADA";
        gapUnits = totalUnits;
        severity = "high";
      } else {
        status = "CUMPLIDA";
        gapUnits = 0;
        severity = "none";
      }
    } else if (totalUnits < idealUnits) {
      status = "FALTANTE";
      gapUnits = idealUnits - totalUnits;
      severity = "medium";
    } else if (totalUnits > idealUnits) {
      status = "EXCEDENTE";
      gapUnits = totalUnits - idealUnits;
      severity = "low";
    } else {
      status = "CUMPLIDA";
      gapUnits = 0;
      severity = "none";
    }

    results.push({
      pattern,
      label: pattern.replace(/_/g, " "),
      storeId,
      idealUnits,
      totalUnits,
      matchedReferenceCount: matched.length,
      matchedReferences: matched.map(m => ({
        referenceCode: m.referenceCode,
        productName: m.productName,
        units: m.currentUnits,
      })),
      status,
      gapUnits,
      severity,
    });
  }

  // Most severe first: NO_AUTORIZADA, FALTANTE, EXCEDENTE, CUMPLIDA
  const order: Record<SpecialRuleStatus, number> = {
    NO_AUTORIZADA: 0, FALTANTE: 1, EXCEDENTE: 2, CUMPLIDA: 3,
  };
  return results.sort((a, b) => order[a.status] - order[b.status] || b.gapUnits - a.gapUnits);
}
