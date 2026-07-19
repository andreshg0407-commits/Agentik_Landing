// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 23 — Executive Brain Query Layer

import type {
  ExecutivePriority,
  ExecutiveRisk,
  ExecutiveOpportunity,
  ExecutiveBriefing,
  ExecutiveDigest,
  ExecutiveFocusArea,
  ExecutiveConflict,
  ExecutiveNarrative,
  ExecutiveBrainV2Query,
  ExecutiveDomain,
  ExecutivePriorityLevel,
} from "./executive-brain-types";
import { EXECUTIVE_PRIORITY_RANK } from "./executive-brain-types";

// ── Query API ─────────────────────────────────────────────────────────────────

export function getPriorities(
  priorities: ExecutivePriority[],
  query: ExecutiveBrainV2Query
): ExecutivePriority[] {
  let result = priorities.filter((p) => p.orgSlug === query.orgSlug);
  if (query.domains) result = result.filter((p) => (query.domains as ExecutiveDomain[]).includes(p.domain));
  if (query.priorityLevels) result = result.filter((p) => (query.priorityLevels as ExecutivePriorityLevel[]).includes(p.level));
  if (query.minConfidenceScore) result = result.filter((p) => p.confidenceScore >= (query.minConfidenceScore as number));
  return result
    .sort((a, b) => EXECUTIVE_PRIORITY_RANK[b.level] - EXECUTIVE_PRIORITY_RANK[a.level] || a.rank - b.rank)
    .slice(0, query.limit ?? 50);
}

export function getRisks(
  risks: ExecutiveRisk[],
  query: ExecutiveBrainV2Query
): ExecutiveRisk[] {
  let result = risks.filter((r) => r.orgSlug === query.orgSlug);
  if (query.domains) result = result.filter((r) => (query.domains as ExecutiveDomain[]).includes(r.domain));
  if (query.minConfidenceScore) result = result.filter((r) => r.confidenceScore >= (query.minConfidenceScore as number));
  return result
    .sort((a, b) => b.compositeRisk - a.compositeRisk)
    .slice(0, query.limit ?? 50);
}

export function getOpportunities(
  opportunities: ExecutiveOpportunity[],
  query: ExecutiveBrainV2Query
): ExecutiveOpportunity[] {
  let result = opportunities.filter((o) => o.orgSlug === query.orgSlug);
  if (query.domains) result = result.filter((o) => (query.domains as ExecutiveDomain[]).includes(o.domain));
  if (query.minConfidenceScore) result = result.filter((o) => o.confidenceScore >= (query.minConfidenceScore as number));
  return result
    .sort((a, b) => b.captureScore - a.captureScore)
    .slice(0, query.limit ?? 50);
}

export function getConflicts(
  conflicts: ExecutiveConflict[],
  query: ExecutiveBrainV2Query
): ExecutiveConflict[] {
  let result = conflicts.filter((c) => c.orgSlug === query.orgSlug);
  if (query.domains) result = result.filter((c) => (query.domains as ExecutiveDomain[]).includes(c.domain));
  return result
    .sort((a, b) => EXECUTIVE_PRIORITY_RANK[b.severity] - EXECUTIVE_PRIORITY_RANK[a.severity])
    .slice(0, query.limit ?? 50);
}

export function getNarratives(
  narratives: ExecutiveNarrative[],
  query: ExecutiveBrainV2Query
): ExecutiveNarrative[] {
  let result = narratives.filter((n) => n.orgSlug === query.orgSlug);
  if (query.domains) result = result.filter((n) => (query.domains as ExecutiveDomain[]).includes(n.domain));
  return result
    .sort((a, b) => EXECUTIVE_PRIORITY_RANK[b.priority] - EXECUTIVE_PRIORITY_RANK[a.priority])
    .slice(0, query.limit ?? 20);
}

export function getBriefings(
  briefings: ExecutiveBriefing[],
  query: ExecutiveBrainV2Query
): ExecutiveBriefing[] {
  return briefings
    .filter((b) => b.orgSlug === query.orgSlug)
    .sort((a, b) => b.executiveScore - a.executiveScore)
    .slice(0, query.limit ?? 10);
}

export function getDigests(
  digests: ExecutiveDigest[],
  query: ExecutiveBrainV2Query
): ExecutiveDigest[] {
  return digests
    .filter((d) => d.orgSlug === query.orgSlug)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, query.limit ?? 10);
}

export function getFocusAreas(
  areas: ExecutiveFocusArea[],
  query: ExecutiveBrainV2Query
): ExecutiveFocusArea[] {
  let result = areas.filter((a) => a.orgSlug === query.orgSlug);
  if (query.domains) result = result.filter((a) => (query.domains as ExecutiveDomain[]).includes(a.domain));
  return result
    .sort((a, b) => a.rank - b.rank)
    .slice(0, query.limit ?? 10);
}

export function queryExecutiveSnapshot(
  snapshot: { context: { orgSlug: string } } | null,
  orgSlug: string
): boolean {
  return snapshot?.context.orgSlug === orgSlug;
}
