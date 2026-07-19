// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 31 — Simulation Readiness Check

export interface SimulationReadinessResult {
  readonly ready:       boolean;
  readonly score:       number;   // 0–1
  readonly blockers:    string[];
  readonly warnings:    string[];
  readonly checkedAt:   string;
}

export interface SimulationReadinessInput {
  readonly hasStrategicMemory:   boolean;
  readonly hasLearningData:      boolean;
  readonly hasSignals:           boolean;
  readonly hasExecutiveBrain:    boolean;
  readonly orgSlug:              string;
}

// ── Readiness check ───────────────────────────────────────────────────────────

export function checkSimulationReadiness(input: SimulationReadinessInput): SimulationReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.orgSlug || input.orgSlug.trim().length === 0) {
    blockers.push("orgSlug is required");
  }

  // No hard blockers beyond orgSlug — simulations work with defaults
  if (!input.hasStrategicMemory) warnings.push("No strategic memory — assumptions built from defaults");
  if (!input.hasLearningData)    warnings.push("No learning data — pattern-based assumptions unavailable");
  if (!input.hasSignals)         warnings.push("No cross-module signals — risk projection from signals disabled");
  if (!input.hasExecutiveBrain)  warnings.push("No executive brain context — executive constraints unavailable");

  const dataCount = [input.hasStrategicMemory, input.hasLearningData, input.hasSignals, input.hasExecutiveBrain]
    .filter(Boolean).length;
  const score = Math.round((0.40 + dataCount * 0.15) * 100) / 100;

  return {
    ready:     blockers.length === 0,
    score:     Math.min(1, score),
    blockers,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

export function isSimulationReady(input: SimulationReadinessInput): boolean {
  return checkSimulationReadiness(input).ready;
}

export function buildSimulationReadinessFromFlags(orgSlug: string): SimulationReadinessInput {
  return {
    orgSlug,
    hasStrategicMemory:  false,
    hasLearningData:     false,
    hasSignals:          false,
    hasExecutiveBrain:   false,
  };
}
