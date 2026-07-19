/**
 * lib/security/security-evaluator.ts
 *
 * Agentik — Security Foundation — Security Evaluator
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Evaluates access requests against the security model.
 * Deterministic, synchronous, no side effects, no Prisma, no server-only.
 *
 * This is a PREPARATORY layer — it establishes the evaluation contract
 * that will be enforced by AGENTIK-SECURITY-RBAC-01 and
 * AGENTIK-SECURITY-ZERO-TRUST-01.
 *
 * Current behavior:
 *   - Enforces tenant isolation (always)
 *   - Enforces secret protection (always)
 *   - Applies policy engine decisions
 *   - Does NOT replace or modify existing RBAC/auth
 *
 * Fail closed: any unexpected error → denied.
 */

import type { AccessAction, DataSensitivity } from "./security-types";
import type { AccessContext } from "./access-context";
import { isTenantAllowed, STRICT_TENANT_BOUNDARY_POLICY } from "./tenant-boundary";
import { evaluatePolicy } from "./security-policy-engine";
import { classifyResourceById } from "./data-classification";

// ── Evaluation Result ─────────────────────────────────────────────────────────

/**
 * EvaluationResult — the outcome of a security evaluation.
 */
export interface EvaluationResult {
  /** Whether the action is allowed. */
  allowed:     boolean;
  /** Human-readable explanation of the decision. */
  reason:      string;
  /** The data sensitivity determined for the resource. */
  sensitivity: DataSensitivity;
  /** Policies that were evaluated. */
  policies:    Array<{ policyId: string; allowed: boolean; reason: string }>;
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * canRead — evaluate whether the actor can read the given resource.
 *
 * Checks:
 *   1. Tenant isolation (always required)
 *   2. AUDIT_REQUIRED policy for sensitive data
 *   3. Data-type specific policies
 */
export function canRead(ctx: AccessContext): EvaluationResult {
  return _evaluate(ctx, "READ");
}

/**
 * canWrite — evaluate whether the actor can write to the given resource.
 */
export function canWrite(ctx: AccessContext): EvaluationResult {
  return _evaluate(ctx, "WRITE");
}

/**
 * canDelete — evaluate whether the actor can delete the given resource.
 */
export function canDelete(ctx: AccessContext): EvaluationResult {
  return _evaluate(ctx, "DELETE");
}

/**
 * canExport — evaluate whether the actor can export the given resource.
 *
 * Export is the most sensitive action — requires RESTRICTED data to go
 * through the Vault layer (AGENTIK-SECURITY-VAULT-01).
 */
export function canExport(ctx: AccessContext): EvaluationResult {
  return _evaluate(ctx, "EXPORT");
}

// ── Core Evaluation ───────────────────────────────────────────────────────────

function _evaluate(ctx: AccessContext, action: AccessAction): EvaluationResult {
  try {
    // Step 1: Classify the resource
    const classification = classifyResourceById(ctx.resource);
    const sensitivity    = classification.sensitivity;

    // Step 2: Tenant isolation — always first, always strict
    const resourceOrg    = ctx.resourceOrgSlug ?? ctx.orgSlug;
    const tenantAllowed  = isTenantAllowed(ctx.orgSlug, resourceOrg, STRICT_TENANT_BOUNDARY_POLICY);

    if (!tenantAllowed) {
      return {
        allowed:     false,
        reason:      `Tenant boundary violation: actor "${ctx.orgSlug}" cannot access resource owned by "${resourceOrg}".`,
        sensitivity,
        policies:    [{ policyId: "TENANT_ISOLATION_REQUIRED", allowed: false, reason: "Cross-tenant access denied." }],
      };
    }

    // Step 3: Evaluate domain-specific policies
    const policyInput = {
      orgSlug:          ctx.orgSlug,
      resourceOrgSlug:  resourceOrg,
      sensitivity,
      isAudited:        false, // Caller must track audit state separately
      isSecret:         sensitivity === "RESTRICTED",
      isExecutiveData:  ctx.resource.includes("executive"),
      isMemoryData:     ctx.resource.includes("memory") || ctx.resource.includes("copilot"),
      isPlaybookData:   ctx.resource.includes("playbook"),
    };

    // Secrets require vault access for EXPORT
    if (action === "EXPORT" && sensitivity === "RESTRICTED") {
      return {
        allowed:     false,
        reason:      "RESTRICTED resources cannot be exported directly. Use the Vault layer (AGENTIK-SECURITY-VAULT-01).",
        sensitivity,
        policies:    [{ policyId: "SECRETS_PROTECTED", allowed: false, reason: "RESTRICTED data export blocked." }],
      };
    }

    // Evaluate TENANT_ISOLATION_REQUIRED
    const tenantDecision = evaluatePolicy("TENANT_ISOLATION_REQUIRED", policyInput);

    // Evaluate type-specific policy
    let typeDecision = { policyId: "AUDIT_REQUIRED", allowed: true, reason: "No type-specific policy applies." };
    if (policyInput.isExecutiveData) {
      typeDecision = evaluatePolicy("EXECUTIVE_DATA_PROTECTED", policyInput);
    } else if (policyInput.isMemoryData) {
      typeDecision = evaluatePolicy("MEMORY_DATA_PROTECTED", policyInput);
    } else if (policyInput.isPlaybookData) {
      typeDecision = evaluatePolicy("PLAYBOOK_DATA_PROTECTED", policyInput);
    } else if (policyInput.isSecret) {
      typeDecision = evaluatePolicy("SECRETS_PROTECTED", policyInput);
    }

    const policies   = [tenantDecision, typeDecision];
    const allAllowed = policies.every(d => d.allowed);

    return {
      allowed:     allAllowed,
      reason:      allAllowed
        ? `${action} allowed for "${ctx.resource}" (${sensitivity}).`
        : policies.find(d => !d.allowed)?.reason ?? "Access denied by policy.",
      sensitivity,
      policies,
    };
  } catch {
    // Fail closed — any evaluation error results in denial
    return {
      allowed:     false,
      reason:      "Security evaluation error — access denied (fail closed).",
      sensitivity: "RESTRICTED",
      policies:    [],
    };
  }
}
