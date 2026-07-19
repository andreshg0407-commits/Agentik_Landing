// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 3 — Assumption Engine
// Builds, validates, scores, and ranks simulation assumptions.
// NEVER executes. NEVER modifies data.

import type { SimulationAssumption, SimulationConfidence, SimulationHorizon } from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { simulationConfidenceFromScore } from "./strategic-simulation-types";
import { generateAssumptionId } from "./strategic-simulation-identity";

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildAssumption(
  params: {
    label:       string;
    description: string;
    domain:      StrategicDomain;
    confidenceScore: number;
    isKeyAssumption?: boolean;
    validUntil?:  SimulationHorizon;
    source?:     SimulationAssumption["source"];
    metadata?:   Record<string, unknown>;
  }
): SimulationAssumption {
  return {
    id:             generateAssumptionId(),
    label:          params.label,
    description:    params.description,
    domain:         params.domain,
    confidence:     simulationConfidenceFromScore(params.confidenceScore),
    confidenceScore: Math.min(1, Math.max(0, params.confidenceScore)),
    isKeyAssumption: params.isKeyAssumption ?? false,
    validUntil:     params.validUntil ?? "MEDIUM_TERM",
    source:         params.source ?? "INFERRED",
    metadata:       params.metadata ?? {},
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface AssumptionValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateAssumption(a: SimulationAssumption): AssumptionValidationResult {
  const warnings: string[] = [];
  const errors:   string[] = [];

  if (!a.label || a.label.trim().length === 0) errors.push("Assumption label is required");
  if (a.confidenceScore < 0 || a.confidenceScore > 1) errors.push("confidenceScore must be in [0,1]");
  if (a.confidenceScore < 0.3) warnings.push(`Low confidence assumption: "${a.label}" — may undermine simulation reliability`);
  if (a.isKeyAssumption && a.confidenceScore < 0.5) warnings.push(`Key assumption "${a.label}" has low confidence — simulation conclusions are fragile`);

  return { valid: errors.length === 0, warnings, errors };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreAssumption(a: SimulationAssumption): number {
  let score = a.confidenceScore;
  if (a.source === "HISTORICAL") score = Math.min(1, score + 0.10);
  if (a.source === "MARKET")     score = Math.min(1, score + 0.05);
  if (a.source === "INFERRED")   score = Math.max(0, score - 0.05);
  if (!a.isKeyAssumption)        score = Math.max(0, score - 0.02);
  return Math.round(score * 100) / 100;
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export function rankAssumptions(assumptions: SimulationAssumption[]): SimulationAssumption[] {
  return [...assumptions].sort((a, b) => {
    const aScore = scoreAssumption(a);
    const bScore = scoreAssumption(b);
    if (a.isKeyAssumption !== b.isKeyAssumption) return a.isKeyAssumption ? -1 : 1;
    return bScore - aScore;
  });
}

// ── Aggregate helpers ─────────────────────────────────────────────────────────

export function aggregateAssumptionConfidence(assumptions: SimulationAssumption[]): number {
  if (assumptions.length === 0) return 0;
  const key = assumptions.filter((a) => a.isKeyAssumption);
  const all  = assumptions;

  const keyScore = key.length > 0
    ? key.reduce((s, a) => s + a.confidenceScore, 0) / key.length
    : 1;
  const allScore = all.reduce((s, a) => s + a.confidenceScore, 0) / all.length;

  return Math.round((keyScore * 0.7 + allScore * 0.3) * 100) / 100;
}

export function getKeyAssumptions(assumptions: SimulationAssumption[]): SimulationAssumption[] {
  return assumptions.filter((a) => a.isKeyAssumption);
}

export function buildDefaultAssumptions(domain: StrategicDomain): SimulationAssumption[] {
  const defaults: Array<{ label: string; description: string; confidenceScore: number; isKey: boolean }> = [
    { label: "Condiciones de mercado estables", description: "No se anticipan cambios estructurales en el mercado durante el horizonte de simulación.", confidenceScore: 0.6, isKey: false },
    { label: "Capacidad operacional sin cambios críticos", description: "La organización mantiene su estructura operacional actual durante la simulación.", confidenceScore: 0.7, isKey: true },
    { label: "Datos históricos son representativos", description: "Los datos históricos disponibles reflejan adecuadamente el comportamiento esperado.", confidenceScore: 0.65, isKey: true },
  ];

  return defaults.map((d) =>
    buildAssumption({ label: d.label, description: d.description, domain, confidenceScore: d.confidenceScore, isKeyAssumption: d.isKey, source: "INFERRED" })
  );
}
