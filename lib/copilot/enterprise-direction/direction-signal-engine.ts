// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 12: Direction Signal Engine

import type {
  DirectionSignal,
  DirectionSignalType,
  DirectionDomain,
  DirectionHorizon,
} from "./enterprise-direction-types";
import { generateDirectionSignalId } from "./enterprise-direction-identity";

export interface RawSignalInput {
  readonly title:        string;
  readonly description:  string;
  readonly type:         DirectionSignalType;
  readonly domain:       DirectionDomain;
  readonly intensity:    number; // 0–1
  readonly horizon:      DirectionHorizon;
  readonly evidenceIds?: string[];
}

export function buildDirectionSignal(
  orgSlug: string,
  input: RawSignalInput
): DirectionSignal {
  try {
    return {
      id:          generateDirectionSignalId(),
      orgSlug,
      title:       input.title,
      description: input.description,
      type:        input.type,
      domain:      input.domain,
      intensity:   Math.max(0, Math.min(1, input.intensity)),
      horizon:     input.horizon,
      evidenceIds: input.evidenceIds ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptySignal(orgSlug);
  }
}

export function identifyDirectionSignals(
  orgSlug: string,
  inputs: RawSignalInput[]
): DirectionSignal[] {
  try {
    return inputs.map((i) => buildDirectionSignal(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankDirectionSignals(signals: DirectionSignal[]): DirectionSignal[] {
  try {
    return [...signals].sort((a, b) => b.intensity - a.intensity);
  } catch {
    return signals;
  }
}

export function getOpportunitySignals(signals: DirectionSignal[]): DirectionSignal[] {
  try {
    return signals.filter((s) => s.type === "OPPORTUNITY");
  } catch {
    return [];
  }
}

export function getThreatSignals(signals: DirectionSignal[]): DirectionSignal[] {
  try {
    return signals.filter((s) => s.type === "THREAT");
  } catch {
    return [];
  }
}

export function getEnablerSignals(signals: DirectionSignal[]): DirectionSignal[] {
  try {
    return signals.filter((s) => s.type === "ENABLER");
  } catch {
    return [];
  }
}

export function getHighIntensitySignals(
  signals: DirectionSignal[],
  threshold = 0.70
): DirectionSignal[] {
  try {
    return signals.filter((s) => s.intensity >= threshold);
  } catch {
    return [];
  }
}

export function groupSignalsByDomain(
  signals: DirectionSignal[]
): Record<DirectionDomain, DirectionSignal[]> {
  try {
    const groups: Partial<Record<DirectionDomain, DirectionSignal[]>> = {};
    for (const s of signals) {
      if (!groups[s.domain]) groups[s.domain] = [];
      groups[s.domain]!.push(s);
    }
    return groups as Record<DirectionDomain, DirectionSignal[]>;
  } catch {
    return {} as Record<DirectionDomain, DirectionSignal[]>;
  }
}

function buildEmptySignal(orgSlug: string): DirectionSignal {
  return {
    id:          generateDirectionSignalId(),
    orgSlug,
    title:       "Señal no disponible",
    description: "",
    type:        "INDICATOR",
    domain:      "CROSS_DOMAIN",
    intensity:   0,
    horizon:     "MEDIUM_TERM",
    evidenceIds: [],
    createdAt:   new Date().toISOString(),
  };
}
