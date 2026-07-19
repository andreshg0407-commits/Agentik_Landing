/**
 * lib/comercial/business-policy/policy-engine.ts
 *
 * Public API (FASE 8).
 * The single entry point for Business Engines to interact with policies.
 *
 * Exposes:
 *   registerPolicy()
 *   resolvePolicy()
 *   evaluatePolicy()
 *   listPolicies()
 *   validatePolicy()
 *   deactivatePolicy()
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type {
  BusinessPolicy,
  PolicyCategory,
  PolicyResolutionContext,
  PolicyResolutionResult,
  BusinessPolicyEvaluation,
  BusinessPolicyEvidence,
  PolicyValidationResult,
  PolicyScope,
} from "./policy-types";
import { resolvePolicy as resolve } from "./policy-resolution";
import { validatePolicy as validate } from "./policy-validation";
import { deprecatePolicyVersion } from "./policy-versioning";
import { buildPolicyResolutionEvidence, buildResolutionNarrative } from "./policy-evidence";

// ── In-Memory Store ─────────────────────────────────────────────────────────
// Future: replace with Prisma repository.
// Current: in-memory per-process. Safe for deterministic tests.

const policyStore: Map<string, BusinessPolicy[]> = new Map();

function storeKey(tenantId: string): string {
  return tenantId;
}

// ── registerPolicy ──────────────────────────────────────────────────────────

export interface RegisterPolicyResult {
  readonly success: boolean;
  readonly policy: BusinessPolicy;
  readonly validation: PolicyValidationResult;
}

export function registerPolicy(policy: BusinessPolicy): RegisterPolicyResult {
  const validation = validate(policy);
  if (!validation.valid) {
    return { success: false, policy, validation };
  }

  const key = storeKey(policy.tenantId);
  const existing = policyStore.get(key) ?? [];
  existing.push(policy);
  policyStore.set(key, existing);

  return { success: true, policy, validation };
}

// ── resolvePolicy ───────────────────────────────────────────────────────────

export function resolvePolicy(context: PolicyResolutionContext): PolicyResolutionResult {
  const key = storeKey(context.tenantId);
  const policies = policyStore.get(key) ?? [];
  return resolve(policies, context);
}

// ── evaluatePolicy ──────────────────────────────────────────────────────────

export function evaluatePolicy(context: PolicyResolutionContext): BusinessPolicyEvaluation | null {
  const result = resolvePolicy(context);
  if (!result.resolved || !result.selectedPolicy) return null;

  const p = result.selectedPolicy;

  return {
    policyId: p.id,
    policyName: p.name,
    tenantId: p.tenantId,
    category: p.category,
    parameters: p.parameters,
    actions: p.actions,
    evaluatedAt: new Date(),
    evidence: buildPolicyResolutionEvidence(result, context.tenantId, context.category),
  };
}

// ── listPolicies ────────────────────────────────────────────────────────────

export interface ListPoliciesFilter {
  readonly tenantId: string;
  readonly category?: PolicyCategory;
  readonly scope?: PolicyScope;
  readonly status?: BusinessPolicy["status"];
}

export function listPolicies(filter: ListPoliciesFilter): readonly BusinessPolicy[] {
  const key = storeKey(filter.tenantId);
  let policies = policyStore.get(key) ?? [];

  if (filter.category) {
    policies = policies.filter(p => p.category === filter.category);
  }

  if (filter.scope) {
    policies = policies.filter(p => p.scopes.some(s => s.scope === filter.scope));
  }

  if (filter.status) {
    policies = policies.filter(p => p.status === filter.status);
  }

  return policies;
}

// ── validatePolicy ──────────────────────────────────────────────────────────

export { validate as validatePolicy };

// ── deactivatePolicy ────────────────────────────────────────────────────────

export function deactivatePolicy(tenantId: string, policyId: string): BusinessPolicy | null {
  const key = storeKey(tenantId);
  const policies = policyStore.get(key) ?? [];

  const idx = policies.findIndex(p => p.id === policyId && p.status === "ACTIVE");
  if (idx === -1) return null;

  const deprecated = deprecatePolicyVersion(policies[idx]);
  policies[idx] = deprecated;
  policyStore.set(key, policies);

  return deprecated;
}

// ── clearStore (testing only) ───────────────────────────────────────────────

export function _clearPolicyStore(): void {
  policyStore.clear();
}
