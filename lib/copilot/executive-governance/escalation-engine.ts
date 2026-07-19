// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 8: Escalation Engine

import type {
  GovernanceEscalation,
  GovernanceEscalationType,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceAuthorityLevel,
} from "./executive-governance-types";
import { generateEscalationId } from "./executive-governance-identity";
import { resolveRequiredAuthority } from "./authority-engine";

export interface RawEscalationInput {
  readonly title:           string;
  readonly description:     string;
  readonly justification:   string;
  readonly type:            GovernanceEscalationType;
  readonly domain:          GovernanceDomain;
  readonly severity:        GovernancePriorityLevel;
  readonly targetAuthority: GovernanceAuthorityLevel;
  readonly policyIds?:      string[];
  readonly exceptionIds?:   string[];
  readonly isBlocking:      boolean;
}

export function scoreEscalation(
  severity: GovernancePriorityLevel,
  isBlocking: boolean,
  type: GovernanceEscalationType
): number {
  try {
    const base: Record<GovernancePriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.45,
      LOW:      0.20,
    };
    const typeBonus: Record<GovernanceEscalationType, number> = {
      BOARD_REQUIRED:           0.10,
      RISK_THRESHOLD_EXCEEDED:  0.08,
      VIOLATION_DETECTED:       0.07,
      UNRESOLVED_EXCEPTION:     0.06,
      POLICY_CONFLICT:          0.05,
      AUTHORITY_INSUFFICIENT:   0.04,
    };
    const blockingBonus = isBlocking ? 0.05 : 0;
    return Math.min(1, (base[severity] ?? 0.45) + (typeBonus[type] ?? 0) + blockingBonus);
  } catch {
    return 0;
  }
}

export function buildEscalation(
  orgSlug: string,
  sessionId: string,
  input: RawEscalationInput
): GovernanceEscalation {
  try {
    return {
      id:              generateEscalationId(),
      orgSlug,
      sessionId,
      title:           input.title,
      description:     input.description,
      type:            input.type,
      domain:          input.domain,
      severity:        input.severity,
      targetAuthority: input.targetAuthority,
      escalationScore: scoreEscalation(input.severity, input.isBlocking, input.type),
      isBlocking:      input.isBlocking,
      justification:   input.justification,
      policyIds:       input.policyIds ?? [],
      exceptionIds:    input.exceptionIds ?? [],
      createdAt:       new Date().toISOString(),
    };
  } catch {
    return buildEmptyEscalation(orgSlug, sessionId);
  }
}

export function detectEscalations(
  orgSlug: string,
  sessionId: string,
  inputs: RawEscalationInput[]
): GovernanceEscalation[] {
  try {
    return inputs.map((i) => buildEscalation(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function rankEscalations(escalations: GovernanceEscalation[]): GovernanceEscalation[] {
  try {
    const severityOrder: Record<GovernancePriorityLevel, number> = {
      CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
    };
    return [...escalations].sort(
      (a, b) =>
        (a.isBlocking === b.isBlocking ? 0 : a.isBlocking ? -1 : 1) ||
        (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
    );
  } catch {
    return escalations;
  }
}

export function evaluateEscalationLevel(
  financialImpact: number | undefined,
  domain: GovernanceDomain,
  severity: GovernancePriorityLevel
): GovernanceAuthorityLevel {
  try {
    const authorityLevel = resolveRequiredAuthority(financialImpact, domain);
    if (severity === "CRITICAL") {
      const upgrade: Record<GovernanceAuthorityLevel, GovernanceAuthorityLevel> = {
        SUPERVISOR: "MANAGER",
        MANAGER:    "DIRECTOR",
        DIRECTOR:   "EXECUTIVE",
        EXECUTIVE:  "CEO",
        CEO:        "BOARD",
        BOARD:      "BOARD",
      };
      return upgrade[authorityLevel] ?? "EXECUTIVE";
    }
    return authorityLevel;
  } catch {
    return "EXECUTIVE";
  }
}

export function getBlockingEscalations(escalations: GovernanceEscalation[]): GovernanceEscalation[] {
  try {
    return escalations.filter((e) => e.isBlocking);
  } catch {
    return [];
  }
}

export function getCriticalEscalations(escalations: GovernanceEscalation[]): GovernanceEscalation[] {
  try {
    return escalations.filter((e) => e.severity === "CRITICAL");
  } catch {
    return [];
  }
}

export function getBoardRequiredEscalations(escalations: GovernanceEscalation[]): GovernanceEscalation[] {
  try {
    return escalations.filter(
      (e) => e.type === "BOARD_REQUIRED" || e.targetAuthority === "BOARD"
    );
  } catch {
    return [];
  }
}

export function calculateEscalationPressure(escalations: GovernanceEscalation[]): number {
  try {
    if (escalations.length === 0) return 0;
    const blocking    = escalations.filter((e) => e.isBlocking).length;
    const critical    = escalations.filter((e) => e.severity === "CRITICAL").length;
    const boardLevel  = escalations.filter(
      (e) => e.targetAuthority === "BOARD" || e.targetAuthority === "CEO"
    ).length;
    return Math.min(1, blocking * 0.10 + critical * 0.08 + boardLevel * 0.05 + escalations.length * 0.02);
  } catch {
    return 0;
  }
}

function buildEmptyEscalation(orgSlug: string, sessionId: string): GovernanceEscalation {
  return {
    id:              generateEscalationId(),
    orgSlug,
    sessionId,
    title:           "Escalación no disponible",
    description:     "",
    type:            "AUTHORITY_INSUFFICIENT",
    domain:          "CROSS_DOMAIN",
    severity:        "LOW",
    targetAuthority: "MANAGER",
    escalationScore: 0,
    isBlocking:      false,
    justification:   "",
    policyIds:       [],
    exceptionIds:    [],
    createdAt:       new Date().toISOString(),
  };
}
