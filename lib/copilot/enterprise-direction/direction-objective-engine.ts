// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 6: Objective Engine

import type {
  DirectionObjective,
  DirectionDomain,
  DirectionHorizon,
  DirectionPriorityLevel,
} from "./enterprise-direction-types";
import { generateDirectionObjectiveId } from "./enterprise-direction-identity";

export interface RawObjectiveInput {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       DirectionDomain;
  readonly horizon:      DirectionHorizon;
  readonly priority:     DirectionPriorityLevel;
  readonly northStarId:  string;
  readonly pillarId?:    string;
  readonly score?:       number; // 0–1 progress
  readonly evidenceIds?: string[];
  readonly assumptions?: string[];
}

export function scoreObjective(
  priority: DirectionPriorityLevel,
  evidenceCount: number,
  horizonUrgency: number
): number {
  try {
    const priorityBase: Record<DirectionPriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.50,
      LOW:      0.30,
    };
    const base    = priorityBase[priority] ?? 0.50;
    const evBonus = Math.min(0.08, evidenceCount * 0.02);
    const urgency = Math.max(0, Math.min(0.10, horizonUrgency));
    return Math.min(1, base + evBonus + urgency);
  } catch {
    return 0.5;
  }
}

export function buildDirectionObjective(
  orgSlug: string,
  input: RawObjectiveInput
): DirectionObjective {
  try {
    const score = input.score ?? scoreObjective(
      input.priority,
      (input.evidenceIds ?? []).length,
      0
    );
    return {
      id:          generateDirectionObjectiveId(),
      orgSlug,
      title:       input.title,
      description: input.description,
      domain:      input.domain,
      horizon:     input.horizon,
      priority:    input.priority,
      score:       Math.max(0, Math.min(1, score)),
      northStarId: input.northStarId,
      pillarId:    input.pillarId,
      evidenceIds: input.evidenceIds ?? [],
      assumptions: input.assumptions ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyObjective(orgSlug, input.northStarId ?? "unknown");
  }
}

export function buildDirectionObjectives(
  orgSlug: string,
  inputs: RawObjectiveInput[]
): DirectionObjective[] {
  try {
    return inputs.map((i) => buildDirectionObjective(orgSlug, i));
  } catch {
    return [];
  }
}

export function scoreObjectives(objectives: DirectionObjective[]): number {
  try {
    if (objectives.length === 0) return 0;
    return objectives.reduce((s, o) => s + o.score, 0) / objectives.length;
  } catch {
    return 0;
  }
}

export function rankObjectives(objectives: DirectionObjective[]): DirectionObjective[] {
  try {
    const order: Record<DirectionPriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...objectives].sort(
      (a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || b.score - a.score
    );
  } catch {
    return objectives;
  }
}

export function getCriticalObjectives(objectives: DirectionObjective[]): DirectionObjective[] {
  try {
    return objectives.filter((o) => o.priority === "CRITICAL");
  } catch {
    return [];
  }
}

function buildEmptyObjective(orgSlug: string, northStarId: string): DirectionObjective {
  return {
    id:          generateDirectionObjectiveId(),
    orgSlug,
    title:       "Objetivo no disponible",
    description: "",
    domain:      "CROSS_DOMAIN",
    horizon:     "MEDIUM_TERM",
    priority:    "LOW",
    score:       0,
    northStarId,
    evidenceIds: [],
    assumptions: [],
    createdAt:   new Date().toISOString(),
  };
}
