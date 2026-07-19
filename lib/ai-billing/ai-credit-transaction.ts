/**
 * lib/ai-billing/ai-credit-transaction.ts
 *
 * Agentik — AI Billing Hardening — Credit Transaction Domain Types
 * Sprint: AGENTIK-AI-BILLING-HARDENING-01
 *
 * Every modification to credit balance must go through a CreditTransaction.
 * No balance changes are allowed outside the transactional layer.
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

// ── Transaction type ──────────────────────────────────────────────────────────

/**
 * The four canonical types of credit movement.
 * Maps to AiCreditLedgerEntryType in the ledger but with stricter semantics.
 */
export type CreditTransactionType =
  | "GRANT"       // adding credits (monthly, purchase, promo)
  | "DEBIT"       // consuming credits (AI usage)
  | "REFUND"      // returning credits (failed job, dispute)
  | "ADJUSTMENT"; // manual correction by admin

// ── Overage policy ────────────────────────────────────────────────────────────

/**
 * Controls whether a tenant can go below zero.
 *
 * allowOverage = false (default) → balance never goes negative
 * allowOverage = true            → balance can go negative up to overageLimitCredits
 */
export interface OveragePolicy {
  allowOverage:        boolean;
  /** Maximum debt allowed (only relevant when allowOverage=true). 0 = unlimited. */
  overageLimitCredits: number;
}

export const DEFAULT_OVERAGE_POLICY: OveragePolicy = {
  allowOverage:        false,
  overageLimitCredits: 0,
};

// ── Transaction request ───────────────────────────────────────────────────────

/**
 * Input for any atomic credit operation.
 */
export interface CreditTransactionRequest {
  orgSlug:          string;
  organizationId?:  string; // resolved by atomic repo if missing

  type:             CreditTransactionType;

  /** Always positive. The direction is determined by `type`. */
  amount:           number;

  /**
   * Idempotency key. If the same correlationId arrives twice:
   *   - the second call is a no-op
   *   - returns the original ledger entry
   *   - result.idempotent = true
   *
   * Examples: "workflow:run123:step2", "approval:ap_001", "ao:op_xyz"
   */
  correlationId?:   string;

  reason?:          string;
  relatedUsageId?:  string;
  relatedInvoiceId?: string;
  createdBy?:       string;

  overagePolicy?:   OveragePolicy;
  metadata?:        Record<string, unknown>;
}

// ── Transaction result ────────────────────────────────────────────────────────

/**
 * Result of an atomic credit operation.
 * Never throws — always returns a structured result.
 */
export interface CreditTransactionResult {
  success:      boolean;

  /** True if this exact correlationId was already processed. No duplicate write occurred. */
  idempotent:   boolean;

  /** True if the operation was blocked (insufficient credits or policy). */
  blocked:      boolean;

  balanceBefore: number;
  balanceAfter:  number;

  /** The ledger entry created (or the existing one if idempotent). */
  ledgerEntryId?: string;

  reason?:  string;
  error?:   string;
}

// ── Committed transaction (domain record) ─────────────────────────────────────

/**
 * An immutable record of a committed credit transaction.
 * Produced after successful atomic write.
 */
export interface CreditTransaction {
  id:              string;
  orgSlug:         string;
  type:            CreditTransactionType;
  amount:          number;
  balanceBefore:   number;
  balanceAfter:    number;
  correlationId?:  string;
  idempotent:      boolean;
  createdAt:       string;
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

/**
 * Validate the proposed balance change against the overage policy.
 * Returns true if the operation is allowed.
 */
export function isBalanceChangeAllowed(
  currentBalance:   number,
  debitAmount:      number,
  policy:           OveragePolicy = DEFAULT_OVERAGE_POLICY,
): { allowed: boolean; reason?: string } {
  const projectedBalance = currentBalance - debitAmount;

  if (projectedBalance >= 0) {
    return { allowed: true };
  }

  if (!policy.allowOverage) {
    return {
      allowed: false,
      reason:  `Insufficient credits: balance ${currentBalance}, requested ${debitAmount}.`,
    };
  }

  if (policy.overageLimitCredits > 0 && Math.abs(projectedBalance) > policy.overageLimitCredits) {
    return {
      allowed: false,
      reason:  `Overage limit exceeded: projected balance ${projectedBalance}, limit −${policy.overageLimitCredits}.`,
    };
  }

  return { allowed: true };
}

/**
 * Map a CreditTransactionType to the corresponding AiCreditLedgerEntryType.
 */
export function transactionTypeToLedgerType(
  type: CreditTransactionType,
  subtype?: "PURCHASE" | "MONTHLY_GRANT" | "PROMO_CREDIT" | "MANUAL_ADJUSTMENT" | "EXPIRATION",
): string {
  switch (type) {
    case "GRANT":      return subtype ?? "MONTHLY_GRANT";
    case "DEBIT":      return "USAGE_DEBIT";
    case "REFUND":     return "REFUND";
    case "ADJUSTMENT": return "MANUAL_ADJUSTMENT";
  }
}
