// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 6: Approval Engine
// Never approves automatically. Only identifies requirements.

import type {
  GovernanceApproval,
  GovernancePolicy,
  GovernanceDecisionCandidate,
  GovernancePriorityLevel,
} from "./executive-governance-types";
import { generateApprovalId } from "./executive-governance-identity";
import { resolveRequiredAuthority } from "./authority-engine";

export function determineApprovalRequirements(
  orgSlug: string,
  sessionId: string,
  candidate: GovernanceDecisionCandidate,
  policies: GovernancePolicy[]
): GovernanceApproval[] {
  try {
    const approvals: GovernanceApproval[] = [];

    // Financial threshold policies
    const financialPolicies = policies.filter(
      (p) => p.type === "FINANCIAL_THRESHOLD" &&
             p.isActive &&
             candidate.financialImpact !== undefined &&
             p.threshold !== undefined &&
             candidate.financialImpact > p.threshold
    );
    for (const policy of financialPolicies) {
      approvals.push({
        id:                 generateApprovalId(),
        orgSlug,
        sessionId,
        decisionId:         candidate.id,
        title:              `Aprobación requerida: ${policy.title}`,
        requiredAuthority:  policy.authorityLevel,
        domain:             candidate.domain,
        urgency:            policy.priority,
        justification:      `El impacto financiero de ${candidate.financialImpact} supera el umbral de ${policy.threshold}`,
        policyIds:          [policy.id],
        isBlocking:         policy.isMandatory,
        estimatedRisk:      candidate.riskScore,
        createdAt:          new Date().toISOString(),
      });
    }

    // Approval gate policies
    const gatePolicies = policies.filter(
      (p) => p.type === "APPROVAL_GATE" && p.isActive
    );
    for (const policy of gatePolicies) {
      if (policy.domain === candidate.domain || policy.domain === "CROSS_DOMAIN") {
        approvals.push({
          id:                 generateApprovalId(),
          orgSlug,
          sessionId,
          decisionId:         candidate.id,
          title:              `Aprobación de proceso: ${policy.title}`,
          requiredAuthority:  policy.authorityLevel,
          domain:             candidate.domain,
          urgency:            policy.priority,
          justification:      `Política de aprobación obligatoria para el dominio ${candidate.domain}`,
          policyIds:          [policy.id],
          isBlocking:         policy.isMandatory,
          estimatedRisk:      candidate.riskScore,
          createdAt:          new Date().toISOString(),
        });
      }
    }

    // Minimum authority if no specific policy matched
    if (approvals.length === 0 && candidate.financialImpact) {
      const requiredAuthority = resolveRequiredAuthority(candidate.financialImpact, candidate.domain);
      approvals.push({
        id:                 generateApprovalId(),
        orgSlug,
        sessionId,
        decisionId:         candidate.id,
        title:              `Aprobación estándar por impacto financiero`,
        requiredAuthority,
        domain:             candidate.domain,
        urgency:            "MEDIUM",
        justification:      `Impacto financiero requiere autorización de nivel ${requiredAuthority}`,
        policyIds:          [],
        isBlocking:         true,
        estimatedRisk:      candidate.riskScore,
        createdAt:          new Date().toISOString(),
      });
    }

    return approvals;
  } catch {
    return [];
  }
}

export function rankApprovals(approvals: GovernanceApproval[]): GovernanceApproval[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...approvals].sort(
      (a, b) =>
        (a.isBlocking === b.isBlocking ? 0 : a.isBlocking ? -1 : 1) ||
        (order[a.urgency] ?? 2) - (order[b.urgency] ?? 2)
    );
  } catch {
    return approvals;
  }
}

export function evaluateApprovalRisk(approvals: GovernanceApproval[]): number {
  try {
    if (approvals.length === 0) return 0;
    const blockingCount = approvals.filter((a) => a.isBlocking).length;
    const avgRisk       = approvals.reduce((s, a) => s + a.estimatedRisk, 0) / approvals.length;
    const blockingBonus = Math.min(0.20, blockingCount * 0.05);
    return Math.min(1, avgRisk + blockingBonus);
  } catch {
    return 0;
  }
}

export function getBlockingApprovals(approvals: GovernanceApproval[]): GovernanceApproval[] {
  try {
    return approvals.filter((a) => a.isBlocking);
  } catch {
    return [];
  }
}

export function calculateApprovalCount(approvals: GovernanceApproval[]): number {
  try {
    return approvals.length;
  } catch {
    return 0;
  }
}
