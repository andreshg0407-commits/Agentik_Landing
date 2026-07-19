/**
 * lib/finance/runtime-snapshots.ts
 *
 * FASE 2 — Runtime Snapshot Engine
 *
 * buildFinancialRuntimeSnapshot(orgId) builds a compact operational snapshot
 * from getFinancialIntelligenceContext() without duplicating queries.
 *
 * All values are deterministic — same data → same snapshot.
 *
 * Sprint: AGENTIK-FINANCIAL-LIVE-ORCHESTRATION-01
 */

import { getFinancialIntelligenceContext } from "@/lib/finance/intelligence";
import type { FinancialIntelligenceContext } from "@/lib/finance/intelligence";

// ── Snapshot shape ────────────────────────────────────────────────────────────

export interface FinancialRuntimeSnapshot {
  organizationId:       string;
  generatedAt:          Date;

  /** 0–100: % of graph without critical issues. */
  graphIntegrityPct:    number;
  /** Raw count of unresolved graph relations. */
  unresolvedCount:      number;

  /** 0–100: % of bank movements reconciled. */
  reconciliationHealth: number;

  /** 0–1: derived from cashConfidenceLevel (HIGH→0.9, MEDIUM→0.6, LOW→0.2). */
  liquidityConfidence:  number;

  /** Number of stale data sources. */
  staleSources:         number;

  /** Number of close blockers. */
  closeBlockers:        number;

  /** Whether at least one bank account is connected with real data. */
  bankingConnected:     boolean;

  overallState: "HEALTHY" | "DEGRADED" | "CRITICAL";
}

// ── Derivation helpers ────────────────────────────────────────────────────────

function deriveGraphIntegrityPct(ctx: FinancialIntelligenceContext): number {
  const g = ctx.financialGraphState;
  if (g.totalNodes === 0) return 0;
  // Each critical issue degrades by 20%, each warning by 5%
  const degradation = (g.criticalIssues * 20) + (g.warningIssues * 5);
  return Math.max(0, Math.min(100, 100 - degradation));
}

function deriveLiquidityConfidence(ctx: FinancialIntelligenceContext): number {
  switch (ctx.liquidityState.cashConfidenceLevel) {
    case "HIGH":   return 0.9;
    case "MEDIUM": return 0.6;
    case "LOW":    return 0.2;
    default:       return 0.0;
  }
}

function deriveOverallState(
  graphIntegrityPct:    number,
  closeBlockers:        number,
  bankingConnected:     boolean,
  staleSources:         number,
  reconciliationHealth: number,
  liquidityConfidence:  number,
): FinancialRuntimeSnapshot["overallState"] {
  // CRITICAL: any blocker, graph collapsed, or no banking at all
  if (closeBlockers > 0 || graphIntegrityPct < 40 || !bankingConnected) {
    return "CRITICAL";
  }
  // DEGRADED: multiple stale sources, poor reconciliation, or low confidence
  if (staleSources >= 2 || reconciliationHealth < 60 || liquidityConfidence < 0.4) {
    return "DEGRADED";
  }
  return "HEALTHY";
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildFinancialRuntimeSnapshot(
  orgId: string,
): Promise<FinancialRuntimeSnapshot> {
  const ctx = await getFinancialIntelligenceContext(orgId);

  const graphIntegrityPct    = deriveGraphIntegrityPct(ctx);
  const unresolvedCount      = ctx.financialGraphState.unresolvedCount;
  const reconciliationHealth = ctx.reconciliationState.conciliadoPct;
  const liquidityConfidence  = deriveLiquidityConfidence(ctx);
  const staleSources         = ctx.dataFreshness.staleSources.length;
  const closeBlockers        = ctx.closeState.blockers.length;
  const bankingConnected     = ctx.bankingState.state !== "MISSING" && ctx.bankingState.accountCount > 0;

  const overallState = deriveOverallState(
    graphIntegrityPct,
    closeBlockers,
    bankingConnected,
    staleSources,
    reconciliationHealth,
    liquidityConfidence,
  );

  return {
    organizationId:       orgId,
    generatedAt:          ctx.builtAt,
    graphIntegrityPct,
    unresolvedCount,
    reconciliationHealth,
    liquidityConfidence,
    staleSources,
    closeBlockers,
    bankingConnected,
    overallState,
  };
}

// ── Snapshot comparison helpers ───────────────────────────────────────────────

export function snapshotDelta(
  previous: FinancialRuntimeSnapshot,
  current:  FinancialRuntimeSnapshot,
) {
  return {
    confidenceDelta:     current.liquidityConfidence - previous.liquidityConfidence,
    unresolvedDelta:     current.unresolvedCount     - previous.unresolvedCount,
    reconHealthDelta:    current.reconciliationHealth - previous.reconciliationHealth,
    closeBlockersDelta:  current.closeBlockers       - previous.closeBlockers,
    graphIntegrityDelta: current.graphIntegrityPct   - previous.graphIntegrityPct,
    staleSourcesDelta:   current.staleSources        - previous.staleSources,
    bankingRestored:     !previous.bankingConnected   && current.bankingConnected,
    bankingLost:         previous.bankingConnected    && !current.bankingConnected,
    stateDelta:          previous.overallState !== current.overallState
                           ? { from: previous.overallState, to: current.overallState }
                           : null,
  };
}
