/**
 * lib/ai-billing/ai-ledger-integrity.ts
 *
 * Agentik — AI Billing Hardening — Ledger Integrity Verification
 * Sprint: AGENTIK-AI-BILLING-HARDENING-01
 *
 * Pure functions for verifying that the credit ledger is internally consistent
 * and that stored balances match the sum of all ledger entries.
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiCreditLedgerEntry } from "./ai-credit-types";

// ── Summary types ─────────────────────────────────────────────────────────────

export interface LedgerSummary {
  orgSlug:        string;
  entryCount:     number;
  totalGranted:   number;
  totalDebited:   number;
  totalRefunded:  number;
  totalAdjusted:  number;
  reconstructedBalance: number;
  /** createdAt of the oldest entry */
  firstEntryAt?:  string;
  /** createdAt of the newest entry */
  lastEntryAt?:   string;
}

export interface LedgerIntegrityResult {
  valid:              boolean;
  reconstructedBalance: number;
  storedBalance?:     number;
  drift:              number; // reconstructed - stored (0 = perfectly consistent)
  duplicateCorrelationIds: string[];
  negativeEntries:    number; // entries that took balance below 0 without overage intent
  errors:             string[];
  warnings:           string[];
}

// ── Reconstruction ────────────────────────────────────────────────────────────

/**
 * Reconstruct the current credit balance by replaying all ledger entries.
 * Entries must be in chronological order (oldest first).
 *
 * This is the single source of truth for balance recovery.
 * If the stored balance ever diverges, this value wins.
 */
export function reconstructBalance(
  _orgSlug: string,
  entries:  AiCreditLedgerEntry[],
): number {
  return entries.reduce((sum, e) => sum + e.credits, 0);
}

// ── Integrity verification ────────────────────────────────────────────────────

/**
 * Full integrity check of a ledger.
 *
 * Checks:
 *   1. Reconstructed balance matches storedBalance (if provided)
 *   2. No duplicate correlationIds
 *   3. No unexpected negative balance points (for non-overage debits)
 *   4. All entries have required fields
 */
export function verifyLedgerIntegrity(
  entries:        AiCreditLedgerEntry[],
  storedBalance?: number,
): LedgerIntegrityResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // ── Reconstruct balance ───────────────────────────────────────────────────

  let runningBalance        = 0;
  let negativeEntries       = 0;

  for (const e of entries) {
    runningBalance += e.credits;
    if (runningBalance < 0 && e.type !== "MANUAL_ADJUSTMENT") {
      negativeEntries++;
    }
  }

  const reconstructedBalance = runningBalance;

  // ── Drift check ───────────────────────────────────────────────────────────

  const drift = storedBalance !== undefined ? reconstructedBalance - storedBalance : 0;
  if (storedBalance !== undefined && drift !== 0) {
    errors.push(
      `Balance drift detected: reconstructed ${reconstructedBalance}, stored ${storedBalance}, drift ${drift}.`
    );
  }

  // ── Duplicate correlationIds ──────────────────────────────────────────────

  const dupes = detectDuplicateCorrelationIds(entries);
  if (dupes.length > 0) {
    errors.push(`Duplicate correlationIds detected: ${dupes.join(", ")}`);
  }

  // ── Required fields ───────────────────────────────────────────────────────

  for (const e of entries) {
    if (!e.id)        errors.push(`Entry missing id`);
    if (!e.orgSlug)   errors.push(`Entry ${e.id} missing orgSlug`);
    if (!e.type)      errors.push(`Entry ${e.id} missing type`);
    if (!e.createdAt) errors.push(`Entry ${e.id} missing createdAt`);
  }

  // ── Warnings ──────────────────────────────────────────────────────────────

  if (negativeEntries > 0) {
    warnings.push(`${negativeEntries} entries temporarily put balance below zero.`);
  }

  if (entries.length === 0) {
    warnings.push("Ledger is empty — no entries to verify.");
  }

  return {
    valid: errors.length === 0,
    reconstructedBalance,
    storedBalance,
    drift,
    duplicateCorrelationIds: dupes,
    negativeEntries,
    errors,
    warnings,
  };
}

// ── Duplicate correlationId detector ─────────────────────────────────────────

/**
 * Returns a list of correlationIds that appear more than once in the ledger.
 * A non-empty result indicates a failed idempotency constraint.
 */
export function detectDuplicateCorrelationIds(
  entries: AiCreditLedgerEntry[],
): string[] {
  const seen = new Map<string, number>();
  for (const e of entries) {
    if (!e.metadata?.correlationId && !(e as unknown as Record<string, unknown>)["correlationId"]) continue;
    const cid = (e as unknown as Record<string, string>)["correlationId"];
    if (!cid) continue;
    seen.set(cid, (seen.get(cid) ?? 0) + 1);
  }
  return Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([cid]) => cid);
}

// ── Ledger summary ────────────────────────────────────────────────────────────

/**
 * Build a human-readable summary of a ledger.
 * Assumes all entries belong to the same orgSlug.
 */
export function buildLedgerSummary(
  orgSlug:  string,
  entries:  AiCreditLedgerEntry[],
): LedgerSummary {
  let totalGranted   = 0;
  let totalDebited   = 0;
  let totalRefunded  = 0;
  let totalAdjusted  = 0;

  for (const e of entries) {
    switch (e.type) {
      case "MONTHLY_GRANT":
      case "PURCHASE":
      case "PROMO_CREDIT":
        totalGranted  += e.credits;
        break;
      case "USAGE_DEBIT":
      case "EXPIRATION":
        totalDebited  += Math.abs(e.credits);
        break;
      case "REFUND":
        totalRefunded += e.credits;
        break;
      case "MANUAL_ADJUSTMENT":
        totalAdjusted += e.credits;
        break;
    }
  }

  const reconstructedBalance = reconstructBalance(orgSlug, entries);
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    orgSlug,
    entryCount:           entries.length,
    totalGranted,
    totalDebited,
    totalRefunded,
    totalAdjusted,
    reconstructedBalance,
    firstEntryAt:         sorted[0]?.createdAt,
    lastEntryAt:          sorted[sorted.length - 1]?.createdAt,
  };
}

// ── Balance sanity guard ──────────────────────────────────────────────────────

/**
 * Verify that the given balance is consistent with the ledger replay.
 * Returns true if they match within epsilon (handles floating point).
 */
export function isBalanceConsistent(
  storedBalance:   number,
  entries:         AiCreditLedgerEntry[],
  orgSlug:         string,
): boolean {
  const reconstructed = reconstructBalance(orgSlug, entries);
  return Math.abs(reconstructed - storedBalance) <= 1; // 1 credit epsilon for rounding
}
