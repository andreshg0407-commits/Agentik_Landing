/**
 * close-committee.ts
 *
 * Sprint 4 — Cierre financiero inteligente V1
 *
 * Assembles the executive committee report from all available finance
 * sub-module data.  No database access — pure aggregation from already-loaded
 * summaries.
 *
 * Output:
 *   - Top 5 risks (ordered CRITICO → ALTO → MEDIO)
 *   - Top 5 opportunities
 *   - Budget summary (when variance data available)
 *   - 90-day liquidity summary
 *   - Fiscal risk snapshot
 *   - Suggested management decisions (max 5, prioritised)
 */

import type { CloseScore }            from "./close-score";
import type { FiscalSummary }          from "./dian-read";
import type { ReconciliationSummary }  from "./reconciliation";
import type { ClassificationBatch }    from "./accounting-classifier";
import type { CashFlowSummary, VarianceRow, FpaRecommendation } from "./fpa-queries";
import type { FinanceOverview }        from "./queries";

// ── Public types ──────────────────────────────────────────────────────────────

export type RiskSeverity = "CRITICO" | "ALTO" | "MEDIO";

export interface CommitteeRisk {
  id:          string;
  severity:    RiskSeverity;
  area:        string;
  description: string;
  metric:      string | null;
}

export interface CommitteeOpportunity {
  id:          string;
  area:        string;
  description: string;
  metric:      string | null;
}

export interface BudgetSummary {
  totalBudgeted: number;
  totalActual:   number;
  variancePct:   number;   // (actual - budgeted) / budgeted * 100
  currency:      string;
  hasData:       boolean;
}

export interface LiquiditySummary {
  totalOutstanding: number;
  totalOverdue:     number;
  overduePct:       number;
  next30DayInflow:  number;
  next90DayInflow:  number;
  currency:         string;
  hasData:          boolean;
}

export interface FiscalRiskSnapshot {
  total:         number;
  inconsistente: number;
  duplicado:     number;
  rechazado:     number;
  validado:      number;
  validPct:      number;
  hasCritical:   boolean;
}

export interface CommitteeReport {
  generatedAt:       Date;
  closeScore:        number;
  closeGrade:        string;
  closeable:         boolean;
  risks:             CommitteeRisk[];
  opportunities:     CommitteeOpportunity[];
  budget:            BudgetSummary;
  liquidity:         LiquiditySummary;
  fiscalRisk:        FiscalRiskSnapshot;
  suggestedDecisions: string[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} COP`;
}

function fmtPct(n: number, decimals = 1): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

// ── Risk builder ──────────────────────────────────────────────────────────────

function buildRisks(
  score:         CloseScore,
  fiscal:        FiscalSummary,
  reconciliation: ReconciliationSummary,
  accounting:    ClassificationBatch,
  cashFlow:      CashFlowSummary | null,
  overview:      FinanceOverview,
): CommitteeRisk[] {
  const risks: CommitteeRisk[] = [];
  let seq = 1;

  // ── Fiscal risks
  if (fiscal.inconsistente > 0) {
    risks.push({
      id: `risk-${seq++}`,
      severity: fiscal.inconsistente >= 5 ? "CRITICO" : "ALTO",
      area: "Fiscal / DIAN",
      description: `${fiscal.inconsistente} documento${fiscal.inconsistente > 1 ? "s" : ""} con inconsistencias fiscales ante la DIAN. Riesgo de rechazo en declaración de IVA y renta.`,
      metric: `${fiscal.inconsistente}/${fiscal.total} inconsistentes`,
    });
  }
  if (fiscal.duplicado > 0) {
    risks.push({
      id: `risk-${seq++}`,
      severity: "CRITICO",
      area: "Fiscal / DIAN",
      description: `${fiscal.duplicado} CUFE duplicado${fiscal.duplicado > 1 ? "s" : ""} detectado${fiscal.duplicado > 1 ? "s" : ""}. Posible doble contabilización o fraude documental.`,
      metric: `${fiscal.duplicado} duplicados`,
    });
  }
  if (fiscal.rechazado > 0) {
    risks.push({
      id: `risk-${seq++}`,
      severity: "ALTO",
      area: "Fiscal / DIAN",
      description: `${fiscal.rechazado} documento${fiscal.rechazado > 1 ? "s" : ""} rechazado${fiscal.rechazado > 1 ? "s" : ""} por extracción XML fallida. Sin respaldo fiscal electrónico.`,
      metric: `${fiscal.rechazado} rechazados`,
    });
  }

  // ── Reconciliation risks
  if (reconciliation.inconsistente > 0) {
    risks.push({
      id: `risk-${seq++}`,
      severity: "ALTO",
      area: "Conciliación",
      description: `${reconciliation.inconsistente} partida${reconciliation.inconsistente > 1 ? "s" : ""} de conciliación con divergencias de monto o NIT. Posibles errores contables o pagos mal aplicados.`,
      metric: `${reconciliation.inconsistente}/${reconciliation.total} inconsistentes`,
    });
  }

  // ── Cartera risks
  if (cashFlow?.hasData && cashFlow.totalOutstanding > 0) {
    const overduePct = cashFlow.totalOverdue / cashFlow.totalOutstanding;
    if (overduePct >= 0.40) {
      risks.push({
        id: `risk-${seq++}`,
        severity: "CRITICO",
        area: "Cartera",
        description: `El ${(overduePct * 100).toFixed(0)}% de la cartera está vencida — riesgo de deterioro patrimonial y provisión contable.`,
        metric: `${fmtCOP(cashFlow.totalOverdue)} vencidos de ${fmtCOP(cashFlow.totalOutstanding)}`,
      });
    } else if (overduePct >= 0.25) {
      risks.push({
        id: `risk-${seq++}`,
        severity: "ALTO",
        area: "Cartera",
        description: `${(overduePct * 100).toFixed(0)}% de cartera vencida — requiere gestión de cobranza inmediata.`,
        metric: `${fmtCOP(cashFlow.totalOverdue)} vencidos`,
      });
    }
  }

  // ── Documentation risks
  if (overview.documents.errors > 0) {
    risks.push({
      id: `risk-${seq++}`,
      severity: overview.documents.errors >= 10 ? "ALTO" : "MEDIO",
      area: "Documentación",
      description: `${overview.documents.errors} documento${overview.documents.errors > 1 ? "s" : ""} con error de procesamiento — sin respaldo válido para cierre.`,
      metric: `${overview.documents.errors} errores`,
    });
  }

  // ── Accounting risks
  const sinClasificar = (accounting.byCategory?.SIN_CLASIFICAR ?? 0) as number;
  if (sinClasificar > 0) {
    const pct = accounting.total > 0 ? sinClasificar / accounting.total : 0;
    risks.push({
      id: `risk-${seq++}`,
      severity: pct > 0.20 ? "ALTO" : "MEDIO",
      area: "Contabilidad",
      description: `${sinClasificar} documento${sinClasificar > 1 ? "s" : ""} sin clasificación contable — no pueden ser legalizados.`,
      metric: `${sinClasificar} sin clasificar (${(pct * 100).toFixed(0)}%)`,
    });
  }

  // Sort: CRITICO → ALTO → MEDIO, take top 5
  const ORDER: Record<RiskSeverity, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2 };
  return risks.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]).slice(0, 5);
}

// ── Opportunity builder ───────────────────────────────────────────────────────

function buildOpportunities(
  score:         CloseScore,
  fiscal:        FiscalSummary,
  reconciliation: ReconciliationSummary,
  accounting:    ClassificationBatch,
  cashFlow:      CashFlowSummary | null,
  fpaRecs:       FpaRecommendation[],
): CommitteeOpportunity[] {
  const opps: CommitteeOpportunity[] = [];
  let seq = 1;

  // From FP&A recommendations
  for (const rec of fpaRecs.filter((r) => r.severity !== "critical").slice(0, 3)) {
    opps.push({
      id: `opp-${seq++}`,
      area: rec.category === "cashflow" ? "Tesorería" : rec.category === "budget" ? "Presupuesto" : "Crecimiento",
      description: rec.body,
      metric: rec.metric ?? null,
    });
  }

  // Cash flow recovery opportunity
  if (cashFlow?.hasData && cashFlow.totalOverdue > 0) {
    const base = cashFlow.overdueRecovery.base;
    if (base > 0) {
      opps.push({
        id: `opp-${seq++}`,
        area: "Tesorería",
        description: `Recuperación proyectada de cartera vencida en escenario base mediante gestión de cobranza activa.`,
        metric: fmtCOP(base),
      });
    }
  }

  // Accounting coverage opportunity
  if (accounting.autoApproved > 0 && accounting.autoApproved === accounting.total) {
    opps.push({
      id: `opp-${seq++}`,
      area: "Contabilidad",
      description: "100% de documentos clasificados automáticamente — proceso contable listo para legalización directa.",
      metric: `${accounting.autoApproved} docs auto-aprobados`,
    });
  } else if (accounting.taxSensitive > 0) {
    opps.push({
      id: `opp-${seq++}`,
      area: "Fiscal",
      description: `${accounting.taxSensitive} documentos con IVA/retención identificados para optimización tributaria.`,
      metric: `${accounting.taxSensitive} docs fiscales`,
    });
  }

  // High fiscal validation
  if (fiscal.hasData && fiscal.total > 0 && fiscal.validado / fiscal.total >= 0.95) {
    opps.push({
      id: `opp-${seq++}`,
      area: "Fiscal / DIAN",
      description: "Excelente cobertura fiscal — documentos listos para declaración de IVA y renta sin contingencias.",
      metric: `${fiscal.validado}/${fiscal.total} validados`,
    });
  }

  return opps.slice(0, 5);
}

// ── Budget summary ────────────────────────────────────────────────────────────

function buildBudgetSummary(
  varianceRows: VarianceRow[] | null,
): BudgetSummary {
  if (!varianceRows || varianceRows.length === 0) {
    return { totalBudgeted: 0, totalActual: 0, variancePct: 0, currency: "COP", hasData: false };
  }

  const totalBudgeted = varianceRows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual   = varianceRows.reduce((s, r) => s + r.actual,   0);
  const variancePct   = totalBudgeted > 0
    ? ((totalActual - totalBudgeted) / totalBudgeted) * 100
    : 0;
  const currency = varianceRows[0]?.currency ?? "COP";

  return { totalBudgeted, totalActual, variancePct, currency, hasData: true };
}

// ── Liquidity summary ─────────────────────────────────────────────────────────

function buildLiquiditySummary(cashFlow: CashFlowSummary | null): LiquiditySummary {
  if (!cashFlow || !cashFlow.hasData) {
    return {
      totalOutstanding: 0, totalOverdue: 0, overduePct: 0,
      next30DayInflow: 0, next90DayInflow: 0, currency: "COP", hasData: false,
    };
  }

  const overduePct     = cashFlow.totalOutstanding > 0
    ? cashFlow.totalOverdue / cashFlow.totalOutstanding
    : 0;
  const next30DayInflow = cashFlow.horizons.find((h) => h.label?.includes("30"))?.expected ?? 0;
  const next90DayInflow = cashFlow.horizons.find((h) => h.label?.includes("90"))?.expected ?? 0;

  return {
    totalOutstanding: cashFlow.totalOutstanding,
    totalOverdue:     cashFlow.totalOverdue,
    overduePct,
    next30DayInflow,
    next90DayInflow,
    currency:         cashFlow.currency,
    hasData:          true,
  };
}

// ── Fiscal risk snapshot ──────────────────────────────────────────────────────

function buildFiscalRisk(fiscal: FiscalSummary): FiscalRiskSnapshot {
  const validPct = fiscal.total > 0 ? fiscal.validado / fiscal.total : 0;
  return {
    total:         fiscal.total,
    inconsistente: fiscal.inconsistente,
    duplicado:     fiscal.duplicado,
    rechazado:     fiscal.rechazado,
    validado:      fiscal.validado,
    validPct,
    hasCritical:   fiscal.inconsistente > 0 || fiscal.duplicado > 0,
  };
}

// ── Decision builder ──────────────────────────────────────────────────────────

function buildDecisions(
  score:         CloseScore,
  fiscal:        FiscalSummary,
  reconciliation: ReconciliationSummary,
  cashFlow:      CashFlowSummary | null,
  budgetSummary: BudgetSummary,
): string[] {
  const decisions: string[] = [];

  if (!score.closeable) {
    decisions.push("Diferir el cierre contable hasta resolver los bloqueantes identificados.");
  }

  if (fiscal.inconsistente > 0 || fiscal.duplicado > 0) {
    decisions.push(`Escalar a revisor fiscal: ${fiscal.inconsistente + fiscal.duplicado} inconsistencias DIAN requieren corrección antes de declaración.`);
  }

  if (cashFlow?.hasData && cashFlow.totalOverdue > 0) {
    const pct = cashFlow.totalOutstanding > 0 ? cashFlow.totalOverdue / cashFlow.totalOutstanding : 0;
    if (pct >= 0.30) {
      decisions.push("Activar campaña de cobranza intensiva — cartera vencida supera umbral de provisión.");
    }
  }

  if (reconciliation.pendiente > 0) {
    decisions.push(`Asignar al equipo contable la resolución de ${reconciliation.pendiente} partidas pendientes antes del corte.`);
  }

  if (budgetSummary.hasData && budgetSummary.variancePct < -15) {
    decisions.push(`Analizar desviación presupuestal de ${fmtPct(budgetSummary.variancePct)} — evaluar ajuste de forecast.`);
  }

  if (score.closeable && score.total >= 85) {
    decisions.push("Proceder con el cierre mensual — todos los indicadores dentro de umbrales aceptables.");
  }

  return decisions.slice(0, 5);
}

// ── Main export ────────────────────────────────────────────────────────────────

export function buildCommitteeReport(
  score:          CloseScore,
  fiscal:         FiscalSummary,
  reconciliation: ReconciliationSummary,
  accounting:     ClassificationBatch,
  cashFlow:       CashFlowSummary | null,
  varianceRows:   VarianceRow[] | null,
  overview:       FinanceOverview,
  fpaRecs:        FpaRecommendation[],
): CommitteeReport {
  const budget    = buildBudgetSummary(varianceRows);
  const liquidity = buildLiquiditySummary(cashFlow);
  const fiscalRisk = buildFiscalRisk(fiscal);

  const risks = buildRisks(score, fiscal, reconciliation, accounting, cashFlow, overview);
  const opportunities = buildOpportunities(score, fiscal, reconciliation, accounting, cashFlow, fpaRecs);
  const suggestedDecisions = buildDecisions(score, fiscal, reconciliation, cashFlow, budget);

  return {
    generatedAt: new Date(),
    closeScore:  score.total,
    closeGrade:  score.grade,
    closeable:   score.closeable,
    risks,
    opportunities,
    budget,
    liquidity,
    fiscalRisk,
    suggestedDecisions,
  };
}
