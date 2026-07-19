// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 7: Exception Engine

import type {
  GovernanceException,
  GovernanceExceptionType,
  GovernanceDomain,
  GovernancePriorityLevel,
} from "./executive-governance-types";
import { generateExceptionId } from "./executive-governance-identity";

export interface RawExceptionInput {
  readonly title:            string;
  readonly description:      string;
  readonly type:             GovernanceExceptionType;
  readonly domain:           GovernanceDomain;
  readonly severity:         GovernancePriorityLevel;
  readonly policyId?:        string;
  readonly ruleId?:          string;
  readonly justification:    string;
  readonly isJustifiable:    boolean;
  readonly requiresApproval: boolean;
  readonly evidenceIds?:     string[];
}

export function scoreException(
  severity: GovernancePriorityLevel,
  isJustifiable: boolean,
  requiresApproval: boolean
): number {
  try {
    const base: Record<GovernancePriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.45,
      LOW:      0.20,
    };
    const justPenalty   = isJustifiable   ? 0 : 0.10;
    const approvalBonus = requiresApproval ? 0.05 : 0;
    return Math.min(1, (base[severity] ?? 0.45) + justPenalty + approvalBonus);
  } catch {
    return 0;
  }
}

export function buildException(orgSlug: string, sessionId: string, input: RawExceptionInput): GovernanceException {
  try {
    return {
      id:               generateExceptionId(),
      orgSlug,
      sessionId,
      title:            input.title,
      description:      input.description,
      type:             input.type,
      domain:           input.domain,
      severity:         input.severity,
      policyId:         input.policyId,
      ruleId:           input.ruleId,
      justification:    input.justification,
      isJustifiable:    input.isJustifiable,
      requiresApproval: input.requiresApproval,
      evidenceIds:      input.evidenceIds ?? [],
      createdAt:        new Date().toISOString(),
    };
  } catch {
    return buildEmptyException(orgSlug, sessionId);
  }
}

export function detectExceptions(
  orgSlug: string,
  sessionId: string,
  inputs: RawExceptionInput[]
): GovernanceException[] {
  try {
    return inputs.map((i) => buildException(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function rankExceptions(exceptions: GovernanceException[]): GovernanceException[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...exceptions].sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
  } catch {
    return exceptions;
  }
}

export function getUnjustifiableExceptions(exceptions: GovernanceException[]): GovernanceException[] {
  try {
    return exceptions.filter((e) => !e.isJustifiable);
  } catch {
    return [];
  }
}

export function getCriticalExceptions(exceptions: GovernanceException[]): GovernanceException[] {
  try {
    return exceptions.filter((e) => e.severity === "CRITICAL");
  } catch {
    return [];
  }
}

export function calculateExceptionPenalty(exceptions: GovernanceException[]): number {
  try {
    if (exceptions.length === 0) return 0;
    const criticalCount = exceptions.filter((e) => e.severity === "CRITICAL").length;
    const unjustifiable = exceptions.filter((e) => !e.isJustifiable).length;
    return Math.min(0.35, criticalCount * 0.08 + unjustifiable * 0.05 + exceptions.length * 0.01);
  } catch {
    return 0;
  }
}

function buildEmptyException(orgSlug: string, sessionId: string): GovernanceException {
  return {
    id:               generateExceptionId(),
    orgSlug,
    sessionId,
    title:            "Excepción no disponible",
    description:      "",
    type:             "THRESHOLD_BREACH",
    domain:           "CROSS_DOMAIN",
    severity:         "LOW",
    justification:    "",
    isJustifiable:    false,
    requiresApproval: true,
    evidenceIds:      [],
    createdAt:        new Date().toISOString(),
  };
}
