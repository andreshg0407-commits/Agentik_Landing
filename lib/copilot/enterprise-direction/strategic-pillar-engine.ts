// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 5: Strategic Pillar Engine

import type {
  StrategicPillar,
  DirectionDomain,
} from "./enterprise-direction-types";
import { generateStrategicPillarId } from "./enterprise-direction-identity";

export interface RawPillarInput {
  readonly name:        string;
  readonly description: string;
  readonly domain:      DirectionDomain;
  readonly weight:      number; // 0–1
  readonly score:       number; // 0–1 current performance
  readonly objectives?: string[];
}

export function buildStrategicPillar(
  orgSlug: string,
  input: RawPillarInput
): StrategicPillar {
  try {
    return {
      id:          generateStrategicPillarId(),
      orgSlug,
      name:        input.name,
      description: input.description,
      domain:      input.domain,
      weight:      Math.max(0, Math.min(1, input.weight)),
      score:       Math.max(0, Math.min(1, input.score)),
      objectives:  input.objectives ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyPillar(orgSlug, input.name ?? "Pilar");
  }
}

export function buildStrategicPillars(
  orgSlug: string,
  inputs: RawPillarInput[]
): StrategicPillar[] {
  try {
    return inputs.map((i) => buildStrategicPillar(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankStrategicPillars(pillars: StrategicPillar[]): StrategicPillar[] {
  try {
    // rank by weight × score (impact × performance)
    return [...pillars].sort((a, b) => (b.weight * b.score) - (a.weight * a.score));
  } catch {
    return pillars;
  }
}

export function getWeakPillars(pillars: StrategicPillar[]): StrategicPillar[] {
  try {
    return pillars.filter((p) => p.score < 0.40);
  } catch {
    return [];
  }
}

export function buildDefaultPillars(orgSlug: string): StrategicPillar[] {
  const defaults: RawPillarInput[] = [
    { name: "Crecimiento", description: "Expansión de ingresos y mercado", domain: "GROWTH", weight: 0.25, score: 0.5 },
    { name: "Rentabilidad", description: "Eficiencia y márgenes operativos", domain: "PROFITABILITY", weight: 0.25, score: 0.5 },
    { name: "Eficiencia", description: "Optimización de operaciones y recursos", domain: "EFFICIENCY", weight: 0.20, score: 0.5 },
    { name: "Innovación", description: "Capacidad de transformación y diferenciación", domain: "INNOVATION", weight: 0.15, score: 0.5 },
    { name: "Gobierno", description: "Gobernanza corporativa y cumplimiento", domain: "GOVERNANCE", weight: 0.15, score: 0.5 },
  ];
  try {
    return defaults.map((d) => buildStrategicPillar(orgSlug, d));
  } catch {
    return [];
  }
}

export function calculateWeightedPillarScore(pillars: StrategicPillar[]): number {
  try {
    if (pillars.length === 0) return 0;
    const totalWeight = pillars.reduce((s, p) => s + p.weight, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = pillars.reduce((s, p) => s + p.score * p.weight, 0);
    return Math.min(1, weightedSum / totalWeight);
  } catch {
    return 0;
  }
}

function buildEmptyPillar(orgSlug: string, name: string): StrategicPillar {
  return {
    id:          generateStrategicPillarId(),
    orgSlug,
    name,
    description: "",
    domain:      "CROSS_DOMAIN",
    weight:      0,
    score:       0,
    objectives:  [],
    createdAt:   new Date().toISOString(),
  };
}
