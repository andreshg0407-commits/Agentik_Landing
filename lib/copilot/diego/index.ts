/**
 * lib/copilot/diego/index.ts
 * Diego CFO Copilot — Public barrel.
 */

export type {
  DiegoSignalType,
  DiegoSeverity,
  DiegoDataState,
  DiegoSignal,
  DiegoPriorityItem,
  DiegoExecutiveSummary,
  DiegoSummarySerial,
  DiegoEvidenceTraceSerial,
} from "./diego-types";

export { evaluateDiegoSignals }   from "./diego-signal-engine";
export { prioritizeDiegoSignals } from "./diego-priority-engine";
export {
  buildDiegoExecutiveSummary,
  serializeDiegoSummary,
} from "./diego-summary";
