/**
 * lib/finance/intelligence/financial-question-router.ts
 *
 * Routes the 7 deterministic FinancialQuestions to evidence-backed answers.
 * Every answer has: summary | null, evidence[], dataState, confidence, focusPath.
 *
 * Rule: if there is no real evidence → answered=false, summary=null.
 * Rule: confidence = average of evidence entry confidences (or 0 if none).
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

import {
  FinancialIntelligenceContext,
  FinancialQuestion,
  RoutedAnswer,
  EvidenceEntry,
  FinancialDataState,
} from "./financial-intelligence-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgConfidence(entries: EvidenceEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((s, e) => s + e.confidence, 0) / entries.length;
}

function worstState(entries: EvidenceEntry[]): FinancialDataState {
  const priority: FinancialDataState[] = ["BROKEN", "MISSING", "STALE", "PARTIAL", "REAL"];
  const states = entries.map(e => e.state);
  for (const p of priority) {
    if (states.includes(p)) return p;
  }
  return "MISSING";
}

function hasEvidence(entries: EvidenceEntry[], minConfidence = 0.3): boolean {
  return entries.some(e => e.confidence >= minConfidence);
}

// ── Question handlers ─────────────────────────────────────────────────────────

function routeQuePasoHoy(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const ev = [
    ctx.evidenceIndex.collections,
    ctx.evidenceIndex.bankMovements,
  ].filter(Boolean);

  const ok  = hasEvidence(ev);
  const col  = ctx.collectionsState;
  const bank = ctx.bankingState;
  const graph = ctx.financialGraphState;

  let summary: string | null = null;
  if (ok) {
    const parts: string[] = [];
    if (col.todayCount !== null && col.todayCount > 0) {
      parts.push(`${col.todayCount} recaudo(s) por $${col.todayAmount?.toLocaleString("es-CO") ?? "—"}`);
    }
    if (bank.totalCreditToday !== null && bank.totalCreditToday > 0) {
      parts.push(`$${bank.totalCreditToday.toLocaleString("es-CO")} en créditos bancarios hoy`);
    }
    if (graph.criticalIssues > 0) {
      parts.push(`${graph.criticalIssues} alerta(s) de integridad financiera`);
    }
    summary = parts.length > 0 ? parts.join(" · ") : "Sin actividad registrada hoy";
  }

  return {
    question:   "que_paso_hoy",
    answered:   ok,
    summary,
    evidence:   ev,
    dataState:  worstState(ev),
    confidence: avgConfidence(ev),
    focusPath:  "/finanzas/torre-control/cobros-hoy",
  };
}

function routeSinConciliar(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const ev = [
    ctx.evidenceIndex.bankMovements,
    ctx.evidenceIndex.graphEdges,
  ].filter(Boolean);

  const recon = ctx.reconciliationState;
  const ok    = hasEvidence(ev);

  let summary: string | null = null;
  if (ok) {
    const total = recon.pendiente + recon.inconsistente + recon.parcial;
    summary = total === 0
      ? "Sin movimientos pendientes de conciliación"
      : `${recon.pendiente} pendiente(s), ${recon.inconsistente} inconsistente(s), ${recon.parcial} parcial(es) — conciliación al ${recon.conciliadoPct.toFixed(0)}%`;
  }

  return {
    question:   "sin_conciliar",
    answered:   ok,
    summary,
    evidence:   ev,
    dataState:  worstState(ev),
    confidence: avgConfidence(ev),
    focusPath:  "/finanzas/conciliacion",
  };
}

function routeAfectaLiquidez(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const ev = [
    ctx.evidenceIndex.bankAccounts,
    ctx.evidenceIndex.collections,
  ].filter(Boolean);

  const liq = ctx.liquidityState;
  const ok  = hasEvidence(ev);

  let summary: string | null = null;
  if (ok) {
    const parts: string[] = [];
    if (liq.availableCash !== null) {
      parts.push(`Caja disponible: $${liq.availableCash.toLocaleString("es-CO")}`);
    }
    if (liq.pendingConsignaciones > 0) {
      parts.push(`$${liq.pendingConsignaciones.toLocaleString("es-CO")} en consignaciones sin cruzar`);
    }
    if (liq.runway !== null) {
      parts.push(`~${liq.runway} días de runway estimado`);
    }
    if (liq.cashConfidenceLevel === "LOW") {
      parts.push(`Confianza BAJA — ${liq.cashConfidenceReasons[0] ?? "datos incompletos"}`);
    }
    summary = parts.join(" · ") || "Sin información de liquidez disponible";
  }

  return {
    question:   "afecta_liquidez",
    answered:   ok,
    summary,
    evidence:   ev,
    dataState:  worstState(ev),
    confidence: avgConfidence(ev),
    focusPath:  "/finanzas/tesoreria",
  };
}

function routeClientesCartera(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const ev = [ctx.evidenceIndex.receivables].filter(Boolean);

  const recv = ctx.receivablesState;
  const ok   = hasEvidence(ev);

  let summary: string | null = null;
  if (ok) {
    if (recv.totalReceivable !== null) {
      const overdueStr = recv.overdueReceivable !== null && recv.overdueReceivable > 0
        ? ` · $${recv.overdueReceivable.toLocaleString("es-CO")} vencida (${((recv.overdueRatio ?? 0) * 100).toFixed(0)}%)`
        : "";
      summary = `Cartera total: $${recv.totalReceivable.toLocaleString("es-CO")}${overdueStr}`;
      if (recv.maxDpd && recv.maxDpd > 0) summary += ` · Máx vencimiento: ${recv.maxDpd} días`;
    } else {
      summary = "Cartera no disponible";
    }
  }

  return {
    question:   "clientes_cartera",
    answered:   ok,
    summary,
    evidence:   ev,
    dataState:  worstState(ev),
    confidence: avgConfidence(ev),
    focusPath:  "/finanzas/torre-control/cartera",
  };
}

function routeMovimientosSinRelacion(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const ev = [
    ctx.evidenceIndex.bankMovements,
    ctx.evidenceIndex.graphNodes,
  ].filter(Boolean);

  const bank  = ctx.bankingState;
  const graph = ctx.financialGraphState;
  const ok    = hasEvidence(ev);

  let summary: string | null = null;
  if (ok) {
    const parts: string[] = [];
    if (bank.unmatchedMovements > 0) {
      parts.push(`${bank.unmatchedMovements} movimiento(s) sin match bancario`);
    }
    if (graph.unresolvedCount > 0) {
      parts.push(`${graph.unresolvedCount} relación(es) sin resolver en grafo`);
    }
    if (graph.orphanCount > 0) {
      parts.push(`${graph.orphanCount} nodo(s) huérfano(s)`);
    }
    summary = parts.join(" · ") || "Sin movimientos desvinculados detectados";
  }

  return {
    question:   "movimientos_sin_relacion",
    answered:   ok,
    summary,
    evidence:   ev,
    dataState:  worstState(ev),
    confidence: avgConfidence(ev),
    focusPath:  "/finanzas/conciliacion",
  };
}

function routeKpisNoConfiables(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const allEv        = Object.values(ctx.evidenceIndex);
  const lowConfidence = allEv.filter(e => e.confidence < 0.5);

  let summary: string;
  if (lowConfidence.length === 0) {
    summary = "Todas las fuentes tienen confianza aceptable";
  } else {
    const names = lowConfidence.slice(0, 3).map(e => e.source).join(", ");
    summary = `${lowConfidence.length} fuente(s) con confianza baja: ${names}`;
  }

  return {
    question:   "kpis_no_confiables",
    answered:   true,
    summary,
    evidence:   lowConfidence.length > 0 ? lowConfidence : allEv,
    dataState:  worstState(allEv),
    confidence: avgConfidence(allEv),
    focusPath:  null,
  };
}

function routeBloqueCierre(ctx: FinancialIntelligenceContext): RoutedAnswer {
  const ev = [
    ctx.evidenceIndex.bankAccounts,
    ctx.evidenceIndex.graphNodes,
    ctx.evidenceIndex.bankMovements,
  ].filter(Boolean);

  const close = ctx.closeState;
  const ok    = hasEvidence(ev);

  let summary: string | null = null;
  if (ok) {
    if (!close.canClose) {
      summary = `Cierre bloqueado — ${close.blockers.join("; ")}`;
    } else if (close.warnings.length > 0) {
      summary = `Cierre posible con advertencias: ${close.warnings.slice(0, 2).join("; ")}`;
    } else {
      summary = `Cierre habilitado — puntuación ${close.score ?? "—"}/100 (${close.grade ?? "—"})`;
    }
  }

  return {
    question:   "bloquea_cierre",
    answered:   ok,
    summary,
    evidence:   ev,
    dataState:  worstState(ev),
    confidence: avgConfidence(ev),
    focusPath:  "/finanzas/cierre",
  };
}

// ── Router entry point ────────────────────────────────────────────────────────

export function routeFinancialQuestion(
  question: FinancialQuestion,
  ctx:      FinancialIntelligenceContext,
): RoutedAnswer {
  switch (question) {
    case "que_paso_hoy":              return routeQuePasoHoy(ctx);
    case "sin_conciliar":             return routeSinConciliar(ctx);
    case "afecta_liquidez":           return routeAfectaLiquidez(ctx);
    case "clientes_cartera":          return routeClientesCartera(ctx);
    case "movimientos_sin_relacion":  return routeMovimientosSinRelacion(ctx);
    case "kpis_no_confiables":        return routeKpisNoConfiables(ctx);
    case "bloquea_cierre":            return routeBloqueCierre(ctx);
    default:                          return routeQuePasoHoy(ctx);
  }
}

export function routeAllQuestions(ctx: FinancialIntelligenceContext): RoutedAnswer[] {
  const questions: FinancialQuestion[] = [
    "que_paso_hoy",
    "sin_conciliar",
    "afecta_liquidez",
    "clientes_cartera",
    "movimientos_sin_relacion",
    "kpis_no_confiables",
    "bloquea_cierre",
  ];
  return questions.map(q => routeFinancialQuestion(q, ctx));
}
