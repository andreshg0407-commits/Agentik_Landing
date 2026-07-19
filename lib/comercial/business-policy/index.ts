/**
 * lib/comercial/business-policy/index.ts
 *
 * Public barrel for the Business Policy Platform.
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  PolicyCategory,
  PolicyScope,
  PolicyParameterType,
  PolicyActionType,
  ConditionOperator,
  PolicyStatus,
  DiscardReason,
  PolicyValidationSeverity,

  BusinessPolicy,
  BusinessPolicyVersion,
  BusinessPolicyScopeBinding,
  BusinessPolicyCondition,
  BusinessPolicyAction,
  BusinessPolicyParameter,
  BusinessPolicyEvaluation,
  BusinessPolicyEvidence,

  PolicyResolutionContext,
  PolicyResolutionResult,
  PolicyResolutionCandidate,
  PolicyResolutionDiscard,

  PolicyValidationResult,
  PolicyValidationIssue,
  PolicyRegistryEntry,
} from "./policy-types";

export {
  ALL_POLICY_CATEGORIES,
  ALL_POLICY_SCOPES,
  SCOPE_SPECIFICITY,
} from "./policy-types";

// ── Engine API (FASE 8) ────────────────────────────────────────────────────

export {
  registerPolicy,
  resolvePolicy,
  evaluatePolicy,
  listPolicies,
  validatePolicy,
  deactivatePolicy,
  _clearPolicyStore,
} from "./policy-engine";

export type {
  RegisterPolicyResult,
  ListPoliciesFilter,
} from "./policy-engine";

// ── Versioning (FASE 5) ────────────────────────────────────────────────────

export {
  createPolicyVersion,
  activatePolicyVersion,
  deprecatePolicyVersion,
  validateVersionTransition,
  buildVersionChain,
} from "./policy-versioning";

// ── Evidence (FASE 6) ──────────────────────────────────────────────────────

export {
  buildPolicyResolutionEvidence,
  policyEvidenceToCommercialEvidence,
  summarizeDiscardReasons,
  buildResolutionNarrative,
} from "./policy-evidence";

// ── Registry (FASE 7) ──────────────────────────────────────────────────────

export {
  getRegistryEntry,
  getAllRegistryEntries,
  isScopeAllowed,
  getRequiredParameters,
  getOptionalParameters,
} from "./policy-registry";

// ── Validation ──────────────────────────────────────────────────────────────

export { validatePolicy as validatePolicyStructure } from "./policy-validation";

// ── Coverage Compatibility (FASE 9) ─────────────────────────────────────────

export {
  coverageRuleToPolicy,
  buildCoverageResolutionContext,
} from "./policy-compatibility";

export type { CoverageRuleShape } from "./policy-compatibility";

// ── BusinessDecision (COMMERCIAL-INTEGRATION-01) ────────────────────────────

export type {
  BusinessDecision,
  BusinessDecisionPriority,
  BusinessDecisionSeverity,
  BusinessDecisionStatus,
  BusinessDecisionEvidence,
  CommercialDomain,
  CommercialDecisionGroup,
  CommercialDecisionSummary,
} from "./business-decision-types";

// ── Aggregator (COMMERCIAL-INTEGRATION-01) ──────────────────────────────────

export {
  aggregateCommercialDecisions,
  aggregateByDomain,
  filterByDomain,
  filterByPriority,
  filterPending,
  sortByPriority,
} from "./commercial-decision-aggregator";
