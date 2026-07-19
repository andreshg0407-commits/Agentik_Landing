/**
 * lib/copilot/signal-rules/budget-velocity.ts
 *
 * RULE 1: budget.velocity_exceeded
 *
 * Fires when the current month's revenue pace is significantly off the
 * Budget target — either well below plan (miss risk) or above plan
 * (forecast deviation).
 *
 * Data sources:
 *   - Budget table: monthly revenue target for current org/year/month
 *   - SaleRecord:   actual OFICIAL revenue for current month to date
 *
 * Signal conditions:
 *   - velocityRatio < 0.65 → revenue severely behind pace (severity: critica)
 *   - velocityRatio < 0.80 → revenue behind pace (severity: elevada)
 *   - velocityRatio > 1.25 → revenue tracking well above budget (severity: vigilancia)
 *   - Otherwise: no signal
 *
 * V1 scope: MONTHLY revenue budgets only. Dimension: total.
 */

import { prisma }            from "@/lib/prisma";
import { BudgetPeriod, SagSourceType } from "@prisma/client";
import { computeConfidence } from "@/lib/copilot/confidence-engine";
import { buildExplicacion }  from "@/lib/copilot/explainability";
import type { CopilotSignal, BudgetVelocityEvidence, SignalSeverity } from "@/lib/copilot/types";

function toNum(d: { toString(): string } | null | undefined): number {
  if (d == null) return 0;
  const n = parseFloat(d.toString());
  return isFinite(n) ? n : 0;
}

export async function evaluateBudgetVelocity(
  orgId: string,
  orgSlug: string,
): Promise<CopilotSignal | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth   = new Date(year, month, 1); // exclusive

  // ── Fetch budget target ──────────────────────────────────────────────────────
  const budget = await prisma.budget.findFirst({
    where: {
      organizationId: orgId,
      year,
      month,
      periodType: BudgetPeriod.MONTHLY,
      category: "revenue",
      dimensionKey: "total",
    },
    select: { amount: true, currency: true, updatedAt: true },
  });

  // No budget configured — no signal possible
  if (!budget || toNum(budget.amount) === 0) return null;

  // ── Fetch actual revenue (OFICIAL source type only) ──────────────────────────
  const actualAgg = await prisma.saleRecord.aggregate({
    _sum: { amount: true },
    where: {
      organizationId: orgId,
      sagSourceType: SagSourceType.OFICIAL,
      saleDate: { gte: startOfMonth, lt: endOfMonth },
    },
  });

  const actualAmount  = toNum(actualAgg._sum.amount);
  const budgetAmount  = toNum(budget.amount);

  // ── Pace calculation ─────────────────────────────────────────────────────────
  const totalDays   = new Date(year, month, 0).getDate(); // days in month
  const elapsedDays = Math.max(1, now.getDate());

  // Expected pace at this point in the month
  const expectedAtElapsed = budgetAmount * (elapsedDays / totalDays);
  const velocityRatio     = expectedAtElapsed > 0
    ? actualAmount / expectedAtElapsed
    : 0;

  // ── Signal condition ─────────────────────────────────────────────────────────
  let severity: SignalSeverity | null = null;
  if (velocityRatio < 0.65) {
    severity = "critica";
  } else if (velocityRatio < 0.80) {
    severity = "elevada";
  } else if (velocityRatio > 1.25) {
    severity = "vigilancia";
  }

  if (!severity) return null;

  // ── Confidence ───────────────────────────────────────────────────────────────
  const budgetAgeMinutes = Math.round(
    (Date.now() - budget.updatedAt.getTime()) / 60_000,
  );
  const missingFields: string[] = [];
  if (!actualAgg._sum.amount) missingFields.push("actualAmount");

  const confidence = computeConfidence({
    sources:        [true, actualAmount > 0],   // D1: budget present, actuals present
    dataAgeMinutes: budgetAgeMinutes,            // D2: staleness of budget target
    requiredFields: ["budgetAmount", "actualAmount", "elapsedDays"],
    missingFields,
  });

  // ── Build signal ─────────────────────────────────────────────────────────────
  const evidence: BudgetVelocityEvidence = {
    type: "budget_velocity",
    budgetAmount,
    actualAmount,
    elapsedDays,
    totalDays,
    velocityRatio,
    category: "revenue",
    currency: budget.currency,
  };

  const isUnder = velocityRatio < 1;
  const pctOff  = Math.round(Math.abs(1 - velocityRatio) * 100);

  const signal: CopilotSignal = {
    id:           crypto.randomUUID(),
    ruleId:       "budget.velocity_exceeded",
    orgId,
    severity,
    lifecycle:    "visible",
    targetModule: "planeacion",
    titulo:       isUnder
      ? `Ventas ${pctOff}% por debajo del ritmo presupuestado`
      : `Ventas ${pctOff}% por encima del ritmo esperado`,
    descripcion:  isUnder
      ? `El ritmo de facturación del mes está rezagado respecto al plan. De mantenerse, el objetivo mensual no se alcanzará.`
      : `El ritmo de ventas supera el presupuesto. Valide si el pronóstico requiere ajuste.`,
    accion:       isUnder ? "Revisar ejecución" : "Recalibrar presupuesto",
    targetPath:   `/${orgSlug}/finanzas/planeacion`,
    confidence,
    evidence,
    explicacion:  buildExplicacion("budget.velocity_exceeded", evidence),
    detectedAt:   now,
  };

  return signal;
}
