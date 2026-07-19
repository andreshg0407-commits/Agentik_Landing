/**
 * lib/copilot/david/index.ts
 *
 * David Commercial Copilot — Public API
 *
 * Sprint: AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01
 */

export { buildDavidCommercialSummary, serializeDavidSummary } from "./david-summary";
export type { DavidCommercialSummary, DavidSummarySerial }   from "./david-summary";
export type {
  DavidSignal,
  DavidSignalType,
  DavidSeverity,
  DavidDataState,
  DavidCriticalRef,
  DavidProductionSuggestion,
  DavidKpis,
} from "./david-types";
