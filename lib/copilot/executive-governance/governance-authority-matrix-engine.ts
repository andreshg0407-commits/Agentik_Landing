// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 47: Authority Matrix Engine

import type {
  GovernanceAuthorityLevel,
  GovernanceDomain,
  GovernancePolicyType,
} from "./executive-governance-types";
import { buildAuthorityModel } from "./authority-engine";

export interface AuthorityMatrixEntry {
  readonly authorityLevel: GovernanceAuthorityLevel;
  readonly domain:         GovernanceDomain;
  readonly policyType:     GovernancePolicyType;
  readonly maxThreshold:   number | null;
  readonly canApprove:     boolean;
  readonly canDelegate:    boolean;
  readonly requiresEscalation: boolean;
}

export interface AuthorityMatrix {
  readonly orgSlug: string;
  readonly entries: AuthorityMatrixEntry[];
}

const MATRIX_BASE: Omit<AuthorityMatrixEntry, "authorityLevel" | "maxThreshold" | "canDelegate">[] = [
  { domain: "FINANCIAL",   policyType: "FINANCIAL_THRESHOLD", canApprove: true,  requiresEscalation: false },
  { domain: "LEGAL",       policyType: "CONFLICT_OF_INTEREST", canApprove: true, requiresEscalation: false },
  { domain: "STRATEGIC",   policyType: "AUTHORITY_LIMIT",     canApprove: false, requiresEscalation: true  },
  { domain: "REGULATORY",  policyType: "REGULATORY_COMPLIANCE", canApprove: true, requiresEscalation: false },
  { domain: "RISK",        policyType: "RISK_TOLERANCE",      canApprove: true,  requiresEscalation: false },
  { domain: "OPERATIONAL", policyType: "VENDOR_MANAGEMENT",   canApprove: true,  requiresEscalation: false },
  { domain: "CROSS_DOMAIN", policyType: "APPROVAL_GATE",      canApprove: false, requiresEscalation: true  },
];

export function buildAuthorityMatrix(orgSlug: string): AuthorityMatrix {
  try {
    const levels: GovernanceAuthorityLevel[] = ["BOARD", "CEO", "EXECUTIVE", "DIRECTOR", "MANAGER", "SUPERVISOR"];
    const authorities = levels.map((l) => buildAuthorityModel(orgSlug, l));
    const entries: AuthorityMatrixEntry[] = [];

    for (const auth of authorities) {
      for (const base of MATRIX_BASE) {
        if (auth.domains.includes(base.domain)) {
          entries.push({
            ...base,
            authorityLevel:      auth.level,
            maxThreshold:        auth.maxThreshold,
            canDelegate:         auth.canDelegate,
            requiresEscalation:  base.requiresEscalation && auth.level !== "BOARD",
          });
        }
      }
    }

    return { orgSlug, entries };
  } catch {
    return { orgSlug, entries: [] };
  }
}

export function lookupAuthorityMatrix(
  matrix: AuthorityMatrix,
  level: GovernanceAuthorityLevel,
  domain: GovernanceDomain
): AuthorityMatrixEntry[] {
  try {
    return matrix.entries.filter((e) => e.authorityLevel === level && e.domain === domain);
  } catch {
    return [];
  }
}

export function canAuthorityApprove(
  matrix: AuthorityMatrix,
  level: GovernanceAuthorityLevel,
  domain: GovernanceDomain,
  amount?: number
): boolean {
  try {
    const entries = lookupAuthorityMatrix(matrix, level, domain);
    if (entries.length === 0) return false;
    return entries.some((e) => {
      if (!e.canApprove) return false;
      if (amount !== undefined && e.maxThreshold !== null && amount > e.maxThreshold) return false;
      return true;
    });
  } catch {
    return false;
  }
}
