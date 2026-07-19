// AGENTIK-STRATEGIC-FORECASTING-01 — Client-safe barrel
// NO server-only import — safe for client components

// Types only
export type {
  StrategicForecast,
  StrategicForecastingInput,
  StrategicForecastingResult,
  ForecastScenario,
  ForecastTrend,
  ForecastSignal,
  ForecastTrajectory,
  ForecastRisk,
  ForecastOpportunity,
  ForecastRecommendation,
  ForecastReport,
  ForecastDigest,
  ForecastBriefing,
  ForecastNarrative,
  ForecastEvidence,
  ForecastConfidence,
  ForecastAssumption,
  ForecastOutcome,
  ForecastHorizon,
  ForecastConfidenceLevel,
  ForecastSignalType,
  ForecastTrendDirection,
  ForecastScenarioType,
  ForecastDomain,
  ForecastStatus,
  ForecastPriority,
  ForecastHealth,
  ForecastDigestPeriod,
  ForecastBriefingType,
} from "./strategic-forecasting-types";

// Dashboard contract (client-safe)
export {
  buildStrategicForecastingDashboard,
} from "./strategic-forecasting-dashboard-contract";
export type { StrategicForecastingDashboard } from "./strategic-forecasting-dashboard-contract";

// Canonical (client-safe constants)
export * from "./strategic-forecasting-canonical";
