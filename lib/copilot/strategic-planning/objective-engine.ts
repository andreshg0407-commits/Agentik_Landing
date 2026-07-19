// AGENTIK-STRATEGIC-PLANNING-01
// Phase 3 — Objective Engine
// NEVER executes. NEVER modifies data.

import type {
  StrategicObjective, PlanningPriority, PlanningStatus,
  PlanningHorizon, StrategicDomain,
} from "./strategic-planning-types";
import { planningConfidenceFromScore, PLANNING_PRIORITY_RANK } from "./strategic-planning-types";
import { generateObjectiveId } from "./strategic-planning-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildObjective(params: {
  orgSlug:         string;
  title:           string;
  description:     string;
  domain:          StrategicDomain;
  priority?:       PlanningPriority;
  status?:         PlanningStatus;
  horizon?:        PlanningHorizon;
  confidenceScore?: number;
  impactScore?:    number;
  alignmentScore?: number;
  evidenceIds?:    string[];
  relatedGoalIds?: string[];
  metadata?:       Record<string, unknown>;
}): StrategicObjective {
  return {
    id:              generateObjectiveId(),
    orgSlug:         params.orgSlug,
    title:           params.title,
    description:     params.description,
    domain:          params.domain,
    priority:        params.priority       ?? "MEDIUM",
    status:          params.status         ?? "DRAFT",
    horizon:         params.horizon        ?? "MEDIUM_TERM",
    confidenceScore: Math.min(1, Math.max(0, params.confidenceScore ?? 0.6)),
    impactScore:     Math.min(1, Math.max(0, params.impactScore     ?? 0.5)),
    alignmentScore:  Math.min(1, Math.max(0, params.alignmentScore  ?? 0.5)),
    evidenceIds:     params.evidenceIds    ?? [],
    relatedGoalIds:  params.relatedGoalIds ?? [],
    metadata:        params.metadata       ?? {},
    createdAt:       new Date().toISOString(),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ObjectiveValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateObjective(o: StrategicObjective): ObjectiveValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  if (!o.title || o.title.trim().length === 0)       errors.push("Objective title required");
  if (!o.orgSlug || o.orgSlug.trim().length === 0)   errors.push("orgSlug required");
  if (!o.id.startsWith("objective_"))                 errors.push("Invalid objective ID prefix");
  if (o.confidenceScore < 0.3)                        warnings.push(`Low confidence: "${o.title}" — objective may be poorly defined`);
  if (o.evidenceIds.length === 0)                     warnings.push(`Objective "${o.title}" has no evidence — traceability limited`);
  return { valid: errors.length === 0, warnings, errors };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreObjective(o: StrategicObjective): number {
  const base    = (o.impactScore * 0.40) + (o.alignmentScore * 0.30) + (o.confidenceScore * 0.30);
  const bonus   = o.evidenceIds.length >= 3 ? 0.05 : 0;
  const penalty = o.priority === "CRITICAL" && o.evidenceIds.length === 0 ? -0.10 : 0;
  return Math.min(1, Math.max(0, Math.round((base + bonus + penalty) * 100) / 100));
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export function rankObjectives(objectives: StrategicObjective[]): StrategicObjective[] {
  return [...objectives].sort((a, b) => {
    const priorityDiff = PLANNING_PRIORITY_RANK[b.priority] - PLANNING_PRIORITY_RANK[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return scoreObjective(b) - scoreObjective(a);
  });
}

// ── Normalize ─────────────────────────────────────────────────────────────────

export function normalizeObjective(o: StrategicObjective): StrategicObjective {
  return {
    ...o,
    title:       o.title.trim(),
    description: o.description.trim(),
    confidenceScore: Math.min(1, Math.max(0, o.confidenceScore)),
    impactScore:     Math.min(1, Math.max(0, o.impactScore)),
    alignmentScore:  Math.min(1, Math.max(0, o.alignmentScore)),
  };
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

export function aggregateObjectiveScore(objectives: StrategicObjective[]): number {
  if (objectives.length === 0) return 0;
  const scores = objectives.map(scoreObjective);
  return Math.round(scores.reduce((s, x) => s + x, 0) / scores.length * 100) / 100;
}
