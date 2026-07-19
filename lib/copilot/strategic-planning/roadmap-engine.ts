// AGENTIK-STRATEGIC-PLANNING-01
// Phase 9 — Roadmap Engine
// Objectives → Initiatives → Dependencies → Milestones → Roadmap
// NEVER executes. NEVER modifies data.

import type {
  StrategicRoadmap, StrategicObjective, StrategicInitiative,
  StrategicMilestone, StrategicDependency, PlanningHorizon,
} from "./strategic-planning-types";
import { planningConfidenceFromScore } from "./strategic-planning-types";
import { generateRoadmapId } from "./strategic-planning-identity";
import { aggregateObjectiveScore } from "./objective-engine";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildRoadmap(params: {
  orgSlug:      string;
  planId:       string;
  title:        string;
  description:  string;
  objectives:   StrategicObjective[];
  initiatives:  StrategicInitiative[];
  milestones:   StrategicMilestone[];
  dependencies: StrategicDependency[];
  horizon?:     PlanningHorizon;
  metadata?:    Record<string, unknown>;
}): StrategicRoadmap {
  const confScore = _computeRoadmapConfidence(params.objectives, params.initiatives);
  return {
    id:              generateRoadmapId(),
    orgSlug:         params.orgSlug,
    planId:          params.planId,
    title:           params.title,
    description:     params.description,
    objectives:      params.objectives,
    initiatives:     params.initiatives,
    milestones:      params.milestones,
    dependencies:    params.dependencies,
    horizon:         params.horizon ?? _deriveHorizon(params.milestones),
    confidence:      planningConfidenceFromScore(confScore),
    confidenceScore: confScore,
    metadata:        params.metadata ?? {},
    builtAt:         new Date().toISOString(),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface RoadmapValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateRoadmap(r: StrategicRoadmap): RoadmapValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  if (!r.id.startsWith("roadmap_")) errors.push("Invalid roadmap ID prefix");
  if (r.objectives.length === 0)    warnings.push("Roadmap has no objectives");
  if (r.initiatives.length === 0)   warnings.push("Roadmap has no initiatives");
  if (r.milestones.length === 0)    warnings.push("Roadmap has no milestones");

  // Each initiative should have a valid objectiveId in this roadmap
  const objIds = new Set(r.objectives.map((o) => o.id));
  for (const ini of r.initiatives) {
    if (!objIds.has(ini.objectiveId)) {
      warnings.push(`Initiative "${ini.title}" references unknown objective ${ini.objectiveId}`);
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}

// ── Score ─────────────────────────────────────────────────────────────────────

export function scoreRoadmap(r: StrategicRoadmap): number {
  const objScore   = aggregateObjectiveScore(r.objectives);
  const iniCount   = Math.min(1, r.initiatives.length / 5);
  const msCount    = Math.min(1, r.milestones.length / 10);
  const depBonus   = r.dependencies.length > 0 ? 0.05 : 0;

  return Math.min(1, Math.round((objScore * 0.50 + iniCount * 0.20 + msCount * 0.20 + depBonus + r.confidenceScore * 0.10) * 100) / 100);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeRoadmapConfidence(
  objectives:  StrategicObjective[],
  initiatives: StrategicInitiative[]
): number {
  const allScores = [
    ...objectives.map((o) => o.confidenceScore),
    ...initiatives.map((i) => i.confidenceScore),
  ];
  if (allScores.length === 0) return 0.4;
  return Math.round(allScores.reduce((s, x) => s + x, 0) / allScores.length * 100) / 100;
}

function _deriveHorizon(milestones: StrategicMilestone[]): PlanningHorizon {
  if (milestones.some((m) => m.estimatedDate === "LONG_TERM"))   return "LONG_TERM";
  if (milestones.some((m) => m.estimatedDate === "MEDIUM_TERM")) return "MEDIUM_TERM";
  if (milestones.some((m) => m.estimatedDate === "SHORT_TERM"))  return "SHORT_TERM";
  return "IMMEDIATE";
}
