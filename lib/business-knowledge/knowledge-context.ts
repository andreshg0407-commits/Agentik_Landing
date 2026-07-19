/**
 * knowledge-context.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Context builder contract for the Business Knowledge Graph.
 *
 * KnowledgeContext is the structured intelligence package consumed by
 * David, Copilot, Informes Inteligentes, and future AI agents.
 *
 * It assembles: entity, related entities, important relations, paths,
 * impacts, alerts, recommendations, facts, risks, opportunities,
 * suggested questions, and data freshness — all from the graph.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { DataFreshnessLevel } from "./knowledge-types";
import type { KnowledgeNode } from "./knowledge-node";
import type { KnowledgeEdge } from "./knowledge-edge";
import type { KnowledgePath } from "./knowledge-path";
import type { KnowledgeImpact } from "./knowledge-impact";

// -- Context Alert (lightweight) -------------------------------------------

/** A lightweight alert representation for context. */
export interface ContextAlert {
  /** Alert title. */
  title: string;
  /** Severity. */
  severity: string;
  /** Source entity label. */
  entityLabel: string;
  /** Alert category. */
  category: string;
}

// -- Context Recommendation (lightweight) ----------------------------------

/** A lightweight recommendation for context. */
export interface ContextRecommendation {
  /** Recommendation title. */
  title: string;
  /** Recommended action. */
  action: string;
  /** Priority (lower = higher). */
  priority: number;
  /** Always true. */
  suggestedOnly: true;
}

// -- Context Fact ----------------------------------------------------------

/** A factual statement about the entity or its neighborhood. */
export interface ContextFact {
  /** Machine-readable fact key. */
  key: string;
  /** Human-readable fact statement. */
  statement: string;
  /** Data source. */
  source: string;
  /** Confidence in this fact (0-100). */
  confidence: number;
}

// -- Knowledge Context ----------------------------------------------------

/**
 * The complete intelligence package for a business entity.
 *
 * This is what David, Copilot, and intelligent reports consume
 * to reason about a single entity and its business neighborhood.
 */
export interface KnowledgeContext {
  /** The central entity. */
  entity: KnowledgeNode;
  /** Directly related entities (depth 1). */
  relatedEntities: KnowledgeNode[];
  /** Important relations (filtered by weight/confidence). */
  importantRelations: KnowledgeEdge[];
  /** Notable paths connecting this entity to other entities. */
  paths: KnowledgePath[];
  /** Impact analysis results. */
  impacts: KnowledgeImpact[];
  /** Active alerts from this entity and its neighborhood. */
  alerts: ContextAlert[];
  /** Recommendations for this entity and its neighborhood. */
  recommendations: ContextRecommendation[];
  /** Key facts about the entity. */
  facts: ContextFact[];
  /** Identified risks. */
  risks: string[];
  /** Identified opportunities. */
  opportunities: string[];
  /** Questions a manager might ask about this entity. */
  suggestedQuestions: string[];
  /** Data freshness of the context. */
  freshness: DataFreshnessLevel;
  /** ISO timestamp when this context was assembled. */
  assembledAt: string;
}

// -- Context Builder -------------------------------------------------------

/** Build a KnowledgeContext with sensible defaults. */
export function buildContext(opts: {
  entity: KnowledgeNode;
  relatedEntities?: KnowledgeNode[];
  importantRelations?: KnowledgeEdge[];
  paths?: KnowledgePath[];
  impacts?: KnowledgeImpact[];
  alerts?: ContextAlert[];
  recommendations?: ContextRecommendation[];
  facts?: ContextFact[];
  risks?: string[];
  opportunities?: string[];
  suggestedQuestions?: string[];
  freshness?: DataFreshnessLevel;
}): KnowledgeContext {
  return {
    entity: opts.entity,
    relatedEntities: opts.relatedEntities ?? [],
    importantRelations: opts.importantRelations ?? [],
    paths: opts.paths ?? [],
    impacts: opts.impacts ?? [],
    alerts: opts.alerts ?? [],
    recommendations: opts.recommendations ?? [],
    facts: opts.facts ?? [],
    risks: opts.risks ?? [],
    opportunities: opts.opportunities ?? [],
    suggestedQuestions: opts.suggestedQuestions ?? [],
    freshness: opts.freshness ?? opts.entity.freshness,
    assembledAt: new Date().toISOString(),
  };
}
