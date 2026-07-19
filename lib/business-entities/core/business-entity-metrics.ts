/**
 * business-entity-metrics.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Common metrics model for all Digital Business Entities.
 *
 * Metrics are generic and extensible. Each entity type defines
 * which metric keys it uses. The model itself is universal.
 *
 * No Prisma. No React. Pure domain types.
 */

// ── Metric Period ────────────────────────────────────────────────────────────

/** Time period for a metric value. */
export type MetricPeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "rolling_7d"
  | "rolling_30d"
  | "all_time";

// ── Metric Trend ─────────────────────────────────────────────────────────────

/** Direction of change for a metric. */
export type MetricTrend =
  | "up"
  | "down"
  | "flat"
  | "unknown";

// ── Metric Unit ──────────────────────────────────────────────────────────────

/** Unit of measurement for a metric value. */
export type MetricUnit =
  | "currency"
  | "count"
  | "percent"
  | "days"
  | "hours"
  | "units"
  | "ratio"
  | "score"
  | "none";

// ── Business Entity Metric ───────────────────────────────────────────────────

/**
 * A single quantified performance metric for a business entity.
 *
 * Metrics are consumed by:
 * - KPI cards in entity profiles
 * - Executive dashboard aggregation
 * - Copilot context for AI analysis
 * - Future Data Warehouse (as dimension/fact)
 */
export interface BusinessEntityMetric {
  /** Machine-readable key (e.g. "sales_today", "fulfillment_rate"). */
  key: string;
  /** Human-readable label (e.g. "Ventas hoy", "Tasa de cumplimiento"). */
  label: string;
  /** Numeric value. */
  value: number;
  /** Unit of measurement. */
  unit: MetricUnit;
  /** Time period this metric covers. */
  period: MetricPeriod;
  /** Change from previous period (absolute). Null if not computable. */
  delta: number | null;
  /** Direction of change. */
  trend: MetricTrend;
  /** Data source identifier. */
  source: string;
  /** ISO timestamp when this metric was last computed. */
  updatedAt: string;
}

// ── Metric Builder ───────────────────────────────────────────────────────────

/** Build a BusinessEntityMetric with sensible defaults. */
export function buildMetric(opts: {
  key: string;
  label: string;
  value: number;
  unit: MetricUnit;
  period?: MetricPeriod;
  delta?: number;
  trend?: MetricTrend;
  source?: string;
}): BusinessEntityMetric {
  const trend = opts.trend ?? (
    opts.delta != null
      ? opts.delta > 0 ? "up" : opts.delta < 0 ? "down" : "flat"
      : "unknown"
  );

  return {
    key: opts.key,
    label: opts.label,
    value: opts.value,
    unit: opts.unit,
    period: opts.period ?? "today",
    delta: opts.delta ?? null,
    trend,
    source: opts.source ?? "computed",
    updatedAt: new Date().toISOString(),
  };
}

/** Find a metric by key from a list. */
export function findMetric(
  metrics: BusinessEntityMetric[],
  key: string,
): BusinessEntityMetric | undefined {
  return metrics.find(m => m.key === key);
}

/** Get metric value by key, with default. */
export function metricValue(
  metrics: BusinessEntityMetric[],
  key: string,
  defaultValue: number = 0,
): number {
  return findMetric(metrics, key)?.value ?? defaultValue;
}
