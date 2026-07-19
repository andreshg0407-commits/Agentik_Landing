/**
 * dashboard-insights.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Executive insight extraction — what the gerente needs to know.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { ExecutiveDashboardState } from "./dashboard-types";

// -- Executive Question -------------------------------------------------------

/** A question the dashboard answers for the executive. */
export interface ExecutiveQuestion {
  question: string;
  answer: string;
  severity: "info" | "warning" | "critical";
}

// -- Builder ------------------------------------------------------------------

/** Build the 8 daily executive questions from dashboard state. */
export function buildExecutiveQuestions(state: ExecutiveDashboardState): ExecutiveQuestion[] {
  const questions: ExecutiveQuestion[] = [];

  // 1. What happened?
  const eventCount = state.timeline.filter(t => t.entryType === "event").length;
  questions.push({
    question: "Que paso?",
    answer: eventCount > 0
      ? `${eventCount} evento(s) registrado(s) hoy`
      : "Sin eventos registrados",
    severity: "info",
  });

  // 2. What's happening?
  const activeSignals = state.signals.reduce((s, c) => s + c.total, 0);
  questions.push({
    question: "Que esta pasando?",
    answer: activeSignals > 0
      ? `${activeSignals} signal(es) activo(s) en ${state.signals.length} categoria(s)`
      : "Sin signals activos",
    severity: activeSignals > 5 ? "warning" : "info",
  });

  // 3. What concerns me?
  const criticalTotal = state.signals.reduce((s, c) => s + c.bySeverity.critical, 0);
  const highTotal = state.signals.reduce((s, c) => s + c.bySeverity.high, 0);
  questions.push({
    question: "Que me preocupa?",
    answer: criticalTotal > 0
      ? `${criticalTotal} signal(es) critico(s) y ${highTotal} de alta prioridad`
      : highTotal > 0
        ? `${highTotal} signal(es) de alta prioridad`
        : "Sin preocupaciones criticas",
    severity: criticalTotal > 0 ? "critical" : highTotal > 0 ? "warning" : "info",
  });

  // 4. What opportunities do I have?
  const planBenefits = state.plans.filter(p => p.benefit !== "—").length;
  questions.push({
    question: "Que oportunidades tengo?",
    answer: planBenefits > 0
      ? `${planBenefits} plan(es) con beneficios identificados`
      : "Sin oportunidades identificadas",
    severity: "info",
  });

  // 5. What should I review?
  questions.push({
    question: "Que debo revisar?",
    answer: state.rules.length > 0
      ? `${state.rules.length} regla(s) aplicada(s) — revisar hallazgos`
      : "Sin reglas aplicadas",
    severity: state.rules.some(r => r.severity === "critical") ? "critical" : "info",
  });

  // 6. What does Agentik recommend?
  const topDecision = state.decisions[0];
  questions.push({
    question: "Que recomienda Agentik?",
    answer: topDecision
      ? `${topDecision.recommendation} (confianza: ${topDecision.confidence}%)`
      : "Sin recomendaciones activas",
    severity: topDecision?.severity === "critical" ? "critical" : "info",
  });

  // 7. What actions are ready?
  const readyActions = state.actions.filter(a => a.status === "draft" || a.status === "ready").length;
  questions.push({
    question: "Que acciones estan listas?",
    answer: readyActions > 0
      ? `${readyActions} accion(es) preparada(s) — ${state.actions.filter(a => a.executionMode === "dry_run").length} en dry-run`
      : "Sin acciones preparadas",
    severity: "info",
  });

  // 8. What needs my approval?
  const pendingApproval = state.actions.filter(a => a.requiresApproval && a.approvalStatus === "pending").length;
  questions.push({
    question: "Que necesita mi aprobacion?",
    answer: pendingApproval > 0
      ? `${pendingApproval} accion(es) esperan aprobacion`
      : "Nada pendiente de aprobacion",
    severity: pendingApproval > 0 ? "warning" : "info",
  });

  return questions;
}
