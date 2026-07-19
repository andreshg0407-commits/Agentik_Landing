// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 11: Conflict Engine

import type {
  DirectionConflict,
  DirectionConflictType,
  DirectionDomain,
  DirectionPriorityLevel,
} from "./enterprise-direction-types";
import { generateDirectionConflictId } from "./enterprise-direction-identity";

export interface RawConflictInput {
  readonly title:        string;
  readonly description:  string;
  readonly type:         DirectionConflictType;
  readonly domain:       DirectionDomain;
  readonly severity:     DirectionPriorityLevel;
  readonly affectedIds:  string[];
  readonly isBlocking:   boolean;
  readonly impact:       number; // 0–1
  readonly resolution?:  string;
  readonly evidenceIds?: string[];
}

export function scoreConflict(
  severity: DirectionPriorityLevel,
  impact: number,
  isBlocking: boolean
): number {
  try {
    const severityBase: Record<DirectionPriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.45,
      LOW:      0.20,
    };
    const base     = severityBase[severity] ?? 0.45;
    const imp      = Math.max(0, Math.min(1, impact));
    const blocking = isBlocking ? 0.15 : 0;
    return Math.min(1, base * 0.45 + imp * 0.40 + blocking);
  } catch {
    return 0;
  }
}

export function buildConflict(
  orgSlug: string,
  input: RawConflictInput
): DirectionConflict {
  try {
    const conflictScore = scoreConflict(input.severity, input.impact, input.isBlocking);
    return {
      id:            generateDirectionConflictId(),
      orgSlug,
      title:         input.title,
      description:   input.description,
      type:          input.type,
      domain:        input.domain,
      severity:      input.severity,
      conflictScore,
      affectedIds:   input.affectedIds,
      isBlocking:    input.isBlocking,
      resolution:    input.resolution,
      createdAt:     new Date().toISOString(),
    };
  } catch {
    return buildEmptyConflict(orgSlug);
  }
}

export function detectConflicts(
  orgSlug: string,
  inputs: RawConflictInput[]
): DirectionConflict[] {
  try {
    return inputs.map((i) => buildConflict(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankConflicts(conflicts: DirectionConflict[]): DirectionConflict[] {
  try {
    return [...conflicts].sort((a, b) => b.conflictScore - a.conflictScore);
  } catch {
    return conflicts;
  }
}

export function groupConflicts(
  conflicts: DirectionConflict[]
): Record<DirectionConflictType, DirectionConflict[]> {
  try {
    const result: Record<DirectionConflictType, DirectionConflict[]> = {
      OBJECTIVE_CONFLICT: [],
      RESOURCE_CONFLICT:  [],
      PRIORITY_CONFLICT:  [],
      TIMING_CONFLICT:    [],
      GOVERNANCE_CONFLICT:[],
    };
    for (const c of conflicts) {
      result[c.type].push(c);
    }
    return result;
  } catch {
    return {
      OBJECTIVE_CONFLICT: [],
      RESOURCE_CONFLICT:  [],
      PRIORITY_CONFLICT:  [],
      TIMING_CONFLICT:    [],
      GOVERNANCE_CONFLICT:[],
    };
  }
}

export function getBlockingConflicts(conflicts: DirectionConflict[]): DirectionConflict[] {
  try {
    return conflicts.filter((c) => c.isBlocking);
  } catch {
    return [];
  }
}

export function getUnresolvedConflicts(conflicts: DirectionConflict[]): DirectionConflict[] {
  try {
    return conflicts.filter((c) => !c.resolution);
  } catch {
    return [];
  }
}

export function calculateConflictPenalty(conflicts: DirectionConflict[]): number {
  try {
    if (conflicts.length === 0) return 0;
    const blockingPenalty  = conflicts.filter((c) => c.isBlocking).length * 0.08;
    const avgConflictScore = conflicts.reduce((s, c) => s + c.conflictScore, 0) / conflicts.length;
    return Math.min(0.35, avgConflictScore * 0.25 + blockingPenalty);
  } catch {
    return 0;
  }
}

function buildEmptyConflict(orgSlug: string): DirectionConflict {
  return {
    id:            generateDirectionConflictId(),
    orgSlug,
    title:         "Conflicto no disponible",
    description:   "",
    type:          "OBJECTIVE_CONFLICT",
    domain:        "CROSS_DOMAIN",
    severity:      "LOW",
    conflictScore: 0,
    affectedIds:   [],
    isBlocking:    false,
    createdAt:     new Date().toISOString(),
  };
}
