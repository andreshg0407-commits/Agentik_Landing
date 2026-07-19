/**
 * lib/comercial/rules/coverage/index.ts
 *
 * Public barrel for the Commercial Coverage Rules Engine.
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

export { evaluateCoverage, evaluateCoverageBatch } from "./commercial-coverage-engine";
export { resolveRule } from "./commercial-coverage-rule-resolver";
export { buildExplanation } from "./commercial-coverage-explanation";
export { collectEvidence } from "./commercial-evidence-engine";
export { evaluateSubgroupStrategy } from "./strategies/subgroup-coverage-strategy";
export { evaluateSizeStrategy } from "./strategies/size-coverage-strategy";
export { SCOPE_PRIORITY, SIZE_LABEL, DEFAULT_THRESHOLDS } from "./commercial-coverage-config";

export type {
  CommercialCoverageStrategy,
  CoverageState,
  CoverageSuggestionAction,
  ConfidenceLevel,
  DataQualityLevel,
  CommercialCoverageInput,
  CommercialCoverageRuleMatch,
  CommercialCoverageEvaluation,
  CommercialCoverageSuggestion,
  CommercialCoverageExplanation,
  CommercialCoverageDataQuality,
  CommercialCoverageResult,
} from "./commercial-coverage-types";

export type {
  EvidenceType,
  EvidenceSource,
  ConfidenceFactor,
  CommercialEvidenceItem,
  CommercialEvidence,
  RuleEvidence,
  InventoryEvidence,
  StoreEvidence,
  ProductEvidence,
  StrategyEvidence,
  CalculationEvidence,
  ConfidenceEvidence,
  MissingDataEvidence,
  FallbackEvidence,
  WarningEvidence,
} from "./commercial-evidence-types";
