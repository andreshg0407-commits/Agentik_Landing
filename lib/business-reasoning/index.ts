/**
 * lib/business-reasoning/index.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * Barrel export for the Business Reasoning Engine.
 *
 * Client-safe: no Prisma, no server-only, no React, no AI.
 * Import from "@/lib/business-reasoning" for all reasoning contracts.
 */

// -- Core Types -----------------------------------------------------------
export type {
  EntityRef,
  ReasoningSeverity,
  ReasoningCategory,
  ReasoningSource,
  Urgency,
  DecisionType,
  EffortLevel,
} from "./reasoning-types";
export { nextReasoningId } from "./reasoning-types";

// -- Observation ----------------------------------------------------------
export type { Observation } from "./observation";
export { buildObservation } from "./observation";

// -- Evidence -------------------------------------------------------------
export type {
  EvidenceType,
  EvidenceItem,
  Evidence,
} from "./evidence";
export {
  buildEvidenceItem,
  buildEvidence,
  emptyEvidence,
} from "./evidence";

// -- Confidence -----------------------------------------------------------
export type {
  ConfidenceLevel,
  ReasoningConfidence,
} from "./reasoning-confidence";
export {
  scoreToLevel,
  buildConfidence,
  aggregateConfidence,
} from "./reasoning-confidence";

// -- Finding --------------------------------------------------------------
export type { Finding } from "./finding";
export { buildFinding } from "./finding";

// -- Insight --------------------------------------------------------------
export type {
  InsightImpact,
  Insight,
} from "./insight";
export { buildInsight } from "./insight";

// -- Risk -----------------------------------------------------------------
export type {
  PreventiveAction,
  Risk,
} from "./risk";
export {
  buildRisk,
  buildPreventiveAction,
} from "./risk";

// -- Opportunity ----------------------------------------------------------
export type { Opportunity } from "./opportunity";
export { buildOpportunity } from "./opportunity";

// -- Decision -------------------------------------------------------------
export type {
  ExpectedImpact,
  Decision,
} from "./decision";
export { buildDecision } from "./decision";

// -- Recommendation -------------------------------------------------------
export type { Recommendation } from "./recommendation";
export { buildRecommendation } from "./recommendation";

// -- Reasoning Chain ------------------------------------------------------
export type {
  ChainStep,
  ChainStepType,
  ReasoningChain,
} from "./reasoning-chain";
export { buildReasoningChain } from "./reasoning-chain";

// -- Reasoning Context ----------------------------------------------------
export type { ReasoningContext } from "./reasoning-context";
export {
  buildReasoningContext,
  topRisk,
  topRecommendation,
  contextCounts,
} from "./reasoning-context";

// -- Reasoning Engine -----------------------------------------------------
export type {
  ReasoningRequest,
  ReasoningResult,
  IReasoningEngine,
} from "./reasoning-engine";

// -- Utils ----------------------------------------------------------------
export {
  sortBySeverity,
  anomalousObservations,
  findingsAboveSeverity,
  risksAboveProbability,
  highValueOpportunities,
  extractEntities,
  chainSummary,
  contextOneLiner,
} from "./reasoning-utils";
