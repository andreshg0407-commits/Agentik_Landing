// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 5: Authority Engine

import type {
  GovernanceAuthority,
  GovernanceAuthorityLevel,
  GovernanceDomain,
} from "./executive-governance-types";
import { generateAuthorityId } from "./executive-governance-identity";

const AUTHORITY_HIERARCHY: Record<GovernanceAuthorityLevel, number> = {
  BOARD:      6,
  CEO:        5,
  EXECUTIVE:  4,
  DIRECTOR:   3,
  MANAGER:    2,
  SUPERVISOR: 1,
};

export function buildAuthorityModel(
  orgSlug: string,
  level: GovernanceAuthorityLevel,
  overrides?: Partial<Omit<GovernanceAuthority, "id" | "orgSlug" | "level" | "createdAt">>
): GovernanceAuthority {
  try {
    const defaults: Record<GovernanceAuthorityLevel, Omit<GovernanceAuthority, "id" | "orgSlug" | "level" | "createdAt">> = {
      BOARD: {
        title:        "Junta Directiva",
        description:  "Máxima autoridad de gobierno corporativo",
        maxThreshold: null,
        canDelegate:  true,
        domains:      ["FINANCIAL", "STRATEGIC", "REGULATORY", "LEGAL", "RISK", "CROSS_DOMAIN"],
        policyIds:    [],
      },
      CEO: {
        title:        "Director Ejecutivo (CEO)",
        description:  "Responsable de ejecución estratégica y decisiones ejecutivas",
        maxThreshold: 5000000,
        canDelegate:  true,
        domains:      ["FINANCIAL", "STRATEGIC", "OPERATIONAL", "TALENT", "COMMERCIAL", "CROSS_DOMAIN"],
        policyIds:    [],
      },
      EXECUTIVE: {
        title:        "Comité Ejecutivo",
        description:  "Decisiones tácticas de alto impacto",
        maxThreshold: 1000000,
        canDelegate:  true,
        domains:      ["FINANCIAL", "OPERATIONAL", "STRATEGIC", "COMMERCIAL", "CROSS_DOMAIN"],
        policyIds:    [],
      },
      DIRECTOR: {
        title:        "Director de Área",
        description:  "Decisiones operativas y de área",
        maxThreshold: 250000,
        canDelegate:  false,
        domains:      ["FINANCIAL", "OPERATIONAL", "TALENT", "COMMERCIAL"],
        policyIds:    [],
      },
      MANAGER: {
        title:        "Gerente",
        description:  "Decisiones de gestión y coordinación",
        maxThreshold: 50000,
        canDelegate:  false,
        domains:      ["OPERATIONAL", "TALENT", "COMMERCIAL"],
        policyIds:    [],
      },
      SUPERVISOR: {
        title:        "Supervisor",
        description:  "Decisiones operativas de bajo impacto",
        maxThreshold: 5000,
        canDelegate:  false,
        domains:      ["OPERATIONAL"],
        policyIds:    [],
      },
    };

    const def = defaults[level];
    return {
      id:           generateAuthorityId(),
      orgSlug,
      level,
      title:        overrides?.title        ?? def.title,
      description:  overrides?.description  ?? def.description,
      maxThreshold: overrides?.maxThreshold !== undefined ? overrides.maxThreshold : def.maxThreshold,
      canDelegate:  overrides?.canDelegate  ?? def.canDelegate,
      domains:      overrides?.domains      ?? def.domains,
      policyIds:    overrides?.policyIds    ?? def.policyIds,
      createdAt:    new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuthority(orgSlug, level);
  }
}

export function validateAuthority(
  requiredLevel: GovernanceAuthorityLevel,
  availableLevel: GovernanceAuthorityLevel
): boolean {
  try {
    return (AUTHORITY_HIERARCHY[availableLevel] ?? 0) >= (AUTHORITY_HIERARCHY[requiredLevel] ?? 0);
  } catch {
    return false;
  }
}

export function rankAuthority(
  levels: GovernanceAuthorityLevel[]
): GovernanceAuthorityLevel[] {
  try {
    return [...levels].sort(
      (a, b) => (AUTHORITY_HIERARCHY[b] ?? 0) - (AUTHORITY_HIERARCHY[a] ?? 0)
    );
  } catch {
    return levels;
  }
}

export function getAuthorityScore(level: GovernanceAuthorityLevel): number {
  try {
    const max   = 6;
    const score = AUTHORITY_HIERARCHY[level] ?? 0;
    return score / max;
  } catch {
    return 0;
  }
}

export function buildDefaultAuthorityModels(orgSlug: string): GovernanceAuthority[] {
  try {
    const levels: GovernanceAuthorityLevel[] = ["BOARD", "CEO", "EXECUTIVE", "DIRECTOR", "MANAGER", "SUPERVISOR"];
    return levels.map((l) => buildAuthorityModel(orgSlug, l));
  } catch {
    return [];
  }
}

export function resolveRequiredAuthority(
  financialImpact: number | undefined,
  domain: GovernanceDomain
): GovernanceAuthorityLevel {
  try {
    if (domain === "STRATEGIC" || domain === "LEGAL") return "BOARD";
    if (!financialImpact)                              return "MANAGER";
    if (financialImpact > 5000000)                     return "BOARD";
    if (financialImpact > 1000000)                     return "CEO";
    if (financialImpact > 250000)                      return "EXECUTIVE";
    if (financialImpact > 50000)                       return "DIRECTOR";
    if (financialImpact > 5000)                        return "MANAGER";
    return "SUPERVISOR";
  } catch {
    return "EXECUTIVE";
  }
}

function buildEmptyAuthority(
  orgSlug: string,
  level: GovernanceAuthorityLevel
): GovernanceAuthority {
  return {
    id:           generateAuthorityId(),
    orgSlug,
    level,
    title:        `Autoridad ${level}`,
    description:  "",
    maxThreshold: null,
    canDelegate:  false,
    domains:      [],
    policyIds:    [],
    createdAt:    new Date().toISOString(),
  };
}
