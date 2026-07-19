/**
 * lib/marketing-studio/library/operations/approval.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Review and approval system for the Biblioteca / Asset Hub.
 *
 * ── RULE ──────────────────────────────────────────────────────────────────────
 *
 *   "Generated ≠ Biblioteca."
 *
 *   Every asset must pass through the Review Queue before it becomes
 *   an active, publishable record in the Biblioteca.
 *
 *   Exceptions:
 *     - Auto-approve presets (from TenantMarketingConfig.approvalRules)
 *     - Operator with AGENTIK_ADMIN role can fast-track approvals
 *
 * ── APPROVAL VALIDATES ────────────────────────────────────────────────────────
 *
 *   1. Minimal metadata is present (name, assetType, clearedChannels)
 *   2. Asset is not a confirmed duplicate of an existing approved asset
 *   3. Channel readiness — asset format is compatible with declared channels
 *   4. Asset passes visual quality gate (future: AI quality score)
 *
 * ── APPROVAL ≠ PUBLISHING ─────────────────────────────────────────────────────
 *
 *   Approved assets stay in the Biblioteca until an operator (or automation)
 *   explicitly pushes them to a destination (Shopify, social, catalog, etc.).
 *   This separation allows campaign pre-loading and scheduled publishing.
 */

import type { AssetChannel } from "../types";

// ── Approval record ────────────────────────────────────────────────────────────

/**
 * ApprovalDecision — the outcome of a review action.
 */
export type ApprovalDecision =
  | "pending"         // not yet reviewed
  | "approved"        // cleared for publication to declared channels
  | "rejected"        // content rejected — asset moves to rejected state
  | "needs_changes";  // returned for revision — asset reverts to generated state

/**
 * AssetApprovalRecord — the review record for a single asset.
 *
 * One record per review cycle. When an asset is revised and resubmitted,
 * a new record is created (history is preserved — never overwritten).
 */
export interface AssetApprovalRecord {
  /** The ID of the asset being reviewed. */
  assetId:     string;
  /** The outcome of this review cycle. */
  status:      ApprovalDecision;
  /** UserId of the operator who performed the review. */
  reviewedBy?: string;
  /** ISO timestamp of the review action. */
  reviewedAt?: string;
  /**
   * Free-text notes from the reviewer.
   * Multiple notes are preserved (one per review cycle if resubmitted).
   */
  notes?:      string[];
  /**
   * Destination readiness flags — signals whether this asset is ready
   * for specific destinations at approval time.
   * Set by the reviewer or validated automatically.
   */
  destinationReadiness?: {
    shopify?:  boolean;
    crm?:      boolean;
    catalog?:  boolean;
    social?:   boolean;
    ads?:      boolean;
    whatsapp?: boolean;
  };
  /** Review cycle number. 1 = first review, 2+ = after resubmission. */
  cycle?:      number;
  /** ISO timestamp when this record was created. */
  createdAt:   string;
}

// ── Approval queue ─────────────────────────────────────────────────────────────

/**
 * ApprovalQueueItem — a single item in the review queue.
 *
 * The queue is the list of assets awaiting review for a tenant.
 * Items can be reviewed individually or in bulk (batch approval flow).
 */
export interface ApprovalQueueItem {
  assetId:         string;
  assetName:       string;
  assetType:       string;
  status:          ApprovalDecision;
  submittedAt:     string;
  submittedBy:     string;
  sessionId?:      string;   // Foto Estudio session origin
  batchJobId?:     string;   // batch job origin if applicable
  presetId?:       string;   // preset used — drives auto-approve check
  previewUrl?:     string;   // thumbnail for queue display
  tenantId:        string;
  /** Validation issues found — shown to reviewer as guidance. */
  validationIssues?: string[];
  /** Whether auto-approve applies (preset in auto-approve list). */
  isAutoApprovable?: boolean;
}

/**
 * ApprovalQueue — the full queue for a tenant.
 * Paginated — use LibrarySearchFilter with status: ["generated", "review_pending"].
 */
export interface ApprovalQueue {
  tenantId:    string;
  items:       ApprovalQueueItem[];
  total:       number;
  pending:     number;   // items not yet reviewed
  autoApprovable: number; // items eligible for auto-approval
}

// ── Batch approval ─────────────────────────────────────────────────────────────

/**
 * BatchApprovalRequest — approve or reject multiple assets at once.
 * Used by the batch review UI (sprint MS-04) and auto-approve pipeline.
 */
export interface BatchApprovalRequest {
  tenantId:    string;
  assetIds:    string[];
  decision:    ApprovalDecision;
  reviewedBy:  string;
  notes?:      string;
  /** When true, only auto-approvable assets are processed. */
  autoApproveOnly?: boolean;
}

export interface BatchApprovalResult {
  total:       number;
  succeeded:   number;
  skipped:     number;   // already in terminal state
  failed:      number;
  results:     Array<{
    assetId:  string;
    success:  boolean;
    error?:   string;
  }>;
}

// ── Approval validation ────────────────────────────────────────────────────────

/**
 * ApprovalValidationResult — the outcome of pre-approval checks.
 *
 * Run before persisting an approval decision to catch issues that would
 * make the asset unpublishable even if approved.
 */
export interface ApprovalValidationResult {
  /** Whether the asset passes all checks and can be approved. */
  canApprove:  boolean;
  /** Blocking issues — must be resolved before approval. */
  blockers:    ApprovalIssue[];
  /** Non-blocking warnings — shown to reviewer as guidance. */
  warnings:    ApprovalIssue[];
}

export type ApprovalIssueCode =
  | "MISSING_NAME"
  | "MISSING_ASSET_TYPE"
  | "NO_CHANNELS_DECLARED"
  | "CONFIRMED_DUPLICATE"
  | "METADATA_INCOMPLETE"
  | "INVALID_LIFECYCLE_STATE"
  | "CHANNEL_FORMAT_MISMATCH"
  | "FILE_MISSING"
  | "QUALITY_SCORE_TOO_LOW";     // future: AI quality gate

export interface ApprovalIssue {
  code:    ApprovalIssueCode;
  message: string;
  field?:  string;
}

/**
 * validateForApproval — pre-approval guard.
 *
 * Checks minimal metadata, lifecycle validity, and basic channel compatibility.
 * Does NOT check duplicate records (that requires a DB query — API layer concern).
 *
 * @param asset    — partial asset data available at approval time
 * @param channels — the channels declared for this asset
 */
export function validateForApproval(
  asset: {
    name?:         string;
    assetType?:    string;
    channels?:     AssetChannel[];
    url?:          string;
    status?:       string;
  },
  channels: AssetChannel[],
): ApprovalValidationResult {
  const blockers: ApprovalIssue[] = [];
  const warnings: ApprovalIssue[] = [];

  if (!asset.name || asset.name.trim().length === 0) {
    blockers.push({ code: "MISSING_NAME", message: "El asset no tiene nombre.", field: "name" });
  }
  if (!asset.assetType) {
    blockers.push({ code: "MISSING_ASSET_TYPE", message: "El tipo de asset no está definido.", field: "assetType" });
  }
  if (!channels || channels.length === 0) {
    blockers.push({ code: "NO_CHANNELS_DECLARED", message: "El asset no tiene canales asignados." });
  }
  if (!asset.url) {
    blockers.push({ code: "FILE_MISSING", message: "El archivo del asset no está disponible." });
  }
  if (asset.status && !["generated", "review_pending"].includes(asset.status)) {
    blockers.push({
      code:    "INVALID_LIFECYCLE_STATE",
      message: `No se puede aprobar un asset en estado "${asset.status}".`,
      field:   "status",
    });
  }

  return {
    canApprove: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ── Auto-approve logic ─────────────────────────────────────────────────────────

/**
 * shouldAutoApprove — determines if an asset qualifies for automatic approval.
 *
 * Auto-approve is granted when:
 *   1. The preset used is in the tenant's autoApprovePresets list, AND
 *   2. The asset passes all validation checks
 *
 * @param presetId         — the preset used for this asset
 * @param autoApproveList  — from TenantMarketingConfig.approvalRules.autoApprovePresets
 * @param validation       — result of validateForApproval()
 */
export function shouldAutoApprove(
  presetId:        string,
  autoApproveList: string[],
  validation:      ApprovalValidationResult,
): boolean {
  return autoApproveList.includes(presetId) && validation.canApprove;
}
