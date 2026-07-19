/**
 * lib/comercial/operational-integration/index.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Barrel export for the Commercial Operational Integration pipeline.
 *
 * Client-safe types. Server pipeline must be imported directly.
 */

// -- Types (client-safe) ----------------------------------------------------
export type {
  ReferenceOperationalAnalysis,
  CommercialOperationalResult,
  AffectedOrder,
  AffectedCustomer,
  AffectedVendor,
  AffectedPortfolio,
  RelatedProduction,
  AlternativeInventory,
} from "./commercial-operational-types";

// -- Knowledge Graph Summary ------------------------------------------------
export type { ReferenceGraphSummary } from "./commercial-operational-knowledge";

// -- Utils (client-safe) ----------------------------------------------------
export {
  outOfStockAnalyses,
  criticalAnalyses,
  withAffectedOrders,
  withAffectedVendors,
  withProduction,
  withAlternativeInventory,
  pipelineSummary,
  allRecommendations,
  allRisks,
} from "./commercial-operational-utils";
