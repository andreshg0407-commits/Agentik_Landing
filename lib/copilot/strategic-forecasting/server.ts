// AGENTIK-STRATEGIC-FORECASTING-01 — Server barrel (server-only)
import "server-only";

// Types
export * from "./strategic-forecasting-types";

// Identity
export * from "./strategic-forecasting-identity";

// Core engines
export * from "./trend-engine";
export * from "./signal-engine";
export * from "./trajectory-engine";
export * from "./forecast-risk-engine";
export * from "./forecast-opportunity-engine";
export * from "./forecast-scenario-engine";
export * from "./forecast-confidence-engine";
export * from "./forecast-assumption-engine";
export * from "./forecast-narrative-engine";
export * from "./forecast-digest-engine";
export * from "./forecast-briefing-engine";
export * from "./strategic-forecasting-engine";

// Integrations
export * from "./integrations/forecasting-strategic-memory";
export * from "./integrations/forecasting-learning";
export * from "./integrations/forecasting-executive-brain";
export * from "./integrations/forecasting-advisor";
export * from "./integrations/forecasting-simulations";
export * from "./integrations/forecasting-planning";
export * from "./integrations/forecasting-executive-council";
export * from "./integrations/forecasting-board-intelligence";
export * from "./integrations/forecasting-memory-graph";
export * from "./integrations/forecasting-cross-module";
export * from "./integrations/forecasting-tenant-profile";
export * from "./integrations/forecasting-playbooks";
export * from "./integrations/forecasting-compliance";
export * from "./integrations/forecasting-audit";

// Query — explicit exports to avoid name collisions
export {
  getForecasts,
  getForecast,
  getLatestForecast,
  getForecastsByStatus,
  getForecastsByHorizon,
  sortForecastsByScore,
  getForecastStats,
  filterForecastsByConfidence,
} from "./strategic-forecasting-query";
export type { ForecastStats } from "./strategic-forecasting-query";

// Repository
export * from "./strategic-forecasting-repository";
export * from "./persistence/prisma-strategic-forecasting-repository";

// Dashboard (client-safe, re-exported for server convenience)
export * from "./strategic-forecasting-dashboard-contract";

// Health + Readiness
export * from "./strategic-forecasting-health";
export * from "./strategic-forecasting-readiness";

// Horizon models + Enterprise engines
export * from "./forecast-horizon-models";
export * from "./enterprise-trajectory-engine";
export * from "./future-signals-engine";

// Canonical
export * from "./strategic-forecasting-canonical";
