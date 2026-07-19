// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 4 — Constraint Engine
// Builds, validates, and applies simulation constraints.
// NEVER executes. NEVER modifies data.

import type { SimulationConstraint, SimulationImpactLevel } from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { generateConstraintId } from "./strategic-simulation-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildConstraint(params: {
  label:        string;
  description:  string;
  domain:       StrategicDomain;
  type:         "HARD" | "SOFT";
  origin:       SimulationConstraint["origin"];
  impact:       SimulationImpactLevel;
  isViolated?:  boolean;
  metadata?:    Record<string, unknown>;
}): SimulationConstraint {
  return {
    id:          generateConstraintId(),
    label:       params.label,
    description: params.description,
    domain:      params.domain,
    type:        params.type,
    origin:      params.origin,
    impact:      params.impact,
    isViolated:  params.isViolated ?? false,
    metadata:    params.metadata ?? {},
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ConstraintValidationResult {
  readonly valid:          boolean;
  readonly hardViolations: SimulationConstraint[];
  readonly softViolations: SimulationConstraint[];
  readonly warnings:       string[];
}

export function validateConstraint(c: SimulationConstraint): { valid: boolean; error?: string } {
  if (!c.label || c.label.trim().length === 0) return { valid: false, error: "Constraint label required" };
  if (c.type === "HARD" && c.isViolated) return { valid: false, error: `Hard constraint violated: "${c.label}"` };
  return { valid: true };
}

export function validateConstraints(constraints: SimulationConstraint[]): ConstraintValidationResult {
  const hardViolations = constraints.filter((c) => c.type === "HARD" && c.isViolated);
  const softViolations = constraints.filter((c) => c.type === "SOFT" && c.isViolated);
  const warnings: string[] = [];

  if (softViolations.length > 0) {
    warnings.push(`${softViolations.length} soft constraint(s) violated — simulation may be unrealistic`);
  }

  return {
    valid:          hardViolations.length === 0,
    hardViolations,
    softViolations,
    warnings,
  };
}

// ── Constraint application ────────────────────────────────────────────────────

export interface ConstraintApplicationResult {
  readonly feasible:       boolean;
  readonly adjustedValue:  number;
  readonly appliedConstraints: SimulationConstraint[];
  readonly violations:     string[];
}

export function applyConstraint(
  value: number,
  constraint: SimulationConstraint,
  min: number,
  max: number
): ConstraintApplicationResult {
  const violations: string[] = [];
  let adjusted = value;

  if (constraint.isViolated && constraint.type === "HARD") {
    violations.push(`Hard constraint "${constraint.label}" violated`);
    return { feasible: false, adjustedValue: adjusted, appliedConstraints: [constraint], violations };
  }

  // Clamp to bounds
  adjusted = Math.min(max, Math.max(min, adjusted));

  return {
    feasible:            true,
    adjustedValue:       adjusted,
    appliedConstraints:  [constraint],
    violations,
  };
}

// ── Aggregate helpers ─────────────────────────────────────────────────────────

export function hasHardViolations(constraints: SimulationConstraint[]): boolean {
  return constraints.some((c) => c.type === "HARD" && c.isViolated);
}

export function buildDefaultConstraints(domain: StrategicDomain): SimulationConstraint[] {
  return [
    buildConstraint({
      label:       "Restricción de liquidez mínima",
      description: "La organización debe mantener liquidez positiva durante el horizonte simulado.",
      domain,
      type:        "HARD",
      origin:      "FINANCIAL",
      impact:      "CRITICAL",
      isViolated:  false,
    }),
    buildConstraint({
      label:       "Cumplimiento normativo",
      description: "Todas las acciones simuladas deben cumplir con el marco regulatorio vigente.",
      domain,
      type:        "HARD",
      origin:      "REGULATORY",
      impact:      "CRITICAL",
      isViolated:  false,
    }),
  ];
}
