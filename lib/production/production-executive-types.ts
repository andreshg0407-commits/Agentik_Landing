/**
 * production-executive-types.ts
 *
 * PRODUCTION-EXECUTIVE-DASHBOARD-01 — Executive Projection Types.
 *
 * Derived entirely from ProductionOperationsSnapshot.
 * No Prisma. No React. No server-only. Pure domain types.
 */

// ── Executive Snapshot ──────────────────────────────────────────────────────

export interface ProductionExecutiveSnapshot {
  /** Overall health assessment. */
  health: ProductionExecutiveHealth;
  /** Top 6 KPIs for executive strip. */
  kpis: ProductionExecutiveKpi[];
  /** Up to 5 actionable priorities. */
  priorities: ProductionExecutivePriority[];
  /** Stage bottleneck analysis. */
  bottlenecks: ProductionExecutiveBottleneck[];
  /** Material cost insights. */
  costInsights: ProductionExecutiveCostInsights;
  /** Data trust assessment. */
  dataTrust: ProductionExecutiveDataTrust;
}

// ── Health ──────────────────────────────────────────────────────────────────

export type ProductionHealthLevel = "OK" | "ATTENTION" | "CRITICAL";

export interface ProductionExecutiveHealth {
  /** Overall status. */
  level: ProductionHealthLevel;
  /** One-line executive summary (Spanish, human-readable). */
  summary: string;
  /** Supporting signals. */
  signals: string[];
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface ProductionExecutiveKpi {
  /** KPI identifier. */
  key: string;
  /** Display label (Spanish). */
  label: string;
  /** Formatted value. */
  value: string;
  /** Raw numeric value (for sorting/coloring). */
  raw: number;
  /** Optional accent color. */
  color: string | null;
  /** Optional suffix. */
  suffix: string;
}

// ── Priorities ──────────────────────────────────────────────────────────────

export type ProductionPrioritySeverity = "critical" | "high" | "medium";

export interface ProductionExecutivePriority {
  /** Short title. */
  title: string;
  /** Why this matters. */
  impact: string;
  /** Evidence backing this priority. */
  evidence: string;
  /** Severity level. */
  severity: ProductionPrioritySeverity;
  /** What to review (call to action). */
  action: string;
}

// ── Bottlenecks ─────────────────────────────────────────────────────────────

export interface ProductionExecutiveBottleneck {
  /** Stage label (Spanish). */
  stageLabel: string;
  /** Stage code. */
  stageCode: string;
  /** How many active OPs are in this stage. */
  activeCount: number;
  /** Percentage of active OPs concentrated here. */
  concentrationPct: number;
  /** Observation text (Spanish). */
  observation: string;
}

// ── Cost Insights ───────────────────────────────────────────────────────────

export interface ProductionExecutiveCostInsights {
  /** Total material cost committed to active production. */
  costoMaterialActivo: number;
  /** Average material cost per active OP. */
  costoPromedioOP: number;
  /** Top 5 OPs by material cost. */
  topOpsPorCosto: ProductionCostEntry[];
  /** Top 5 references by material cost (aggregated). */
  topReferenciasPorCosto: ProductionCostEntry[];
}

export interface ProductionCostEntry {
  /** Label (OP number or reference code). */
  label: string;
  /** Secondary label (description or null). */
  detail: string | null;
  /** Material cost. */
  cost: number;
}

// ── Data Trust ──────────────────────────────────────────────────────────────

export type ProductionDataTrustLevel = "CONFIABLE" | "PARCIAL" | "INSUFICIENTE";

export interface ProductionExecutiveDataTrust {
  /** Trust level. */
  level: ProductionDataTrustLevel;
  /** One-line assessment. */
  summary: string;
  /** Last order created. */
  lastOrdenProduccion: string | null;
  /** Last material consumption. */
  lastConsumoMaterial: string | null;
  /** Last finished goods entry. */
  lastEntradaPT: string | null;
  /** Last successful sync. */
  lastSync: string | null;
  /** Cost coverage percentage. */
  costCoveragePct: number;
  /** Chronological consistency. */
  consistencyPct: number;
}
