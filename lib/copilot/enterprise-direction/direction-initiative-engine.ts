// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 8: Initiative Engine

import type {
  DirectionInitiative,
  DirectionDomain,
  DirectionHorizon,
  DirectionInitiativeStatus,
} from "./enterprise-direction-types";
import { generateDirectionInitiativeId } from "./enterprise-direction-identity";

export interface RawInitiativeInput {
  readonly title:          string;
  readonly description:    string;
  readonly domain:         DirectionDomain;
  readonly horizon:        DirectionHorizon;
  readonly status:         DirectionInitiativeStatus;
  readonly northStarScore: number; // 0–1 alignment with north star
  readonly priorityId?:    string;
  readonly objectiveId?:   string;
  readonly evidenceIds?:   string[];
  readonly assumptions?:   string[];
}

export function scoreInitiativeAlignment(
  northStarScore: number,
  status: DirectionInitiativeStatus,
  evidenceCount: number
): number {
  try {
    const base = Math.max(0, Math.min(1, northStarScore));
    const statusBonus =
      status === "ACTIVE"    ? 0.08 :
      status === "PROPOSED"  ? 0.04 :
      status === "PAUSED"    ? -0.05 :
      status === "COMPLETED" ? 0.10 :
      status === "CANCELLED" ? -0.20 :
      0;
    const evBonus = Math.min(0.07, evidenceCount * 0.02);
    return Math.max(0, Math.min(1, base + statusBonus + evBonus));
  } catch {
    return 0;
  }
}

export function buildDirectionInitiative(
  orgSlug: string,
  input: RawInitiativeInput
): DirectionInitiative {
  try {
    const alignmentScore = scoreInitiativeAlignment(
      input.northStarScore,
      input.status,
      (input.evidenceIds ?? []).length
    );
    return {
      id:             generateDirectionInitiativeId(),
      orgSlug,
      title:          input.title,
      description:    input.description,
      domain:         input.domain,
      horizon:        input.horizon,
      status:         input.status,
      alignmentScore,
      priorityId:     input.priorityId,
      objectiveId:    input.objectiveId,
      evidenceIds:    input.evidenceIds ?? [],
      assumptions:    input.assumptions ?? [],
      suggestedOnly:  true,
      createdAt:      new Date().toISOString(),
    };
  } catch {
    return buildEmptyInitiative(orgSlug);
  }
}

export function identifyInitiatives(
  orgSlug: string,
  inputs: RawInitiativeInput[]
): DirectionInitiative[] {
  try {
    return inputs.map((i) => buildDirectionInitiative(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankInitiatives(initiatives: DirectionInitiative[]): DirectionInitiative[] {
  try {
    return [...initiatives].sort((a, b) => b.alignmentScore - a.alignmentScore);
  } catch {
    return initiatives;
  }
}

export function getActiveInitiatives(initiatives: DirectionInitiative[]): DirectionInitiative[] {
  try {
    return initiatives.filter((i) => i.status === "ACTIVE");
  } catch {
    return [];
  }
}

export function getMisalignedInitiatives(initiatives: DirectionInitiative[]): DirectionInitiative[] {
  try {
    return initiatives.filter((i) => i.alignmentScore < 0.40);
  } catch {
    return [];
  }
}

function buildEmptyInitiative(orgSlug: string): DirectionInitiative {
  return {
    id:             generateDirectionInitiativeId(),
    orgSlug,
    title:          "Iniciativa no disponible",
    description:    "",
    domain:         "CROSS_DOMAIN",
    horizon:        "MEDIUM_TERM",
    status:         "PROPOSED",
    alignmentScore: 0,
    evidenceIds:    [],
    assumptions:    [],
    suggestedOnly:  true,
    createdAt:      new Date().toISOString(),
  };
}
