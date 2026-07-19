/**
 * lib/marketing-studio/library/operations/actions.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Operational action contracts for the Biblioteca / Asset Hub.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   Every action in the Biblioteca is:
 *     1. Named — has a clear semantic label ("approveAsset", not "update status")
 *     2. Typed — input and output are fully typed contracts
 *     3. Auditable — produces an audit record
 *     4. Reversible where possible — define the inverse action
 *     5. Role-aware — specifies which roles can perform it
 *
 * ── WHAT THIS FILE DOES ───────────────────────────────────────────────────────
 *
 *   Defines action input/output contracts. Does NOT implement backend persistence.
 *   The API routes (sprint MS-API) will implement the actual server logic.
 *   Components and agents call these action types — not raw Prisma.
 *
 * ── ACTIONS LIST ──────────────────────────────────────────────────────────────
 *
 *   approveAsset         → review_pending | generated → approved
 *   rejectAsset          → any → rejected
 *   archiveAsset         → approved | published → archived
 *   restoreAsset         → rejected → draft  (AGENTIK_ADMIN only)
 *   sendToReview         → generated → review_pending
 *   duplicateAsset       → creates a new MarketingAsset from an existing one
 *   createVariant        → creates a channel-specific AssetVariant
 *   assignChannels       → updates asset.channels
 *   assignRelations      → adds/removes AssetRelation entries
 *   markReadyForShopify  → sets destinationReadiness.shopify = true
 *   markReadyForCatalog  → sets destinationReadiness.catalog = true
 */

import type { AssetChannel, AssetRelation, AssetVariant, MarketingAsset } from "../types";
import type { AssetDestination }                                            from "./destinations";

// ── Action result wrapper ──────────────────────────────────────────────────────

/**
 * LibraryActionResult — the standardized output of any Biblioteca action.
 */
export interface LibraryActionResult<T = void> {
  success:   boolean;
  data?:     T;
  error?:    string;
  warnings?: string[];
  /** The audit record produced by this action. */
  audit?:    LibraryAuditRecord;
}

// ── Audit record ───────────────────────────────────────────────────────────────

/**
 * LibraryAuditRecord — immutable record of an action performed on an asset.
 * Stored in a separate audit log — never mutated after creation.
 */
export interface LibraryAuditRecord {
  id:           string;
  assetId:      string;
  tenantId:     string;
  actionType:   LibraryActionType;
  performedBy:  string;     // userId
  performedAt:  string;     // ISO
  /** Before snapshot (subset of asset fields relevant to the action). */
  before?:      Record<string, unknown>;
  /** After snapshot. */
  after?:       Record<string, unknown>;
  notes?:       string;
}

// ── Action type registry ───────────────────────────────────────────────────────

export type LibraryActionType =
  | "approve_asset"
  | "reject_asset"
  | "archive_asset"
  | "restore_asset"
  | "send_to_review"
  | "duplicate_asset"
  | "create_variant"
  | "assign_channels"
  | "assign_relations"
  | "remove_relation"
  | "mark_ready_for_destination"
  | "update_metadata"
  | "promote_from_session"
  | "bulk_approve"
  | "bulk_archive"
  | "bulk_reject";

/** Minimum required role for each action. */
export const ACTION_ROLE_REQUIREMENTS: Record<LibraryActionType, "any" | "admin" | "super_admin"> = {
  approve_asset:                "any",
  reject_asset:                 "any",
  archive_asset:                "any",
  restore_asset:                "admin",        // only AGENTIK_ADMIN / SUPER_ADMIN
  send_to_review:               "any",
  duplicate_asset:              "any",
  create_variant:               "any",
  assign_channels:              "any",
  assign_relations:             "any",
  remove_relation:              "any",
  mark_ready_for_destination:   "any",
  update_metadata:              "any",
  promote_from_session:         "any",
  bulk_approve:                 "any",
  bulk_archive:                 "any",
  bulk_reject:                  "admin",
};

// ── Individual action contracts ────────────────────────────────────────────────

/** approveAsset — moves asset from review_pending or generated → approved. */
export interface ApproveAssetAction {
  type:        "approve_asset";
  assetId:     string;
  approvedBy:  string;
  notes?:      string;
  destinationReadiness?: {
    shopify?:  boolean;
    crm?:      boolean;
    catalog?:  boolean;
    social?:   boolean;
    ads?:      boolean;
    whatsapp?: boolean;
  };
}

/** rejectAsset — moves asset to rejected state (terminal — requires admin to restore). */
export interface RejectAssetAction {
  type:       "reject_asset";
  assetId:    string;
  rejectedBy: string;
  reason:     string;   // required — must document why
  notes?:     string;
}

/** archiveAsset — retires an approved or published asset from active circulation. */
export interface ArchiveAssetAction {
  type:        "archive_asset";
  assetId:     string;
  archivedBy:  string;
  reason?:     string;
}

/**
 * restoreAsset — resets a rejected asset to draft for re-evaluation.
 * AGENTIK_ADMIN / SUPER_ADMIN only.
 */
export interface RestoreAssetAction {
  type:        "restore_asset";
  assetId:     string;
  restoredBy:  string;
  notes?:      string;
}

/** sendToReview — moves a generated asset to review_pending. */
export interface SendToReviewAction {
  type:          "send_to_review";
  assetId:       string;
  submittedBy:   string;
  reviewerHints?: string;
}

/**
 * duplicateAsset — creates a new MarketingAsset copied from an existing one.
 * Use when the same visual is needed for a different channel or context.
 */
export interface DuplicateAssetAction {
  type:           "duplicate_asset";
  sourceAssetId:  string;
  performedBy:    string;
  /** Overrides to apply to the new asset. */
  overrides?: {
    name?:        string;
    channels?:    AssetChannel[];
    tags?:        string[];
    targetChannel?: AssetChannel;
  };
}

export interface DuplicateAssetResult {
  newAssetId:     string;
  sourceAssetId:  string;
}

/**
 * createVariant — adds a channel-specific size/format variant to an asset.
 * Variants are derived from the master — they do not have independent lifecycle.
 */
export interface CreateVariantAction {
  type:        "create_variant";
  assetId:     string;
  performedBy: string;
  variant:     Omit<AssetVariant, "id">;
}

export interface CreateVariantResult {
  variantId: string;
  assetId:   string;
}

/** assignChannels — updates which channels an asset is cleared for. */
export interface AssignChannelsAction {
  type:        "assign_channels";
  assetId:     string;
  performedBy: string;
  /** Replaces the entire channels array. Send existing + new. */
  channels:    AssetChannel[];
}

/** assignRelations — adds relation records to an asset. */
export interface AssignRelationsAction {
  type:        "assign_relations";
  assetId:     string;
  performedBy: string;
  relations:   AssetRelation[];
  /** When true, merges with existing. When false (default), replaces. */
  merge?:      boolean;
}

/** removeRelation — removes a specific relation from an asset. */
export interface RemoveRelationAction {
  type:          "remove_relation";
  assetId:       string;
  performedBy:   string;
  relationType:  AssetRelation["type"];
  referenceId:   string;
}

/**
 * markReadyForDestination — flags an asset as operationally ready for a specific destination.
 * Sets destinationReadiness[destination] = true.
 * Does NOT publish — just marks intent.
 */
export interface MarkReadyForDestinationAction {
  type:        "mark_ready_for_destination";
  assetId:     string;
  performedBy: string;
  destination: AssetDestination;
}

/** updateMetadata — patches contextual metadata fields. */
export interface UpdateMetadataAction {
  type:        "update_metadata";
  assetId:     string;
  performedBy: string;
  /** Partial metadata patch — merged with existing. */
  patch:       Record<string, unknown>;
}

// ── Bulk action contracts ──────────────────────────────────────────────────────

export interface BulkActionRequest {
  assetIds:    string[];
  performedBy: string;
  notes?:      string;
}

export interface BulkActionResult {
  total:     number;
  succeeded: number;
  failed:    number;
  skipped:   number;
  errors:    Array<{ assetId: string; error: string }>;
}

// ── Union type ─────────────────────────────────────────────────────────────────

/**
 * LibraryAction — the discriminated union of all Biblioteca actions.
 * Used by the action dispatcher and audit log.
 */
export type LibraryAction =
  | ApproveAssetAction
  | RejectAssetAction
  | ArchiveAssetAction
  | RestoreAssetAction
  | SendToReviewAction
  | DuplicateAssetAction
  | CreateVariantAction
  | AssignChannelsAction
  | AssignRelationsAction
  | RemoveRelationAction
  | MarkReadyForDestinationAction
  | UpdateMetadataAction;

// ── Action factory helpers ─────────────────────────────────────────────────────

/** approveAsset — convenience factory for the approve action. */
export function approveAsset(
  assetId:    string,
  approvedBy: string,
  opts?: Pick<ApproveAssetAction, "notes" | "destinationReadiness">,
): ApproveAssetAction {
  return { type: "approve_asset", assetId, approvedBy, ...opts };
}

/** rejectAsset — convenience factory for the reject action. */
export function rejectAsset(
  assetId:    string,
  rejectedBy: string,
  reason:     string,
  notes?:     string,
): RejectAssetAction {
  return { type: "reject_asset", assetId, rejectedBy, reason, notes };
}

/** sendToReview — convenience factory for the review submission action. */
export function sendToReview(
  assetId:       string,
  submittedBy:   string,
  hints?:        string,
): SendToReviewAction {
  return { type: "send_to_review", assetId, submittedBy, reviewerHints: hints };
}

/** archiveAsset — convenience factory for the archive action. */
export function archiveAsset(
  assetId:    string,
  archivedBy: string,
  reason?:    string,
): ArchiveAssetAction {
  return { type: "archive_asset", assetId, archivedBy, reason };
}

/** assignChannels — convenience factory for channel assignment. */
export function assignChannels(
  assetId:     string,
  channels:    AssetChannel[],
  performedBy: string,
): AssignChannelsAction {
  return { type: "assign_channels", assetId, performedBy, channels };
}
