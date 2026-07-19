/**
 * lib/integrations/sag/executive-pack/index.ts
 *
 * SAG Executive Pack — Barrel Export
 *
 * Central export point for the SAG Executive Pack.
 * Import from this file to access all executive-pack utilities.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

// ── Executive Summary ──────────────────────────────────────────────────────────
export {
  SAG_EXECUTIVE_SUMMARY_META,
  SAG_EXECUTIVE_SUMMARY,
  renderExecutiveSummaryText,
} from "./sag-executive-summary";
export type {
  ExecutiveSummarySection,
  ExecutiveSummary,
} from "./sag-executive-summary";

// ── View Request Document ──────────────────────────────────────────────────────
export {
  SAG_VIEW_REQUEST_DOC,
  getViewRequestEntry,
  getViewRequestSummary,
} from "./sag-view-request-doc";
export type {
  SagViewRequestEntry,
  SagViewColumn,
} from "./sag-view-request-doc";

// ── Open Questions Register ────────────────────────────────────────────────────
export {
  SAG_OPEN_QUESTIONS,
  getQuestionsByDomain,
  getCriticalQuestions,
  getBlockingQuestions,
  getOpenQuestionsSummary,
  renderOpenQuestionsText,
} from "./sag-open-questions";
export type {
  QuestionPriority,
  QuestionDomain,
  QuestionStatus,
  OpenQuestion,
} from "./sag-open-questions";

// ── Email Package ──────────────────────────────────────────────────────────────
export {
  SAG_EMAIL_ATTACHMENTS,
  SAG_EMAIL_PACKAGE,
  getEmailDraft,
  getPrimaryEmailDraft,
  renderEmailText,
} from "./sag-email-package";
export type {
  EmailAudience,
  EmailTone,
  EmailAttachment,
  EmailDraft,
} from "./sag-email-package";

// ── PDF Readiness ──────────────────────────────────────────────────────────────
export {
  PDF_RESUMEN_EJECUTIVO,
  PDF_SOLICITUD_VISTAS,
  PDF_PREGUNTAS_ABIERTAS,
  SAG_PDF_DOCUMENTS,
  getPdfSpec,
  getPdfReadinessSummary,
} from "./sag-pdf-readiness";
export type {
  PdfDocumentId,
  PdfSectionType,
  PdfSection,
  PdfMetadata,
  PdfDocumentSpec,
  PdfStyleHints,
} from "./sag-pdf-readiness";

// ── Validation Checklist ───────────────────────────────────────────────────────
export {
  buildValidationChecklist,
  getChecklistSummary,
  renderChecklistText,
} from "./sag-validation-checklist";
export type {
  ChecklistPhase,
  ChecklistStatus,
  ChecklistItem,
} from "./sag-validation-checklist";

// ── Redaction Layer ────────────────────────────────────────────────────────────
export {
  redactFieldForExternal,
  redactDomainForExternal,
  redactDomainsForExternal,
  getExternalFieldSummary,
} from "./sag-redaction-layer";
export type {
  ExportTarget,
  ExternalSagField,
  ExternalDomainView,
} from "./sag-redaction-layer";
