/**
 * index.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Client-safe barrel export for the Executive Control Center.
 *
 * No Prisma. No server-only. Pure domain types.
 */

// Types
export type {
  BusinessHealthLevel,
  SignalCategorySummary,
  ExecutiveTimelineEntry,
  ExecutiveKpiCard,
  RuleSummaryCard,
  PlanSummaryCard,
  DecisionSummaryCard,
  ActionSummaryCard,
  BusinessTraceChain,
  ExecutiveDashboardState,
} from "./dashboard-types";

// Pipeline
export {
  mapSignalsToSummaries,
  mapEventsToTimeline,
  mapSignalsToTimeline,
  mapRulesToCards,
  mapPlansToCards,
  mapDecisionsToCards,
  mapActionsToCards,
  deriveHealthLevel,
  buildTraceChain,
  assembleDashboardState,
} from "./dashboard-pipeline";

// Sections
export type { DashboardSectionId, DashboardSection } from "./dashboard-sections";
export { DASHBOARD_SECTIONS } from "./dashboard-sections";

// Widgets
export {
  severityColor,
  healthColor,
  entryTypeLabel,
  actionStatusLabel,
  approvalStatusLabel,
} from "./dashboard-widgets";

// Timeline
export type { DailyHighlight } from "./dashboard-timeline";
export { buildDailyHighlights } from "./dashboard-timeline";

// Insights
export type { ExecutiveQuestion } from "./dashboard-insights";
export { buildExecutiveQuestions } from "./dashboard-insights";

// Utils
export {
  timelineByType,
  timelineBySeverity,
  totalActiveSignals,
  totalCriticalSignals,
  actionsPendingApproval,
  healthSummary,
  hasActionableItems,
} from "./dashboard-utils";

// ── Castillitos Executive Intelligence (INTEGRATION-02) ─────────────────────

export type {
  CastillitosExecutiveIntelligence,
  VendorExecutiveSummary,
  VendorSummaryRow,
  ExecutiveDataQuality,
  DataSourceStatus,
  ExecutiveAlert,
  CeoExecutiveQuestion,
} from "./castillitos-executive-types";

export {
  assembleCastillitosExecutiveIntelligence,
  buildExecutiveAlerts,
  buildCeoExecutiveQuestions,
} from "./castillitos-executive-builder";
