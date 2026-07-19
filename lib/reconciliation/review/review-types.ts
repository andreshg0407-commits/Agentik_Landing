/**
 * lib/reconciliation/review/review-types.ts
 *
 * AGENTIK-RECON-REVIEW-CENTER-01 — Phase 1
 * Review Item type system.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export type ReviewItemStatus =
  | "open"
  | "in_review"
  | "resolved"
  | "dismissed"
  | "escalated";

export type ReviewItemResolution =
  | "approved"
  | "rejected"
  | "manual_match"
  | "needs_sag_validation"
  | "needs_business_validation"
  | "needs_bank_support";

export type ReviewAuditEventType =
  | "status_changed"
  | "resolved"
  | "assigned"
  | "note_added"
  | "escalated"
  | "created";

// ── Verdicts that produce review items ────────────────────────────────────────

export const REVIEWABLE_VERDICTS = new Set([
  "partial",
  "pending_review",
  "mismatch",
  "suspicious",
]);

/** reconciled pairs below this score also get a review item */
export const LOW_CONFIDENCE_SCORE_THRESHOLD = 60;

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateReviewItemInput {
  organizationId: string;
  executionId:    string;
  sessionId?:     string | null;
  sourceAType:    string;
  sourceBType:    string;
  recordAKey:     string;
  recordBKey?:    string | null;
  score:          number;
  verdict:        string;
  verdictLabel:   string;
  headline:       string;
  explanationJson?: object | null;
}

export interface UpdateReviewItemInput {
  status?:      ReviewItemStatus;
  assignedTo?:  string;
  reviewNote?:  string;
  resolution?:  ReviewItemResolution;
}

export interface ResolveReviewItemInput {
  resolution:  ReviewItemResolution;
  reviewNote?: string;
  actor:       string;
}

export interface ListReviewItemsOptions {
  executionId?:  string;
  sessionId?:    string;
  status?:       ReviewItemStatus | ReviewItemStatus[];
  verdict?:      string;
  sourceAType?:  string;
  sourceBType?:  string;
  minScore?:     number;
  maxScore?:     number;
  limit?:        number;
  offset?:       number;
}

// ── Output types ──────────────────────────────────────────────────────────────

/** Lightweight row — no heavy JSON blob — for list/table display. */
export interface ReconReviewItemRow {
  id:             string;
  organizationId: string;
  executionId:    string;
  sessionId:      string | null;
  sourceAType:    string;
  sourceBType:    string;
  recordAKey:     string;
  recordBKey:     string | null;
  score:          number;
  verdict:        string;
  verdictLabel:   string;
  headline:       string;
  status:         string;
  assignedTo:     string | null;
  reviewNote:     string | null;
  resolution:     string | null;
  createdAt:      string; // ISO
  updatedAt:      string; // ISO
}

/** Full record including explanationJson — for drawer/detail view. */
export interface ReconReviewItemDetail extends ReconReviewItemRow {
  explanationJson: object | null;
}

export interface ReconReviewAuditEventRow {
  id:             string;
  reviewItemId:   string;
  actor:          string;
  eventType:      string;
  previousStatus: string | null;
  newStatus:      string | null;
  resolution:     string | null;
  note:           string | null;
  createdAt:      string; // ISO
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface ReviewCenterSummary {
  total:      number;
  open:       number;
  in_review:  number;
  escalated:  number;
  resolved:   number;
  dismissed:  number;
  byVerdict: {
    partial:       number;
    mismatch:      number;
    suspicious:    number;
    pending_review: number;
    no_candidate:  number;
  };
}
