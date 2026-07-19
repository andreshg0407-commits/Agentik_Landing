/**
 * lib/marketing-studio/commerce/publication-state.ts
 *
 * MS-11 — Publication State Machine
 *
 * Governs valid transitions for a product's publication lifecycle.
 * Pure computation — no Prisma, no fetch, no side effects.
 *
 * Maps to CommerceJob.status and ProductPublicationState.publicationStatus.
 */

// ── State definitions ─────────────────────────────────────────────────────────

export const PUBLICATION_JOB_STATE = {
  QUEUED:     "queued",
  PUBLISHING: "publishing",
  PUBLISHED:  "published",
  FAILED:     "failed",
  RETRYING:   "retrying",
  PARTIAL:    "partial",
  ARCHIVED:   "archived",
} as const;
export type PublicationJobState = typeof PUBLICATION_JOB_STATE[keyof typeof PUBLICATION_JOB_STATE];

export const PUBLICATION_JOB_STATE_LABEL: Record<PublicationJobState, string> = {
  queued:     "En cola",
  publishing: "Publicando",
  published:  "Publicado",
  failed:     "Fallido",
  retrying:   "Reintentando",
  partial:    "Parcial",
  archived:   "Archivado",
};

// ── Valid transitions ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<PublicationJobState, PublicationJobState[]> = {
  queued:     ["publishing", "failed", "archived"],
  publishing: ["published", "failed", "partial"],
  published:  ["retrying", "archived"],
  failed:     ["retrying", "archived"],
  retrying:   ["publishing", "failed"],
  partial:    ["publishing", "failed", "archived"],
  archived:   [],  // terminal state
};

export class InvalidPublicationTransitionError extends Error {
  constructor(from: PublicationJobState, to: PublicationJobState) {
    super(`Invalid publication state transition: ${from} → ${to}`);
    this.name = "InvalidPublicationTransitionError";
  }
}

export function assertValidPublicationTransition(
  from: PublicationJobState,
  to:   PublicationJobState,
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidPublicationTransitionError(from, to);
  }
}

export function isValidPublicationTransition(
  from: PublicationJobState,
  to:   PublicationJobState,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ── Health computation ────────────────────────────────────────────────────────

export interface PublicationHealthResult {
  state:         PublicationJobState;
  isHealthy:     boolean;
  isTerminal:    boolean;
  canRetry:      boolean;
  retryCount:    number;
  maxRetries:    number;
  nextRetryAt:   Date | null;
  errorSummary:  string | null;
}

export const MAX_PUBLICATION_RETRIES = 3;

export function computePublicationHealth(opts: {
  state:        PublicationJobState;
  retryCount:   number;
  lastError?:   string | null;
  scheduledAt?: Date;
}): PublicationHealthResult {
  const { state, retryCount, lastError } = opts;

  const isPermanentlyFailed = state === "failed" && retryCount >= MAX_PUBLICATION_RETRIES;
  const isTerminal = state === "archived" || isPermanentlyFailed;

  const canRetry = (state === "failed" || state === "partial") &&
    retryCount < MAX_PUBLICATION_RETRIES;

  // Exponential backoff: 60s * 2^retryCount
  const nextRetryAt = canRetry
    ? new Date(Date.now() + 60_000 * Math.pow(2, retryCount))
    : null;

  return {
    state,
    isHealthy:   state === "published",
    isTerminal,
    canRetry,
    retryCount,
    maxRetries:  MAX_PUBLICATION_RETRIES,
    nextRetryAt,
    errorSummary: lastError ?? null,
  };
}

// ── CommerceJob status → PublicationJobState mapper ───────────────────────────

export function jobStatusToPublicationState(
  jobStatus: string,
  retryCount: number,
): PublicationJobState {
  switch (jobStatus) {
    case "pending":   return "queued";
    case "queued":    return "queued";
    case "running":   return "publishing";
    case "succeeded": return "published";
    case "failed":    return retryCount > 0 ? "retrying" : "failed";
    case "cancelled": return "archived";
    default:          return "queued";
  }
}
