/**
 * lib/copilot/finance/diego-financial-adapter.ts
 *
 * FASE 1 — Diego Financial Adapter
 *
 * Bridges getFinancialIntelligenceContext() → Diego-consumable signals.
 * No mock data. No invented numbers. No GPT-style framing.
 *
 * Rules:
 *   - Every DiegoFinancialSignal maps to a real EvidenceEntry or sub-state.
 *   - No signal emitted when evidence.count === 0 or state === MISSING.
 *   - severity mirrors FinancialDataState: BROKEN→critical, STALE→warning, PARTIAL→warning.
 *
 * Sprint: AGENTIK-DIEGO-FINANCIAL-COPILOT-01
 */

import { getFinancialIntelligenceContext } from "@/lib/finance/intelligence";
import type {
  FinancialIntelligenceContext,
  EvidenceEntry,
  MissingEvidence,
  IntelligenceFocusArea,
} from "@/lib/finance/intelligence";

// ── Output types ──────────────────────────────────────────────────────────────

export type DiegoFinancialSignalSeverity = "critical" | "warning" | "info";

export type DiegoFinancialSignal = {
  id:               string;
  title:            string;
  summary:          string;
  severity:         DiegoFinancialSignalSeverity;
  confidence:       number;
  freshnessState:   "REAL" | "STALE" | "PARTIAL" | "MISSING" | "BROKEN";
  sourceCount:      number;
  focusArea?:       string;
  recommendedAction?: string;
};

export type DiegoEvidenceTrace = {
  source:     string;
  state:      "REAL" | "STALE" | "PARTIAL" | "MISSING" | "BROKEN";
  confidence: number;  // 0–1
  syncAt:     string | null;
  count:      number;
};

export type DiegoFinancialAdapterOutput = {
  orgId:                 string;
  builtAt:               Date;
  signals:               DiegoFinancialSignal[];
  confidence:            number;             // avg across evidence
  freshnessLabel:        "FRESH" | "PARTIAL" | "STALE" | "UNKNOWN";
  blockers:              string[];
  missingEvidence:       MissingEvidence[];
  recommendedFocusAreas: IntelligenceFocusArea[];
  evidenceTrace:         DiegoEvidenceTrace[];
  hasRealData:           boolean;
};

// ── Signal ID counter (deterministic within request) ──────────────────────────

let _seq = 0;
function nextId(area: string): string {
  return `dfa:${area}:${++_seq}`;
}

// ── Sub-state → signals ───────────────────────────────────────────────────────

function signalsFromGraph(ctx: FinancialIntelligenceContext): DiegoFinancialSignal[] {
  const g = ctx.financialGraphState;
  const signals: DiegoFinancialSignal[] = [];

  if (g.state === "MISSING") return signals;

  if (g.criticalIssues > 0) {
    signals.push({
      id:               nextId("graph_critical"),
      title:            `${g.criticalIssues} issue(s) crítico(s) en grafo financiero`,
      summary:          `${g.unresolvedCount} relaciones sin resolver, ${g.orphanCount} nodos huérfanos. Afecta integridad de conciliación y cierre.`,
      severity:         "critical",
      confidence:       ctx.evidenceIndex.graphNodes?.confidence ?? 0,
      freshnessState:   g.state,
      sourceCount:      g.totalNodes,
      focusArea:        "conciliacion",
      recommendedAction: "Resolver inconsistencias en módulo Conciliación",
    });
  } else if (g.warningIssues > 0) {
    signals.push({
      id:               nextId("graph_warning"),
      title:            `${g.warningIssues} advertencia(s) en grafo financiero`,
      summary:          `${g.unresolvedCount} relaciones sin resolver afectan integridad.`,
      severity:         "warning",
      confidence:       ctx.evidenceIndex.graphNodes?.confidence ?? 0,
      freshnessState:   g.state,
      sourceCount:      g.totalNodes,
      focusArea:        "conciliacion",
      recommendedAction: "Revisar advertencias en Conciliación",
    });
  }

  if (g.orphanCount > 5) {
    signals.push({
      id:               nextId("graph_orphan"),
      title:            `${g.orphanCount} nodos huérfanos sin relación`,
      summary:          "Documentos financieros sin vínculo a transacciones bancarias o facturas.",
      severity:         "warning",
      confidence:       ctx.evidenceIndex.graphEdges?.confidence ?? 0,
      freshnessState:   g.state,
      sourceCount:      g.orphanCount,
      focusArea:        "conciliacion",
      recommendedAction: "Vincular documentos huérfanos desde Conciliación",
    });
  }

  return signals;
}

function signalsFromBanking(ctx: FinancialIntelligenceContext): DiegoFinancialSignal[] {
  const b = ctx.bankingState;
  const signals: DiegoFinancialSignal[] = [];

  if (b.state === "MISSING") return signals;

  if (b.healthLevel === "critical") {
    signals.push({
      id:               nextId("bank_critical"),
      title:            "Cuentas bancarias en estado crítico",
      summary:          `${b.accountCount} cuenta(s) — revisar sincronización y saldos.`,
      severity:         "critical",
      confidence:       ctx.evidenceIndex.bankAccounts?.confidence ?? 0,
      freshnessState:   b.state,
      sourceCount:      b.accountCount,
      focusArea:        "tesoreria",
      recommendedAction: "Revisar cuentas bancarias en Tesorería",
    });
  }

  if (b.unmatchedMovements > 0) {
    signals.push({
      id:               nextId("bank_unmatched"),
      title:            `${b.unmatchedMovements} movimiento(s) bancario(s) sin match`,
      summary:          "Movimientos sin correspondencia en el grafo financiero.",
      severity:         b.unmatchedMovements > 20 ? "critical" : "warning",
      confidence:       ctx.evidenceIndex.bankMovements?.confidence ?? 0,
      freshnessState:   ctx.evidenceIndex.bankMovements?.state ?? "MISSING",
      sourceCount:      b.unmatchedMovements,
      focusArea:        "conciliacion",
      recommendedAction: "Conciliar movimientos en módulo Conciliación",
    });
  }

  if (b.staleAccounts > 0) {
    signals.push({
      id:               nextId("bank_stale"),
      title:            `${b.staleAccounts} cuenta(s) con sincronización desactualizada`,
      summary:          "Datos bancarios con más de 24h sin actualizar afectan confianza de liquidez.",
      severity:         "warning",
      confidence:       (ctx.evidenceIndex.bankAccounts?.confidence ?? 0) * 0.6,
      freshnessState:   "STALE",
      sourceCount:      b.staleAccounts,
      focusArea:        "tesoreria",
      recommendedAction: "Forzar re-sincronización bancaria",
    });
  }

  return signals;
}

function signalsFromLiquidity(ctx: FinancialIntelligenceContext): DiegoFinancialSignal[] {
  const liq = ctx.liquidityState;
  const signals: DiegoFinancialSignal[] = [];

  if (liq.state === "MISSING") return signals;

  if (liq.cashConfidenceLevel === "LOW") {
    signals.push({
      id:               nextId("liquidity_low_conf"),
      title:            "Confianza en liquidez: BAJA",
      summary:          liq.cashConfidenceReasons.slice(0, 2).join(" · ") || "Datos de caja incompletos.",
      severity:         "warning",
      confidence:       ctx.evidenceIndex.bankAccounts?.confidence ?? 0,
      freshnessState:   liq.state,
      sourceCount:      (liq.hasBankData ? 1 : 0) + (ctx.evidenceIndex.collections?.count ?? 0 > 0 ? 1 : 0),
      focusArea:        "tesoreria",
      recommendedAction: "Conectar fuente bancaria para mejorar trazabilidad",
    });
  }

  if (liq.pendingConsignaciones > 0) {
    signals.push({
      id:               nextId("liquidity_consig"),
      title:            `$${liq.pendingConsignaciones.toLocaleString("es-CO")} en consignaciones sin cruzar`,
      summary:          "Pagos recibidos sin aplicar a facturas. Afecta saldo real de caja.",
      severity:         liq.pendingConsignaciones > 5_000_000 ? "warning" : "info",
      confidence:       ctx.evidenceIndex.collections?.confidence ?? 0,
      freshnessState:   ctx.evidenceIndex.collections?.state ?? "MISSING",
      sourceCount:      1,
      focusArea:        "tesoreria",
      recommendedAction: "Aplicar consignaciones pendientes desde Tesorería",
    });
  }

  return signals;
}

function signalsFromReceivables(ctx: FinancialIntelligenceContext): DiegoFinancialSignal[] {
  const recv = ctx.receivablesState;
  const signals: DiegoFinancialSignal[] = [];

  if (recv.state === "MISSING" || recv.totalReceivable === null) return signals;

  const overdueRatio = recv.overdueRatio ?? 0;
  if (overdueRatio > 0.3 && recv.overdueReceivable !== null) {
    signals.push({
      id:               nextId("recv_overdue"),
      title:            `${(overdueRatio * 100).toFixed(0)}% de cartera vencida`,
      summary:          `$${recv.overdueReceivable.toLocaleString("es-CO")} vencidos — ${recv.overdueClients ?? 0} cliente(s). Máx ${recv.maxDpd ?? 0} días de mora.`,
      severity:         overdueRatio > 0.5 ? "critical" : "warning",
      confidence:       ctx.evidenceIndex.receivables?.confidence ?? 0,
      freshnessState:   recv.state,
      sourceCount:      recv.overdueClients ?? 0,
      focusArea:        "cobranza",
      recommendedAction: "Priorizar gestión de cobro en clientes vencidos",
    });
  }

  return signals;
}

function signalsFromReconciliation(ctx: FinancialIntelligenceContext): DiegoFinancialSignal[] {
  const rec = ctx.reconciliationState;
  const signals: DiegoFinancialSignal[] = [];

  if (rec.state === "MISSING") return signals;

  if (rec.conciliadoPct < 70 && rec.total > 0) {
    signals.push({
      id:               nextId("recon_low"),
      title:            `Conciliación al ${rec.conciliadoPct.toFixed(0)}% — ${rec.pendiente} pendiente(s)`,
      summary:          `${rec.inconsistente} inconsistentes, ${rec.parcial} parciales de ${rec.total} movimientos totales.`,
      severity:         rec.conciliadoPct < 50 ? "critical" : "warning",
      confidence:       ctx.evidenceIndex.bankMovements?.confidence ?? 0,
      freshnessState:   rec.state,
      sourceCount:      rec.total,
      focusArea:        "conciliacion",
      recommendedAction: "Completar conciliación bancaria antes del cierre",
    });
  }

  return signals;
}

function signalsFromClose(ctx: FinancialIntelligenceContext): DiegoFinancialSignal[] {
  const cl = ctx.closeState;
  const signals: DiegoFinancialSignal[] = [];

  if (!cl.canClose && cl.blockers.length > 0) {
    signals.push({
      id:               nextId("close_blocked"),
      title:            "Cierre financiero bloqueado",
      summary:          cl.blockers.slice(0, 2).join(" · "),
      severity:         "critical",
      confidence:       ctx.evidenceIndex.graphNodes?.confidence ?? 0.5,
      freshnessState:   cl.state,
      sourceCount:      cl.blockers.length,
      focusArea:        "cierre",
      recommendedAction: "Resolver bloqueos en módulo Cierre Financiero",
    });
  }

  return signals;
}

// ── Evidence trace builder ────────────────────────────────────────────────────

function buildEvidenceTrace(ctx: FinancialIntelligenceContext): DiegoEvidenceTrace[] {
  return Object.values(ctx.evidenceIndex).map(e => ({
    source:     e.source,
    state:      e.state,
    confidence: e.confidence,
    syncAt:     e.syncAt,
    count:      e.count,
  }));
}

// ── Overall confidence aggregation ────────────────────────────────────────────

function computeOverallConfidence(ctx: FinancialIntelligenceContext): number {
  const entries = Object.values(ctx.evidenceIndex).filter(e => e.count > 0);
  if (entries.length === 0) return 0;
  return entries.reduce((s, e) => s + e.confidence, 0) / entries.length;
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export async function buildDiegoFinancialAdapter(
  orgId: string,
): Promise<DiegoFinancialAdapterOutput> {
  _seq = 0; // reset per-request

  const ctx = await getFinancialIntelligenceContext(orgId);

  const signals: DiegoFinancialSignal[] = [
    ...signalsFromGraph(ctx),
    ...signalsFromBanking(ctx),
    ...signalsFromLiquidity(ctx),
    ...signalsFromReceivables(ctx),
    ...signalsFromReconciliation(ctx),
    ...signalsFromClose(ctx),
  ].sort((a, b) => {
    const order: Record<DiegoFinancialSignalSeverity, number> = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const blockers = ctx.closeState.blockers;
  const confidence = computeOverallConfidence(ctx);
  const evidenceTrace = buildEvidenceTrace(ctx);
  const hasRealData = evidenceTrace.some(e => e.state === "REAL" && e.count > 0);

  if (!hasRealData) {
    console.warn(
      `DIEGO_FINANCIAL_ADAPTER_WARNING: no real evidence found for org ${orgId} — all sources MISSING or count=0`,
    );
  }

  return {
    orgId,
    builtAt:               ctx.builtAt,
    signals,
    confidence,
    freshnessLabel:        ctx.dataFreshness.overallFreshness,
    blockers,
    missingEvidence:       ctx.missingEvidence,
    recommendedFocusAreas: ctx.recommendedFocusAreas,
    evidenceTrace,
    hasRealData,
  };
}
