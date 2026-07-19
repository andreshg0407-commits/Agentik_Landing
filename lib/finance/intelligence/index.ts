/**
 * lib/finance/intelligence/index.ts
 *
 * Barrel — public surface of the Financial Intelligence Layer.
 *
 * Primary consumers:
 *   - Diego copilot signal engine
 *   - Finanzas module pages (tesoreria, conciliacion, cierre, planeacion)
 *   - Right ops rail
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

export { getFinancialIntelligenceContext }          from "./financial-intelligence-runtime";
export { routeFinancialQuestion, routeAllQuestions } from "./financial-question-router";
export { buildDataFreshnessReport }                 from "./financial-data-freshness";
export { buildEvidenceIndex, detectMissingEvidence } from "./financial-evidence-engine";

export type {
  FinancialDataState,
  EvidenceEntry,
  EvidenceIndex,
  MissingEvidence,
  SourceFreshness,
  DataFreshnessReport,
  BusinessState,
  LiquidityState,
  ReceivablesState,
  CollectionsState,
  BankingState,
  ReconciliationState,
  CloseState,
  PlanningState,
  FinancialGraphState,
  IntelligenceFocusArea,
  FinancialIntelligenceContext,
  FinancialQuestion,
  RoutedAnswer,
} from "./financial-intelligence-types";
