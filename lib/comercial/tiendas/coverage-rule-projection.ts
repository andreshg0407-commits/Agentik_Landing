/**
 * lib/comercial/tiendas/coverage-rule-projection.ts
 *
 * AGENTIK-STORES-COVERAGE-RULE-PROJECTION-01
 *
 * Canonical projection of ALL active rules from the Derrotero into a single
 * generic evaluation contract consumable by Coverage (and any future consumer).
 *
 * Design law:
 *   "A new valid active rule created in Derrotero must appear automatically
 *    in Coverage without modifying code."
 *
 * This module is PURE — no DB, no Prisma, no server-only, no side effects.
 * It projects from data already computed by the snapshot pipeline; it does
 * NOT re-evaluate or duplicate evaluation logic.
 *
 * Three rule families coexist in one projection:
 *   TEXTILE_STRUCTURE — CS (grupo+subgrupo) and LK (subgrupo): 8/10/12 units
 *   ACCESSORY_SIZE   — ACC by sizeClass: target=min=ideal, no max
 *   SPECIAL_PRODUCT   — per-store unit targets for special patterns
 */

import type { UnitsRuleStatus } from "../derrotero-semantics";
import type { SpecialRuleStatus, SpecialRuleEvaluation } from "./store-unit-coverage-engine";
import type { SnapshotCoverageStructure, SnapshotStoreCoverage } from "./store-snapshot-pipeline";

// ═════════════════════════════════════════════════════════════════════════════
// Rule identity
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Deterministic, stable rule identity. Survives refresh, inventory changes,
 * presentation, and filters. Format:
 *
 *   TEXTILE_STRUCTURE: "STRUCT:{structureKey}"     e.g. "STRUCT:CS|CS NIÑA BEBE|Blusas"
 *   ACCESSORY_SIZE:    "STRUCT:{structureKey}"     e.g. "STRUCT:ACC|Pequeño"
 *   SPECIAL_PRODUCT:   "SPECIAL:{storeId}:{pattern}" e.g. "SPECIAL:gran_plaza:BAÑERA"
 *
 * If a Derrotero assigns a persistent ruleId in the future, that takes
 * precedence over these deterministic IDs.
 */
export function buildStructureRuleId(structureKey: string): string {
  return `STRUCT:${structureKey}`;
}

export function buildSpecialRuleId(storeId: string, pattern: string): string {
  return `SPECIAL:${storeId}:${pattern}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Rule type discriminator
// ═════════════════════════════════════════════════════════════════════════════

export type CoverageRuleType =
  | "TEXTILE_STRUCTURE"
  | "ACCESSORY_SIZE"
  | "SPECIAL_PRODUCT";

// ═════════════════════════════════════════════════════════════════════════════
// Unified evaluation status
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Unified status across all rule types:
 *
 *   SIN_COBERTURA          — 0 refs with stock (textile/ACC only)
 *   BAJO_MINIMO            — has refs but total units < min
 *   DENTRO_DE_RANGO        — min <= total units <= max
 *   SOBRE_MAXIMO           — total units > max (still "healthy" for KPI)
 *   CUMPLIDA               — special: units === ideal
 *   FALTANTE               — special: units < ideal
 *   EXCEDENTE              — special: units > ideal, ideal > 0
 *   NO_AUTORIZADA          — special: ideal === 0 and units > 0
 */
export type CoverageRuleStatus =
  | "SIN_COBERTURA"
  | "BAJO_MINIMO"
  | "DENTRO_DE_RANGO"
  | "SOBRE_MAXIMO"
  | "CUMPLIDA"
  | "FALTANTE"
  | "EXCEDENTE"
  | "NO_AUTORIZADA";

// ═════════════════════════════════════════════════════════════════════════════
// CoverageRuleEvaluation — the canonical projection contract
// ═════════════════════════════════════════════════════════════════════════════

export interface CoverageRuleEvaluation {
  /** Stable deterministic identity (see buildStructureRuleId / buildSpecialRuleId). */
  readonly ruleId: string;
  /** Discriminator: determines which dimensions are meaningful. */
  readonly ruleType: CoverageRuleType;
  /** Human-readable label for the rule. */
  readonly label: string;

  // ── Thresholds ──
  readonly minimum: number;
  readonly ideal: number;
  /** null for ACC (no cap) and specials. */
  readonly maximum: number | null;

  // ── Measured values ──
  readonly actualUnits: number;

  // ── Evaluated status ──
  readonly status: CoverageRuleStatus;
  /** Units deficit to ideal (0 if at/above ideal). */
  readonly gapToIdeal: number;

  // ── Trazability ──
  /** Where the thresholds come from. */
  readonly source: "PACK_DEFAULT" | "POLICY_OVERRIDE" | "POLICY_ADD" | "SPECIAL_POLICY";
  /** Priority for ordering within same hierarchy level. */
  readonly priority: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// Projection builders — from existing snapshot data, NO re-evaluation
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Map a UnitsRuleStatus + structural status to the unified CoverageRuleStatus.
 */
function mapStructureStatus(
  structuralStatus: "CUBIERTA" | "SIN_COBERTURA",
  unitStatus: UnitsRuleStatus,
): CoverageRuleStatus {
  if (structuralStatus === "SIN_COBERTURA") return "SIN_COBERTURA";
  switch (unitStatus) {
    case "BELOW_MINIMUM": return "BAJO_MINIMO";
    case "WITHIN_RANGE": return "DENTRO_DE_RANGO";
    case "OVER_MAXIMUM": return "SOBRE_MAXIMO";
  }
}

/**
 * Resolve the CoverageRuleType from line and structureKey.
 */
function resolveRuleType(structureKey: string): CoverageRuleType {
  if (structureKey.startsWith("ACC|")) return "ACCESSORY_SIZE";
  return "TEXTILE_STRUCTURE";
}

/**
 * Project a SnapshotCoverageStructure into a CoverageRuleEvaluation.
 * Pure transformation — no re-evaluation.
 */
function projectStructure(s: SnapshotCoverageStructure): CoverageRuleEvaluation {
  return {
    ruleId: buildStructureRuleId(s.structureKey),
    ruleType: resolveRuleType(s.structureKey),
    label: s.label,

    minimum: s.rule.minUnits,
    ideal: s.rule.idealUnits,
    maximum: s.rule.maxUnits,

    actualUnits: s.totalUnits,

    status: mapStructureStatus(s.structuralCoverageStatus, s.unitRule.status),
    gapToIdeal: s.unitRule.deficitToIdeal,

    source: s.rule.source as "PACK_DEFAULT" | "POLICY_OVERRIDE" | "POLICY_ADD",
    priority: s.priority,
  };
}

/**
 * Map SpecialRuleStatus to CoverageRuleStatus.
 */
function mapSpecialStatus(status: SpecialRuleStatus): CoverageRuleStatus {
  switch (status) {
    case "CUMPLIDA": return "CUMPLIDA";
    case "FALTANTE": return "FALTANTE";
    case "EXCEDENTE": return "EXCEDENTE";
    case "NO_AUTORIZADA": return "NO_AUTORIZADA";
  }
}

/**
 * Project a SpecialRuleEvaluation into a CoverageRuleEvaluation.
 * Pure transformation — no re-evaluation.
 */
function projectSpecialRule(
  sr: SpecialRuleEvaluation,
  priority: number,
): CoverageRuleEvaluation {
  return {
    ruleId: buildSpecialRuleId(sr.storeId, sr.pattern),
    ruleType: "SPECIAL_PRODUCT",
    label: sr.label,

    minimum: sr.idealUnits,
    ideal: sr.idealUnits,
    maximum: null,

    actualUnits: sr.totalUnits,

    status: mapSpecialStatus(sr.status),
    gapToIdeal: sr.status === "FALTANTE" ? sr.gapUnits : 0,

    source: "SPECIAL_POLICY",
    priority,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Main projection function
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build the canonical rule projection from a store's coverage data.
 *
 * Combines structures (46 today) + special rules (3 today) into a single
 * ordered array of CoverageRuleEvaluation.
 *
 * Order: structures by priority, then specials by severity/gap (already sorted
 * by evaluateSpecialRules).
 *
 * This is a PURE projection — all evaluation has already been done by the
 * snapshot pipeline. No DB, no side effects, no re-computation.
 */
export function buildCoverageRuleProjection(
  coverage: SnapshotStoreCoverage,
): readonly CoverageRuleEvaluation[] {
  const structureProjections = coverage.structures.map(projectStructure);
  const specialProjections = coverage.specialRules.map((sr, i) =>
    projectSpecialRule(sr, 1000 + i),
  );
  return [...structureProjections, ...specialProjections];
}
