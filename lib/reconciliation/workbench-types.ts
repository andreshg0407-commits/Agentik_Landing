/**
 * lib/reconciliation/workbench-types.ts
 *
 * AGENTIK-RECON-EXCEPTIONS-01 — Exception Resolution Workbench
 * UI type surface — pure TypeScript, safe for client components.
 *
 * Designed to work with:
 *   - ReconRecord[]   from the current legacy engine (available now)
 *   - ReconException[] from ENGINE-01 universal engine (forward-compatible upgrade path)
 *
 * Resolution state is client-side optimistic.
 * RECON-ENGINE-03 will add DB persistence via ReconciliationException model.
 */

// ── Exception types ────────────────────────────────────────────────────────────

export type WorkbenchExceptionType =
  | "mismatch_amount"
  | "only_in_a"
  | "only_in_b"
  | "probable_match"
  | "duplicate";

export type WorkbenchSeverity = "info" | "watch" | "elevated" | "critical";

export type WorkbenchStatus = "open" | "under_review" | "resolved" | "ignored";

// ── Core exception record ─────────────────────────────────────────────────────

/**
 * Unified exception record for the workbench UI.
 *
 * Produced by recon-to-workbench.ts from ReconRecord[].
 * Forward-compatible with ReconException[] from ENGINE-01.
 */
export interface WorkbenchException {
  id:              string;
  type:            WorkbenchExceptionType;
  severity:        WorkbenchSeverity;

  // Display
  label:           string;
  explanation:     string;
  reasons:         string[];

  // Amounts
  amountA:         number | null;
  amountB:         number | null;
  amountDelta:     number | null;
  amountDeltaPct:  number | null;

  // Record identity
  recordKey:       string;
  rowsA:           number;
  rowsB:           number;
  metaA?:          Record<string, unknown>;
  metaB?:          Record<string, unknown>;

  /**
   * DB CUID of the persisted ReconciliationException row.
   * Present when this exception is backed by a DB record (RECON-EXCEPTIONS-02).
   * Absent when generated transiently via reconRecordsToExceptions() (legacy adapter).
   *
   * When persistedId is present, operator actions are sent to the API.
   * When absent, actions remain client-side only.
   */
  persistedId?:    string;
}

// ── Resolution state ──────────────────────────────────────────────────────────

/**
 * Per-exception operator resolution.
 *
 * PERSISTENCE NOTE: Currently client-side optimistic state only.
 * RECON-ENGINE-03 will persist this via the ReconciliationException Prisma model.
 */
export interface ExceptionResolution {
  status:     WorkbenchStatus;
  resolution: string | null;
  notes:      WorkbenchNote[];
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface WorkbenchNote {
  id:        string;
  text:      string;
  author:    string;
  createdAt: string;
}

/** Map from exception.id to its current resolution state. */
export type ResolutionMap = Record<string, ExceptionResolution>;

// ── Filter state ──────────────────────────────────────────────────────────────

export interface WorkbenchFilter {
  types:      WorkbenchExceptionType[];  // empty = show all
  severities: WorkbenchSeverity[];       // empty = show all
  statuses:   WorkbenchStatus[];         // empty = show all
  searchText: string;
}

export const DEFAULT_FILTER: WorkbenchFilter = {
  types:      [],
  severities: [],
  statuses:   ["open", "under_review"],  // default: hide resolved + ignored
  searchText: "",
};

// ── Operator actions ──────────────────────────────────────────────────────────

export type ExceptionAction =
  | { type: "resolve";        resolution: string }
  | { type: "ignore";         reason?: string    }
  | { type: "set_reviewing"                      }
  | { type: "reopen"                             }
  | { type: "add_note";       text: string; author: string };

// ── Display config (used by UI layer) ─────────────────────────────────────────

export interface ExceptionTypeConfig {
  label:       string;
  description: string;
  /** CSS ag-op-status variant for severity badges */
  statusVariant: "ok" | "warning" | "critical" | "info" | "pending";
}
