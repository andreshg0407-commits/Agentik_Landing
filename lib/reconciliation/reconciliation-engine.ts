/**
 * lib/reconciliation/reconciliation-engine.ts
 *
 * Sprint S3 Phase 1 — Core reconciliation engine.
 *
 * Modes:
 *   DRY_RUN  — read-only simulation, no DB writes, returns full plan
 *   APPLY    — writes CollectionAllocation + updates CustomerReceivable in transactions
 *
 * Phase 1 rule: MOV_EXACT_MATCH only (HIGH confidence).
 * No fuzzy matching. No AI. No ND/NC adjustments.
 *
 * Design principles:
 *   - Idempotent: CollectionAllocation @@unique prevents double-application
 *   - Resumable: engine processes AVAILABLE cobros; already-applied ones are skipped
 *   - Transactional: each (cobro, receivable) pair is its own prisma.$transaction
 *   - Auditable: every application creates an immutable CollectionAllocation record
 *   - Never throws on individual record failure — errors are collected, not propagated
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  extractDocumentoPagado,
  docPagadoToErpId,
  applyRuleMovExactMatch,
  deriveStatusAfter,
  computeBalanceAfter,
  type CandidateCobro,
  type CandidateReceivable,
} from "./reconciliation-rules";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EngineMode = "DRY_RUN" | "APPLY";

export interface ReconciliationPair {
  cobroId:         string;
  receivableId:    string;
  cobroAmount:     number;
  amountApplied:   number;
  balanceBefore:   number;
  balanceAfter:    number;
  paidBefore:      number;
  paidAfter:       number;
  statusBefore:    string;
  statusAfter:     string;
  ruleId:          string;
  confidence:      string;
  erpId:           string;
  customerName:    string;
  docPagado:       number;
  cobroDate:       Date;
  comprobanteCode: string;
}

export interface SkippedRecord {
  cobroId:    string;
  erpId:      string | null;
  reason:     string;
  cobroAmt:   number;
}

export interface ReconciliationPlan {
  orgId:           string;
  mode:            EngineMode;
  totalCobros:     number;
  qualifiedPairs:  ReconciliationPair[];
  skippedCobros:   SkippedRecord[];
  unmatchedCobros: SkippedRecord[];  // no CustomerReceivable found for Documento_pagado
  totalAmountApplied:   number;
  totalBalanceReduction: number;
  projectedPaidCount:   number;
  projectedPartialCount: number;
}

export interface ReconciliationResult extends ReconciliationPlan {
  applied:  ReconciliationPair[];   // pairs actually committed (APPLY mode only)
  errored:  { cobroId: string; error: string }[];
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return parseFloat(String(v)) || 0;
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Build a reconciliation plan for an organization.
 *
 * Fetches all AVAILABLE CollectionRecords, extracts Documento_pagado,
 * joins to CustomerReceivable, applies Phase 1 rule, and returns
 * the full plan without writing anything.
 *
 * @param orgId         Organization ID
 * @param opts.limit    Cap total cobros processed (for testing; default: unlimited)
 * @param opts.erpIds   Process only these CustomerReceivable erpIds (for targeted runs)
 */
export async function buildReconciliationPlan(
  orgId: string,
  opts?: { limit?: number; erpIds?: string[] },
): Promise<ReconciliationPlan> {
  const limit = opts?.limit ?? 999_999;

  // Load all AVAILABLE cobros ordered by date (oldest first for correct partial accumulation)
  const cobros = await (prisma as any).collectionRecord.findMany({
    where: {
      organizationId: orgId,
      appliedStatus: { in: ["AVAILABLE", "PARTIALLY_APPLIED"] },
    },
    select: {
      id: true,
      organizationId: true,
      amount: true,
      comprobanteCode: true,
      collectionDate: true,
      rawJson: true,
      appliedStatus: true,
      naturalKey: true,
    },
    orderBy: { collectionDate: "asc" },
    take: limit,
  }) as CandidateCobro[];

  // Pre-fetch already-allocated pairs to skip them (idempotency)
  const existingAllocations = await (prisma as any).collectionAllocation.findMany({
    where: { organizationId: orgId },
    select: { collectionRecordId: true, receivableId: true },
  }) as { collectionRecordId: string; receivableId: string }[];

  const allocatedSet = new Set(
    existingAllocations.map((a: any) => `${a.collectionRecordId}:${a.receivableId}`)
  );

  // Build erpId → receivable map for efficient lookup
  // Extract all Documento_pagado values first, then bulk-fetch matching receivables
  const erpIdCandidates: Map<string, number> = new Map(); // erpId → docPagado
  for (const cobro of cobros) {
    const dp = extractDocumentoPagado(cobro.rawJson);
    if (dp != null) {
      const erpId = docPagadoToErpId(dp);
      erpIdCandidates.set(erpId, dp);
    }
  }

  const targetErpIds = opts?.erpIds
    ? Array.from(erpIdCandidates.keys()).filter(id => opts.erpIds!.includes(id))
    : Array.from(erpIdCandidates.keys());

  // Bulk-fetch all matching receivables
  const receivableRows = await (prisma as any).customerReceivable.findMany({
    where: {
      organizationId: orgId,
      erpId: { in: targetErpIds },
    },
    select: {
      id: true,
      organizationId: true,
      erpId: true,
      originalAmount: true,
      paidAmount: true,
      balanceDue: true,
      status: true,
      customerName: true,
      customerNit: true,
      invoiceDate: true,
    },
  }) as CandidateReceivable[];

  const rxByErpId = new Map<string, CandidateReceivable>(
    receivableRows.map(r => [r.erpId!, r])
  );

  // Process each cobro
  const qualifiedPairs:  ReconciliationPair[] = [];
  const skippedCobros:   SkippedRecord[] = [];
  const unmatchedCobros: SkippedRecord[] = [];

  // Track running paidAmount per receivable for multi-cobro accumulation
  const runningPaid = new Map<string, number>(); // receivableId → running paidAmount

  for (const cobro of cobros) {
    const dp = extractDocumentoPagado(cobro.rawJson);
    const cobroAmt = toNum(cobro.amount);

    if (dp == null) {
      skippedCobros.push({
        cobroId: cobro.id,
        erpId: null,
        reason: "NO_DOCUMENTO_PAGADO",
        cobroAmt,
      });
      continue;
    }

    const erpId = docPagadoToErpId(dp);
    const rx = rxByErpId.get(erpId);

    if (!rx) {
      unmatchedCobros.push({
        cobroId: cobro.id,
        erpId,
        reason: "NO_RX_MATCH",
        cobroAmt,
      });
      continue;
    }

    // Skip if already allocated
    const pairKey = `${cobro.id}:${rx.id}`;
    if (allocatedSet.has(pairKey)) {
      skippedCobros.push({
        cobroId: cobro.id,
        erpId,
        reason: "ALREADY_ALLOCATED",
        cobroAmt,
      });
      continue;
    }

    // Build effective receivable with running accumulated paidAmount
    const runPaid = runningPaid.get(rx.id) ?? toNum(rx.paidAmount);
    const origAmt = toNum(rx.originalAmount);
    const effectiveBalance = Math.max(0, origAmt - runPaid);

    const effectiveRx: CandidateReceivable = {
      ...rx,
      paidAmount: runPaid,
      balanceDue: effectiveBalance,
    };

    // Apply rule
    const decision = applyRuleMovExactMatch(cobro, effectiveRx);

    if (!decision.qualifies) {
      skippedCobros.push({
        cobroId: cobro.id,
        erpId,
        reason: decision.skipReason ?? "RULE_REJECTED",
        cobroAmt,
      });
      continue;
    }

    const { paidAfter, balanceAfter } = computeBalanceAfter(effectiveRx, decision.amountToApply);
    const statusAfter = deriveStatusAfter(effectiveRx, decision.amountToApply);

    qualifiedPairs.push({
      cobroId:         cobro.id,
      receivableId:    rx.id,
      cobroAmount:     cobroAmt,
      amountApplied:   decision.amountToApply,
      balanceBefore:   effectiveBalance,
      balanceAfter,
      paidBefore:      runPaid,
      paidAfter,
      statusBefore:    runPaid > 0 ? "PARTIAL" : (rx.status ?? "OPEN"),
      statusAfter,
      ruleId:          decision.ruleId,
      confidence:      decision.confidence,
      erpId,
      customerName:    rx.customerName,
      docPagado:       dp,
      cobroDate:       cobro.collectionDate,
      comprobanteCode: cobro.comprobanteCode,
    });

    // Update running state for next cobro against same receivable
    runningPaid.set(rx.id, paidAfter);
  }

  const totalAmountApplied = qualifiedPairs.reduce((s, p) => s + p.amountApplied, 0);
  const projectedPaidCount    = qualifiedPairs.filter(p => p.statusAfter === "PAID").length;
  const projectedPartialCount = qualifiedPairs.filter(p => p.statusAfter === "PARTIAL").length;

  return {
    orgId,
    mode: "DRY_RUN",
    totalCobros: cobros.length,
    qualifiedPairs,
    skippedCobros,
    unmatchedCobros,
    totalAmountApplied,
    totalBalanceReduction: totalAmountApplied,
    projectedPaidCount,
    projectedPartialCount,
  };
}

// ── Apply Engine ──────────────────────────────────────────────────────────────

/**
 * Execute a reconciliation plan. Applies each qualified pair in its own transaction.
 *
 * For each pair:
 *   1. Re-validate the receivable state (may have changed since plan was built)
 *   2. Create CollectionAllocation (audit record)
 *   3. Update CustomerReceivable (paidAmount, balanceDue, status, paidAt)
 *   4. Update CollectionRecord.appliedStatus
 *
 * Never throws — errors are collected per pair and returned in result.errored.
 */
export async function applyReconciliationPlan(
  plan: ReconciliationPlan,
): Promise<ReconciliationResult> {
  const t0 = Date.now();
  const applied:  ReconciliationPair[] = [];
  const errored:  { cobroId: string; error: string }[] = [];

  for (const pair of plan.qualifiedPairs) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-read current receivable state inside transaction (optimistic)
        const currentRx = await tx.customerReceivable.findUnique({
          where: { id: pair.receivableId },
          select: {
            paidAmount: true,
            balanceDue: true,
            originalAmount: true,
            status: true,
          },
        });
        if (!currentRx) throw new Error(`Receivable not found: ${pair.receivableId}`);

        const origAmt  = toNum(currentRx.originalAmount);
        const paidNow  = toNum(currentRx.paidAmount);
        const balNow   = toNum(currentRx.balanceDue);

        // Skip if already paid
        if (paidNow >= origAmt || balNow <= 0) {
          throw new Error(`SKIP:RX_FULLY_PAID:${pair.receivableId}`);
        }

        // Re-compute amounts based on live state (may differ from plan if another
        // cobro was applied concurrently — rare but possible)
        const amountToApply = Math.min(pair.cobroAmount, balNow);
        const paidAfter     = Math.min(origAmt, paidNow + amountToApply);
        const balanceAfter  = Math.max(0, origAmt - paidAfter);
        const statusNow     = (currentRx.status as string) ?? "OPEN";
        const statusAfter   = paidAfter >= origAmt ? "PAID" : (paidAfter > 0 ? "PARTIAL" : "OPEN");

        // Create audit record (unique constraint guards idempotency)
        await (tx as any).collectionAllocation.create({
          data: {
            organizationId:     plan.orgId,
            collectionRecordId: pair.cobroId,
            receivableId:       pair.receivableId,
            amountApplied:      amountToApply,
            balanceBefore:      balNow,
            balanceAfter,
            paidBefore:         paidNow,
            paidAfter,
            statusBefore:       statusNow,
            statusAfter,
            ruleUsed:           pair.ruleId,
            confidence:         pair.confidence,
            appliedBy:          "AUTO",
          },
        });

        // Update receivable balance
        await tx.customerReceivable.update({
          where: { id: pair.receivableId },
          data: {
            paidAmount: paidAfter,
            balanceDue: balanceAfter,
            status:     statusAfter,
            paidAt:     statusAfter === "PAID" ? new Date() : null,
          },
        });

        // Update cobro applied status
        // Determine if cobro is fully applied (single-receivable cobros) or partially applied
        await (tx as any).collectionRecord.update({
          where: { id: pair.cobroId },
          data: {
            appliedStatus: "APPLIED",
            appliedAt:     new Date(),
            appliedBy:     "AUTO",
          },
        });
      });

      applied.push(pair);
    } catch (e) {
      const msg = (e as Error).message;
      // SKIP errors are expected (concurrent modification / already paid) — not failures
      if (msg.startsWith("SKIP:")) continue;
      errored.push({ cobroId: pair.cobroId, error: msg });
    }
  }

  return {
    ...plan,
    mode: "APPLY",
    applied,
    errored,
    durationMs: Date.now() - t0,
  };
}
