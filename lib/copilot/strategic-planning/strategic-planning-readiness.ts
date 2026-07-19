// AGENTIK-STRATEGIC-PLANNING-01 — Phase 30: Readiness Check

export interface PlanningReadinessReport {
  readonly orgSlug:       string;
  readonly ready:         boolean;
  readonly score:         number;   // 0–1
  readonly requirements:  PlanningReadinessRequirement[];
  readonly checkedAt:     string;
}

export interface PlanningReadinessRequirement {
  readonly name:   string;
  readonly met:    boolean;
  readonly reason: string;
}

export interface PlanningReadinessFlags {
  hasMemoryData:        boolean;
  hasLearningData:      boolean;
  hasExecutiveBrainData: boolean;
  hasAdvisorData:       boolean;
  hasSimulationData:    boolean;
  hasCrossModuleData:   boolean;
}

export function checkStrategicPlanningReadiness(
  orgSlug: string,
  flags:   PlanningReadinessFlags
): PlanningReadinessReport {
  const requirements: PlanningReadinessRequirement[] = [
    {
      name:   "STRATEGIC_MEMORY",
      met:    flags.hasMemoryData,
      reason: flags.hasMemoryData
        ? "Strategic memory data available."
        : "No strategic memory data — objectives cannot be grounded.",
    },
    {
      name:   "LEARNING_FRAMEWORK",
      met:    flags.hasLearningData,
      reason: flags.hasLearningData
        ? "Learning patterns and outcomes available."
        : "No learning data — confidence calibration degraded.",
    },
    {
      name:   "EXECUTIVE_BRAIN",
      met:    flags.hasExecutiveBrainData,
      reason: flags.hasExecutiveBrainData
        ? "Executive brain priorities available."
        : "No executive brain data — critical objectives may be missed.",
    },
    {
      name:   "STRATEGIC_ADVISOR",
      met:    flags.hasAdvisorData,
      reason: flags.hasAdvisorData
        ? "Strategic advisor recommendations available."
        : "No advisor data — initiative generation degraded.",
    },
    {
      name:   "STRATEGIC_SIMULATIONS",
      met:    flags.hasSimulationData,
      reason: flags.hasSimulationData
        ? "Simulation results available for scenario grounding."
        : "No simulation data — scenario coverage degraded.",
    },
    {
      name:   "CROSS_MODULE_REASONING",
      met:    flags.hasCrossModuleData,
      reason: flags.hasCrossModuleData
        ? "Cross-module reasoning output available."
        : "No cross-module data — hypothesis grounding degraded.",
    },
  ];

  const metCount = requirements.filter((r) => r.met).length;
  const score    = Math.round(metCount / requirements.length * 100) / 100;
  const ready    = metCount >= 3; // need at least 3 sources to produce a meaningful plan

  return {
    orgSlug,
    ready,
    score,
    requirements,
    checkedAt: new Date().toISOString(),
  };
}

export function isStrategicPlanningReady(report: PlanningReadinessReport): boolean {
  return report.ready;
}

export function buildReadinessFromFlags(
  orgSlug: string,
  flags:   Partial<PlanningReadinessFlags>
): PlanningReadinessReport {
  const fullFlags: PlanningReadinessFlags = {
    hasMemoryData:         flags.hasMemoryData        ?? false,
    hasLearningData:       flags.hasLearningData       ?? false,
    hasExecutiveBrainData: flags.hasExecutiveBrainData ?? false,
    hasAdvisorData:        flags.hasAdvisorData        ?? false,
    hasSimulationData:     flags.hasSimulationData     ?? false,
    hasCrossModuleData:    flags.hasCrossModuleData    ?? false,
  };
  return checkStrategicPlanningReadiness(orgSlug, fullFlags);
}
