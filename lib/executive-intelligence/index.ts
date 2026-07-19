/**
 * lib/executive-intelligence/index.ts
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03
 * Barrel export for Executive Intelligence.
 *
 * Client-safe: exports types only. No Prisma. No server-only.
 * For the server pipeline, import from "./executive-pipeline" directly.
 */

export type {
  ExecutiveKpi,
  ExecutiveAlert,
  ExecutiveRecommendation,
  ExecutiveRisk,
  ExecutiveOpportunity,
  CommercialReport,
  InventoryReport,
  ProductionReport,
  CarteraReport,
  ExecutiveIntelligenceReport,
} from "./executive-types";
