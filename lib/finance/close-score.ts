/**
 * close-score.ts
 *
 * Sprint 4 — Cierre financiero inteligente V1
 *
 * Computes a 0–100 health score from six weighted dimensions:
 *   1. Fiscal        (25%) — DIAN validation quality
 *   2. Reconciliación (20%) — invoice ↔ bank matching
 *   3. Contabilidad   (20%) — accounting classification coverage
 *   4. Cartera        (20%) — receivables health / overdue exposure
 *   5. Tesorería      (10%) — cash flow / liquidity horizon
 *   6. Documentación  (5%)  — document validation quality
 *
 * Grade thresholds:
 *   A ≥ 90  (closeable, green)
 *   B ≥ 75  (closeable, light green)
 *   C ≥ 60  (warning — review before close)
 *   D ≥ 45  (caution — blockers likely)
 *   F < 45  (do not close — critical issues)
 */

import type { FiscalSummary }          from "./dian-read";
import type { ReconciliationSummary }  from "./reconciliation";
import type { ClassificationBatch }    from "./accounting-classifier";
import type { ValidationStatusCounts } from "./queries";
import type { CashFlowSummary, VarianceRow } from "./fpa-queries";

// ── Public types ──────────────────────────────────────────────────────────────

export type CloseGrade = "A" | "B" | "C" | "D" | "F";
export type DimensionSeverity = "ok" | "warning" | "critical";

export interface CloseScoreDimension {
  key:      string;
  label:    string;
  score:    number;   // 0–100
  weight:   number;   // weight applied to total (0–1)
  signals:  string[];
  severity: DimensionSeverity;
  /** Computed contribution to total (score × weight). */
  contribution: number;
}

export interface CloseScore {
  /** Weighted total 0–100. */
  total:       number;
  grade:       CloseGrade;
  /** True when total ≥ 75. */
  closeable:   boolean;
  dimensions:  CloseScoreDimension[];
  blockers:    string[];   // must-fix before close
  warnings:    string[];   // should-review but not blockers
}

// ── Grade mapping ─────────────────────────────────────────────────────────────

function gradeFromScore(score: number): CloseGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

function severityFromScore(score: number): DimensionSeverity {
  if (score >= 70) return "ok";
  if (score >= 45) return "warning";
  return "critical";
}

// ── Dimension scorers ─────────────────────────────────────────────────────────

function scoreFiscal(fiscal: FiscalSummary): Omit<CloseScoreDimension, "contribution"> {
  const signals: string[] = [];
  let score = 100;

  if (!fiscal.hasData) {
    return {
      key: "fiscal", label: "Fiscal / DIAN", weight: 0.25,
      score: 50, signals: ["Sin documentos XML procesados"], severity: "warning",
    };
  }

  const { total, validado, rechazado, inconsistente, duplicado, noEncontrado } = fiscal;

  if (total === 0) {
    return {
      key: "fiscal", label: "Fiscal / DIAN", weight: 0.25,
      score: 50, signals: ["Sin documentos fiscales"], severity: "warning",
    };
  }

  const validPct   = validado    / total;
  const invalidPct = (rechazado + inconsistente + duplicado) / total;

  if (validPct >= 0.95) {
    signals.push(`${validado}/${total} docs validados ante DIAN`);
  } else if (validPct >= 0.80) {
    score -= 15;
    signals.push(`${validado}/${total} docs validados (${(validPct * 100).toFixed(0)}%)`);
  } else {
    score -= 30;
    signals.push(`Solo ${(validPct * 100).toFixed(0)}% validados — cobertura baja`);
  }

  if (inconsistente > 0) {
    const pen = Math.min(40, inconsistente * 8);
    score -= pen;
    signals.push(`${inconsistente} inconsistencias con DIAN`);
  }
  if (duplicado > 0) {
    const pen = Math.min(20, duplicado * 6);
    score -= pen;
    signals.push(`${duplicado} CUFE duplicados detectados`);
  }
  if (rechazado > 0) {
    const pen = Math.min(15, rechazado * 3);
    score -= pen;
    signals.push(`${rechazado} documentos rechazados`);
  }
  if (noEncontrado > 0) {
    score -= Math.min(10, noEncontrado * 2);
    signals.push(`${noEncontrado} sin CUFE/XML`);
  }

  // Bonus: very low invalid rate
  if (invalidPct === 0 && total >= 5) {
    score = Math.min(100, score + 5);
    signals.push("Cero inconsistencias — excelente");
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "fiscal", label: "Fiscal / DIAN", weight: 0.25, score, signals, severity: severityFromScore(score) };
}

function scoreReconciliation(rec: ReconciliationSummary): Omit<CloseScoreDimension, "contribution"> {
  const signals: string[] = [];
  let score = 100;

  if (!rec.hasData || rec.total === 0) {
    return {
      key: "reconciliacion", label: "Conciliación", weight: 0.20,
      score: 50, signals: ["Sin datos de conciliación"], severity: "warning",
    };
  }

  const { total, conciliado, parcial, pendiente, inconsistente } = rec;

  const conciliadoPct = conciliado / total;
  if (conciliadoPct >= 0.90) {
    signals.push(`${conciliado}/${total} conciliados`);
  } else if (conciliadoPct >= 0.70) {
    score -= 15;
    signals.push(`${(conciliadoPct * 100).toFixed(0)}% conciliados`);
  } else {
    score -= 30;
    signals.push(`Solo ${(conciliadoPct * 100).toFixed(0)}% conciliados`);
  }

  if (inconsistente > 0) {
    const pen = Math.min(35, inconsistente * 7);
    score -= pen;
    signals.push(`${inconsistente} inconsistencias de conciliación`);
  }
  if (pendiente > 0) {
    const pen = Math.min(20, pendiente * 3);
    score -= pen;
    signals.push(`${pendiente} pendientes sin match`);
  }
  if (parcial > 0) {
    score -= Math.min(10, parcial * 2);
    signals.push(`${parcial} conciliaciones parciales`);
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "reconciliacion", label: "Conciliación", weight: 0.20, score, signals, severity: severityFromScore(score) };
}

function scoreAccounting(batch: ClassificationBatch): Omit<CloseScoreDimension, "contribution"> {
  const signals: string[] = [];
  let score = 100;

  if (!batch.hasData || batch.total === 0) {
    return {
      key: "contabilidad", label: "Contabilidad", weight: 0.20,
      score: 50, signals: ["Sin clasificaciones contables"], severity: "warning",
    };
  }

  const { total, autoApproved, requiresReview, taxSensitive } = batch;
  const sinClasificar = (batch.byCategory?.SIN_CLASIFICAR ?? 0) as number;

  const autoPct    = autoApproved / total;
  const reviewPct  = requiresReview / total;
  const unclassPct = sinClasificar / total;

  if (autoPct >= 0.80) {
    signals.push(`${autoApproved}/${total} auto-aprobados`);
  } else if (autoPct >= 0.60) {
    score -= 15;
    signals.push(`${(autoPct * 100).toFixed(0)}% auto-aprobados — cobertura media`);
  } else {
    score -= 25;
    signals.push(`Solo ${(autoPct * 100).toFixed(0)}% auto-aprobados`);
  }

  if (unclassPct > 0.10) {
    const pen = Math.min(30, Math.round(unclassPct * 100));
    score -= pen;
    signals.push(`${sinClasificar} sin clasificar (${(unclassPct * 100).toFixed(0)}%)`);
  } else if (sinClasificar > 0) {
    score -= 5;
    signals.push(`${sinClasificar} sin clasificar`);
  }

  if (taxSensitive > 0) {
    // Tax-sensitive docs require accountant review; penalize lightly
    score -= Math.min(10, taxSensitive * 2);
    signals.push(`${taxSensitive} docs con alerta tributaria`);
  }

  if (reviewPct < 0.10 && unclassPct === 0) {
    signals.push("Clasificación contable completa");
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "contabilidad", label: "Contabilidad", weight: 0.20, score, signals, severity: severityFromScore(score) };
}

function scoreCartera(cashFlow: CashFlowSummary | null): Omit<CloseScoreDimension, "contribution"> {
  const signals: string[] = [];
  let score = 100;

  if (!cashFlow || !cashFlow.hasData || cashFlow.totalOutstanding === 0) {
    return {
      key: "cartera", label: "Cartera", weight: 0.20,
      score: 70, signals: ["Sin datos de cartera"], severity: "ok",
    };
  }

  const { totalOutstanding, totalOverdue, currency } = cashFlow;
  const overduePct = totalOutstanding > 0 ? totalOverdue / totalOutstanding : 0;

  const fmt = (n: number) =>
    `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

  if (overduePct >= 0.50) {
    score -= 40;
    signals.push(`${(overduePct * 100).toFixed(0)}% de cartera vencida (${fmt(totalOverdue)} ${currency})`);
  } else if (overduePct >= 0.30) {
    score -= 25;
    signals.push(`${(overduePct * 100).toFixed(0)}% vencida — nivel alto`);
  } else if (overduePct >= 0.15) {
    score -= 12;
    signals.push(`${(overduePct * 100).toFixed(0)}% vencida — nivel moderado`);
  } else {
    signals.push(`Cartera saludable: ${(overduePct * 100).toFixed(0)}% vencida`);
  }

  // Aging: critical bucket (>90 days) from aging breakdown
  const aging90 = cashFlow.aging.find((a) => a.bucket === ">90d" || a.bucket === "MAS_90");
  if (aging90 && aging90.amount > 0) {
    const pct = aging90.amount / totalOutstanding;
    if (pct > 0.20) {
      score -= 15;
      signals.push(`${(pct * 100).toFixed(0)}% en bucket >90 días`);
    }
  }

  // Check 30-day horizon inflow
  const h30 = cashFlow.horizons.find((h) => h.label?.includes("30"));
  if (h30 && h30.expected > 0) {
    signals.push(`Recaudo esperado 30d: ${fmt(h30.expected)} ${currency}`);
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "cartera", label: "Cartera", weight: 0.20, score, signals, severity: severityFromScore(score) };
}

function scoreTesoreria(cashFlow: CashFlowSummary | null): Omit<CloseScoreDimension, "contribution"> {
  const signals: string[] = [];
  let score = 100;

  if (!cashFlow || !cashFlow.hasData) {
    return {
      key: "tesoreria", label: "Tesorería", weight: 0.10,
      score: 60, signals: ["Sin datos de tesorería"], severity: "ok",
    };
  }

  const fmt = (n: number) =>
    `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

  // Evaluate 90-day conservative inflow vs outstanding
  const h90 = cashFlow.horizons.find((h) => h.label?.includes("90"));
  if (h90) {
    const conservRatio = cashFlow.totalOutstanding > 0
      ? h90.conservative / cashFlow.totalOutstanding
      : 1;
    if (conservRatio >= 0.80) {
      signals.push(`Liquidez 90d saludable: ${fmt(h90.conservative)} ${cashFlow.currency} escenario conservador`);
    } else if (conservRatio >= 0.50) {
      score -= 20;
      signals.push(`Liquidez 90d moderada (${(conservRatio * 100).toFixed(0)}% de cartera)`);
    } else {
      score -= 40;
      signals.push(`Liquidez 90d baja — riesgo de caja`);
    }
  }

  // Overdue recovery
  const { overdueRecovery } = cashFlow;
  if (overdueRecovery.base > 0 && cashFlow.totalOverdue > 0) {
    const recRatio = overdueRecovery.base / cashFlow.totalOverdue;
    if (recRatio < 0.40) {
      score -= 15;
      signals.push(`Recuperación cartera vencida proyectada: ${(recRatio * 100).toFixed(0)}%`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "tesoreria", label: "Tesorería", weight: 0.10, score, signals, severity: severityFromScore(score) };
}

function scoreDocumentacion(validationCounts: ValidationStatusCounts): Omit<CloseScoreDimension, "contribution"> {
  const signals: string[] = [];
  let score = 100;

  const { VALID, INCOMPLETE, REVIEW_REQUIRED, unprocessed } = validationCounts;
  const total = VALID + INCOMPLETE + REVIEW_REQUIRED + unprocessed;

  if (total === 0) {
    return {
      key: "documentacion", label: "Documentación", weight: 0.05,
      score: 60, signals: ["Sin documentos registrados"], severity: "ok",
    };
  }

  const validPct    = VALID / total;
  const incompPct   = INCOMPLETE / total;
  const reviewPct   = REVIEW_REQUIRED / total;
  const unprocPct   = unprocessed / total;

  if (validPct >= 0.85) {
    signals.push(`${VALID}/${total} documentos válidos`);
  } else if (validPct >= 0.65) {
    score -= 15;
    signals.push(`${(validPct * 100).toFixed(0)}% documentos válidos`);
  } else {
    score -= 30;
    signals.push(`Solo ${(validPct * 100).toFixed(0)}% válidos`);
  }

  if (REVIEW_REQUIRED > 0) {
    score -= Math.min(20, REVIEW_REQUIRED * 3);
    signals.push(`${REVIEW_REQUIRED} requieren revisión`);
  }
  if (INCOMPLETE > 0) {
    score -= Math.min(15, INCOMPLETE * 2);
    signals.push(`${INCOMPLETE} incompletos`);
  }
  if (unprocessed > 0) {
    score -= Math.min(10, unprocessed * 1);
    signals.push(`${unprocessed} sin procesar`);
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "documentacion", label: "Documentación", weight: 0.05, score, signals, severity: severityFromScore(score) };
}

// ── Remision conversion signal (source-aware) ─────────────────────────────────

export interface RemisionSignal {
  /** Total pending remision count (any age). */
  pendingCount:    number;
  /** Total pending remision amount. */
  pendingAmount:   number;
  /** Count of high-risk remisiones (>7 days). */
  highRiskCount:   number;
  /** Count of critical remisiones (>15 days). */
  criticalCount:   number;
}

function scoreRemisionConversion(signal: RemisionSignal | null): Omit<CloseScoreDimension, "contribution"> {
  if (!signal || signal.pendingCount === 0) {
    return {
      key: "remision", label: "Conversión remisiones", weight: 0,
      score: 100, signals: ["Sin remisiones pendientes"], severity: "ok",
    };
  }
  const signals: string[] = [];
  let score = 100;
  const fmt = (n: number) => `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

  if (signal.criticalCount > 0) {
    score -= Math.min(40, signal.criticalCount * 10);
    signals.push(`${signal.criticalCount} remisiones >15 días sin facturar`);
  }
  if (signal.highRiskCount > 0) {
    score -= Math.min(20, signal.highRiskCount * 5);
    signals.push(`${signal.highRiskCount} remisiones >7 días`);
  }
  if (signal.pendingAmount > 0) {
    signals.push(`${fmt(signal.pendingAmount)} COP en remisiones pendientes`);
  }

  score = Math.max(0, Math.min(100, score));
  return { key: "remision", label: "Conversión remisiones", weight: 0, score, signals, severity: severityFromScore(score) };
}

// ── Main export ────────────────────────────────────────────────────────────────

export function computeCloseScore(
  fiscal:            FiscalSummary,
  reconciliation:    ReconciliationSummary,
  accounting:        ClassificationBatch,
  validationCounts:  ValidationStatusCounts,
  cashFlow:          CashFlowSummary | null,
  remisionSignal?:   RemisionSignal | null,
): CloseScore {
  const dims: Omit<CloseScoreDimension, "contribution">[] = [
    scoreFiscal(fiscal),
    scoreReconciliation(reconciliation),
    scoreAccounting(accounting),
    scoreCartera(cashFlow),
    scoreTesoreria(cashFlow),
    scoreDocumentacion(validationCounts),
  ];

  const total = Math.round(
    dims.reduce((acc, d) => acc + d.score * d.weight, 0)
  );

  const dimensions: CloseScoreDimension[] = dims.map((d) => ({
    ...d,
    contribution: Math.round(d.score * d.weight),
  }));

  const grade     = gradeFromScore(total);
  const closeable = total >= 75;

  // Blockers: critical dimensions or critical fiscal/reconciliation mismatches
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const d of dimensions) {
    if (d.severity === "critical") {
      blockers.push(`${d.label}: score crítico (${d.score}/100)`);
    } else if (d.severity === "warning") {
      warnings.push(`${d.label}: requiere revisión (${d.score}/100)`);
    }
  }

  if (fiscal.inconsistente > 0) {
    blockers.push(`${fiscal.inconsistente} inconsistencias fiscales ante DIAN pendientes de resolución`);
  }
  if (fiscal.duplicado > 0) {
    blockers.push(`${fiscal.duplicado} CUFE duplicados — requieren auditoría`);
  }
  if (reconciliation.inconsistente > 0) {
    warnings.push(`${reconciliation.inconsistente} partidas de conciliación inconsistentes`);
  }

  // Remision conversion warnings
  if (remisionSignal) {
    if (remisionSignal.criticalCount > 0) {
      blockers.push(`${remisionSignal.criticalCount} remisiones >15 días sin convertir a factura`);
    } else if (remisionSignal.highRiskCount > 0) {
      warnings.push(`${remisionSignal.highRiskCount} remisiones >7 días pendientes de conversión`);
    } else if (remisionSignal.pendingCount > 0) {
      warnings.push(`${remisionSignal.pendingCount} remisiones (Fuente 2) pendientes de facturación`);
    }
  }

  return { total, grade, closeable, dimensions, blockers, warnings };
}
