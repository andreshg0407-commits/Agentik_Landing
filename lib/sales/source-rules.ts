/**
 * source-rules.ts
 *
 * SAG Source-Aware Layer — Truth Layering Rules
 *
 * Defines which SAG source types are authoritative for each consuming module.
 * This is the SINGLE authoritative place for "which sources count where."
 *
 * Business rule matrix:
 * ┌────────────────────────┬──────────┬──────────┬───────────────────────────────────────────┐
 * │ Module                 │ FUENTE_1 │ FUENTE_2 │ Rationale                                 │
 * ├────────────────────────┼──────────┼──────────┼───────────────────────────────────────────┤
 * │ revenue_executive      │   YES    │    NO    │ Legal revenue truth only                  │
 * │ operational            │   YES    │   YES    │ Full pipeline view (all activity)          │
 * │ forecast               │   YES    │   YES    │ F2 = leading demand signal                │
 * │ finance_dian           │   YES    │    NO    │ DIAN cares only about fiscal invoices      │
 * │ customer_360           │   YES    │   YES    │ Both, visually separated per source        │
 * │ seller_productivity    │   YES    │   YES    │ Weighted by confidence (F1 > F2)           │
 * │ receivables            │   YES    │    NO    │ AR entries only from official invoices     │
 * └────────────────────────┴──────────┴──────────┴───────────────────────────────────────────┘
 *
 * Usage:
 *   import { getTruthFilter, sourceLabel } from "@/lib/sales/source-rules";
 *   const where = getTruthFilter("revenue_executive");
 *   // → { sagSourceType: "OFICIAL" }  (apply to Prisma query)
 */

import type { SagSourceType } from "@/lib/sag/source-inference";

// ── Module types ──────────────────────────────────────────────────────────────

/**
 * Known consuming modules with distinct source-truth rules.
 * Add new modules here as the product grows.
 */
export type TruthModule =
  | "revenue_executive"   // Executive KPIs, Torre de Control top-line
  | "operational"         // Operational dashboards, branch/seller activity
  | "forecast"            // FP&A demand forecast
  | "finance_dian"        // DIAN reconciliation, close score, accounting
  | "customer_360"        // Customer timeline and commercial history
  | "seller_productivity" // Seller leaderboard and performance KPIs
  | "receivables";        // Cartera / accounts receivable

// ── Source filter per module ──────────────────────────────────────────────────

/**
 * Which SagSourceType values are valid for a given module.
 * Maps directly to Prisma WHERE conditions.
 */
export type SourceFilter =
  | { sagSourceType: SagSourceType }            // single source
  | { sagSourceType: { in: SagSourceType[] } }  // multiple sources

const TRUTH_RULES: Record<TruthModule, SourceFilter> = {
  revenue_executive:   { sagSourceType: "OFICIAL" },
  operational:         { sagSourceType: { in: ["OFICIAL", "REMISION"] } },
  forecast:            { sagSourceType: { in: ["OFICIAL", "REMISION"] } },
  finance_dian:        { sagSourceType: "OFICIAL" },
  customer_360:        { sagSourceType: { in: ["OFICIAL", "REMISION"] } },
  seller_productivity: { sagSourceType: { in: ["OFICIAL", "REMISION"] } },
  receivables:         { sagSourceType: "OFICIAL" },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the Prisma-compatible WHERE filter for SaleRecord source type
 * for a given module.
 *
 * @example
 *   prisma.saleRecord.aggregate({
 *     where: { organizationId, ...getTruthFilter("revenue_executive") },
 *     _sum: { amount: true },
 *   });
 */
export function getTruthFilter(module: TruthModule): SourceFilter {
  return TRUTH_RULES[module];
}

/**
 * True when the given module should include FUENTE_2 records.
 */
export function includesF2(module: TruthModule): boolean {
  const f = TRUTH_RULES[module];
  return "sagSourceType" in f && typeof f.sagSourceType === "object"
    ? (f.sagSourceType as { in: string[] }).in.includes("REMISION")
    : (f.sagSourceType as string) === "REMISION";
}

/**
 * True when the given module is restricted to FUENTE_1 only.
 */
export function isF1Only(module: TruthModule): boolean {
  return !includesF2(module);
}

// ── Display labels for modules ────────────────────────────────────────────────

export const MODULE_LABELS: Record<TruthModule, string> = {
  revenue_executive:   "Ingresos ejecutivos",
  operational:         "Actividad operacional",
  forecast:            "Pronóstico de demanda",
  finance_dian:        "Finanzas y DIAN",
  customer_360:        "Cliente 360",
  seller_productivity: "Productividad de vendedores",
  receivables:         "Cartera",
};

// ── Confidence weights for mixed-source modules ───────────────────────────────
//
// When a module includes both FUENTE_1 and FUENTE_2, these weights express
// the relative confidence in each source for KPI calculations.
// Weight 1.0 = full confidence; 0.7 = 70% weight in weighted averages.

export const SOURCE_CONFIDENCE: Record<SagSourceType, number> = {
  OFICIAL:  1.0,   // fiscal invoice — maximum confidence
  REMISION: 0.7,   // dispatch note — high confidence for delivery, lower for revenue
};

/**
 * Apply source confidence weight to an amount.
 * Used in seller_productivity and forecast modules.
 */
export function weightedAmount(amount: number, source: SagSourceType): number {
  return amount * SOURCE_CONFIDENCE[source];
}

// ── SQL raw condition per module ──────────────────────────────────────────────
//
// For use in Prisma.$queryRaw via Prisma.raw().
// See lib/sag/source-semantics.ts for the individual constants.

export const MODULE_SQL_CONDITION: Record<TruthModule, string> = {
  revenue_executive:   `"sagSourceType" = 'OFICIAL'`,
  operational:         `"sagSourceType" IN ('OFICIAL', 'REMISION')`,
  forecast:            `"sagSourceType" IN ('OFICIAL', 'REMISION')`,
  finance_dian:        `"sagSourceType" = 'OFICIAL'`,
  customer_360:        `"sagSourceType" IN ('OFICIAL', 'REMISION')`,
  seller_productivity: `"sagSourceType" IN ('OFICIAL', 'REMISION')`,
  receivables:         `"sagSourceType" = 'OFICIAL'`,
};

// ── Source split description for UI ──────────────────────────────────────────

/**
 * Human-readable description of what sources a module uses.
 * Used in dashboard tooltips and help text.
 */
export function getSourceDescription(module: TruthModule): string {
  const descriptions: Record<TruthModule, string> = {
    revenue_executive:
      "Solo Fuente 1 (facturas oficiales). Los despachos/remisiones no se incluyen en ingresos ejecutivos.",
    operational:
      "Fuente 1 + Fuente 2. Vista completa de la actividad comercial incluyendo despachos y remisiones.",
    forecast:
      "Fuente 1 + Fuente 2. Las remisiones son un indicador adelantado de demanda.",
    finance_dian:
      "Solo Fuente 1. La DIAN únicamente reconoce facturas oficiales para efectos fiscales.",
    customer_360:
      "Fuente 1 + Fuente 2, mostradas por separado. El historial completo de la relación comercial.",
    seller_productivity:
      "Fuente 1 + Fuente 2 con pesos de confianza. Facturas con confianza 100%, remisiones al 70%.",
    receivables:
      "Solo Fuente 1. La cartera solo se genera sobre facturas oficiales que crean obligaciones legales.",
  };
  return descriptions[module];
}
