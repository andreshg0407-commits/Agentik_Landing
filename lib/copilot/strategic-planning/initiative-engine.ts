// AGENTIK-STRATEGIC-PLANNING-01
// Phase 4 — Initiative Engine
// Transforms recommendations, opportunities, priorities, and risks into strategic initiatives.
// NEVER executes. NEVER assigns real tasks. All initiatives are suggestedOnly.

import type {
  StrategicInitiative, InitiativeType, PlanningPriority,
  PlanningHorizon, PlanningStatus, StrategicDomain,
} from "./strategic-planning-types";
import { PLANNING_PRIORITY_RANK } from "./strategic-planning-types";
import { generateInitiativeId } from "./strategic-planning-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function createInitiative(params: {
  orgSlug:          string;
  objectiveId:      string;
  title:            string;
  description:      string;
  type?:            InitiativeType;
  domain:           StrategicDomain;
  priority?:        PlanningPriority;
  status?:          PlanningStatus;
  horizon?:         PlanningHorizon;
  effortScore?:     number;
  impactScore?:     number;
  confidenceScore?: number;
  playbookIds?:     string[];
  evidenceIds?:     string[];
  metadata?:        Record<string, unknown>;
}): StrategicInitiative {
  return {
    id:              generateInitiativeId(),
    orgSlug:         params.orgSlug,
    objectiveId:     params.objectiveId,
    title:           params.title,
    description:     params.description,
    type:            params.type            ?? "CUSTOM",
    domain:          params.domain,
    priority:        params.priority        ?? "MEDIUM",
    status:          params.status          ?? "DRAFT",
    horizon:         params.horizon         ?? "MEDIUM_TERM",
    effortScore:     Math.min(1, Math.max(0, params.effortScore     ?? 0.5)),
    impactScore:     Math.min(1, Math.max(0, params.impactScore     ?? 0.5)),
    confidenceScore: Math.min(1, Math.max(0, params.confidenceScore ?? 0.6)),
    playbookIds:     params.playbookIds     ?? [],
    evidenceIds:     params.evidenceIds     ?? [],
    suggestedOnly:   true,
    metadata:        params.metadata        ?? {},
    createdAt:       new Date().toISOString(),
  };
}

// ── From recommendations ──────────────────────────────────────────────────────

export function createInitiativeFromRecommendation(params: {
  orgSlug:     string;
  objectiveId: string;
  domain:      StrategicDomain;
  recTitle:    string;
  recDesc:     string;
  recPriority: PlanningPriority;
  confidenceScore: number;
  evidenceIds: string[];
}): StrategicInitiative {
  return createInitiative({
    orgSlug:      params.orgSlug,
    objectiveId:  params.objectiveId,
    title:        `Iniciativa: ${params.recTitle}`,
    description:  params.recDesc,
    type:         "CUSTOM",
    domain:       params.domain,
    priority:     params.recPriority,
    confidenceScore: params.confidenceScore,
    evidenceIds:  params.evidenceIds,
    metadata:     { source: "RECOMMENDATION" },
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface InitiativeValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateInitiative(i: StrategicInitiative): InitiativeValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  if (!i.title || i.title.trim().length === 0)     errors.push("Initiative title required");
  if (!i.objectiveId)                               errors.push("Initiative must have a parent objectiveId");
  if (!i.suggestedOnly)                             errors.push("Initiative must have suggestedOnly: true");
  if (!i.id.startsWith("initiative_"))              errors.push("Invalid initiative ID prefix");
  if (i.evidenceIds.length === 0)                   warnings.push(`Initiative "${i.title}" has no evidence`);
  if (i.effortScore > 0.8 && i.impactScore < 0.4)  warnings.push(`High-effort, low-impact initiative: "${i.title}"`);
  return { valid: errors.length === 0, warnings, errors };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreInitiative(i: StrategicInitiative): number {
  const base    = (i.impactScore * 0.50) + (i.confidenceScore * 0.30) + ((1 - i.effortScore) * 0.20);
  const bonus   = i.playbookIds.length > 0 ? 0.05 : 0;
  return Math.min(1, Math.max(0, Math.round((base + bonus) * 100) / 100));
}

// ── Prioritize ────────────────────────────────────────────────────────────────

export function prioritizeInitiative(i: StrategicInitiative): StrategicInitiative {
  const score = scoreInitiative(i);
  const priority: PlanningPriority = score >= 0.80 ? "CRITICAL" : score >= 0.60 ? "HIGH" : score >= 0.40 ? "MEDIUM" : "LOW";
  return { ...i, priority };
}

export function rankInitiatives(initiatives: StrategicInitiative[]): StrategicInitiative[] {
  return [...initiatives].sort((a, b) => {
    const pDiff = PLANNING_PRIORITY_RANK[b.priority] - PLANNING_PRIORITY_RANK[a.priority];
    if (pDiff !== 0) return pDiff;
    return scoreInitiative(b) - scoreInitiative(a);
  });
}
