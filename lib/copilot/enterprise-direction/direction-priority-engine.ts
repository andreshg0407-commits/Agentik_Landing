// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 7: Priority Engine

import type {
  DirectionPriority,
  DirectionDomain,
  DirectionHorizon,
  DirectionPriorityLevel,
} from "./enterprise-direction-types";
import { generateDirectionPriorityId } from "./enterprise-direction-identity";

export interface RawPriorityInput {
  readonly title:        string;
  readonly rationale:    string;
  readonly level:        DirectionPriorityLevel;
  readonly domain:       DirectionDomain;
  readonly horizon:      DirectionHorizon;
  readonly urgency:      number; // 0–1
  readonly impact:       number; // 0–1
  readonly objectiveIds?: string[];
  readonly evidenceIds?: string[];
}

export function scorePriority(
  urgency: number,
  impact: number,
  level: DirectionPriorityLevel
): number {
  try {
    const u = Math.max(0, Math.min(1, urgency));
    const i = Math.max(0, Math.min(1, impact));
    const levelBonus: Record<DirectionPriorityLevel, number> = {
      CRITICAL: 0.15, HIGH: 0.08, MEDIUM: 0.03, LOW: 0,
    };
    return Math.min(1, u * 0.45 + i * 0.45 + (levelBonus[level] ?? 0));
  } catch {
    return 0;
  }
}

export function buildDirectionPriority(
  orgSlug: string,
  input: RawPriorityInput,
  rank: number
): DirectionPriority {
  try {
    const score = scorePriority(input.urgency, input.impact, input.level);
    return {
      id:           generateDirectionPriorityId(),
      orgSlug,
      title:        input.title,
      rationale:    input.rationale,
      level:        input.level,
      domain:       input.domain,
      horizon:      input.horizon,
      score,
      objectiveIds: input.objectiveIds ?? [],
      evidenceIds:  input.evidenceIds ?? [],
      rank,
      suggestedOnly: true,
      createdAt:    new Date().toISOString(),
    };
  } catch {
    return buildEmptyPriority(orgSlug, rank);
  }
}

export function identifyPriorities(
  orgSlug: string,
  inputs: RawPriorityInput[]
): DirectionPriority[] {
  try {
    return inputs.map((input, idx) => buildDirectionPriority(orgSlug, input, idx + 1));
  } catch {
    return [];
  }
}

export function rankPriorities(priorities: DirectionPriority[]): DirectionPriority[] {
  try {
    const ranked = [...priorities].sort((a, b) => b.score - a.score);
    return ranked.map((p, idx) => ({ ...p, rank: idx + 1 }));
  } catch {
    return priorities;
  }
}

export function getCriticalPriorities(priorities: DirectionPriority[]): DirectionPriority[] {
  try {
    return priorities.filter((p) => p.level === "CRITICAL");
  } catch {
    return [];
  }
}

export function getTopPriorities(priorities: DirectionPriority[], n = 5): DirectionPriority[] {
  try {
    return rankPriorities(priorities).slice(0, n);
  } catch {
    return [];
  }
}

function buildEmptyPriority(orgSlug: string, rank: number): DirectionPriority {
  return {
    id:           generateDirectionPriorityId(),
    orgSlug,
    title:        "Prioridad no disponible",
    rationale:    "",
    level:        "LOW",
    domain:       "CROSS_DOMAIN",
    horizon:      "MEDIUM_TERM",
    score:        0,
    objectiveIds: [],
    evidenceIds:  [],
    rank,
    suggestedOnly: true,
    createdAt:    new Date().toISOString(),
  };
}
