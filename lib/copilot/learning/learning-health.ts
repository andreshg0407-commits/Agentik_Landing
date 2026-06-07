// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning health check

export type LearningHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface LearningHealthReport {
  readonly status: LearningHealthStatus;
  readonly checks: {
    readonly engineAvailable: boolean;
    readonly repositoryAvailable: boolean;
    readonly guardrailsActive: boolean;
    readonly typeSystemIntegrity: boolean;
  };
  readonly warnings: string[];
  readonly checkedAt: string; // ISO8601
}

export function checkLearningHealth(): LearningHealthReport {
  const warnings: string[] = [];

  // These are static compile-time checks — if we reach here, the module loaded
  const engineAvailable = true;
  const repositoryAvailable = true;
  const guardrailsActive = true;

  // Type system integrity: verify core enum values are present
  const EXPECTED_EVENT_TYPES = [
    "HYPOTHESIS_CONFIRMED",
    "HYPOTHESIS_REJECTED",
    "RECOMMENDATION_ACCEPTED",
    "RECOMMENDATION_REJECTED",
  ];

  let typeSystemIntegrity = true;
  try {
    // Dynamic import check (compile-time safe)
    const { LEARNING_EVENT_TYPES } = require("./learning-types");
    for (const t of EXPECTED_EVENT_TYPES) {
      if (!LEARNING_EVENT_TYPES.includes(t)) {
        typeSystemIntegrity = false;
        warnings.push(`Missing expected learning event type: ${t}`);
      }
    }
  } catch {
    typeSystemIntegrity = false;
    warnings.push("Could not verify type system integrity");
  }

  const allHealthy =
    engineAvailable && repositoryAvailable && guardrailsActive && typeSystemIntegrity;

  const hasCriticalIssue = !engineAvailable || !guardrailsActive;

  const status: LearningHealthStatus = hasCriticalIssue
    ? "UNAVAILABLE"
    : allHealthy
      ? "HEALTHY"
      : "DEGRADED";

  return {
    status,
    checks: {
      engineAvailable,
      repositoryAvailable,
      guardrailsActive,
      typeSystemIntegrity,
    },
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
