/**
 * evidence.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * Evidence links every conclusion to its supporting data.
 *
 * No conclusion in Agentik may exist without evidence.
 * Evidence makes the reasoning chain auditable and explainable.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef } from "./reasoning-types";
import { nextReasoningId } from "./reasoning-types";

// -- Evidence Item ---------------------------------------------------------

/** A single piece of supporting evidence. */
export interface EvidenceItem {
  /** What kind of evidence this is. */
  type: EvidenceType;
  /** Human-readable description of the evidence. */
  description: string;
  /** Reference ID (observation ID, entity ID, edge ID, rule ID, etc.). */
  referenceId: string;
  /** Data source. */
  source: string;
  /** Confidence in this evidence (0-100). */
  confidence: number;
}

/** Types of evidence that can support a conclusion. */
export type EvidenceType =
  | "observation"
  | "entity_state"
  | "entity_relation"
  | "knowledge_path"
  | "business_event"
  | "rule_evaluation"
  | "metric_value"
  | "historical_pattern"
  | "external_data";

// -- Evidence Bundle -------------------------------------------------------

/**
 * A complete evidence bundle for a reasoning conclusion.
 * Every Finding, Insight, Risk, Opportunity, Decision, and Recommendation
 * carries one of these.
 */
export interface Evidence {
  /** Unique evidence bundle ID. */
  id: string;
  /** All supporting evidence items. */
  items: EvidenceItem[];
  /** Observation IDs used. */
  observationIds: string[];
  /** Entity references involved. */
  entities: EntityRef[];
  /** Knowledge Graph relation IDs used. */
  relationIds: string[];
  /** Business event IDs used (future). */
  eventIds: string[];
  /** Rule IDs that were evaluated (future). */
  ruleIds: string[];
  /** Metric keys used. */
  metricKeys: string[];
  /** Overall strength of evidence (0-100). */
  strength: number;
  /** ISO timestamp when evidence was assembled. */
  assembledAt: string;
}

// -- Builders --------------------------------------------------------------

export function buildEvidenceItem(opts: {
  type: EvidenceType;
  description: string;
  referenceId: string;
  source?: string;
  confidence?: number;
}): EvidenceItem {
  return {
    type: opts.type,
    description: opts.description,
    referenceId: opts.referenceId,
    source: opts.source ?? "reasoning-engine",
    confidence: opts.confidence ?? 100,
  };
}

export function buildEvidence(opts: {
  items: EvidenceItem[];
  observationIds?: string[];
  entities?: EntityRef[];
  relationIds?: string[];
  eventIds?: string[];
  ruleIds?: string[];
  metricKeys?: string[];
}): Evidence {
  const items = opts.items;
  const strength = items.length > 0
    ? Math.round(items.reduce((sum, i) => sum + i.confidence, 0) / items.length)
    : 0;

  return {
    id: nextReasoningId("evi"),
    items,
    observationIds: opts.observationIds ?? [],
    entities: opts.entities ?? [],
    relationIds: opts.relationIds ?? [],
    eventIds: opts.eventIds ?? [],
    ruleIds: opts.ruleIds ?? [],
    metricKeys: opts.metricKeys ?? [],
    strength,
    assembledAt: new Date().toISOString(),
  };
}

/** Create an empty evidence bundle (for placeholders during development). */
export function emptyEvidence(): Evidence {
  return buildEvidence({ items: [] });
}
