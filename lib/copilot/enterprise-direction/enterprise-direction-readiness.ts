// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 39: Readiness System

export type DirectionReadinessLevel =
  | "FULL"
  | "PARTIAL"
  | "MINIMUM"
  | "NOT_READY";

export interface DirectionReadinessInputs {
  readonly orgSlug:            string;
  readonly hasNorthStar:       boolean;
  readonly hasObjectives:      boolean;
  readonly hasPriorities:      boolean;
  readonly hasInitiatives:     boolean;
  readonly hasDeviationData:   boolean;
  readonly hasConflictData:    boolean;
  readonly hasSignalData:      boolean;
  readonly hasMemoryData:      boolean;
  readonly hasLearningData:    boolean;
  readonly hasForecastData:    boolean;
}

export interface DirectionReadinessResult {
  readonly orgSlug:    string;
  readonly level:      DirectionReadinessLevel;
  readonly isReady:    boolean;
  readonly score:      number; // 0–1
  readonly missing:    string[];
  readonly available:  string[];
}

export function checkDirectionReadiness(
  inputs: DirectionReadinessInputs
): DirectionReadinessResult {
  try {
    // Minimum requirement: hasNorthStar && hasObjectives
    const minimumMet = inputs.hasNorthStar && inputs.hasObjectives;

    const checks: Array<[boolean, string]> = [
      [inputs.hasNorthStar,     "north_star"],
      [inputs.hasObjectives,    "objectives"],
      [inputs.hasPriorities,    "priorities"],
      [inputs.hasInitiatives,   "initiatives"],
      [inputs.hasDeviationData, "deviations"],
      [inputs.hasConflictData,  "conflicts"],
      [inputs.hasSignalData,    "signals"],
      [inputs.hasMemoryData,    "memory"],
      [inputs.hasLearningData,  "learning"],
      [inputs.hasForecastData,  "forecasting"],
    ];

    const available = checks.filter(([v]) => v).map(([, k]) => k);
    const missing   = checks.filter(([v]) => !v).map(([, k]) => k);
    const score     = available.length / checks.length;

    let level: DirectionReadinessLevel;
    if (!minimumMet)     level = "NOT_READY";
    else if (score < 0.50) level = "MINIMUM";
    else if (score < 0.80) level = "PARTIAL";
    else                   level = "FULL";

    return {
      orgSlug:   inputs.orgSlug,
      level,
      isReady:   minimumMet,
      score,
      missing,
      available,
    };
  } catch {
    return {
      orgSlug:   inputs.orgSlug,
      level:     "NOT_READY",
      isReady:   false,
      score:     0,
      missing:   ["north_star", "objectives"],
      available: [],
    };
  }
}
