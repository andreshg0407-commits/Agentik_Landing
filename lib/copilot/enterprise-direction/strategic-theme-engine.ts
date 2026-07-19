// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 4: Strategic Theme Engine

import type {
  StrategicTheme,
  DirectionDomain,
  DirectionHorizon,
} from "./enterprise-direction-types";
import { generateStrategicThemeId } from "./enterprise-direction-identity";

export interface RawThemeInput {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       DirectionDomain;
  readonly horizon:      DirectionHorizon;
  readonly strength:     number; // 0–1
  readonly evidenceIds?: string[];
  readonly isEmergent?:  boolean;
}

export function scoreStrategicTheme(
  strength: number,
  evidenceCount: number,
  isEmergent: boolean
): number {
  try {
    const base     = Math.max(0, Math.min(1, strength));
    const evBonus  = Math.min(0.10, evidenceCount * 0.02);
    const emBonus  = isEmergent ? 0.05 : 0;
    return Math.min(1, base + evBonus + emBonus);
  } catch {
    return 0;
  }
}

export function buildStrategicTheme(
  orgSlug: string,
  input: RawThemeInput
): StrategicTheme {
  try {
    const strength = scoreStrategicTheme(
      input.strength,
      (input.evidenceIds ?? []).length,
      input.isEmergent ?? false
    );
    return {
      id:          generateStrategicThemeId(),
      orgSlug,
      title:       input.title,
      description: input.description,
      domain:      input.domain,
      strength,
      horizon:     input.horizon,
      isEmergent:  input.isEmergent ?? false,
      evidenceIds: input.evidenceIds ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyTheme(orgSlug, input.title ?? "Tema desconocido");
  }
}

export function identifyStrategicThemes(
  orgSlug: string,
  inputs: RawThemeInput[]
): StrategicTheme[] {
  try {
    return inputs.map((i) => buildStrategicTheme(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankStrategicThemes(themes: StrategicTheme[]): StrategicTheme[] {
  try {
    return [...themes].sort((a, b) => b.strength - a.strength);
  } catch {
    return themes;
  }
}

export function getEmergentThemes(themes: StrategicTheme[]): StrategicTheme[] {
  try {
    return themes.filter((t) => t.isEmergent);
  } catch {
    return [];
  }
}

export function groupThemesByDomain(
  themes: StrategicTheme[]
): Record<DirectionDomain, StrategicTheme[]> {
  try {
    const grouped: Partial<Record<DirectionDomain, StrategicTheme[]>> = {};
    for (const t of themes) {
      if (!grouped[t.domain]) grouped[t.domain] = [];
      grouped[t.domain]!.push(t);
    }
    return grouped as Record<DirectionDomain, StrategicTheme[]>;
  } catch {
    return {} as Record<DirectionDomain, StrategicTheme[]>;
  }
}

function buildEmptyTheme(orgSlug: string, title: string): StrategicTheme {
  return {
    id:          generateStrategicThemeId(),
    orgSlug,
    title,
    description: "",
    domain:      "CROSS_DOMAIN",
    strength:    0,
    horizon:     "MEDIUM_TERM",
    isEmergent:  false,
    evidenceIds: [],
    createdAt:   new Date().toISOString(),
  };
}
