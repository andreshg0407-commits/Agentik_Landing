// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 34: Health Check

export type ForecastHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ForecastHealthCheck {
  readonly name:    string;
  readonly passed:  boolean;
  readonly message: string;
}

export interface ForecastHealthResult {
  readonly status:     ForecastHealthStatus;
  readonly checkCount: number;
  readonly passed:     number;
  readonly failed:     number;
  readonly checks:     ForecastHealthCheck[];
  readonly checkedAt:  string;
}

export interface ForecastHealthInputs {
  readonly hasTypes:            boolean;
  readonly hasIdentity:         boolean;
  readonly hasTrendEngine:      boolean;
  readonly hasSignalEngine:     boolean;
  readonly hasTrajectoryEngine: boolean;
  readonly hasRiskEngine:       boolean;
  readonly hasOpportunityEngine: boolean;
  readonly hasScenarioEngine:   boolean;
  readonly hasConfidenceEngine: boolean;
  readonly hasAssumptionEngine: boolean;
  readonly hasNarrativeEngine:  boolean;
  readonly hasMainEngine:       boolean;
  readonly hasPrismaModels:     boolean;
  readonly hasDashboardContract: boolean;
}

export function checkStrategicForecastingHealth(
  inputs: ForecastHealthInputs
): ForecastHealthResult {
  const checks: ForecastHealthCheck[] = [];

  function check(name: string, condition: boolean, message: string) {
    checks.push({ name, passed: condition, message });
  }

  check("TYPES",             inputs.hasTypes,             "strategic-forecasting-types.ts loaded");
  check("IDENTITY",          inputs.hasIdentity,          "strategic-forecasting-identity.ts loaded");
  check("TREND_ENGINE",      inputs.hasTrendEngine,       "trend-engine.ts loaded");
  check("SIGNAL_ENGINE",     inputs.hasSignalEngine,      "signal-engine.ts loaded");
  check("TRAJECTORY_ENGINE", inputs.hasTrajectoryEngine,  "trajectory-engine.ts loaded");
  check("RISK_ENGINE",       inputs.hasRiskEngine,        "forecast-risk-engine.ts loaded");
  check("OPP_ENGINE",        inputs.hasOpportunityEngine, "forecast-opportunity-engine.ts loaded");
  check("SCENARIO_ENGINE",   inputs.hasScenarioEngine,    "forecast-scenario-engine.ts loaded");
  check("CONFIDENCE_ENGINE", inputs.hasConfidenceEngine,  "forecast-confidence-engine.ts loaded");
  check("ASSUMPTION_ENGINE", inputs.hasAssumptionEngine,  "forecast-assumption-engine.ts loaded");
  check("NARRATIVE_ENGINE",  inputs.hasNarrativeEngine,   "forecast-narrative-engine.ts loaded");
  check("MAIN_ENGINE",       inputs.hasMainEngine,        "strategic-forecasting-engine.ts loaded");
  check("PRISMA_MODELS",     inputs.hasPrismaModels,      "5 Prisma models registered");
  check("DASHBOARD_CONTRACT", inputs.hasDashboardContract, "strategic-forecasting-dashboard-contract.ts loaded");

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;

  const status: ForecastHealthStatus =
    failed === 0            ? "HEALTHY"   :
    passed >= checks.length * 0.7 ? "DEGRADED" :
    "UNAVAILABLE";

  return {
    status,
    checkCount: checks.length,
    passed,
    failed,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export function buildDefaultForecastingHealthInputs(): ForecastHealthInputs {
  return {
    hasTypes:             true,
    hasIdentity:          true,
    hasTrendEngine:       true,
    hasSignalEngine:      true,
    hasTrajectoryEngine:  true,
    hasRiskEngine:        true,
    hasOpportunityEngine: true,
    hasScenarioEngine:    true,
    hasConfidenceEngine:  true,
    hasAssumptionEngine:  true,
    hasNarrativeEngine:   true,
    hasMainEngine:        true,
    hasPrismaModels:      true,
    hasDashboardContract: true,
  };
}
