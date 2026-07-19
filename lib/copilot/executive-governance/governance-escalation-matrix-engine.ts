// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 48: Escalation Matrix Engine

import type {
  GovernanceAuthorityLevel,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceEscalationType,
} from "./executive-governance-types";

export interface EscalationMatrixEntry {
  readonly type:            GovernanceEscalationType;
  readonly triggerDomain:   GovernanceDomain;
  readonly severity:        GovernancePriorityLevel;
  readonly targetAuthority: GovernanceAuthorityLevel;
  readonly isBlocking:      boolean;
  readonly slaHours:        number;
}

export interface EscalationMatrix {
  readonly orgSlug: string;
  readonly entries: EscalationMatrixEntry[];
}

const DEFAULT_MATRIX: EscalationMatrixEntry[] = [
  { type: "BOARD_REQUIRED",         triggerDomain: "STRATEGIC",    severity: "CRITICAL", targetAuthority: "BOARD",      isBlocking: true,  slaHours: 24  },
  { type: "BOARD_REQUIRED",         triggerDomain: "LEGAL",        severity: "CRITICAL", targetAuthority: "BOARD",      isBlocking: true,  slaHours: 24  },
  { type: "RISK_THRESHOLD_EXCEEDED", triggerDomain: "FINANCIAL",   severity: "CRITICAL", targetAuthority: "CEO",        isBlocking: true,  slaHours: 4   },
  { type: "RISK_THRESHOLD_EXCEEDED", triggerDomain: "RISK",        severity: "CRITICAL", targetAuthority: "EXECUTIVE",  isBlocking: true,  slaHours: 8   },
  { type: "VIOLATION_DETECTED",     triggerDomain: "FINANCIAL",    severity: "HIGH",     targetAuthority: "EXECUTIVE",  isBlocking: true,  slaHours: 12  },
  { type: "VIOLATION_DETECTED",     triggerDomain: "REGULATORY",   severity: "HIGH",     targetAuthority: "CEO",        isBlocking: false, slaHours: 48  },
  { type: "UNRESOLVED_EXCEPTION",   triggerDomain: "CROSS_DOMAIN", severity: "HIGH",     targetAuthority: "DIRECTOR",   isBlocking: false, slaHours: 72  },
  { type: "POLICY_CONFLICT",        triggerDomain: "CROSS_DOMAIN", severity: "MEDIUM",   targetAuthority: "MANAGER",    isBlocking: false, slaHours: 96  },
  { type: "AUTHORITY_INSUFFICIENT", triggerDomain: "FINANCIAL",    severity: "HIGH",     targetAuthority: "DIRECTOR",   isBlocking: true,  slaHours: 12  },
  { type: "AUTHORITY_INSUFFICIENT", triggerDomain: "STRATEGIC",    severity: "CRITICAL", targetAuthority: "CEO",        isBlocking: true,  slaHours: 4   },
];

export function buildEscalationMatrix(orgSlug: string): EscalationMatrix {
  return { orgSlug, entries: DEFAULT_MATRIX };
}

export function lookupEscalationPath(
  matrix: EscalationMatrix,
  type: GovernanceEscalationType,
  domain: GovernanceDomain,
  severity: GovernancePriorityLevel
): EscalationMatrixEntry | null {
  try {
    const exact = matrix.entries.find(
      (e) => e.type === type && e.triggerDomain === domain && e.severity === severity
    );
    if (exact) return exact;
    const byType = matrix.entries.find((e) => e.type === type && e.triggerDomain === "CROSS_DOMAIN");
    return byType ?? null;
  } catch {
    return null;
  }
}

export function getBlockingEscalationPaths(matrix: EscalationMatrix): EscalationMatrixEntry[] {
  try {
    return matrix.entries.filter((e) => e.isBlocking);
  } catch {
    return [];
  }
}

export function getCriticalEscalationPaths(matrix: EscalationMatrix): EscalationMatrixEntry[] {
  try {
    return matrix.entries.filter((e) => e.severity === "CRITICAL");
  } catch {
    return [];
  }
}
