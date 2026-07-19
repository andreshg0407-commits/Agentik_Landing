// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 1: Domain Type Contracts
// Multi-tenant, fail-closed, probabilistic only. Never assert absolute predictions.

// ─── Enumerations ────────────────────────────────────────────────────────────

export type ForecastOutcome =
  | "LIKELY"
  | "POSSIBLE"
  | "UNCERTAIN"
  | "UNLIKELY";

export type ForecastHorizon =
  | "SHORT_TERM"   // ≤30 days
  | "MEDIUM_TERM"  // 31–180 days
  | "LONG_TERM";   // 181+ days

export type ForecastConfidenceLevel =
  | "VERY_HIGH"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT";

export type ForecastSignalType =
  | "LEADING"
  | "LAGGING"
  | "COINCIDENT"
  | "WEAK_SIGNAL"
  | "CONFIRMED";

export type ForecastTrendDirection =
  | "ACCELERATING"
  | "GROWING"
  | "STABLE"
  | "DECLINING"
  | "REVERSING"
  | "EMERGING";

export type ForecastScenarioType =
  | "BEST_CASE"
  | "EXPECTED_CASE"
  | "WORST_CASE"
  | "STRETCH_CASE"
  | "BLACK_SWAN_CANDIDATE";

export type ForecastDomain =
  | "FINANCIAL"
  | "COMMERCIAL"
  | "OPERATIONAL"
  | "STRATEGIC"
  | "GOVERNANCE"
  | "TECHNOLOGY"
  | "MARKET"
  | "REGULATORY"
  | "TALENT"
  | "RISK"
  | "CROSS_DOMAIN";

export type ForecastStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";

export type ForecastPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ForecastHealth = "HEALTHY" | "DEGRADED" | "CRITICAL" | "EMPTY";

// ─── Core value objects ───────────────────────────────────────────────────────

export interface ForecastEvidence {
  readonly id:          string;
  readonly description: string;
  readonly sourceModule: string;
  readonly strength:    "STRONG" | "MODERATE" | "WEAK";
  readonly dataPoints:  number;
  readonly asOfDate:    string;
}

export interface ForecastConfidence {
  readonly level:          ForecastConfidenceLevel;
  readonly score:          number; // 0–1
  readonly evidenceCount:  number;
  readonly limitations:    string[];
  readonly rationale:      string;
}

export interface ForecastAssumption {
  readonly id:          string;
  readonly description: string;
  readonly domain:      ForecastDomain;
  readonly criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  readonly validated:   boolean;
  readonly risk:        string; // what breaks if assumption is wrong
}

// ─── Trend ───────────────────────────────────────────────────────────────────

export interface ForecastTrend {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly title:       string;
  readonly description: string;
  readonly domain:      ForecastDomain;
  readonly direction:   ForecastTrendDirection;
  readonly strength:    number; // 0–1
  readonly horizon:     ForecastHorizon;
  readonly evidenceIds: string[];
  readonly drivers:     string[];
  readonly risks:       string[];
  readonly isEmergent:  boolean;
  readonly createdAt:   string;
}

// ─── Signal ───────────────────────────────────────────────────────────────────

export interface ForecastSignal {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly title:       string;
  readonly description: string;
  readonly domain:      ForecastDomain;
  readonly type:        ForecastSignalType;
  readonly intensity:   number; // 0–1
  readonly horizon:     ForecastHorizon;
  readonly evidenceIds: string[];
  readonly isWeak:      boolean;
  readonly isConfirmed: boolean;
  readonly metadata:    Record<string, unknown>;
  readonly createdAt:   string;
}

// ─── Trajectory ───────────────────────────────────────────────────────────────

export interface ForecastTrajectory {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          ForecastDomain;
  readonly direction:       ForecastTrendDirection;
  readonly startingScore:   number; // 0–1
  readonly projectedScore:  number; // 0–1
  readonly horizon:         ForecastHorizon;
  readonly confidence:      ForecastConfidence;
  readonly keyDrivers:      string[];
  readonly barriers:        string[];
  readonly assumptions:     ForecastAssumption[];
  readonly evidenceIds:     string[];
  readonly createdAt:       string;
}

// ─── Risk & Opportunity ───────────────────────────────────────────────────────

export interface ForecastRisk {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly title:        string;
  readonly description:  string;
  readonly domain:       ForecastDomain;
  readonly likelihood:   number; // 0–1
  readonly impact:       number; // 0–1
  readonly compositeRisk: number; // 0–1
  readonly horizon:      ForecastHorizon;
  readonly mitigations:  string[];
  readonly evidenceIds:  string[];
  readonly isSystemic:   boolean;
  readonly createdAt:    string;
}

export interface ForecastOpportunity {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly description:   string;
  readonly domain:        ForecastDomain;
  readonly magnitude:     number; // 0–1
  readonly captureScore:  number; // 0–1
  readonly horizon:       ForecastHorizon;
  readonly requirements:  string[];
  readonly evidenceIds:   string[];
  readonly isTransformational: boolean;
  readonly createdAt:     string;
}

// ─── Scenario ─────────────────────────────────────────────────────────────────

export interface ForecastScenario {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly sessionId:    string;
  readonly type:         ForecastScenarioType;
  readonly title:        string;
  readonly narrative:    string;
  readonly probability:  number; // 0–1 — always probabilistic
  readonly outcome:      ForecastOutcome;
  readonly horizon:      ForecastHorizon;
  readonly domain:       ForecastDomain;
  readonly trajectories: ForecastTrajectory[];
  readonly risks:        ForecastRisk[];
  readonly opportunities: ForecastOpportunity[];
  readonly assumptions:  ForecastAssumption[];
  readonly confidence:   ForecastConfidence;
  readonly evidenceIds:  string[];
  readonly limitations:  string[];
  readonly suggestedOnly: true; // literal — never auto-executes
  readonly createdAt:    string;
}

// ─── Recommendation ───────────────────────────────────────────────────────────

export interface ForecastRecommendation {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly sessionId:    string;
  readonly title:        string;
  readonly rationale:    string;
  readonly priority:     ForecastPriority;
  readonly domain:       ForecastDomain;
  readonly horizon:      ForecastHorizon;
  readonly assumptions:  string[];
  readonly evidenceIds:  string[];
  readonly limitations:  string[];
  readonly suggestedOnly: true; // literal — never auto-executes
  readonly createdAt:    string;
}

// ─── Narrative ────────────────────────────────────────────────────────────────

export interface ForecastNarrative {
  readonly executive:   string;
  readonly scenarios:   string;
  readonly risks:       string;
  readonly opportunities: string;
  readonly assumptions: string;
  readonly horizon:     string;
  readonly limitations: string;
}

// ─── Digest & Briefing ────────────────────────────────────────────────────────

export type ForecastDigestPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type ForecastBriefingType = "CEO" | "EXECUTIVE" | "BOARD" | "RISK" | "GROWTH";

export interface ForecastDigest {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly period:      ForecastDigestPeriod;
  readonly headline:    string;
  readonly highlights:  string[];
  readonly watchItems:  string[];
  readonly scenarios:   string[];
  readonly topRisk:     string;
  readonly topOpportunity: string;
  readonly confidence:  ForecastConfidenceLevel;
  readonly limitations: string[];
  readonly createdAt:   string;
}

export interface ForecastBriefing {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly type:        ForecastBriefingType;
  readonly title:       string;
  readonly summary:     string;
  readonly keyFindings: string[];
  readonly scenarios:   string[];
  readonly risks:       string[];
  readonly opportunities: string[];
  readonly recommendations: string[];
  readonly confidence:  ForecastConfidenceLevel;
  readonly limitations: string[];
  readonly createdAt:   string;
}

// ─── Report & Session ─────────────────────────────────────────────────────────

export interface ForecastReport {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly forecastScore:   number; // 0–1
  readonly confidence:      ForecastConfidence;
  readonly scenarios:       ForecastScenario[];
  readonly risks:           ForecastRisk[];
  readonly opportunities:   ForecastOpportunity[];
  readonly trends:          ForecastTrend[];
  readonly signals:         ForecastSignal[];
  readonly trajectories:    ForecastTrajectory[];
  readonly recommendations: ForecastRecommendation[];
  readonly narrative:       ForecastNarrative;
  readonly digest:          ForecastDigest | null;
  readonly briefing:        ForecastBriefing | null;
  readonly limitations:     string[];
  readonly createdAt:       string;
}

export interface StrategicForecast {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly status:       ForecastStatus;
  readonly horizon:      ForecastHorizon;
  readonly domain:       ForecastDomain;
  readonly report:       ForecastReport;
  readonly forecastScore: number; // 0–1
  readonly confidence:   ForecastConfidence;
  readonly limitations:  string[];
  readonly metadata:     Record<string, unknown>;
  readonly createdAt:    string;
  readonly updatedAt:    string;
}

// ─── Pipeline I/O ─────────────────────────────────────────────────────────────

export interface StrategicForecastingInput {
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly horizon:    ForecastHorizon;
  readonly domain?:    ForecastDomain;
  readonly metadata?:  Record<string, unknown>;
}

export interface StrategicForecastingResult {
  readonly orgSlug:       string;
  readonly sessionId:     string;
  readonly forecast:      StrategicForecast;
  readonly report:        ForecastReport;
  readonly forecastScore: number;
  readonly confidence:    ForecastConfidence;
  readonly status:        "SUCCESS" | "PARTIAL" | "FAILED";
  readonly limitations:   string[];
  readonly errors:        string[];
  readonly createdAt:     string;
}
