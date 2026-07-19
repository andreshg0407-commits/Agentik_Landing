/**
 * lib/ai-billing/ai-credit-ledger.ts
 *
 * Agentik — AI Billing Foundation — Credit Ledger Helpers
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Pure helpers for credit accounting.
 * No Prisma. No React. No server-only. Client-safe.
 *
 * Invariant: balance cannot go negative unless allowOverage=true.
 */

import type { AiCreditLedgerEntry, AiCreditLedgerEntryType, AiCreditBalance } from "./ai-credit-types";
import { toAiCreditLedgerId } from "./ai-billing-types";

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Warn when available credits drop below this fraction of total granted. */
const LOW_BALANCE_THRESHOLD_FRACTION = 0.1;

/** Absolute minimum to trigger low-balance warning regardless of fraction. */
const LOW_BALANCE_ABS_THRESHOLD = 100;

// ── Factory ───────────────────────────────────────────────────────────────────

export interface CreateLedgerEntryInput {
  orgSlug:          string;
  organizationId?:  string;
  type:             AiCreditLedgerEntryType;
  credits:          number;
  balanceAfter?:    number;
  relatedUsageId?:  string;
  relatedInvoiceId?: string;
  reason?:          string;
  createdBy?:       string;
  metadata?:        Record<string, unknown>;
}

/**
 * Create a new ledger entry object (does not persist).
 */
export function createCreditLedgerEntry(
  input: CreateLedgerEntryInput,
): AiCreditLedgerEntry {
  return {
    id:               toAiCreditLedgerId(`ledger_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    orgSlug:          input.orgSlug,
    organizationId:   input.organizationId,
    type:             input.type,
    credits:          input.credits,
    balanceAfter:     input.balanceAfter,
    relatedUsageId:   input.relatedUsageId,
    relatedInvoiceId: input.relatedInvoiceId,
    reason:           input.reason,
    createdBy:        input.createdBy ?? "system",
    createdAt:        new Date().toISOString(),
    metadata:         input.metadata,
  };
}

// ── Debit ─────────────────────────────────────────────────────────────────────

export interface DebitResult {
  success:      boolean;
  creditsDebited: number;
  balanceAfter: number;
  warning?:     string;
  error?:       string;
}

/**
 * Apply a credit debit against a current balance.
 * Returns the new balance and any warnings.
 *
 * Does NOT modify state — returns a DebitResult.
 */
export function applyCreditDebit(
  currentBalance: number,
  creditsToDebit: number,
  opts: { allowOverage?: boolean } = {},
): DebitResult {
  if (creditsToDebit < 0) {
    return {
      success: false, creditsDebited: 0, balanceAfter: currentBalance,
      error: `creditsToDebit must be non-negative; got ${creditsToDebit}`,
    };
  }

  const newBalance = currentBalance - creditsToDebit;

  if (newBalance < 0 && !opts.allowOverage) {
    return {
      success: false, creditsDebited: 0, balanceAfter: currentBalance,
      error: `Insufficient credits. Balance: ${currentBalance}, requested: ${creditsToDebit}.`,
    };
  }

  const result: DebitResult = {
    success: true, creditsDebited: creditsToDebit, balanceAfter: newBalance,
  };

  if (newBalance < 0) {
    result.warning = `Overage: balance is ${newBalance}. Debt will be collected on next billing cycle.`;
  }

  return result;
}

// ── Grant ─────────────────────────────────────────────────────────────────────

export interface GrantResult {
  creditsGranted: number;
  balanceAfter:   number;
}

/**
 * Apply a credit grant against a current balance.
 * Always succeeds.
 */
export function applyCreditGrant(
  currentBalance:  number,
  creditsToGrant:  number,
): GrantResult {
  return {
    creditsGranted: Math.max(0, creditsToGrant),
    balanceAfter:   currentBalance + Math.max(0, creditsToGrant),
  };
}

// ── Balance computation ────────────────────────────────────────────────────────

/**
 * Compute the current credit balance by replaying all ledger entries.
 * Entries must be in chronological order (oldest first).
 */
export function calculateCreditBalance(
  orgSlug:  string,
  entries:  AiCreditLedgerEntry[],
): AiCreditBalance {
  let balance      = 0;
  let totalGranted = 0;
  let totalDebited = 0;
  let totalRefunded = 0;

  for (const e of entries) {
    balance += e.credits;
    if (e.credits > 0) {
      if (e.type === "REFUND") totalRefunded += e.credits;
      else                     totalGranted  += e.credits;
    } else {
      totalDebited += Math.abs(e.credits);
    }
  }

  const isLow = isCreditBalanceLow(balance, totalGranted);

  return {
    orgSlug,
    availableCredits: balance,
    totalGranted,
    totalDebited,
    totalRefunded,
    isLow,
    lowThreshold: LOW_BALANCE_ABS_THRESHOLD,
    computedAt:   new Date().toISOString(),
  };
}

// ── Low balance check ─────────────────────────────────────────────────────────

/**
 * Returns true if the credit balance is dangerously low.
 * Triggers a low_balance_warning audit event.
 */
export function isCreditBalanceLow(
  currentBalance: number,
  totalGranted:   number,
): boolean {
  if (currentBalance <= LOW_BALANCE_ABS_THRESHOLD) return true;
  if (totalGranted > 0) {
    const fraction = currentBalance / totalGranted;
    if (fraction <= LOW_BALANCE_THRESHOLD_FRACTION) return true;
  }
  return false;
}
