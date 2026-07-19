// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 18: Executive Brain V2 Integration

import type { ExecutivePriority, ExecutiveRisk, ExecutiveOpportunity, ExecutiveFocusArea } from "../../executive-brain-v2/executive-brain-types";

export interface ExecutiveBrainCouncilContext {
  readonly priorities:    ExecutivePriority[];
  readonly risks:         ExecutiveRisk[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly focusAreas:    ExecutiveFocusArea[];
  readonly contextScore:  number;
}

export function buildExecutiveBrainCouncilContext(
  orgSlug:    string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[],
  focusAreas: ExecutiveFocusArea[]
): ExecutiveBrainCouncilContext {
  try {
    const scopedPriorities    = priorities.filter((p) => p.orgSlug === orgSlug);
    const scopedRisks         = risks.filter((r) => r.orgSlug === orgSlug);
    const scopedOpportunities = opportunities.filter((o) => o.orgSlug === orgSlug);
    const scopedFocusAreas    = focusAreas.filter((f) => f.orgSlug === orgSlug);

    const contextScore = Math.min(
      1,
      (scopedPriorities.length > 0 ? 0.3 : 0) +
      (scopedRisks.length > 0 ? 0.25 : 0) +
      (scopedOpportunities.length > 0 ? 0.25 : 0) +
      (scopedFocusAreas.length > 0 ? 0.2 : 0)
    );

    return {
      priorities:    scopedPriorities,
      risks:         scopedRisks,
      opportunities: scopedOpportunities,
      focusAreas:    scopedFocusAreas,
      contextScore,
    };
  } catch {
    return { priorities: [], risks: [], opportunities: [], focusAreas: [], contextScore: 0 };
  }
}

export function getCriticalPrioritiesForCouncil(
  orgSlug:    string,
  priorities: ExecutivePriority[]
): ExecutivePriority[] {
  return priorities.filter((p) => p.orgSlug === orgSlug && (p.level === "CRITICAL" || p.level === "HIGH"));
}

export function getCriticalRisksForCouncil(
  orgSlug: string,
  risks:   ExecutiveRisk[]
): ExecutiveRisk[] {
  return risks.filter((r) => r.orgSlug === orgSlug && (r.level === "CRITICAL" || r.level === "HIGH"));
}

export function getCouncilConfidenceBoostFromBrain(ctx: ExecutiveBrainCouncilContext): number {
  return Math.min(0.15, ctx.contextScore * 0.15);
}
