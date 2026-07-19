/**
 * lib/ai-billing/ai-credit-types.ts
 *
 * Agentik — AI Billing Foundation — Credit Ledger Types
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Credits are the commercial unit Agentik sells to tenants.
 * Tenants never see tokens or USD — only credits.
 *
 * Pure domain. No Prisma. No React. No server-only.
 * Client-safe.
 */

import type { AiCreditLedgerId } from "./ai-billing-types";

// ── Ledger entry type ─────────────────────────────────────────────────────────

/**
 * All possible movements in the credit ledger.
 */
export type AiCreditLedgerEntryType =
  | "PURCHASE"          // tenant bought credits
  | "MONTHLY_GRANT"     // plan-included credits granted at cycle start
  | "USAGE_DEBIT"       // credits consumed by an AI operation
  | "REFUND"            // credits returned after a failed or disputed charge
  | "MANUAL_ADJUSTMENT" // admin correction
  | "EXPIRATION"        // credits that lapsed at end of billing period
  | "PROMO_CREDIT";     // promotional credits granted

// ── Credit ledger entry ───────────────────────────────────────────────────────

/**
 * One immutable movement in the credit ledger.
 * The credit balance is derived by replaying all entries for an org.
 */
export interface AiCreditLedgerEntry {
  /** Unique identifier for this ledger entry. */
  id: AiCreditLedgerId;

  /** Tenant slug. */
  orgSlug: string;

  /** Internal organization DB id. */
  organizationId?: string;

  /** Type of movement. */
  type: AiCreditLedgerEntryType;

  /**
   * Credit delta.
   * Positive for grants/purchases/refunds/promos.
   * Negative for debits/expirations.
   */
  credits: number;

  /**
   * Running balance after this entry was applied.
   * Populated at write time by the ledger service.
   */
  balanceAfter?: number;

  /** Foreign key to AiUsage if this debit corresponds to a usage record. */
  relatedUsageId?: string;

  /** Foreign key to an invoice if applicable. */
  relatedInvoiceId?: string;

  /** Human-readable reason for this entry. */
  reason?: string;

  /** Actor who created this entry: "system" | "admin:<userId>" | "cron" */
  createdBy?: string;

  /** ISO timestamp when this entry was created. */
  createdAt: string;

  /** Arbitrary metadata for auditing. */
  metadata?: Record<string, unknown>;
}

// ── Credit balance ────────────────────────────────────────────────────────────

export interface AiCreditBalance {
  orgSlug:         string;
  availableCredits: number;
  totalGranted:    number;
  totalDebited:    number;
  totalRefunded:   number;
  isLow:           boolean;
  lowThreshold:    number;
  computedAt:      string;
}
