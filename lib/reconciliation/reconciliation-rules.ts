/**
 * lib/reconciliation/reconciliation-rules.ts
 *
 * Sprint S3 Phase 1 — Reconciliation rule definitions and validators.
 *
 * Phase 1 implements exactly one rule: MOV_EXACT_MATCH.
 * All other rules are defined here for future phases but not activated.
 *
 * A rule takes a (cobro, receivable) candidate pair and decides:
 *   - Whether the pair qualifies for reconciliation
 *   - The confidence level
 *   - The amount to apply
 *   - Any skip reason
 *
 * Rules NEVER write to the DB — they are pure functions over in-memory data.
 */

// Decimal type from Prisma runtime (compatible with both Decimal instances and numbers)
type Decimal = { toNumber(): number } | number;

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleId = "MOV_EXACT_MATCH";

export interface CandidateCobro {
  id:                string;
  organizationId:    string;
  amount:            Decimal | number;
  comprobanteCode:   string;
  collectionDate:    Date;
  rawJson:           unknown;
  appliedStatus:     string;
  naturalKey:        string;
}

export interface CandidateReceivable {
  id:             string;
  organizationId: string;
  erpId:          string | null;
  originalAmount: Decimal | number;
  paidAmount:     Decimal | number;
  balanceDue:     Decimal | number;
  status:         string;
  customerName:   string;
  customerNit:    string | null;
  invoiceDate:    Date;
}

export interface RuleDecision {
  qualifies:    boolean;
  ruleId:       RuleId;
  confidence:   "HIGH" | "MEDIUM" | "LOW";
  amountToApply: number;
  skipReason?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return parseFloat(String(v)) || 0;
}

/**
 * Extract Documento_pagado from CollectionRecord.rawJson.
 * Returns null if not present or zero.
 */
export function extractDocumentoPagado(rawJson: unknown): number | null {
  if (rawJson == null || typeof rawJson !== "object") return null;
  const rj = rawJson as Record<string, unknown>;
  const raw = rj["raw"] as Record<string, unknown> | null | undefined;
  const sagRow = raw ?? rj;
  const dp =
    sagRow["Documento_pagado"] ??
    sagRow["documento_pagado"] ??
    sagRow["DOCUMENTO_PAGADO"];
  if (dp == null) return null;
  const n = typeof dp === "number" ? dp : parseInt(String(dp), 10);
  if (!isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Derive the CustomerReceivable.erpId join key from Documento_pagado.
 * Format: "MOV-{Documento_pagado}"
 */
export function docPagadoToErpId(docPagado: number): string {
  return `MOV-${docPagado}`;
}

// ── Rule: MOV_EXACT_MATCH ─────────────────────────────────────────────────────

/**
 * Phase 1 rule: exact match via Documento_pagado → CustomerReceivable.erpId.
 *
 * Qualifies when:
 *   1. CollectionRecord.rawJson.raw.Documento_pagado is a positive integer
 *   2. A CustomerReceivable with erpId = "MOV-" + Documento_pagado exists (checked upstream)
 *   3. CollectionRecord.amount > 0
 *   4. CustomerReceivable.originalAmount > 0
 *   5. CustomerReceivable.status is not PAID or WRITTEN_OFF
 *   6. CollectionRecord.appliedStatus is AVAILABLE or PARTIALLY_APPLIED
 *
 * The caller is responsible for the existence check (#2) and dedup check.
 * This function validates the pair given a matched receivable.
 */
export function applyRuleMovExactMatch(
  cobro: CandidateCobro,
  receivable: CandidateReceivable,
): RuleDecision {
  const cobroAmt   = toNum(cobro.amount);
  const origAmt    = toNum(receivable.originalAmount);
  const paidAmt    = toNum(receivable.paidAmount);
  const balanceDue = toNum(receivable.balanceDue);

  // Guard: cobro must have a positive amount
  if (cobroAmt <= 0) {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "LOW",
      amountToApply: 0,
      skipReason: `COBRO_ZERO_AMOUNT: cobro.amount=${cobroAmt}`,
    };
  }

  // Guard: receivable must have a positive original amount (excludes SISTECREDITO zero rows)
  if (origAmt <= 0) {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "LOW",
      amountToApply: 0,
      skipReason: `RX_ZERO_ORIGINAL: originalAmount=${origAmt}`,
    };
  }

  // Guard: receivable must not be fully paid or written off
  if (receivable.status === "PAID") {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "HIGH",
      amountToApply: 0,
      skipReason: `RX_ALREADY_PAID`,
    };
  }
  if (receivable.status === "WRITTEN_OFF") {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "HIGH",
      amountToApply: 0,
      skipReason: `RX_WRITTEN_OFF`,
    };
  }

  // Guard: cobro must be AVAILABLE (or PARTIALLY_APPLIED for multi-cobro invoices)
  if (cobro.appliedStatus === "APPLIED") {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "HIGH",
      amountToApply: 0,
      skipReason: `COBRO_ALREADY_APPLIED`,
    };
  }
  if (cobro.appliedStatus === "MANUAL_OVERRIDE") {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "HIGH",
      amountToApply: 0,
      skipReason: `COBRO_MANUAL_OVERRIDE`,
    };
  }

  // Guard: remaining balance must be positive
  if (balanceDue <= 0) {
    return {
      qualifies: false,
      ruleId:    "MOV_EXACT_MATCH",
      confidence: "HIGH",
      amountToApply: 0,
      skipReason: `RX_BALANCE_ZERO: balanceDue=${balanceDue}`,
    };
  }

  // Amount to apply: MIN(cobro amount, remaining balance) — never go negative
  const amountToApply = Math.min(cobroAmt, balanceDue);

  return {
    qualifies:     true,
    ruleId:        "MOV_EXACT_MATCH",
    confidence:    "HIGH",
    amountToApply,
  };
}

// ── Status derivation ─────────────────────────────────────────────────────────

/**
 * Derive the new CustomerReceivable.status after applying amountApplied to a receivable.
 */
export function deriveStatusAfter(
  receivable: Pick<CandidateReceivable, "originalAmount" | "paidAmount">,
  amountApplied: number,
): "OPEN" | "PARTIAL" | "PAID" {
  const origAmt = toNum(receivable.originalAmount);
  const paidBefore = toNum(receivable.paidAmount);
  const newPaid = paidBefore + amountApplied;

  if (newPaid >= origAmt) return "PAID";
  if (newPaid > 0)        return "PARTIAL";
  return "OPEN";
}

/**
 * Compute post-application balance fields.
 */
export function computeBalanceAfter(
  receivable: Pick<CandidateReceivable, "originalAmount" | "paidAmount" | "balanceDue">,
  amountApplied: number,
): { paidAfter: number; balanceAfter: number } {
  const origAmt    = toNum(receivable.originalAmount);
  const paidBefore = toNum(receivable.paidAmount);
  const paidAfter  = Math.min(origAmt, paidBefore + amountApplied);
  const balanceAfter = Math.max(0, origAmt - paidAfter);
  return { paidAfter, balanceAfter };
}
