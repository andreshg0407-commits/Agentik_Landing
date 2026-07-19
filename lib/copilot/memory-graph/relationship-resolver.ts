/**
 * lib/copilot/memory-graph/relationship-resolver.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Relationship Resolver
 *
 * Determines the correct edge type between two entities.
 * Deterministic. No AI. No ambiguity.
 * Never invents relationships — only resolves KNOWN patterns.
 */

import type { GraphEdgeType, GraphNodeType } from "./memory-graph-types";

// ── Resolution result ──────────────────────────────────────────────────────────

export interface RelationshipResolution {
  /** The resolved edge type, or null if no known pattern matches. */
  edgeType:   GraphEdgeType | null;
  /** Why this relationship type was chosen. */
  reasoning:  string;
  /** Confidence 0–1 in this resolution. */
  confidence: number;
  /** False if no relationship could be determined. */
  resolved:   boolean;
}

// ── Domain pattern registry ────────────────────────────────────────────────────

interface RelationshipPattern {
  sourceType:  GraphNodeType;
  targetType:  GraphNodeType;
  edgeType:    GraphEdgeType;
  reasoning:   string;
  confidence:  number;
}

/**
 * RELATIONSHIP_PATTERNS — all known, explicit relationships.
 * These are the ONLY relationships that get auto-resolved.
 * Anything not listed here requires manual specification.
 */
export const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // Order → Client
  { sourceType: "ORDER",    targetType: "CLIENT",   edgeType: "BELONGS_TO",  reasoning: "An order always belongs to a client",                 confidence: 1.0 },
  // Campaign → Product
  { sourceType: "CAMPAIGN", targetType: "PRODUCT",  edgeType: "AFFECTS",     reasoning: "A campaign affects the product it promotes",           confidence: 0.9 },
  // Campaign → Client
  { sourceType: "CAMPAIGN", targetType: "CLIENT",   edgeType: "AFFECTS",     reasoning: "A campaign targets or affects its client audience",     confidence: 0.8 },
  // Insight → Memory
  { sourceType: "INSIGHT",  targetType: "MEMORY",   edgeType: "GENERATED_BY",reasoning: "An insight is generated from memory evidence",          confidence: 0.9 },
  // Insight → Event
  { sourceType: "INSIGHT",  targetType: "EVENT",    edgeType: "GENERATED_BY",reasoning: "An insight is derived from observed events",            confidence: 0.8 },
  // Playbook → Task
  { sourceType: "PLAYBOOK", targetType: "TASK",     edgeType: "TRIGGERS",    reasoning: "A playbook execution creates tasks",                    confidence: 0.9 },
  // Playbook → Event
  { sourceType: "PLAYBOOK", targetType: "EVENT",    edgeType: "TRIGGERS",    reasoning: "A playbook triggers downstream events",                 confidence: 0.8 },
  // Anomaly → Alert
  { sourceType: "ANOMALY",  targetType: "ALERT",    edgeType: "TRIGGERS",    reasoning: "An anomaly detection triggers an alert",                confidence: 1.0 },
  // Alert → Task
  { sourceType: "ALERT",    targetType: "TASK",     edgeType: "TRIGGERS",    reasoning: "An alert triggers a remediation task",                  confidence: 0.8 },
  // Alert → Decision
  { sourceType: "ALERT",    targetType: "DECISION", edgeType: "AFFECTS",     reasoning: "An alert influences the decision-making process",        confidence: 0.7 },
  // Decision → Task
  { sourceType: "DECISION", targetType: "TASK",     edgeType: "CREATED_FROM",reasoning: "A decision creates downstream tasks",                   confidence: 0.9 },
  // Event → Decision
  { sourceType: "EVENT",    targetType: "DECISION", edgeType: "AFFECTS",     reasoning: "An event can affect or trigger a decision",             confidence: 0.7 },
  // Memory → Insight
  { sourceType: "MEMORY",   targetType: "INSIGHT",  edgeType: "SUPPORTS",    reasoning: "A memory entry supports derived insights",              confidence: 0.8 },
  // Report → Insight
  { sourceType: "REPORT",   targetType: "INSIGHT",  edgeType: "REFERENCES",  reasoning: "A report references the insights it contains",          confidence: 0.9 },
  // Report → Decision
  { sourceType: "REPORT",   targetType: "DECISION", edgeType: "REFERENCES",  reasoning: "A report references decisions it informed",             confidence: 0.8 },
  // Document → Memory
  { sourceType: "DOCUMENT", targetType: "MEMORY",   edgeType: "CREATED_FROM",reasoning: "A memory entry is extracted from a document",           confidence: 0.8 },
  // Agent → Task
  { sourceType: "AGENT",    targetType: "TASK",     edgeType: "CREATED_FROM",reasoning: "An agent creates and assigns tasks",                    confidence: 0.9 },
  // Agent → Decision
  { sourceType: "AGENT",    targetType: "DECISION", edgeType: "GENERATED_BY",reasoning: "A decision is proposed by an agent",                   confidence: 0.8 },
  // User → Task
  { sourceType: "USER",     targetType: "TASK",     edgeType: "CREATED_FROM",reasoning: "A user creates tasks",                                  confidence: 0.9 },
  // Product → Order
  { sourceType: "PRODUCT",  targetType: "ORDER",    edgeType: "BELONGS_TO",  reasoning: "A product line item belongs to an order",               confidence: 0.9 },
  // Order → Product
  { sourceType: "ORDER",    targetType: "PRODUCT",  edgeType: "REFERENCES",  reasoning: "An order references the products it contains",          confidence: 0.9 },
  // Insight contradicts Insight
  { sourceType: "INSIGHT",  targetType: "INSIGHT",  edgeType: "CONTRADICTS", reasoning: "An insight may contradict another insight",             confidence: 0.7 },
  // Insight supports Insight
  { sourceType: "INSIGHT",  targetType: "INSIGHT",  edgeType: "SUPPORTS",    reasoning: "An insight may support another insight",                confidence: 0.7 },
  // Event causes Event
  { sourceType: "EVENT",    targetType: "EVENT",    edgeType: "CAUSED",      reasoning: "An event may cause another downstream event",           confidence: 0.7 },
  // Anomaly resolves Alert
  { sourceType: "DECISION", targetType: "ALERT",    edgeType: "RESOLVES",    reasoning: "A decision can resolve an active alert",                confidence: 0.8 },
];

// ── Resolver ───────────────────────────────────────────────────────────────────

/**
 * resolveRelationship — determine the correct edge type between two node types.
 * Returns resolution with resolved=false if no pattern matches.
 * Never invents relationships.
 */
export function resolveRelationship(
  sourceType: GraphNodeType,
  targetType: GraphNodeType,
): RelationshipResolution {
  const match = RELATIONSHIP_PATTERNS.find(
    p => p.sourceType === sourceType && p.targetType === targetType,
  );

  if (!match) {
    return {
      edgeType:   null,
      reasoning:  `No known relationship pattern between ${sourceType} and ${targetType}`,
      confidence: 0,
      resolved:   false,
    };
  }

  return {
    edgeType:   match.edgeType,
    reasoning:  match.reasoning,
    confidence: match.confidence,
    resolved:   true,
  };
}

/**
 * canRelate — quick check if a known relationship exists between two node types.
 */
export function canRelate(sourceType: GraphNodeType, targetType: GraphNodeType): boolean {
  return resolveRelationship(sourceType, targetType).resolved;
}

/**
 * allRelationshipsFor — list all known patterns for a given source type.
 */
export function allRelationshipsFor(sourceType: GraphNodeType): RelationshipPattern[] {
  return RELATIONSHIP_PATTERNS.filter(p => p.sourceType === sourceType);
}

/**
 * edgeTypesFrom — all edge types that can originate from a node type.
 */
export function edgeTypesFrom(sourceType: GraphNodeType): GraphEdgeType[] {
  return [...new Set(RELATIONSHIP_PATTERNS
    .filter(p => p.sourceType === sourceType)
    .map(p => p.edgeType))];
}
