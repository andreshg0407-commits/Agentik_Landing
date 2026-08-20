/**
 * lib/comercial/maletas/supply-plan-engine.ts
 *
 * @deprecated — Replaced by sample-coverage-engine.ts (MALETAS-COBERTURA-MOSTRARIO-08B2).
 * This file re-exports all types and functions under their legacy names
 * for backward compatibility. New code should import from sample-coverage-engine.ts.
 */

export {
  // Types (legacy aliases)
  type SupplyAction,
  type SupplyPosition,
  type VendorSupplyPlan,
  type SalesPortfolioSupplyPlan,
  type SupplyCandidate,

  // New canonical types
  type CoverageStatus,
  type CoverageCandidate,
  type CoveragePosition,
  type VendorSampleCoverage,
  type SampleCoverageResult,
  type ExcessPosition,
  type CentralRef,
  type CoverageDataAvailability,

  // Engine
  buildSampleCoverageResult,

  // Copilot accessors
  getSampleCoverageSummary,
  getSampleCoverageNeeds,
  getSampleCoverageCandidates,

  // Constants
  WHOLESALE_THRESHOLDS,
} from "./sample-coverage-engine";

// Legacy function alias
export { buildSampleCoverageResult as buildSalesPortfolioSupplyPlan } from "./sample-coverage-engine";
export { getSampleCoverageSummary as getSalesPortfolioDerroteroCoverage } from "./sample-coverage-engine";
export { getSampleCoverageNeeds as getSalesPortfolioSupplyNeeds } from "./sample-coverage-engine";
export { getSampleCoverageCandidates as getSalesPortfolioSupplyCandidates } from "./sample-coverage-engine";
