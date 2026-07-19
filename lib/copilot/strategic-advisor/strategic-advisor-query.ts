// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 24: Query Layer

import type {
  StrategicAdvisorReport, StrategicConcern, StrategicOpportunityAssessment,
  StrategicQuestion, StrategicRecommendation, StrategicAdvisorBriefing, StrategicAdvisorDigest,
  StrategicAdvisorQuery, StrategicFocusArea, StrategicAdvice,
} from "./strategic-advisor-types";
import { STRATEGIC_PRIORITY_RANK } from "./strategic-advisor-types";

export function getAdvice(report: StrategicAdvisorReport, q: StrategicAdvisorQuery): StrategicAdvice[] {
  let items = report.advice.filter((a) => a.orgSlug === q.orgSlug);
  if (q.domains?.length) items = items.filter((a) => q.domains!.includes(a.domain));
  if (q.minConfidenceScore != null) items = items.filter((a) => a.confidenceScore >= q.minConfidenceScore!);
  return items.slice(0, q.limit ?? 20);
}

export function getConcerns(report: StrategicAdvisorReport, q: StrategicAdvisorQuery): StrategicConcern[] {
  let items = report.concerns.filter((c) => c.orgSlug === q.orgSlug);
  if (q.domains?.length)    items = items.filter((c) => q.domains!.includes(c.domain));
  if (q.priorities?.length) items = items.filter((c) => q.priorities!.includes(c.severity));
  if (q.minConfidenceScore != null) items = items.filter((c) => c.confidenceScore >= q.minConfidenceScore!);
  return items.slice(0, q.limit ?? 20);
}

export function getOpportunities(report: StrategicAdvisorReport, q: StrategicAdvisorQuery): StrategicOpportunityAssessment[] {
  let items = report.opportunities.filter((o) => o.orgSlug === q.orgSlug);
  if (q.domains?.length) items = items.filter((o) => q.domains!.includes(o.domain));
  if (q.minConfidenceScore != null) items = items.filter((o) => o.confidenceScore >= q.minConfidenceScore!);
  return items.slice(0, q.limit ?? 20);
}

export function getQuestions(report: StrategicAdvisorReport, q: StrategicAdvisorQuery): StrategicQuestion[] {
  let items = report.questions.filter((x) => x.orgSlug === q.orgSlug);
  if (q.domains?.length)    items = items.filter((x) => q.domains!.includes(x.domain));
  if (q.priorities?.length) items = items.filter((x) => q.priorities!.includes(x.priority));
  return items.slice(0, q.limit ?? 20);
}

export function getRecommendations(report: StrategicAdvisorReport, q: StrategicAdvisorQuery): StrategicRecommendation[] {
  let items = report.recommendations.filter((r) => r.orgSlug === q.orgSlug);
  if (q.domains?.length)    items = items.filter((r) => q.domains!.includes(r.domain));
  if (q.priorities?.length) items = items.filter((r) => q.priorities!.includes(r.priority));
  if (q.minConfidenceScore != null) items = items.filter((r) => r.confidenceScore >= q.minConfidenceScore!);
  return items.sort((a, b) => STRATEGIC_PRIORITY_RANK[b.priority] - STRATEGIC_PRIORITY_RANK[a.priority]).slice(0, q.limit ?? 20);
}

export function getFocusAreas(report: StrategicAdvisorReport, q: StrategicAdvisorQuery): StrategicFocusArea[] {
  let items = report.focusAreas.filter((f) => f.orgSlug === q.orgSlug);
  if (q.domains?.length) items = items.filter((f) => q.domains!.includes(f.domain));
  return items.slice(0, q.limit ?? 10);
}

export function getBriefings(briefings: StrategicAdvisorBriefing[], q: StrategicAdvisorQuery): StrategicAdvisorBriefing[] {
  let items = briefings.filter((b) => b.orgSlug === q.orgSlug);
  if (q.domains?.length) items = items.filter((b) => b.domains.some((d) => q.domains!.includes(d)));
  return items.slice(0, q.limit ?? 10);
}

export function getDigests(digests: StrategicAdvisorDigest[], q: StrategicAdvisorQuery): StrategicAdvisorDigest[] {
  return digests.filter((d) => d.orgSlug === q.orgSlug).slice(0, q.limit ?? 10);
}
