/**
 * lib/ai-billing/ai-billing-result.ts
 *
 * Agentik — AI Billing Foundation — Result Types
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiUsageRecord }       from "./ai-usage-types";
import type { AiCreditLedgerEntry } from "./ai-credit-types";
import type { AiBillingAuditEvent } from "./ai-billing-audit";

// ── Result ────────────────────────────────────────────────────────────────────

/**
 * Structured result returned by all AI billing service operations.
 */
export interface AiBillingResult {
  /** Whether the operation succeeded. */
  success: boolean;

  /** Human-readable message describing the outcome. */
  message: string;

  /** The usage record created or updated (if applicable). */
  usageRecord?: AiUsageRecord;

  /** The ledger entry created (if applicable). */
  ledgerEntry?: AiCreditLedgerEntry;

  /** Credit balance after this operation. */
  balanceAfter?: number;

  /** Credits consumed in this operation. */
  creditsUsed?: number;

  /** Provider cost in USD for this operation (internal only). */
  costUsd?: number;

  /** Non-fatal warnings (e.g. low balance, missing provider). */
  warnings: string[];

  /** Errors that caused the operation to fail. */
  errors: string[];

  /** Ordered audit trail for this operation. */
  auditTrail: AiBillingAuditEvent[];
}

// ── Factories ─────────────────────────────────────────────────────────────────

export function successBillingResult(
  message:   string,
  overrides: Partial<Omit<AiBillingResult, "success" | "message">> = {},
): AiBillingResult {
  return {
    success:    true,
    message,
    warnings:   [],
    errors:     [],
    auditTrail: [],
    ...overrides,
  };
}

export function failedBillingResult(
  message: string,
  errors:  string[],
  overrides: Partial<Omit<AiBillingResult, "success" | "message" | "errors">> = {},
): AiBillingResult {
  return {
    success:    false,
    message,
    errors,
    warnings:   [],
    auditTrail: [],
    ...overrides,
  };
}
