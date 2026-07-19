/**
 * reasoning-engine.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * Contract for the Business Reasoning Engine.
 *
 * The engine orchestrates the full reasoning pipeline:
 *   observe → analyze → findings → insights → risks → opportunities
 *   → decisions → recommendations → reasoning chain → context
 *
 * This sprint defines the CONTRACT only. No AI. No implementation.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningCategory } from "./reasoning-types";
import type { Observation } from "./observation";
import type { Finding } from "./finding";
import type { Insight } from "./insight";
import type { Risk } from "./risk";
import type { Opportunity } from "./opportunity";
import type { Decision } from "./decision";
import type { Recommendation } from "./recommendation";
import type { ReasoningChain } from "./reasoning-chain";
import type { ReasoningContext } from "./reasoning-context";

// -- Reasoning Request -----------------------------------------------------

/** Input to the reasoning engine. */
export interface ReasoningRequest {
  /** Organization ID. */
  organizationId: string;
  /** The entity to reason about. */
  entity: EntityRef;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Maximum depth for Knowledge Graph traversal. */
  graphDepth?: number;
  /** Whether to include historical observations. */
  includeHistory?: boolean;
  /** Specific focus areas. */
  focusAreas?: ReasoningCategory[];
  /** Arbitrary request metadata. */
  metadata?: Record<string, unknown>;
}

// -- Reasoning Result ------------------------------------------------------

/** Output of the reasoning engine. */
export interface ReasoningResult {
  /** The assembled reasoning context. */
  context: ReasoningContext;
  /** All reasoning chains produced. */
  chains: ReasoningChain[];
  /** Processing time in milliseconds. */
  processingMs: number;
  /** Warnings during reasoning (non-blocking). */
  warnings: string[];
}

// -- Reasoning Engine Contract ---------------------------------------------

/**
 * The Business Reasoning Engine.
 *
 * Orchestrates the full reasoning pipeline from raw observations
 * to executive-ready context.
 *
 * Future implementations will wire this to:
 * - Business Entity resolvers (for observations)
 * - Knowledge Graph (for insights)
 * - Rule Engine (for risk/opportunity rules)
 * - Historical data (for patterns)
 *
 * This sprint defines the interface only.
 */
export interface IReasoningEngine {
  // -- Observation Phase --

  /** Observe raw facts about an entity from its data sources. */
  observe(request: ReasoningRequest): Promise<Observation[]>;

  // -- Analysis Phase --

  /** Analyze observations to produce findings. */
  buildFindings(observations: Observation[]): Promise<Finding[]>;

  /** Derive insights from findings using the Knowledge Graph. */
  buildInsights(findings: Finding[], request: ReasoningRequest): Promise<Insight[]>;

  // -- Risk & Opportunity Phase --

  /** Identify risks from insights. */
  analyzeRisks(insights: Insight[], request: ReasoningRequest): Promise<Risk[]>;

  /** Identify opportunities from insights. */
  analyzeOpportunities(insights: Insight[], request: ReasoningRequest): Promise<Opportunity[]>;

  // -- Decision Phase --

  /** Suggest decisions from risks and opportunities. */
  suggestDecisions(
    risks: Risk[],
    opportunities: Opportunity[],
    request: ReasoningRequest,
  ): Promise<Decision[]>;

  // -- Recommendation Phase --

  /** Build executive recommendations from decisions. */
  buildRecommendations(decisions: Decision[], request: ReasoningRequest): Promise<Recommendation[]>;

  // -- Full Pipeline --

  /**
   * Run the complete reasoning pipeline and return the assembled context.
   *
   * This is the primary entry point for consumers.
   * It calls observe → buildFindings → buildInsights → analyzeRisks
   * → analyzeOpportunities → suggestDecisions → buildRecommendations
   * → assembles reasoning chains and context.
   */
  buildReasoning(request: ReasoningRequest): Promise<ReasoningResult>;
}
