/**
 * lib/copilot/explainability.ts
 *
 * Explainability Engine V1 — Level 1: Template-based. No LLM.
 *
 * Pattern: "Agentik detectó esta señal porque [condición A] y [condición B]."
 *
 * Each rule has one or more templates parameterized by evidence values.
 * Templates are deterministic, auditable, and fast.
 *
 * Level 2 (natural language generation) and Level 3 (full reasoning chain)
 * are NOT implemented in V1.
 */

import type {
  CopilotSignalId,
  SignalEvidence,
  BudgetVelocityEvidence,
  TreasuryCoverageEvidence,
  FinancialCloseBlockedEvidence,
  ReconciliationCriticalEvidence,
} from "@/lib/copilot/types";

function fmt(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// ── Per-rule template builders ─────────────────────────────────────────────────

function explainBudgetVelocity(ev: BudgetVelocityEvidence): string {
  const paceDir = ev.velocityRatio < 1 ? "por debajo" : "por encima";
  const pctOff = Math.abs(1 - ev.velocityRatio);
  return (
    `Agentik detectó esta señal porque el ritmo de ventas del mes está ` +
    `${fmtPct(pctOff)} ${paceDir} del ritmo esperado. ` +
    `En ${ev.elapsedDays} días transcurridos se facturaron ` +
    `$${fmt(ev.actualAmount)} ${ev.currency} contra un objetivo proporcional de ` +
    `$${fmt((ev.budgetAmount * ev.elapsedDays) / ev.totalDays)} ${ev.currency}.`
  );
}

function explainTreasuryCoverage(ev: TreasuryCoverageEvidence): string {
  return (
    `Agentik detectó esta señal porque la cobertura operacional estimada es de ` +
    `${ev.coverageDays} días. ` +
    `Las cuentas por cobrar con vencimiento en los próximos 30 días suman ` +
    `$${fmt(ev.pendingInflow)} ${ev.currency}, ` +
    `mientras que las obligaciones abiertas alcanzan ` +
    `$${fmt(ev.openObligations)} ${ev.currency}.`
  );
}

function explainFinancialCloseBlocked(ev: FinancialCloseBlockedEvidence): string {
  return (
    `Agentik detectó esta señal porque hay ${ev.criticalExceptionsCount} excepción(es) ` +
    `crítica(s) de conciliación sin resolver, con antigüedad máxima de ` +
    `${ev.oldestExceptionDays} días. ` +
    `Estas excepciones representan una diferencia acumulada de ` +
    `$${fmt(ev.totalDeltaBlocked)} ${ev.currency} que bloquea el cierre del período.`
  );
}

function explainReconciliationCritical(ev: ReconciliationCriticalEvidence): string {
  const hours = ev.oldestAgeHours;
  const ageLabel =
    hours < 24
      ? `${hours} horas`
      : `${Math.round(hours / 24)} días`;
  return (
    `Agentik detectó esta señal porque hay ${ev.openCriticalCount} excepción(es) ` +
    `crítica(s) abiertas en conciliación con una diferencia total de ` +
    `$${fmt(ev.totalDelta)} ${ev.currency}. ` +
    `La más antigua lleva ${ageLabel} sin resolución.`
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildExplicacion(
  ruleId: CopilotSignalId,
  evidence: SignalEvidence,
): string {
  switch (ruleId) {
    case "budget.velocity_exceeded":
      return explainBudgetVelocity(evidence as BudgetVelocityEvidence);
    case "treasury.low_coverage":
      return explainTreasuryCoverage(evidence as TreasuryCoverageEvidence);
    case "financial_close.blocked":
      return explainFinancialCloseBlocked(evidence as FinancialCloseBlockedEvidence);
    case "reconciliation.pending_critical":
      return explainReconciliationCritical(evidence as ReconciliationCriticalEvidence);
    default:
      return "Agentik detectó esta señal con base en los datos operacionales disponibles.";
  }
}
