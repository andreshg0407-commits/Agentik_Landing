/**
 * Receivable normalizer — helpers for building UnifiedReceivable records.
 */

import type { ReceivableStatus, UnifiedReceivable } from "../types";

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, ReceivableStatus> = {
  // English
  open:        "open",
  pending:     "open",
  outstanding: "open",
  partial:     "partial",
  paid:        "paid",
  settled:     "paid",
  overdue:     "overdue",
  past_due:    "overdue",
  written_off: "written_off",
  bad_debt:    "written_off",
  // Spanish
  abierta:     "open",
  pendiente:   "open",
  parcial:     "partial",
  pagada:      "paid",
  vencida:     "overdue",
  castigada:   "written_off",
  incobrable:  "written_off",
};

export function normalizeReceivableStatus(raw: string | null | undefined): ReceivableStatus {
  if (!raw) return "open";
  return STATUS_MAP[raw.trim().toLowerCase()] ?? "open";
}

// ── Days overdue helper ───────────────────────────────────────────────────────

/**
 * Compute days past the due date at a given reference point.
 * Returns a negative number when the due date is in the future.
 */
export function computeDaysOverdue(dueDate: Date, reference = new Date()): number {
  const diffMs = reference.getTime() - new Date(dueDate).getTime();
  return Math.floor(diffMs / 86_400_000);
}

// ── Receivable builder ────────────────────────────────────────────────────────

type ReceivableInput =
  Omit<UnifiedReceivable, "daysOverdue" | "balanceDue" | "paidAmount">
  & { daysOverdue?: number; balanceDue?: number; paidAmount?: number };

/**
 * Build a UnifiedReceivable, computing daysOverdue and balanceDue when absent.
 */
export function buildReceivable(input: ReceivableInput): UnifiedReceivable {
  const paidAmount = input.paidAmount ?? 0;
  const balanceDue = input.balanceDue ?? Math.max(0, input.originalAmount - paidAmount);
  const daysOverdue = input.daysOverdue ?? computeDaysOverdue(input.dueDate);

  // Auto-derive status from balance + days overdue when status is missing context
  let status = input.status;
  if (status === "open" && daysOverdue > 0) status = "overdue";
  if (balanceDue <= 0 && paidAmount > 0)   status = "paid";
  if (paidAmount > 0 && balanceDue > 0)    status = "partial";

  return { ...input, paidAmount, balanceDue, daysOverdue, status };
}

// ── Ageing bucket ─────────────────────────────────────────────────────────────

export type AgeingBucket =
  | "current"       // not yet due
  | "1-30"
  | "31-60"
  | "61-90"
  | "90+";

export function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0)  return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ReceivableValidation {
  valid:    boolean;
  warnings: string[];
}

export function validateReceivable(r: UnifiedReceivable): ReceivableValidation {
  const w: string[] = [];
  if (!r.sourceId)      w.push("missing sourceId");
  if (!r.customerName)  w.push("missing customerName");
  if (!r.dueDate)       w.push("missing dueDate");
  if (r.balanceDue < 0) w.push(`negative balanceDue: ${r.balanceDue}`);
  if (r.originalAmount < 0) w.push(`negative originalAmount: ${r.originalAmount}`);
  return { valid: w.length === 0, warnings: w };
}
