/**
 * lib/copilot/signal-rules/treasury-coverage.ts
 *
 * RULE 2: treasury.low_coverage
 *
 * Fires when the estimated operational coverage (days of cash inflow vs
 * open obligations) falls below a critical threshold.
 *
 * Data sources:
 *   - CustomerReceivable: open receivables with dueDate ≤ 30 days (expected inflows)
 *   - CustomerReceivable: overdue balances as proxy for outstanding obligations
 *   - CollectionRecord:   recent 30-day average daily cobros for coverage estimate
 *
 * Coverage formula:
 *   pendingInflow = sum(balanceDue) where status IN (OPEN, PARTIAL) AND dueDate ≤ 30 days
 *   dailyAvgCobros = sum(collectionAmount last 30 days) / 30
 *   coverageDays = pendingInflow / dailyAvgCobros    (if dailyAvgCobros > 0)
 *
 * Signal conditions:
 *   - coverageDays < 15 → critica
 *   - coverageDays < 30 → elevada
 *   - coverageDays < 45 → vigilancia
 *   - Otherwise: no signal
 *
 * V1 scope: org-level aggregate. No multi-account breakdown.
 */

import { prisma }            from "@/lib/prisma";
import { computeConfidence } from "@/lib/copilot/confidence-engine";
import { buildExplicacion }  from "@/lib/copilot/explainability";
import type { CopilotSignal, TreasuryCoverageEvidence, SignalSeverity } from "@/lib/copilot/types";

function toNum(d: { toString(): string } | null | undefined): number {
  if (d == null) return 0;
  const n = parseFloat(d.toString());
  return isFinite(n) ? n : 0;
}

export async function evaluateTreasuryCoverage(
  orgId: string,
  orgSlug: string,
): Promise<CopilotSignal | null> {
  const now      = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ago30    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Expected inflows (receivables due in next 30 days) ───────────────────────
  const inflowAgg = await prisma.customerReceivable.aggregate({
    _sum: { balanceDue: true },
    where: {
      organizationId: orgId,
      status: { in: ["OPEN", "PARTIAL"] },
      dueDate: { lte: in30Days },
    },
  });

  // ── Open obligations proxy (overdue receivables — negative liquidity signal) ─
  // In V1 we use overdue balances as a proxy for unresolved cash needs.
  const overdueAgg = await prisma.customerReceivable.aggregate({
    _sum: { balanceDue: true },
    where: {
      organizationId: orgId,
      status: { in: ["OPEN", "PARTIAL"] },
      daysOverdue: { gt: 0 },
    },
  });

  // ── Recent daily cobros rate ──────────────────────────────────────────────────
  const cobrosAgg = await prisma.collectionRecord.aggregate({
    _sum: { amount: true },
    where: {
      organizationId: orgId,
      collectionDate: { gte: ago30 },
    },
  });

  const pendingInflow   = toNum(inflowAgg._sum.balanceDue);
  const openObligations = toNum(overdueAgg._sum.balanceDue);
  const cobros30d       = toNum(cobrosAgg._sum.amount);
  const dailyAvg        = cobros30d / 30;

  // No data at all — skip
  if (pendingInflow === 0 && cobros30d === 0) return null;

  const coverageDays = dailyAvg > 0
    ? Math.round(pendingInflow / dailyAvg)
    : pendingInflow > 0 ? 60 : 0; // If no cobros history, assume moderate coverage

  // ── Signal condition ─────────────────────────────────────────────────────────
  let severity: SignalSeverity | null = null;
  if (coverageDays < 15) {
    severity = "critica";
  } else if (coverageDays < 30) {
    severity = "elevada";
  } else if (coverageDays < 45) {
    severity = "vigilancia";
  }

  if (!severity) return null;

  // ── Confidence ───────────────────────────────────────────────────────────────
  const missingFields: string[] = [];
  if (pendingInflow === 0) missingFields.push("pendingInflow");
  if (cobros30d === 0)     missingFields.push("cobrosHistory");

  const confidence = computeConfidence({
    sources:        [pendingInflow > 0, cobros30d > 0],
    dataAgeMinutes: 60, // Prisma live query — effectively fresh
    requiredFields: ["pendingInflow", "cobrosHistory"],
    missingFields,
  });

  const evidence: TreasuryCoverageEvidence = {
    type:             "treasury_coverage",
    coverageDays,
    pendingInflow,
    openObligations,
    currency:         "COP",
  };

  const signal: CopilotSignal = {
    id:           crypto.randomUUID(),
    ruleId:       "treasury.low_coverage",
    orgId,
    severity,
    lifecycle:    "visible",
    targetModule: "tesoreria",
    titulo:       `Cobertura operacional: ${coverageDays} días estimados`,
    descripcion:  `El flujo proyectado de cobros cubre aproximadamente ${coverageDays} días de operación. Revisar el ritmo de recaudo y las obligaciones abiertas.`,
    accion:       "Revisar tesorería",
    targetPath:   `/${orgSlug}/finanzas/tesoreria`,
    confidence,
    evidence,
    explicacion:  buildExplicacion("treasury.low_coverage", evidence),
    detectedAt:   now,
  };

  return signal;
}
