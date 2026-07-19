/**
 * lib/integrations/sag/executive-pack/export/index.ts
 *
 * SAG Executive Pack Export — Barrel Export
 *
 * Central import point for all export-layer utilities.
 *
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

// ── Executive Summary Export ───────────────────────────────────────────────────
export {
  exportExecutiveSummaryMarkdown,
  exportExecutiveSummaryText,
  exportExecutiveSummaryPdfReady,
  validateExecutiveSummary,
  EXECUTIVE_SUMMARY_META,
} from "./executive-summary-export";
export type {
  PdfReadyDocument,
  PdfReadySection,
  ExecutiveSummaryValidationResult,
} from "./executive-summary-export";

// ── View Request Export ────────────────────────────────────────────────────────
export {
  exportViewRequestMarkdown,
  exportViewRequestText,
  exportViewRequestPdfReady,
  exportSingleViewMarkdown,
  exportSingleViewText,
  exportSingleViewPdfReady,
} from "./view-request-export";
export type {
  PdfReadyView,
  PdfReadyViewColumn,
} from "./view-request-export";

// ── Open Questions Export ──────────────────────────────────────────────────────
export {
  exportOpenQuestionsMarkdown,
  exportOpenQuestionsText,
  exportOpenQuestionsPdfReady,
  exportCriticalQuestionsMarkdown,
} from "./open-questions-export";
export type {
  PdfReadyQuestion,
  PdfReadyQuestionsSection,
  PdfReadyQuestionsDocument,
} from "./open-questions-export";

// ── Email Export ───────────────────────────────────────────────────────────────
export {
  getRecommendedEmailVersion,
  exportEmailTiText,
  exportEmailFuncionalText,
  exportEmailGerenciaText,
  exportEmailMarkdown,
  exportAllEmailsMarkdown,
} from "./email-export";
export type { RecipientType } from "./email-export";

// ── PDF Assembly ───────────────────────────────────────────────────────────────
export {
  assembleDocument,
  assembleFullPackageMarkdown,
  assembleFullPackageText,
  assembleFullPackagePdfReady,
  validatePackage,
} from "./pdf-assembly";
export type {
  PackageDocumentId,
  ExportFormat,
  PackageDocument,
  AssembledPackage,
  PackageValidationResult,
} from "./pdf-assembly";

// ── Pre-Send Validation Runner ─────────────────────────────────────────────────
export {
  runPreSendValidation,
  renderValidationRunText,
} from "./presend-validation-runner";
export type {
  ValidationRunSummary,
  ChecklistRunResult,
  RedactionRunResult,
  QuestionsRunResult,
  ViewsRunResult,
} from "./presend-validation-runner";

// ── Review Dashboard Metadata ──────────────────────────────────────────────────
export {
  buildReviewDashboardMetadata,
  serializeReviewDashboardMetadata,
} from "./review-dashboard-metadata";
export type {
  ReviewDashboardMetadata,
  DomainSummary,
  ViewSummary,
  QuestionsSummary,
  ContractHealthStatus,
} from "./review-dashboard-metadata";
