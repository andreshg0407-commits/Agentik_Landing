// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 49: Policy Simulator
// suggestedOnly: true — never executes, never approves

import type {
  GovernancePolicy,
  GovernanceDomain,
  GovernanceAuthorityLevel,
} from "./executive-governance-types";

export interface PolicySimulationInput {
  readonly orgSlug:        string;
  readonly policies:       GovernancePolicy[];
  readonly financialAmount: number;
  readonly domain:         GovernanceDomain;
  readonly requestedBy:   string;
}

export interface PolicySimulationResult {
  readonly orgSlug:           string;
  readonly domain:            GovernanceDomain;
  readonly financialAmount:   number;
  readonly triggeredPolicies: GovernancePolicy[];
  readonly requiredAuthority: GovernanceAuthorityLevel;
  readonly isBlocked:         boolean;
  readonly blockingReasons:   string[];
  readonly approvalPath:      string[];
  readonly estimatedRisk:     number; // 0–1
  readonly suggestedOnly:     true;
}

export function simulatePolicyApplication(
  input: PolicySimulationInput
): PolicySimulationResult {
  try {
    const triggered = input.policies.filter(
      (p) =>
        p.isActive &&
        (p.domain === input.domain || p.domain === "CROSS_DOMAIN") &&
        (p.threshold === undefined || input.financialAmount > p.threshold)
    );

    const mandatory = triggered.filter((p) => p.isMandatory);
    const isBlocked  = mandatory.length > 0;

    const blockingReasons = mandatory.map(
      (p) => `Política obligatoria: ${p.title} (umbral: ${p.threshold ?? "N/A"})`
    );

    const authorityLevels = triggered.map((p) => p.authorityLevel);
    const hierarchyOrder: Record<GovernanceAuthorityLevel, number> = {
      BOARD: 6, CEO: 5, EXECUTIVE: 4, DIRECTOR: 3, MANAGER: 2, SUPERVISOR: 1,
    };
    const requiredAuthority: GovernanceAuthorityLevel =
      authorityLevels.reduce(
        (max, l) => (hierarchyOrder[l] ?? 0) > (hierarchyOrder[max] ?? 0) ? l : max,
        "SUPERVISOR" as GovernanceAuthorityLevel
      );

    const approvalPath = triggered.map(
      (p) => `${p.authorityLevel}: ${p.title}`
    );

    const estimatedRisk = Math.min(
      1,
      triggered.length * 0.10 + (isBlocked ? 0.20 : 0)
    );

    return {
      orgSlug:           input.orgSlug,
      domain:            input.domain,
      financialAmount:   input.financialAmount,
      triggeredPolicies: triggered,
      requiredAuthority,
      isBlocked,
      blockingReasons,
      approvalPath,
      estimatedRisk,
      suggestedOnly:     true,
    };
  } catch {
    return {
      orgSlug:           input.orgSlug,
      domain:            input.domain,
      financialAmount:   input.financialAmount,
      triggeredPolicies: [],
      requiredAuthority: "EXECUTIVE",
      isBlocked:         false,
      blockingReasons:   ["Error en simulación de política"],
      approvalPath:      [],
      estimatedRisk:     0,
      suggestedOnly:     true,
    };
  }
}

export function simulateMultipleAmounts(
  orgSlug: string,
  policies: GovernancePolicy[],
  domain: GovernanceDomain,
  amounts: number[]
): PolicySimulationResult[] {
  try {
    return amounts.map((amount) =>
      simulatePolicyApplication({
        orgSlug,
        policies,
        financialAmount: amount,
        domain,
        requestedBy:     "simulation",
      })
    );
  } catch {
    return [];
  }
}
