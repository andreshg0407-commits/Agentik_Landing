/**
 * dashboard-timeline.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Executive timeline builder — business-language day summary.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { ExecutiveDashboardState } from "./dashboard-types";

// -- Daily Highlight ----------------------------------------------------------

/** A single daily highlight for the executive timeline. */
export interface DailyHighlight {
  /** Human-readable description. */
  text: string;
  /** Category for color. */
  category: "inventory" | "commercial" | "production" | "decision" | "action" | "general";
  /** Importance (higher = more important). */
  importance: number;
}

// -- Builder ------------------------------------------------------------------

/** Build daily highlights from dashboard state. */
export function buildDailyHighlights(state: ExecutiveDashboardState): DailyHighlight[] {
  const highlights: DailyHighlight[] = [];

  // Signal counts
  const totalCritical = state.signals.reduce((s, c) => s + c.bySeverity.critical, 0);
  const totalHigh = state.signals.reduce((s, c) => s + c.bySeverity.high, 0);

  if (totalCritical > 0) {
    highlights.push({
      text: `${totalCritical} signal(es) critico(s) requieren atencion inmediata`,
      category: "general",
      importance: 100,
    });
  }

  if (totalHigh > 0) {
    highlights.push({
      text: `${totalHigh} signal(es) de alta prioridad activo(s)`,
      category: "general",
      importance: 80,
    });
  }

  // Inventory signals
  const invSignals = state.signals.find(s => s.category === "inventory");
  if (invSignals && invSignals.total > 0) {
    highlights.push({
      text: `${invSignals.total} signal(es) de inventario — ${invSignals.bySeverity.critical} critico(s)`,
      category: "inventory",
      importance: invSignals.bySeverity.critical > 0 ? 90 : 50,
    });
  }

  // Rules
  if (state.rules.length > 0) {
    highlights.push({
      text: `${state.rules.length} regla(s) de negocio aplicada(s)`,
      category: "general",
      importance: 60,
    });
  }

  // Plans
  if (state.plans.length > 0) {
    highlights.push({
      text: `${state.plans.length} plan(es) generado(s) por Agentik`,
      category: "general",
      importance: 70,
    });
  }

  // Decisions
  if (state.decisions.length > 0) {
    const criticalDec = state.decisions.filter(d => d.severity === "critical").length;
    highlights.push({
      text: `${state.decisions.length} decision(es) recomendada(s)${criticalDec > 0 ? ` — ${criticalDec} critica(s)` : ""}`,
      category: "decision",
      importance: criticalDec > 0 ? 95 : 75,
    });
  }

  // Actions pending approval
  const pendingApproval = state.actions.filter(a => a.requiresApproval && a.approvalStatus === "pending").length;
  if (pendingApproval > 0) {
    highlights.push({
      text: `${pendingApproval} accion(es) esperan su aprobacion`,
      category: "action",
      importance: 85,
    });
  }

  // Sort by importance
  return highlights.sort((a, b) => b.importance - a.importance);
}
