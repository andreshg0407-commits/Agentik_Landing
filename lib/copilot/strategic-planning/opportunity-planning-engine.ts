// AGENTIK-STRATEGIC-PLANNING-01
// Phase 8 — Opportunity Planning Engine
// NEVER executes. NEVER modifies data.

import type {
  StrategicOpportunity, StrategicInitiative, StrategicObjective,
  StrategicDomain, PlanningHorizon,
} from "./strategic-planning-types";
import { planningConfidenceFromScore } from "./strategic-planning-types";
import { generateOppPlanId } from "./strategic-planning-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildPlanningOpportunity(params: {
  orgSlug:          string;
  planId:           string;
  title:            string;
  description:      string;
  domain:           StrategicDomain;
  magnitude?:       StrategicOpportunity["magnitude"];
  captureScore?:    number;
  confidenceScore?: number;
  horizon?:         PlanningHorizon;
  evidenceIds?:     string[];
  metadata?:        Record<string, unknown>;
}): StrategicOpportunity {
  return {
    id:              generateOppPlanId(),
    orgSlug:         params.orgSlug,
    planId:          params.planId,
    title:           params.title,
    description:     params.description,
    domain:          params.domain,
    magnitude:       params.magnitude        ?? "MEDIUM",
    captureScore:    Math.min(1, Math.max(0, params.captureScore    ?? 0.5)),
    confidenceScore: Math.min(1, Math.max(0, params.confidenceScore ?? 0.6)),
    horizon:         params.horizon          ?? "MEDIUM_TERM",
    evidenceIds:     params.evidenceIds      ?? [],
    metadata:        params.metadata         ?? {},
  };
}

// ── From objectives ───────────────────────────────────────────────────────────

export function buildPlanningOpportunities(params: {
  orgSlug:    string;
  planId:     string;
  domain:     StrategicDomain;
  objectives: StrategicObjective[];
  initiatives: StrategicInitiative[];
}): StrategicOpportunity[] {
  const opps: StrategicOpportunity[] = [];

  // Opportunities from high-impact objectives
  for (const obj of params.objectives.filter((o) => o.impactScore >= 0.7).slice(0, 3)) {
    opps.push(buildPlanningOpportunity({
      orgSlug:          params.orgSlug,
      planId:           params.planId,
      title:            `Capitalizar objetivo: ${obj.title}`,
      description:      `El objetivo "${obj.title}" con impacto ${obj.impactScore.toFixed(2)} representa una oportunidad de mejora estratégica.`,
      domain:           obj.domain,
      magnitude:        obj.impactScore >= 0.85 ? "LARGE" : "MEDIUM",
      captureScore:     obj.alignmentScore,
      confidenceScore:  obj.confidenceScore,
      horizon:          obj.horizon,
      evidenceIds:      obj.evidenceIds,
    }));
  }

  // Opportunities from controllable high-impact initiatives
  for (const ini of params.initiatives.filter((i) => i.impactScore >= 0.7 && i.effortScore <= 0.5).slice(0, 2)) {
    opps.push(buildPlanningOpportunity({
      orgSlug:          params.orgSlug,
      planId:           params.planId,
      title:            `Iniciativa de alto valor: ${ini.title}`,
      description:      `La iniciativa "${ini.title}" ofrece alto impacto con esfuerzo manejable.`,
      domain:           ini.domain,
      magnitude:        "LARGE",
      captureScore:     ini.impactScore * 0.9,
      confidenceScore:  ini.confidenceScore,
      horizon:          ini.horizon,
      evidenceIds:      ini.evidenceIds,
    }));
  }

  return opps;
}

// ── Score & Rank ──────────────────────────────────────────────────────────────

export function scoreOpportunity(o: StrategicOpportunity): number {
  const magnRank = { TRANSFORMATIONAL: 4, LARGE: 3, MEDIUM: 2, SMALL: 1 };
  return Math.min(1, Math.round((o.captureScore * 0.60 + o.confidenceScore * 0.40 + magnRank[o.magnitude] * 0.05) * 100) / 100);
}

export function rankOpportunities(opps: StrategicOpportunity[]): StrategicOpportunity[] {
  const magnRank = { TRANSFORMATIONAL: 4, LARGE: 3, MEDIUM: 2, SMALL: 1 };
  return [...opps].sort((a, b) => {
    const mDiff = magnRank[b.magnitude] - magnRank[a.magnitude];
    if (mDiff !== 0) return mDiff;
    return scoreOpportunity(b) - scoreOpportunity(a);
  });
}
