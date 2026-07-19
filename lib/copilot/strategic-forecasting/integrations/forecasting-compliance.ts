// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 27: Compliance Integration

export interface ForecastComplianceCheck {
  readonly name:    string;
  readonly passed:  boolean;
  readonly message: string;
}

export interface ForecastComplianceResult {
  readonly orgSlug:     string;
  readonly passed:      boolean;
  readonly checkCount:  number;
  readonly failures:    ForecastComplianceCheck[];
  readonly warnings:    ForecastComplianceCheck[];
}

export function runForecastComplianceChecks(
  orgSlug: string,
  forecastOrgSlug: string,
  suggestedOnly: boolean,
  hasConfidence: boolean,
  hasScenarios: boolean,
  hasLimitations: boolean,
  hasAssumptions: boolean,
  hasEvidence: boolean,
  isProbabilistic: boolean,
  hasNarrative: boolean,
  hasForecastScore: boolean
): ForecastComplianceResult {
  const checks: ForecastComplianceCheck[] = [];
  const failures: ForecastComplianceCheck[] = [];
  const warnings: ForecastComplianceCheck[] = [];

  function check(name: string, condition: boolean, message: string, isWarning = false) {
    const result = { name, passed: condition, message };
    checks.push(result);
    if (!condition) {
      if (isWarning) warnings.push(result);
      else failures.push(result);
    }
  }

  check("TENANT_ISOLATION",    orgSlug === forecastOrgSlug,  "orgSlug mismatch — tenant isolation violated");
  check("SUGGESTED_ONLY",      suggestedOnly === true,        "Forecast must have suggestedOnly: true");
  check("HAS_CONFIDENCE",      hasConfidence,                 "Forecast must include confidence metadata");
  check("HAS_SCENARIOS",       hasScenarios,                  "Forecast must include at least one scenario");
  check("HAS_LIMITATIONS",     hasLimitations,                "Forecast must declare limitations");
  check("HAS_ASSUMPTIONS",     hasAssumptions,                "Forecast must declare assumptions", true);
  check("HAS_EVIDENCE",        hasEvidence,                   "Forecast should include evidence references", true);
  check("IS_PROBABILISTIC",    isProbabilistic,               "Forecast must use probabilistic language");
  check("HAS_NARRATIVE",       hasNarrative,                  "Forecast must include narrative");
  check("HAS_FORECAST_SCORE",  hasForecastScore,              "Forecast must include a score");

  return {
    orgSlug,
    passed:     failures.length === 0,
    checkCount: checks.length,
    failures,
    warnings,
  };
}

export function assertForecastTenantIsolation(orgSlug: string, forecastOrgSlug: string): void {
  if (orgSlug !== forecastOrgSlug) {
    throw new Error(
      `[FORECASTING COMPLIANCE] Tenant isolation violated: expected ${orgSlug}, got ${forecastOrgSlug}`
    );
  }
}
