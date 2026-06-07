// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Relationship Engine — link strategic memory entries

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicRelationType,
} from "./strategic-memory-types";
import { generateStrategicRelationId } from "./strategic-memory-identity";

export function createStrategicRelation(
  orgSlug: string,
  sourceId: string,
  targetId: string,
  type: StrategicRelationType,
  description: string,
  strength = 0.7,
  metadata?: Record<string, unknown>
): StrategicMemoryRelation {
  if (orgSlug !== orgSlug) {
    throw new Error("Cannot create relation across tenants");
  }
  if (sourceId === targetId) {
    throw new Error("Cannot create self-referencing relation");
  }
  return {
    id: generateStrategicRelationId(),
    orgSlug,
    sourceId,
    targetId,
    type,
    strength: Math.max(0, Math.min(1, strength)),
    description,
    metadata: metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

export function linkGoalToRisk(
  orgSlug: string,
  goal: StrategicMemoryEntry,
  risk: StrategicMemoryEntry,
  description?: string
): StrategicMemoryRelation {
  if (goal.orgSlug !== orgSlug || risk.orgSlug !== orgSlug) {
    throw new Error("Cross-tenant relation not allowed");
  }
  return createStrategicRelation(
    orgSlug,
    goal.id,
    risk.id,
    "BLOCKS",
    description ?? `Risk "${risk.title}" blocks goal "${goal.title}"`,
    0.8
  );
}

export function linkGoalToOpportunity(
  orgSlug: string,
  goal: StrategicMemoryEntry,
  opportunity: StrategicMemoryEntry,
  description?: string
): StrategicMemoryRelation {
  if (goal.orgSlug !== orgSlug || opportunity.orgSlug !== orgSlug) {
    throw new Error("Cross-tenant relation not allowed");
  }
  return createStrategicRelation(
    orgSlug,
    opportunity.id,
    goal.id,
    "SUPPORTS",
    description ?? `Opportunity "${opportunity.title}" supports goal "${goal.title}"`,
    0.75
  );
}

export function linkDecisionToOutcome(
  orgSlug: string,
  decision: StrategicMemoryEntry,
  outcome: StrategicMemoryEntry,
  description?: string
): StrategicMemoryRelation {
  if (decision.orgSlug !== orgSlug || outcome.orgSlug !== orgSlug) {
    throw new Error("Cross-tenant relation not allowed");
  }
  return createStrategicRelation(
    orgSlug,
    decision.id,
    outcome.id,
    "DERIVED_FROM",
    description ?? `"${outcome.title}" derived from decision "${decision.title}"`,
    0.85
  );
}

export function linkLessonToDecision(
  orgSlug: string,
  lesson: StrategicMemoryEntry,
  decision: StrategicMemoryEntry,
  description?: string
): StrategicMemoryRelation {
  if (lesson.orgSlug !== orgSlug || decision.orgSlug !== orgSlug) {
    throw new Error("Cross-tenant relation not allowed");
  }
  return createStrategicRelation(
    orgSlug,
    lesson.id,
    decision.id,
    "DERIVED_FROM",
    description ?? `Lesson "${lesson.title}" derived from decision "${decision.title}"`,
    0.7
  );
}

export function linkPolicyToConstraint(
  orgSlug: string,
  policy: StrategicMemoryEntry,
  constraint: StrategicMemoryEntry,
  description?: string
): StrategicMemoryRelation {
  if (policy.orgSlug !== orgSlug || constraint.orgSlug !== orgSlug) {
    throw new Error("Cross-tenant relation not allowed");
  }
  return createStrategicRelation(
    orgSlug,
    policy.id,
    constraint.id,
    "DEPENDS_ON",
    description ?? `Policy "${policy.title}" depends on constraint "${constraint.title}"`,
    0.75
  );
}

export function removeStrategicRelation(
  relations: StrategicMemoryRelation[],
  relationId: string,
  orgSlug: string
): StrategicMemoryRelation[] {
  return relations.filter((r) => !(r.id === relationId && r.orgSlug === orgSlug));
}

export function findRelationsForEntry(
  relations: StrategicMemoryRelation[],
  entryId: string,
  orgSlug: string
): StrategicMemoryRelation[] {
  return relations.filter(
    (r) =>
      r.orgSlug === orgSlug &&
      (r.sourceId === entryId || r.targetId === entryId)
  );
}

export function findRelationsByType(
  relations: StrategicMemoryRelation[],
  type: StrategicRelationType,
  orgSlug: string
): StrategicMemoryRelation[] {
  return relations.filter((r) => r.orgSlug === orgSlug && r.type === type);
}

export function validateRelationIntegrity(
  relation: StrategicMemoryRelation,
  knownIds: Set<string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!knownIds.has(relation.sourceId)) {
    errors.push(`Source ID "${relation.sourceId}" not found`);
  }
  if (!knownIds.has(relation.targetId)) {
    errors.push(`Target ID "${relation.targetId}" not found`);
  }
  if (relation.sourceId === relation.targetId) {
    errors.push("Self-referencing relation");
  }
  return { valid: errors.length === 0, errors };
}
