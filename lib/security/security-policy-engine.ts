/**
 * lib/security/security-policy-engine.ts
 *
 * Agentik — Security Foundation — Policy Engine
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Defines SecurityPolicy contracts and evaluates them deterministically.
 * No DB. No side effects. No AI. No server-only.
 *
 * Policies are the formal rules that govern what is allowed
 * in the Agentik platform. They are evaluated at runtime against
 * an AccessContext to produce a PolicyDecision.
 */

import type { SecurityPolicyId, DataSensitivity } from "./security-types";

// ── Policy Contract ───────────────────────────────────────────────────────────

/**
 * SecurityPolicy — a named, evaluatable security rule.
 */
export interface SecurityPolicy {
  /** Stable, unique identifier for this policy. */
  id:          SecurityPolicyId;
  /** Human-readable policy name. */
  name:        string;
  /** What this policy protects and why. */
  description: string;
  /** Whether the policy is currently active. */
  enabled:     boolean;
}

// ── Policy Decision ───────────────────────────────────────────────────────────

/**
 * PolicyDecision — result of evaluating a policy against a context.
 */
export interface PolicyDecision {
  /** The policy that was evaluated. */
  policyId:  SecurityPolicyId;
  /** Whether the policy evaluation passed (no violation). */
  allowed:   boolean;
  /** Human-readable explanation of the decision. */
  reason:    string;
}

// ── Policy Input ──────────────────────────────────────────────────────────────

/**
 * PolicyEvaluationInput — the minimal context needed to evaluate a policy.
 */
export interface PolicyEvaluationInput {
  /** Tenant making the request. */
  orgSlug:         string;
  /** Org that owns the resource (may differ from orgSlug). */
  resourceOrgSlug?: string;
  /** Data sensitivity of the resource being accessed. */
  sensitivity?:    DataSensitivity;
  /** Whether the access event has an audit record. */
  isAudited?:      boolean;
  /** Whether the resource is a secret or token. */
  isSecret?:       boolean;
  /** Whether the resource is executive intelligence data. */
  isExecutiveData?: boolean;
  /** Whether the resource is memory engine data. */
  isMemoryData?:   boolean;
  /** Whether the resource is playbook data. */
  isPlaybookData?: boolean;
}

// ── Policy Registry ───────────────────────────────────────────────────────────

/**
 * Well-known security policies.
 * Add new policies here as the platform evolves.
 */
export const SECURITY_POLICIES: Record<SecurityPolicyId, SecurityPolicy> = {
  TENANT_ISOLATION_REQUIRED: {
    id:          "TENANT_ISOLATION_REQUIRED",
    name:        "Tenant Isolation Required",
    description: "Every resource access must be scoped to the requesting tenant. Cross-tenant access is denied unless explicitly authorized.",
    enabled:     true,
  },
  AUDIT_REQUIRED: {
    id:          "AUDIT_REQUIRED",
    name:        "Audit Required",
    description: "All access to CONFIDENTIAL and RESTRICTED resources must produce an audit event.",
    enabled:     true,
  },
  SECRETS_PROTECTED: {
    id:          "SECRETS_PROTECTED",
    name:        "Secrets Protected",
    description: "API tokens, certificates, passwords, and credentials must never be exposed in logs, responses, or exports.",
    enabled:     true,
  },
  EXECUTIVE_DATA_PROTECTED: {
    id:          "EXECUTIVE_DATA_PROTECTED",
    name:        "Executive Data Protected",
    description: "Executive Brain context, strategic insights, and intelligence signals are CONFIDENTIAL and require explicit read authorization.",
    enabled:     true,
  },
  MEMORY_DATA_PROTECTED: {
    id:          "MEMORY_DATA_PROTECTED",
    name:        "Memory Data Protected",
    description: "Copilot memory entries containing strategic or operational data are CONFIDENTIAL and scoped to the owning tenant.",
    enabled:     true,
  },
  PLAYBOOK_DATA_PROTECTED: {
    id:          "PLAYBOOK_DATA_PROTECTED",
    name:        "Playbook Data Protected",
    description: "Operational playbooks are CONFIDENTIAL and may only be read, modified, or shared within the owning tenant.",
    enabled:     true,
  },
};

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * evaluatePolicy — deterministic policy evaluation.
 *
 * Returns a PolicyDecision for the given policy and input context.
 * Never throws — returns allowed=false with reason on evaluation failure.
 *
 * @param policyId — the policy to evaluate
 * @param input    — the evaluation context
 */
export function evaluatePolicy(
  policyId: SecurityPolicyId,
  input:    PolicyEvaluationInput,
): PolicyDecision {
  try {
    const policy = SECURITY_POLICIES[policyId];

    // Disabled policy — always passes (not enforced)
    if (!policy.enabled) {
      return { policyId, allowed: true, reason: "Policy is disabled — evaluation skipped." };
    }

    switch (policyId) {
      case "TENANT_ISOLATION_REQUIRED": {
        const resourceOrg = input.resourceOrgSlug ?? input.orgSlug;
        const allowed     = input.orgSlug === resourceOrg;
        return {
          policyId,
          allowed,
          reason: allowed
            ? "Actor and resource share the same tenant."
            : `Tenant mismatch: actor="${input.orgSlug}" resource="${resourceOrg}"`,
        };
      }

      case "AUDIT_REQUIRED": {
        const needsAudit = input.sensitivity === "CONFIDENTIAL" || input.sensitivity === "RESTRICTED";
        if (!needsAudit) {
          return { policyId, allowed: true, reason: "Resource sensitivity does not require audit." };
        }
        const allowed = input.isAudited === true;
        return {
          policyId,
          allowed,
          reason: allowed
            ? "Access event is audited."
            : "CONFIDENTIAL/RESTRICTED resource access requires an audit event.",
        };
      }

      case "SECRETS_PROTECTED": {
        // Secrets may be accessed but must not be in logs/exports
        // This policy always evaluates to allowed at runtime (enforcement is in the serialization layer)
        const allowed = input.isSecret !== true || input.sensitivity !== "RESTRICTED";
        return {
          policyId,
          allowed,
          reason: allowed
            ? "Resource is not a restricted secret."
            : "Restricted secret access requires explicit authorization via Vault layer.",
        };
      }

      case "EXECUTIVE_DATA_PROTECTED": {
        if (!input.isExecutiveData) {
          return { policyId, allowed: true, reason: "Resource is not executive data." };
        }
        // Executive data always requires same-tenant access
        const resourceOrg = input.resourceOrgSlug ?? input.orgSlug;
        const allowed     = input.orgSlug === resourceOrg;
        return {
          policyId,
          allowed,
          reason: allowed
            ? "Executive data access is within tenant boundary."
            : "Executive data is CONFIDENTIAL and cross-tenant access is denied.",
        };
      }

      case "MEMORY_DATA_PROTECTED": {
        if (!input.isMemoryData) {
          return { policyId, allowed: true, reason: "Resource is not memory data." };
        }
        const resourceOrg = input.resourceOrgSlug ?? input.orgSlug;
        const allowed     = input.orgSlug === resourceOrg;
        return {
          policyId,
          allowed,
          reason: allowed
            ? "Memory data access is within tenant boundary."
            : "Memory data is CONFIDENTIAL and cross-tenant access is denied.",
        };
      }

      case "PLAYBOOK_DATA_PROTECTED": {
        if (!input.isPlaybookData) {
          return { policyId, allowed: true, reason: "Resource is not playbook data." };
        }
        const resourceOrg = input.resourceOrgSlug ?? input.orgSlug;
        const allowed     = input.orgSlug === resourceOrg;
        return {
          policyId,
          allowed,
          reason: allowed
            ? "Playbook access is within tenant boundary."
            : "Playbooks are CONFIDENTIAL and cross-tenant access is denied.",
        };
      }

      default: {
        // Unknown policy — fail closed
        return {
          policyId,
          allowed: false,
          reason:  `Unknown policy "${policyId}" — access denied (fail closed).`,
        };
      }
    }
  } catch {
    // Evaluation error — fail closed
    return {
      policyId,
      allowed: false,
      reason:  "Policy evaluation error — access denied (fail closed).",
    };
  }
}

/**
 * evaluateAllPolicies — evaluate all enabled policies for a given input.
 *
 * Returns an array of decisions. The overall result is allowed only when
 * ALL policies pass.
 */
export function evaluateAllPolicies(input: PolicyEvaluationInput): PolicyDecision[] {
  return Object.keys(SECURITY_POLICIES).map(id =>
    evaluatePolicy(id as SecurityPolicyId, input),
  );
}

/**
 * isPolicyPassing — true only when all enabled relevant policies pass.
 */
export function isPolicyPassing(decisions: PolicyDecision[]): boolean {
  return decisions.every(d => d.allowed);
}
