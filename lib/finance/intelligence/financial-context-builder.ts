/**
 * lib/finance/intelligence/financial-context-builder.ts
 *
 * Assembles all sub-state shapes from raw facts + freshness + graph + banking.
 * Each sub-state is evidence-backed and confidence-scored.
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

import { getGraphHealthSummary }   from "@/lib/finance/graph/graph-snapshot";
import { getBankingSnapshot }      from "@/lib/finance/banking/banking-runtime";
import { computeCashFlowConfidence } from "@/lib/finance/source-confidence";
import {
  loadCollectionFacts,
  loadReceivableFacts,
  loadBankFacts,
  loadReconciliationFacts,
  loadPlanningFacts,
} from "./financial-knowledge-map";
import { DataFreshnessReport, EvidenceIndex } from "./financial-intelligence-types";
import {
  BusinessState,
  LiquidityState,
  ReceivablesState,
  CollectionsState,
  BankingState,
  ReconciliationState,
  CloseState,
  PlanningState,
  FinancialGraphState,
  EvidenceEntry,
  IntelligenceFocusArea,
} from "./financial-intelligence-types";

// ── Business state ────────────────────────────────────────────────────────────

export function buildBusinessState(
  orgId:          string,
  graphCritical:  number,
  graphWarnings:  number,
  bankHealth:     string,
  cashConf:       "HIGH" | "MEDIUM" | "LOW" | null,
): BusinessState {
  const criticalSignals = graphCritical + (bankHealth === "critical" ? 1 : 0) + (cashConf === "LOW" ? 1 : 0);
  const activeSignals   = criticalSignals + graphWarnings + (bankHealth === "attention" ? 1 : 0);

  let financialHealth: BusinessState["financialHealth"];
  if (criticalSignals > 0)           financialHealth = "critical";
  else if (activeSignals > 0)        financialHealth = "attention";
  else if (activeSignals === 0 && cashConf !== null) financialHealth = "healthy";
  else                                financialHealth = "no_data";

  const summary =
    financialHealth === "critical"  ? `${criticalSignals} señal(es) crítica(s) requieren atención inmediata` :
    financialHealth === "attention" ? `${activeSignals} señal(es) activa(s) — revisión recomendada` :
    financialHealth === "healthy"   ? "Operación dentro de parámetros normales" :
                                      "Datos insuficientes para evaluar salud financiera";

  return { orgId, evaluatedAt: new Date(), financialHealth, activeSignals, criticalSignals, summary };
}

// ── Liquidity state ───────────────────────────────────────────────────────────

export async function buildLiquidityState(
  orgId:     string,
  evidence:  EvidenceEntry[],
): Promise<LiquidityState> {
  const [banking, cashConf, colFacts] = await Promise.all([
    getBankingSnapshot(orgId).catch(() => null),
    computeCashFlowConfidence(orgId).catch(() => null),
    loadCollectionFacts(orgId).catch(() => null),
  ]);

  const hasBankData   = banking?.hasRealData ?? false;
  const availableCash = hasBankData ? (banking?.balances?.totalAvailable ?? null) : null;
  const bankBalance   = hasBankData ? (banking?.balances?.totalCurrentBalance ?? null) : null;
  const pendingConsig = colFacts?.uncrossedAmount ?? 0;

  const confidenceLevel   = cashConf?.level ?? "LOW";
  const confidenceReasons = cashConf?.reasons ?? ["Sin datos bancarios disponibles"];

  // Rough runway: available cash / avg daily collections
  let runway: number | null = null;
  if (availableCash !== null && colFacts && colFacts.totalCount > 0) {
    const dailyAvg = colFacts.totalAmount / 30;
    if (dailyAvg > 0) runway = Math.round(availableCash / dailyAvg);
  }

  const state = !hasBankData ? "MISSING" : confidenceLevel === "LOW" ? "PARTIAL" : "REAL";

  return {
    state,
    availableCash,
    bankBalance,
    hasBankData,
    receivableDueThisWeek: null, // requires AR aging — not in scope
    pendingConsignaciones: pendingConsig,
    cashConfidenceLevel:   confidenceLevel,
    cashConfidenceReasons: confidenceReasons,
    runway,
    evidence,
  };
}

// ── Receivables state ─────────────────────────────────────────────────────────

export async function buildReceivablesState(
  orgId:    string,
  evidence: EvidenceEntry[],
): Promise<ReceivablesState> {
  const facts = await loadReceivableFacts(orgId).catch(() => null);

  if (!facts) {
    return {
      state: "MISSING", totalReceivable: null, overdueReceivable: null,
      overdueRatio: null, overdueClients: null, maxDpd: null, top5Debtors: [], evidence,
    };
  }

  const overdueRatio = facts.totalAmount > 0 ? facts.overdueAmount / facts.totalAmount : null;
  const state = facts.totalCount === 0 ? "MISSING" : "REAL";

  return {
    state,
    totalReceivable:   facts.totalAmount,
    overdueReceivable: facts.overdueAmount,
    overdueRatio,
    overdueClients:    facts.overdueCount,
    maxDpd:            facts.maxDpd,
    top5Debtors:       facts.top5.map(t => ({
      name: t.clientName, amount: t.amount, daysOverdue: t.daysOverdue,
    })),
    evidence,
  };
}

// ── Collections state ─────────────────────────────────────────────────────────

export async function buildCollectionsState(
  orgId:    string,
  evidence: EvidenceEntry[],
): Promise<CollectionsState> {
  const facts = await loadCollectionFacts(orgId).catch(() => null);

  if (!facts) {
    return {
      state: "MISSING", todayAmount: null, todayCount: null, totalAmount: null,
      uncrossedAmount: null, uncrossedCount: null, bySource: {}, evidence,
    };
  }

  const state = facts.totalCount === 0 ? "MISSING" : "REAL";

  return {
    state,
    todayAmount:     facts.todayAmount,
    todayCount:      facts.todayCount,
    totalAmount:     facts.totalAmount,
    uncrossedAmount: facts.uncrossedAmount,
    uncrossedCount:  facts.uncrossedCount,
    bySource:        facts.bySource,
    evidence,
  };
}

// ── Banking state ─────────────────────────────────────────────────────────────

export async function buildBankingState(
  orgId:    string,
  evidence: EvidenceEntry[],
): Promise<BankingState> {
  const [snapshot, bankFacts] = await Promise.all([
    getBankingSnapshot(orgId).catch(() => null),
    loadBankFacts(orgId).catch(() => null),
  ]);

  if (!snapshot || !snapshot.hasRealData || !bankFacts) {
    return {
      state: "MISSING", accountCount: 0, totalAvailable: null, totalCreditToday: null,
      unreconciledCount: 0, staleAccounts: 0, healthLevel: "no_data", unmatchedMovements: 0, evidence,
    };
  }

  const healthLevel = snapshot.health?.level ?? "no_data";
  const state: BankingState["state"] =
    bankFacts.staleAccountCount > 0 ? "STALE" :
    healthLevel === "critical"      ? "PARTIAL" :
                                      "REAL";

  return {
    state,
    accountCount:       bankFacts.accountCount,
    totalAvailable:     bankFacts.totalAvailable,
    totalCreditToday:   bankFacts.totalCreditToday,
    unreconciledCount:  0,
    staleAccounts:      bankFacts.staleAccountCount,
    healthLevel:        healthLevel as BankingState["healthLevel"],
    unmatchedMovements: bankFacts.unmatchedMovements,
    evidence,
  };
}

// ── Reconciliation state ──────────────────────────────────────────────────────

export async function buildReconciliationState(
  orgId:    string,
  evidence: EvidenceEntry[],
  graphUnresolved: number,
  graphCritical:   number,
): Promise<ReconciliationState> {
  const facts = await loadReconciliationFacts(orgId).catch(() => null);

  if (!facts) {
    return {
      state: "MISSING", total: 0, conciliado: 0, pendiente: 0, inconsistente: 0, parcial: 0,
      conciliadoPct: 0, graphIssues: 0, unresolvedNodes: 0, evidence,
    };
  }

  const conciliadoPct = facts.total > 0 ? (facts.conciliado / facts.total) * 100 : 0;
  const state: ReconciliationState["state"] =
    facts.total === 0         ? "MISSING"  :
    facts.inconsistente > 0   ? "PARTIAL"  :
    facts.pendiente > 0       ? "PARTIAL"  :
                                "REAL";

  return {
    state,
    total:         facts.total,
    conciliado:    facts.conciliado,
    pendiente:     facts.pendiente,
    inconsistente: facts.inconsistente,
    parcial:       facts.parcial,
    conciliadoPct,
    graphIssues:   graphCritical,
    unresolvedNodes: graphUnresolved,
    evidence,
  };
}

// ── Close state ───────────────────────────────────────────────────────────────

export async function buildCloseState(
  orgId:           string,
  evidence:        EvidenceEntry[],
  graphCritical:   number,
  graphUnresolved: number,
  bankHealth:      string,
  recPct:          number,
): Promise<CloseState> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (bankHealth === "critical") blockers.push("Cuentas bancarias en estado crítico");
  if (graphCritical > 0) blockers.push(`${graphCritical} issue(s) crítico(s) en grafo financiero`);
  if (graphUnresolved > 20) blockers.push(`${graphUnresolved} relaciones sin resolver en grafo`);
  if (recPct < 80) warnings.push(`Conciliación al ${recPct.toFixed(0)}% — recomendado ≥80% para cierre`);
  if (bankHealth === "attention") warnings.push("Cuentas bancarias requieren revisión");

  const canClose = blockers.length === 0;
  const score    = canClose ? Math.max(50, Math.round(recPct)) : null;
  const grade    = score === null ? null : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
  const state: CloseState["state"] = blockers.length > 0 ? "PARTIAL" : recPct < 80 ? "PARTIAL" : "REAL";

  return { state, canClose, score, grade, blockers, warnings, graphBlockers: graphCritical, evidence };
}

// ── Planning state ────────────────────────────────────────────────────────────

export async function buildPlanningState(
  orgId:    string,
  evidence: EvidenceEntry[],
): Promise<PlanningState> {
  const facts = await loadPlanningFacts(orgId).catch(() => null);

  if (!facts) {
    return {
      state: "MISSING", budgetCount: 0, totalBudget: null, totalExecuted: null,
      executionPct: null, budgetsAtRisk: 0, evidence,
    };
  }

  const executionPct = facts.totalBudget > 0
    ? (facts.totalExecuted / facts.totalBudget) * 100
    : null;

  const state: PlanningState["state"] =
    facts.budgetCount === 0 ? "MISSING" :
    facts.atRiskCount > 0   ? "PARTIAL" :
                              "REAL";

  return {
    state,
    budgetCount:   facts.budgetCount,
    totalBudget:   facts.totalBudget,
    totalExecuted: facts.totalExecuted,
    executionPct,
    budgetsAtRisk: facts.atRiskCount,
    evidence,
  };
}

// ── Financial graph state ─────────────────────────────────────────────────────

export async function buildFinancialGraphState(
  orgId:    string,
  evidence: EvidenceEntry[],
): Promise<FinancialGraphState> {
  const health = await getGraphHealthSummary(orgId).catch(() => null);

  if (!health) {
    return {
      state: "MISSING", totalNodes: 0, totalEdges: 0, unresolvedCount: 0,
      orphanCount: 0, criticalIssues: 0, warningIssues: 0, evidence,
    };
  }

  const state: FinancialGraphState["state"] =
    health.totalNodes === 0         ? "MISSING"  :
    health.criticalIssues > 0       ? "PARTIAL"  :
    health.warningIssues > 0        ? "PARTIAL"  :
                                      "REAL";

  return {
    state,
    totalNodes:      health.totalNodes,
    totalEdges:      health.totalEdges,
    unresolvedCount: health.unresolvedCount,
    orphanCount:     health.orphanCount,
    criticalIssues:  health.criticalIssues,
    warningIssues:   health.warningIssues,
    evidence,
  };
}

// ── Focus areas ───────────────────────────────────────────────────────────────

export function deriveRecommendedFocusAreas(
  graphState:   FinancialGraphState,
  bankState:    BankingState,
  recState:     ReconciliationState,
  closeState:   CloseState,
  liquidState:  LiquidityState,
  planState:    PlanningState,
): IntelligenceFocusArea[] {
  const areas: IntelligenceFocusArea[] = [];

  if (graphState.criticalIssues > 0) {
    areas.push({
      area:      "Grafo financiero",
      reason:    `${graphState.criticalIssues} issue(s) crítico(s) afectan integridad`,
      severity:  "critical",
      action:    "Revisar y resolver inconsistencias en Conciliación",
      traceable: true,
    });
  }

  if (bankState.healthLevel === "critical") {
    areas.push({
      area:      "Tesorería",
      reason:    "Estado bancario crítico",
      severity:  "critical",
      action:    "Revisar cuentas bancarias en Tesorería",
      traceable: true,
    });
  }

  if (recState.pendiente > 0 || recState.inconsistente > 0) {
    areas.push({
      area:      "Conciliación",
      reason:    `${recState.pendiente} movimientos pendientes, ${recState.inconsistente} inconsistentes`,
      severity:  recState.inconsistente > 0 ? "high" : "medium",
      action:    "Completar conciliación bancaria",
      traceable: true,
    });
  }

  if (closeState.blockers.length > 0) {
    areas.push({
      area:      "Cierre financiero",
      reason:    closeState.blockers[0],
      severity:  "high",
      action:    "Resolver bloqueos antes de intentar cierre",
      traceable: false,
    });
  }

  if (liquidState.cashConfidenceLevel === "LOW") {
    areas.push({
      area:      "Liquidez",
      reason:    liquidState.cashConfidenceReasons[0] ?? "Confianza baja en datos de caja",
      severity:  "medium",
      action:    "Conectar fuente bancaria para mejorar confianza",
      traceable: false,
    });
  }

  if (planState.budgetsAtRisk > 0) {
    areas.push({
      area:      "Planeación",
      reason:    `${planState.budgetsAtRisk} presupuesto(s) en riesgo de sobreejecución`,
      severity:  "medium",
      action:    "Revisar presupuestos en riesgo en módulo Planeación",
      traceable: true,
    });
  }

  return areas;
}
