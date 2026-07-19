/**
 * lib/marketing-studio/library/lifecycle.ts
 *
 * MARKETING-STUDIO-LIBRARY-CORE — Sprint MS-01
 *
 * Asset lifecycle state machine for the Biblioteca / Asset Hub.
 *
 * ── LIFECYCLE ─────────────────────────────────────────────────────────────────
 *
 *   draft
 *     ↓  (generation complete)
 *   generated
 *     ↓  (operator submits for review)
 *   review_pending
 *     ↓  (approval granted)                    ↓ (rejected)
 *   approved                                  rejected (terminal)
 *     ↓  (published to channel)
 *   published
 *     ↓  (retired from active use)
 *   archived
 *
 *   Any state → rejected (operator decision)
 *   rejected  → draft (AGENTIK_ADMIN reset only)
 *   approved  → archived (asset approved but never published, then retired)
 *
 * ── KEY RULE ──────────────────────────────────────────────────────────────────
 *
 *   "Approving ≠ Publishing."
 *
 *   approved  = content validated and cleared; can be scheduled for future publish
 *   published = has been dispatched to at least one channel (Shopify, social, etc.)
 *
 *   This separation allows operators to approve a full batch ahead of a campaign
 *   launch date, then publish on schedule — without confusion between "ready" and "live".
 *
 * ── AUTO-APPROVE PATH ─────────────────────────────────────────────────────────
 *
 *   For presets in TenantMarketingConfig.approvalRules.autoApprovePresets,
 *   the lifecycle skips review_pending → approved automatically:
 *   generated → approved (auto) → (operator publishes manually or via schedule)
 */

import type { AssetStatus } from "./types";

// ── Valid transitions ──────────────────────────────────────────────────────────

/**
 * VALID_TRANSITIONS defines which status changes are permitted.
 * Key = current status. Value = list of statuses it can transition to.
 *
 * The rejection path is special: any non-terminal status can move to "rejected".
 * The reset path (rejected → draft) requires AGENTIK_ADMIN role — enforced in the API layer.
 */
export const VALID_TRANSITIONS: Readonly<Record<AssetStatus, AssetStatus[]>> = {
  draft:          ["generated", "rejected"],
  generated:      ["review_pending", "approved", "rejected"],   // "approved" = auto-approve path
  review_pending: ["approved", "rejected"],
  approved:       ["published", "archived", "rejected"],
  published:      ["archived"],
  archived:       [],                                            // terminal — no further transitions
  rejected:       ["draft"],                                    // only AGENTIK_ADMIN can reset
} as const;

// ── Transition labels (for audit log and UI display) ──────────────────────────

export interface StatusTransitionMeta {
  /** Human-readable label for this transition event. */
  label:       string;
  /** Short description of what this event means. */
  description: string;
  /** Whether this transition requires an explicit operator action. */
  requiresAction: boolean;
  /** Whether this transition sends a notification to the tenant. */
  notifiesTenant: boolean;
}

export const TRANSITION_META: Partial<Record<`${AssetStatus}→${AssetStatus}`, StatusTransitionMeta>> = {
  "draft→generated": {
    label:          "Generación completada",
    description:    "El pipeline de IA finalizó la generación del asset.",
    requiresAction: false,
    notifiesTenant: false,
  },
  "generated→review_pending": {
    label:          "Enviado a revisión",
    description:    "El operador envió el asset para aprobación.",
    requiresAction: true,
    notifiesTenant: true,
  },
  "generated→approved": {
    label:          "Auto-aprobado",
    description:    "El preset tiene aprobación automática activa.",
    requiresAction: false,
    notifiesTenant: false,
  },
  "review_pending→approved": {
    label:          "Aprobado",
    description:    "El asset fue aprobado y está listo para publicar.",
    requiresAction: true,
    notifiesTenant: true,
  },
  "review_pending→rejected": {
    label:          "Rechazado en revisión",
    description:    "El asset no cumple con los requisitos de calidad o marca.",
    requiresAction: true,
    notifiesTenant: true,
  },
  "approved→published": {
    label:          "Publicado",
    description:    "El asset fue enviado a uno o más canales.",
    requiresAction: true,
    notifiesTenant: false,
  },
  "approved→archived": {
    label:          "Archivado sin publicar",
    description:    "El asset fue aprobado pero retirado antes de publicar.",
    requiresAction: true,
    notifiesTenant: false,
  },
  "approved→rejected": {
    label:          "Rechazado post-aprobación",
    description:    "El asset fue rechazado después de haber sido aprobado.",
    requiresAction: true,
    notifiesTenant: true,
  },
  "published→archived": {
    label:          "Archivado",
    description:    "El asset fue retirado de circulación activa.",
    requiresAction: true,
    notifiesTenant: false,
  },
  "rejected→draft": {
    label:          "Reiniciado",
    description:    "AGENTIK_ADMIN reinició el asset para nueva revisión.",
    requiresAction: true,
    notifiesTenant: false,
  },
};

// ── Guard functions ────────────────────────────────────────────────────────────

/**
 * canTransition — returns true when the given status change is valid.
 *
 * Does NOT enforce role checks (that belongs in the API layer).
 * The rejected→draft transition is valid here but must be gated on role in the API.
 */
export function canTransition(from: AssetStatus, to: AssetStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * validateTransition — returns a result object with the transition validity
 * and the metadata for the transition if valid.
 */
export function validateTransition(
  from: AssetStatus,
  to:   AssetStatus,
): { valid: boolean; meta?: StatusTransitionMeta; error?: string } {
  if (!canTransition(from, to)) {
    return {
      valid: false,
      error: `Transición inválida: ${from} → ${to}. Transiciones permitidas desde "${from}": [${VALID_TRANSITIONS[from].join(", ")}]`,
    };
  }
  const key = `${from}→${to}` as `${AssetStatus}→${AssetStatus}`;
  return { valid: true, meta: TRANSITION_META[key] };
}

// ── Lifecycle helpers ──────────────────────────────────────────────────────────

/**
 * isTerminalStatus — returns true for status values with no valid outbound transitions.
 * Currently: "archived" and "rejected" (rejected can only be reset by admin).
 */
export function isTerminalStatus(status: AssetStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}

/**
 * isPublishable — returns true when the asset can be published to a channel.
 * Only "approved" assets can be published.
 */
export function isPublishable(status: AssetStatus): boolean {
  return status === "approved";
}

/**
 * isReviewable — returns true when the asset is ready for operator review.
 */
export function isReviewable(status: AssetStatus): boolean {
  return status === "generated" || status === "review_pending";
}

/**
 * isActive — returns true for statuses that represent an asset in active circulation.
 * Used for Biblioteca default filters (exclude drafts, archived, rejected by default).
 */
export function isActive(status: AssetStatus): boolean {
  return status === "approved" || status === "published";
}

// ── Auto-approve helper ────────────────────────────────────────────────────────

/**
 * resolveInitialStatus — determines the correct initial status for a newly generated asset.
 *
 * @param presetId         — the preset used for this asset
 * @param autoApproveList  — list of preset IDs that bypass review (from TenantMarketingConfig)
 * @returns                — "approved" if auto-approve applies, "generated" otherwise
 */
export function resolveInitialStatus(
  presetId:         string,
  autoApproveList:  string[],
): AssetStatus {
  return autoApproveList.includes(presetId) ? "approved" : "generated";
}

// ── Status display config ──────────────────────────────────────────────────────

export interface StatusDisplayConfig {
  label:       string;
  dot:         string;   // CSS color for the status dot
  text:        string;   // CSS color for the label text
  bg:          string;   // CSS background for the status chip
  border:      string;   // CSS border for the status chip
}

/** Visual config for each status — used by Biblioteca UI components. */
export const STATUS_DISPLAY: Record<AssetStatus, StatusDisplayConfig> = {
  draft:          { label: "Borrador",         dot: "#94a3b8", text: "#64748b", bg: "#f8fafc", border: "1px solid #e2e8f0" },
  generated:      { label: "Generado",         dot: "#3b82f6", text: "#1d4ed8", bg: "#eff6ff", border: "1px solid #bfdbfe" },
  review_pending: { label: "En revisión",      dot: "#f59e0b", text: "#b45309", bg: "#fffbeb", border: "1px solid #fde68a" },
  approved:       { label: "Aprobado",         dot: "#10b981", text: "#047857", bg: "#ecfdf5", border: "1px solid #a7f3d0" },
  published:      { label: "Publicado",        dot: "#004AAD", text: "#004AAD", bg: "#eff6ff", border: "1px solid #bfdbfe" },
  archived:       { label: "Archivado",        dot: "#6b7280", text: "#6b7280", bg: "#f9fafb", border: "1px solid #e5e7eb" },
  rejected:       { label: "Rechazado",        dot: "#ef4444", text: "#b91c1c", bg: "#fef2f2", border: "1px solid #fecaca" },
};
