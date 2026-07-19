/**
 * lib/copilot/finance/diego-focus-engine.ts
 *
 * FASE 3 — Focus Engine (cerebro operativo de Diego).
 *
 * Prioriza áreas de acción financiera basado en:
 *   - blockers (close blockers, banking critical)
 *   - stale sources (desactualización)
 *   - low confidence (datos incompletos)
 *   - unresolved graph (relaciones sin resolver)
 *   - unmatched banking (movimientos sin match)
 *   - overdue receivables (cartera vencida)
 *
 * Output: FinancialFocusArea[] ordered by priority (1=highest).
 *
 * Sprint: AGENTIK-DIEGO-FINANCIAL-COPILOT-01
 */

import type { FinancialIntelligenceContext } from "@/lib/finance/intelligence";

// ── Output type ───────────────────────────────────────────────────────────────

export type FinancialFocusArea = {
  area:            string;
  priority:        number;
  reason:          string;
  confidence:      number;   // 0–1: how confident the focus recommendation is
  affectedSources: string[];
};

// ── Rule evaluation ───────────────────────────────────────────────────────────

interface FocusCandidate {
  area:            string;
  urgency:         number;   // lower = more urgent
  reason:          string;
  confidence:      number;
  affectedSources: string[];
}

function evalCierre(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const cl = ctx.closeState;
  if (!cl.canClose && cl.blockers.length > 0) {
    return {
      area:            "cierre",
      urgency:         0,
      reason:          `${cl.blockers.length} bloqueo(s) impiden cierre — ${cl.blockers[0]}`,
      confidence:      ctx.evidenceIndex.bankAccounts?.confidence ?? 0.5,
      affectedSources: ["BankAccount", "FinancialGraph"],
    };
  }
  if (cl.warnings.length > 0) {
    return {
      area:            "cierre",
      urgency:         3,
      reason:          `${cl.warnings.length} advertencia(s) antes del cierre — ${cl.warnings[0]}`,
      confidence:      ctx.evidenceIndex.bankMovements?.confidence ?? 0.5,
      affectedSources: ["BankMovement"],
    };
  }
  return null;
}

function evalGrafo(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const g = ctx.financialGraphState;
  if (g.criticalIssues > 0) {
    return {
      area:            "conciliacion",
      urgency:         1,
      reason:          `${g.criticalIssues} issue(s) crítico(s) en grafo — ${g.unresolvedCount} sin resolver`,
      confidence:      ctx.evidenceIndex.graphNodes?.confidence ?? 0.5,
      affectedSources: ["FinancialGraph", "BankMovement"],
    };
  }
  if (g.warningIssues > 0 || g.unresolvedCount > 15) {
    return {
      area:            "conciliacion",
      urgency:         4,
      reason:          `${g.unresolvedCount} relaciones sin resolver en grafo financiero`,
      confidence:      ctx.evidenceIndex.graphEdges?.confidence ?? 0.4,
      affectedSources: ["FinancialGraph"],
    };
  }
  return null;
}

function evalBanking(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const b = ctx.bankingState;
  if (b.state === "MISSING") {
    return {
      area:            "tesoreria",
      urgency:         2,
      reason:          "Sin datos bancarios conectados — liquidez no trazable",
      confidence:      0.1,
      affectedSources: ["BankAccount"],
    };
  }
  if (b.healthLevel === "critical") {
    return {
      area:            "tesoreria",
      urgency:         1,
      reason:          "Estado bancario crítico — verificar cuentas y sincronización",
      confidence:      ctx.evidenceIndex.bankAccounts?.confidence ?? 0.3,
      affectedSources: ["BankAccount", "BankMovement"],
    };
  }
  if (b.staleAccounts > 0) {
    return {
      area:            "tesoreria",
      urgency:         5,
      reason:          `${b.staleAccounts} cuenta(s) desactualizadas — datos de liquidez degradados`,
      confidence:      (ctx.evidenceIndex.bankAccounts?.confidence ?? 0.5) * 0.6,
      affectedSources: ["BankAccount"],
    };
  }
  if (b.unmatchedMovements > 10) {
    return {
      area:            "conciliacion",
      urgency:         4,
      reason:          `${b.unmatchedMovements} movimientos sin match bancario`,
      confidence:      ctx.evidenceIndex.bankMovements?.confidence ?? 0.5,
      affectedSources: ["BankMovement"],
    };
  }
  return null;
}

function evalLiquidez(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const liq = ctx.liquidityState;
  if (liq.cashConfidenceLevel === "LOW" && liq.state !== "MISSING") {
    return {
      area:            "tesoreria",
      urgency:         6,
      reason:          liq.cashConfidenceReasons[0] ?? "Confianza de liquidez baja",
      confidence:      ctx.evidenceIndex.bankAccounts?.confidence ?? 0.2,
      affectedSources: ["BankAccount", "CollectionRecord"],
    };
  }
  return null;
}

function evalCartera(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const recv = ctx.receivablesState;
  if (recv.state === "MISSING") return null;
  const overdueRatio = recv.overdueRatio ?? 0;
  if (overdueRatio > 0.3 && recv.overdueReceivable !== null && recv.overdueReceivable > 0) {
    return {
      area:            "cobranza",
      urgency:         overdueRatio > 0.5 ? 2 : 5,
      reason:          `${(overdueRatio * 100).toFixed(0)}% de cartera vencida — $${recv.overdueReceivable.toLocaleString("es-CO")}`,
      confidence:      ctx.evidenceIndex.receivables?.confidence ?? 0.5,
      affectedSources: ["CustomerReceivable"],
    };
  }
  return null;
}

function evalPlaneacion(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const plan = ctx.planningState;
  if (plan.state === "MISSING") {
    return {
      area:            "planeacion",
      urgency:         8,
      reason:          "Sin presupuestos definidos — proyecciones FPA no disponibles",
      confidence:      0.1,
      affectedSources: ["Budget"],
    };
  }
  if (plan.budgetsAtRisk > 0) {
    return {
      area:            "planeacion",
      urgency:         7,
      reason:          `${plan.budgetsAtRisk} presupuesto(s) en riesgo de sobreejecución`,
      confidence:      ctx.evidenceIndex.budgets?.confidence ?? 0.5,
      affectedSources: ["Budget"],
    };
  }
  return null;
}

function evalStaleSources(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const stale = ctx.dataFreshness.staleSources;
  if (stale.length >= 3) {
    return {
      area:            "integridad",
      urgency:         3,
      reason:          `${stale.length} fuentes desactualizadas: ${stale.slice(0, 3).join(", ")}`,
      confidence:      0.3,
      affectedSources: stale,
    };
  }
  return null;
}

function evalLowConfidence(ctx: FinancialIntelligenceContext): FocusCandidate | null {
  const lowConf = Object.values(ctx.evidenceIndex).filter(e => e.confidence < 0.4 && e.count > 0);
  if (lowConf.length >= 3) {
    return {
      area:            "integridad",
      urgency:         6,
      reason:          `${lowConf.length} fuentes con confianza <40% — KPIs no confiables`,
      confidence:      0.3,
      affectedSources: lowConf.map(e => e.source),
    };
  }
  return null;
}

// ── Main focus engine ─────────────────────────────────────────────────────────

export function computeFinancialFocusAreas(
  ctx: FinancialIntelligenceContext,
): FinancialFocusArea[] {
  const rules = [
    evalCierre,
    evalGrafo,
    evalBanking,
    evalLiquidez,
    evalCartera,
    evalPlaneacion,
    evalStaleSources,
    evalLowConfidence,
  ];

  const candidates = rules
    .map(rule => rule(ctx))
    .filter((c): c is FocusCandidate => c !== null);

  // Deduplicate by area (keep lowest urgency per area)
  const byArea = new Map<string, FocusCandidate>();
  for (const c of candidates) {
    const existing = byArea.get(c.area);
    if (!existing || c.urgency < existing.urgency) {
      byArea.set(c.area, c);
    }
  }

  return [...byArea.values()]
    .sort((a, b) => a.urgency - b.urgency)
    .map((c, i) => ({
      area:            c.area,
      priority:        i + 1,
      reason:          c.reason,
      confidence:      c.confidence,
      affectedSources: c.affectedSources,
    }));
}

// ── Async entry point (loads context internally) ──────────────────────────────

import { getFinancialIntelligenceContext } from "@/lib/finance/intelligence";

export async function buildFinancialFocusAreas(orgId: string): Promise<FinancialFocusArea[]> {
  const ctx = await getFinancialIntelligenceContext(orgId);
  return computeFinancialFocusAreas(ctx);
}
