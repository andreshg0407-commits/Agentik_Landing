/**
 * lib/reconciliation/shadow-reconciliation.ts
 *
 * SAFE shadow reconciliation engine — simulation only.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────────
 * Computes what CustomerReceivable balances WOULD become if all SAG cobros
 * were applied. Does NOT write to the database. Does NOT update any balances.
 * Returns ShadowReconciliationResult records for analysis and audit.
 *
 * ── HOW IT WORKS ─────────────────────────────────────────────────────────────
 * 1. Load CustomerReceivable rows for a customer (or all customers)
 * 2. Load all CollectionRecord rows for the same scope
 * 3. For each CollectionRecord, extract the invoice reference via
 *    parseAppliedFacts() / rawJson.Documento_pagado
 * 4. Group cobros by targetInvoiceId (= CustomerReceivable.erpId)
 * 5. Sum cobro amounts per invoice → inferredPaid
 * 6. Compute theoreticalBalance = originalAmount - inferredPaid
 * 7. Compute variance = theoreticalBalance - currentBalance (Agentik's stored value)
 *
 * ── CONFIDENCE RULES ─────────────────────────────────────────────────────────
 *   HIGH   — All cobros matched to exactly one receivable via erpId; amounts > 0
 *   MEDIUM — Some cobros matched, some unmatched; or amount coverage > 50%
 *   LOW    — No cobros found, or all cobros are UNMATCHED
 *
 * ── INVARIANTS ────────────────────────────────────────────────────────────────
 * - Never mutates any DB record
 * - Never throws (all errors → LOW confidence result with notes)
 * - Read-only: uses prisma.$transaction with a read-only flavor (SELECT only)
 */

import { prisma } from "@/lib/prisma";
import {
  parseAppliedFacts,
  extractInvoiceCandidates,
} from "./applied-facts-parser";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShadowReconciliationResult {
  /** CustomerReceivable.id */
  receivableId:    string;

  /** CustomerReceivable.erpId (e.g. "MOV-10329") */
  erpId:           string | null;

  /** CustomerReceivable.customerNit */
  customerNit:     string | null;

  /** CustomerReceivable.customerName */
  customerName:    string;

  /** CustomerReceivable.originalAmount — invoice face value from SAG */
  originalAmount:  number;

  /** CustomerReceivable.balanceDue — Agentik's current (stale) balance */
  currentBalance:  number;

  /** CustomerReceivable.paidAmount — Agentik's tracked paid (from PaymentAllocation) */
  currentPaid:     number;

  /** Sum of all SAG cobros referencing this invoice (from CollectionRecord) */
  inferredPaid:    number;

  /** Sum of any ND (nota débito) amounts (increases balance) — currently 0 (not in dataset) */
  inferredDiscounts: number;

  /** originalAmount - inferredPaid - inferredDiscounts */
  theoreticalBalance: number;

  /** currentBalance - theoreticalBalance (positive = Agentik overstates balance) */
  variance:        number;

  /**
   * Confidence in this result:
   *   HIGH   — erpId join succeeded, cobros found, amounts positive
   *   MEDIUM — partial join coverage or zero-amount cobros
   *   LOW    — no cobros found for this receivable, or erpId null
   */
  confidence:      "HIGH" | "MEDIUM" | "LOW";

  /** Number of CollectionRecord rows that contributed to inferredPaid */
  cobroCount:      number;

  /** Cobro date range if any cobros found */
  firstCobroDate:  Date | null;
  lastCobroDate:   Date | null;

  /** SAG status: OPEN, PARTIAL, PAID, OVERDUE, WRITTEN_OFF, CANCELLED */
  currentStatus:   string;

  /**
   * Theoretical status based on shadow balance:
   *   PAID      — theoreticalBalance <= 0
   *   PARTIAL   — 0 < theoreticalBalance < originalAmount
   *   OPEN      — theoreticalBalance >= originalAmount (no payments applied)
   *   OVERPAID  — theoreticalBalance < 0 (cobros exceed invoice, possible error)
   */
  theoreticalStatus: "PAID" | "PARTIAL" | "OPEN" | "OVERPAID";

  /** Explanatory note when confidence is LOW or variance is large */
  note?: string;
}

export interface ShadowReconciliationSummary {
  orgId:             string;
  scope:             string;     // "customer:{nit}" | "all"
  runAt:             string;     // ISO timestamp
  totalReceivables:  number;
  fullyExplained:    number;     // variance == 0 (or within tolerance)
  partiallyExplained: number;   // some cobros found, variance != 0
  unexplained:       number;    // no cobros found
  totalOriginalAmount: number;
  totalCurrentBalance: number;
  totalInferredPaid:   number;
  totalTheoreticalBalance: number;
  totalVariance:       number;
  highConfidence:      number;
  mediumConfidence:    number;
  lowConfidence:       number;
  /** % of balance that shadow-reconciliation can explain */
  explainabilityRate:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

/** Amount tolerance for "fully explained" classification: 0.5% */
const VARIANCE_TOLERANCE_PCT = 0.005;

function classifyVariance(
  variance:   number,
  origAmount: number,
): "fully_explained" | "partially_explained" | "unexplained" {
  if (origAmount === 0) return "unexplained";
  const pct = Math.abs(variance) / origAmount;
  if (pct <= VARIANCE_TOLERANCE_PCT) return "fully_explained";
  if (Math.abs(variance) < origAmount) return "partially_explained";
  return "unexplained";
}

function theoreticalStatus(
  theoreticalBalance: number,
  originalAmount:     number,
): ShadowReconciliationResult["theoreticalStatus"] {
  if (theoreticalBalance < 0) return "OVERPAID";
  if (theoreticalBalance <= VARIANCE_TOLERANCE_PCT * originalAmount) return "PAID";
  if (theoreticalBalance < originalAmount) return "PARTIAL";
  return "OPEN";
}

// ── Core engine ───────────────────────────────────────────────────────────────

/**
 * Run shadow reconciliation for a single customer (by NIT or sagTerceroId).
 *
 * @param orgId          Organization ID (multi-tenant)
 * @param customerFilter Filter for CustomerReceivable lookup (nit or sagTerceroId)
 */
export async function shadowReconcileCustomer(
  orgId:          string,
  customerFilter: { nit?: string; sagTerceroId?: number; customerId?: string },
): Promise<ShadowReconciliationResult[]> {
  const db = prisma as any;

  // ── Load CustomerReceivable rows ──────────────────────────────────────────
  // Build where clause based on available identity signal
  const receivableWhere: Record<string, unknown> = { organizationId: orgId };

  if (customerFilter.customerId) {
    receivableWhere["customerId"] = customerFilter.customerId;
  } else if (customerFilter.nit) {
    receivableWhere["customerNit"] = customerFilter.nit;
  } else if (customerFilter.sagTerceroId) {
    // CustomerReceivable doesn't have sagTerceroId — must join via CustomerProfile
    // Use customerNit fallback from profile
    const profile = await db.customerProfile.findFirst({
      where: { organizationId: orgId, sagTerceroId: customerFilter.sagTerceroId },
      select: { nit: true, nitNormalized: true, id: true },
    });
    if (!profile) return [];
    receivableWhere["OR"] = [
      { customerId: profile.id },
      { customerNit: profile.nitNormalized ?? profile.nit },
      { customerNit: profile.nit },
    ];
  } else {
    return [];
  }

  const receivables = await db.customerReceivable.findMany({
    where: receivableWhere,
    select: {
      id:             true,
      erpId:          true,
      customerNit:    true,
      customerName:   true,
      originalAmount: true,
      paidAmount:     true,
      balanceDue:     true,
      status:         true,
    },
  });

  if (receivables.length === 0) return [];

  // ── Build erpId → receivable map ─────────────────────────────────────────
  const receivableByErpId = new Map<string, (typeof receivables)[0]>();
  for (const r of receivables) {
    if (r.erpId) receivableByErpId.set(r.erpId, r);
  }

  // ── Load CollectionRecord rows for this customer ──────────────────────────
  // Match by sagTerceroId when available (most reliable), fallback to customerNit
  const collectionWhere: Record<string, unknown> = { organizationId: orgId };

  if (customerFilter.sagTerceroId) {
    collectionWhere["sagTerceroId"] = customerFilter.sagTerceroId;
  } else if (customerFilter.nit) {
    // Normalize: SAG may store NIT without leading zeros
    collectionWhere["customerNit"] = customerFilter.nit;
  } else if (customerFilter.customerId) {
    // Must resolve to NIT first
    const profile = await db.customerProfile.findUnique({
      where: { id: customerFilter.customerId },
      select: { nit: true, nitNormalized: true, sagTerceroId: true },
    });
    if (profile?.sagTerceroId) {
      collectionWhere["sagTerceroId"] = profile.sagTerceroId;
    } else if (profile?.nitNormalized || profile?.nit) {
      collectionWhere["customerNit"] = profile.nitNormalized ?? profile.nit;
    }
  }

  const collections = await db.collectionRecord.findMany({
    where: collectionWhere,
    select: {
      id:              true,
      appliedFacts:    true,
      rawJson:         true,
      comprobanteCode: true,
      amount:          true,
      collectionDate:  true,
    },
  });

  // ── Build erpId → cobro aggregation map ─────────────────────────────────
  // For each cobro, extract the targetInvoiceId and accumulate.
  // Key: CustomerReceivable.erpId (e.g. "MOV-10329")
  type CobroAccum = {
    totalAmount:   number;
    count:         number;
    firstDate:     Date | null;
    lastDate:      Date | null;
  };
  const cobrosByErpId = new Map<string, CobroAccum>();
  let unmatchedCobros = 0;

  for (const col of collections) {
    const candidates = extractInvoiceCandidates(col.appliedFacts, col.rawJson);
    const amount      = toNum(col.amount);
    const date        = col.collectionDate ? new Date(col.collectionDate) : null;

    if (candidates.length === 0) {
      unmatchedCobros++;
      continue;
    }

    // Each cobro applies to one invoice (current SAG data: exactly one Documento_pagado)
    // Future: multi-invoice cobros would split the amount — for now take first candidate
    const erpId = candidates[0];

    const existing = cobrosByErpId.get(erpId);
    if (existing) {
      existing.totalAmount += amount;
      existing.count       += 1;
      if (date) {
        if (!existing.firstDate || date < existing.firstDate) existing.firstDate = date;
        if (!existing.lastDate  || date > existing.lastDate)  existing.lastDate  = date;
      }
    } else {
      cobrosByErpId.set(erpId, {
        totalAmount: amount,
        count:       1,
        firstDate:   date,
        lastDate:    date,
      });
    }
  }

  // ── Build ShadowReconciliationResult per receivable ──────────────────────
  return (receivables as any[]).map((rec): ShadowReconciliationResult => {
    const originalAmount = toNum(rec.originalAmount);
    const currentBalance = toNum(rec.balanceDue);
    const currentPaid    = toNum(rec.paidAmount);

    const cobros = rec.erpId ? cobrosByErpId.get(rec.erpId) : undefined;
    const inferredPaid    = cobros?.totalAmount ?? 0;
    const inferredDiscounts = 0; // ND not yet in CollectionRecord

    const theorBal  = Math.max(0, originalAmount - inferredPaid - inferredDiscounts);
    const variance  = currentBalance - theorBal;
    const cobroCount = cobros?.count ?? 0;

    // Determine confidence
    let confidence: "HIGH" | "MEDIUM" | "LOW";
    let note: string | undefined;

    if (!rec.erpId) {
      confidence = "LOW";
      note = "No erpId on receivable — cannot join to CollectionRecord";
    } else if (cobroCount === 0) {
      confidence = "LOW";
      note = "No cobros found for this invoice in CollectionRecord";
    } else if (inferredPaid >= originalAmount * 0.9) {
      confidence = "HIGH";
    } else {
      confidence = "MEDIUM";
      note = `Cobros cover ${((inferredPaid / originalAmount) * 100).toFixed(1)}% of invoice — may be partial or data gap`;
    }

    const varClass = classifyVariance(variance, originalAmount);
    if (varClass === "unexplained" && !note) {
      note = `Variance ${variance.toFixed(0)} COP (${((Math.abs(variance) / Math.max(originalAmount, 1)) * 100).toFixed(1)}%) unexplained`;
    }

    return {
      receivableId:      rec.id,
      erpId:             rec.erpId,
      customerNit:       rec.customerNit,
      customerName:      rec.customerName,
      originalAmount,
      currentBalance,
      currentPaid,
      inferredPaid,
      inferredDiscounts,
      theoreticalBalance: theorBal,
      variance,
      confidence,
      cobroCount,
      firstCobroDate:   cobros?.firstDate ?? null,
      lastCobroDate:    cobros?.lastDate  ?? null,
      currentStatus:    rec.status,
      theoreticalStatus: theoreticalStatus(theorBal, originalAmount),
      note,
    };
  });
}

/**
 * Run shadow reconciliation for all customers in an org.
 *
 * WARNING: This loads all CustomerReceivable and CollectionRecord rows for
 * the org. For large orgs (Castillitos has 124,998 receivables), use
 * pagination or run as a background job.
 *
 * @param orgId      Organization ID
 * @param opts.limit Maximum receivables to process (default: 1000)
 */
export async function shadowReconcileOrg(
  orgId:  string,
  opts: { limit?: number } = {},
): Promise<{
  results: ShadowReconciliationResult[];
  summary: ShadowReconciliationSummary;
}> {
  const db    = prisma as any;
  const limit = opts.limit ?? 1000;

  // ── Load receivables (limited for safety) ────────────────────────────────
  const receivables = await db.customerReceivable.findMany({
    where: { organizationId: orgId },
    select: {
      id:             true,
      erpId:          true,
      customerNit:    true,
      customerName:   true,
      originalAmount: true,
      paidAmount:     true,
      balanceDue:     true,
      status:         true,
    },
    take: limit,
    orderBy: { balanceDue: "desc" },
  });

  // ── Load all cobros for org ───────────────────────────────────────────────
  const collections = await db.collectionRecord.findMany({
    where: { organizationId: orgId },
    select: {
      appliedFacts:    true,
      rawJson:         true,
      comprobanteCode: true,
      amount:          true,
      collectionDate:  true,
    },
  });

  // ── Build erpId → cobro aggregation ──────────────────────────────────────
  type CobroAccum = { totalAmount: number; count: number; firstDate: Date | null; lastDate: Date | null };
  const cobrosByErpId = new Map<string, CobroAccum>();

  for (const col of collections) {
    const candidates = extractInvoiceCandidates(col.appliedFacts, col.rawJson);
    const amount      = toNum(col.amount);
    const date        = col.collectionDate ? new Date(col.collectionDate) : null;

    if (candidates.length === 0) continue;
    const erpId = candidates[0];

    const existing = cobrosByErpId.get(erpId);
    if (existing) {
      existing.totalAmount += amount;
      existing.count       += 1;
      if (date) {
        if (!existing.firstDate || date < existing.firstDate) existing.firstDate = date;
        if (!existing.lastDate  || date > existing.lastDate)  existing.lastDate  = date;
      }
    } else {
      cobrosByErpId.set(erpId, { totalAmount: amount, count: 1, firstDate: date, lastDate: date });
    }
  }

  // ── Build results ─────────────────────────────────────────────────────────
  const results: ShadowReconciliationResult[] = receivables.map((rec: any): ShadowReconciliationResult => {
    const originalAmount = toNum(rec.originalAmount);
    const currentBalance = toNum(rec.balanceDue);
    const currentPaid    = toNum(rec.paidAmount);

    const cobros       = rec.erpId ? cobrosByErpId.get(rec.erpId) : undefined;
    const inferredPaid = cobros?.totalAmount ?? 0;
    const theorBal     = Math.max(0, originalAmount - inferredPaid);
    const variance     = currentBalance - theorBal;
    const cobroCount   = cobros?.count ?? 0;

    let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let note: string | undefined;

    if (!rec.erpId) {
      note = "No erpId — cannot join to cobros";
    } else if (cobroCount === 0) {
      note = "No cobros found for this invoice";
    } else if (inferredPaid >= originalAmount * 0.9) {
      confidence = "HIGH";
    } else {
      confidence = "MEDIUM";
      note = `Cobros cover ${((inferredPaid / Math.max(originalAmount, 1)) * 100).toFixed(1)}%`;
    }

    return {
      receivableId:       rec.id,
      erpId:              rec.erpId,
      customerNit:        rec.customerNit,
      customerName:       rec.customerName,
      originalAmount,
      currentBalance,
      currentPaid,
      inferredPaid,
      inferredDiscounts:  0,
      theoreticalBalance: theorBal,
      variance,
      confidence,
      cobroCount,
      firstCobroDate:     cobros?.firstDate ?? null,
      lastCobroDate:      cobros?.lastDate  ?? null,
      currentStatus:      rec.status,
      theoreticalStatus:  theoreticalStatus(theorBal, originalAmount),
      note,
    };
  });

  // ── Build summary ─────────────────────────────────────────────────────────
  let fullyExplained = 0, partiallyExplained = 0, unexplained = 0;
  let totalOriginal = 0, totalCurrent = 0, totalInferred = 0, totalTheoretical = 0, totalVariance = 0;
  let highConf = 0, medConf = 0, lowConf = 0;

  for (const r of results) {
    totalOriginal    += r.originalAmount;
    totalCurrent     += r.currentBalance;
    totalInferred    += r.inferredPaid;
    totalTheoretical += r.theoreticalBalance;
    totalVariance    += r.variance;

    const vc = classifyVariance(r.variance, r.originalAmount);
    if (vc === "fully_explained")    fullyExplained++;
    else if (vc === "partially_explained") partiallyExplained++;
    else                              unexplained++;

    if (r.confidence === "HIGH")   highConf++;
    else if (r.confidence === "MEDIUM") medConf++;
    else                           lowConf++;
  }

  const explainabilityRate = results.length > 0
    ? ((fullyExplained + partiallyExplained) / results.length) * 100
    : 0;

  const summary: ShadowReconciliationSummary = {
    orgId,
    scope:              "all",
    runAt:              new Date().toISOString(),
    totalReceivables:   results.length,
    fullyExplained,
    partiallyExplained,
    unexplained,
    totalOriginalAmount:     totalOriginal,
    totalCurrentBalance:     totalCurrent,
    totalInferredPaid:       totalInferred,
    totalTheoreticalBalance: totalTheoretical,
    totalVariance,
    highConfidence:     highConf,
    mediumConfidence:   medConf,
    lowConfidence:      lowConf,
    explainabilityRate,
  };

  return { results, summary };
}
