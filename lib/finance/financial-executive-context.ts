/**
 * lib/finance/financial-executive-context.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-INTEGRATION-01 — FASE 9
 *
 * FinancialExecutiveContext — data shape for Diego (AGENTIK-DIEGO-COPILOT-01).
 *
 * Contains the full financial intelligence state required for an executive
 * AI copilot to reason about the organization's financial health.
 *
 * NOT displayed in any dashboard yet.
 * This shape will be consumed by Diego's context resolver in the next sprint.
 */

import type { FinancialIntegrityIssue } from "./graph/graph-types";
import type { BankingHealthSummary }     from "./banking/banking-status";
import type { OrgSourceConfidence }      from "./source-confidence";

// ── Sub-types ─────────────────────────────────────────────────────────────────

export type GraphHealthLevel = "healthy" | "degraded" | "critical" | "no_data";

export interface GraphHealth {
  level:           GraphHealthLevel;
  totalNodes:      number;
  totalEdges:      number;
  unresolvedCount: number;
  orphanCount:     number;
  criticalIssues:  number;
  warningIssues:   number;
  violationCount:  number;
}

export interface ReconciliationReadiness {
  /** 0–100 reconciliation coverage. */
  coveragePct:      number;
  pendingCount:     number;
  inconsistentCount: number;
  hasData:          boolean;
  blockers:         string[];
}

export interface CloseReadiness {
  /** 0–100 close score. */
  score:       number;
  grade:       "A" | "B" | "C" | "D" | "F" | null;
  closeable:   boolean;
  blockers:    string[];
  warnings:    string[];
}

export interface RecommendedFocusArea {
  area:       "tesoreria" | "conciliacion" | "cierre" | "planeacion" | "cartera" | "bancos";
  priority:   "critical" | "high" | "medium" | "low";
  reason:     string;
  actionHref: string;
}

// ── Main type ─────────────────────────────────────────────────────────────────

/**
 * Complete financial intelligence context for Diego.
 *
 * Assembled server-side from:
 *   - FinancialGraphSnapshot
 *   - BankingSnapshot
 *   - ReconciliationSummary
 *   - CloseScore
 *   - SourceConfidence
 */
export interface FinancialExecutiveContext {
  orgId:      string;
  builtAt:    Date;

  /** Overall financial graph health. */
  graphHealth: GraphHealth;

  /** Top 5 critical/warning integrity issues, sorted by severity. */
  topIntegrityIssues: FinancialIntegrityIssue[];

  /** Critical unresolved issues (severity = critical). */
  unresolvedCriticals: FinancialIntegrityIssue[];

  /** Cash confidence from source-confidence engine. */
  cashConfidence: {
    level:   "HIGH" | "MEDIUM" | "LOW";
    score:   number;
    reasons: string[];
  };

  /** Banking sync status. */
  bankSyncStatus: BankingHealthSummary;

  /** How ready is reconciliation for this period. */
  reconciliationReadiness: ReconciliationReadiness;

  /** How ready is the period close. */
  closeReadiness: CloseReadiness;

  /** Source confidence per data source. */
  sourceConfidence: OrgSourceConfidence;

  /** Priority focus areas for Diego to surface. */
  recommendedFocusAreas: RecommendedFocusArea[];
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the FinancialExecutiveContext from pre-fetched module outputs.
 *
 * Called by page-level server components — inputs are already fetched
 * in parallel alongside other module data. No extra Prisma queries here.
 */
export function buildFinancialExecutiveContext(input: {
  orgId:              string;
  graphHealth: {
    totalNodes: number; totalEdges: number;
    unresolvedCount: number; orphanCount: number;
    criticalIssues: number; warningIssues: number;
    violationCount: number;
  };
  integrityIssues:    FinancialIntegrityIssue[];
  bankSyncStatus:     BankingHealthSummary;
  cashConfidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  cashConfidenceScore: number;
  cashConfidenceReasons: string[];
  reconciliation: { total: number; conciliado: number; pendiente: number; inconsistente: number; hasData: boolean };
  closeScore:     { total: number; grade: string; closeable: boolean; blockers: string[]; warnings: string[] } | null;
  sourceConfidence:   OrgSourceConfidence;
}): FinancialExecutiveContext {
  const {
    orgId, graphHealth, integrityIssues, bankSyncStatus,
    cashConfidenceLevel, cashConfidenceScore, cashConfidenceReasons,
    reconciliation, closeScore, sourceConfidence,
  } = input;

  const level: GraphHealthLevel =
    graphHealth.criticalIssues > 0 ? "critical" :
    graphHealth.warningIssues  > 5 ? "degraded" :
    graphHealth.totalNodes     > 0 ? "healthy" :
    "no_data";

  const topIntegrityIssues = [...integrityIssues]
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    })
    .slice(0, 5);

  const unresolvedCriticals = integrityIssues.filter((i) => i.severity === "critical");

  // Derive recommended focus areas from data state
  const focusAreas: RecommendedFocusArea[] = [];

  if (unresolvedCriticals.length > 0) {
    focusAreas.push({ area: "conciliacion", priority: "critical", reason: `${unresolvedCriticals.length} inconsistencias críticas detectadas en el graph`, actionHref: "conciliacion" });
  }
  if (bankSyncStatus.level === "critical" || bankSyncStatus.level === "attention") {
    focusAreas.push({ area: "bancos", priority: bankSyncStatus.level === "critical" ? "critical" : "high", reason: bankSyncStatus.label, actionHref: "tesoreria" });
  }
  if ((reconciliation.pendiente ?? 0) > 10) {
    focusAreas.push({ area: "conciliacion", priority: "high", reason: `${reconciliation.pendiente} documentos pendientes de conciliación`, actionHref: "conciliacion" });
  }
  if (cashConfidenceLevel === "LOW") {
    focusAreas.push({ area: "tesoreria", priority: "high", reason: "Baja confianza en datos de tesorería — " + cashConfidenceReasons[0], actionHref: "tesoreria" });
  }
  if (closeScore && !closeScore.closeable) {
    focusAreas.push({ area: "cierre", priority: "medium", reason: `Score ${closeScore.total}/100 — grado ${closeScore.grade} · ${closeScore.blockers.length} bloqueos activos`, actionHref: "cierre" });
  }

  return {
    orgId,
    builtAt: new Date(),
    graphHealth: { level, ...graphHealth },
    topIntegrityIssues,
    unresolvedCriticals,
    cashConfidence:          { level: cashConfidenceLevel, score: cashConfidenceScore, reasons: cashConfidenceReasons },
    bankSyncStatus,
    reconciliationReadiness: {
      coveragePct:       reconciliation.total > 0 ? Math.round(reconciliation.conciliado / reconciliation.total * 100) : 0,
      pendingCount:      reconciliation.pendiente,
      inconsistentCount: reconciliation.inconsistente,
      hasData:           reconciliation.hasData,
      blockers:          reconciliation.inconsistente > 0 ? [`${reconciliation.inconsistente} documentos inconsistentes`] : [],
    },
    closeReadiness: closeScore
      ? { score: closeScore.total, grade: closeScore.grade as "A" | "B" | "C" | "D" | "F", closeable: closeScore.closeable, blockers: closeScore.blockers, warnings: closeScore.warnings }
      : { score: 0, grade: null, closeable: false, blockers: ["Evaluación de cierre no disponible"], warnings: [] },
    sourceConfidence,
    recommendedFocusAreas: focusAreas.slice(0, 5),
  };
}
