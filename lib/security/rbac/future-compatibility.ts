/**
 * lib/security/rbac/future-compatibility.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC — Future Compatibility Layer
 *
 * Defines forward-compatible contracts for:
 *   1. ABAC (Attribute-Based Access Control) — Sprint AGENTIK-SECURITY-ABAC-01
 *   2. Zero Trust policy evaluation — Sprint AGENTIK-SECURITY-ZERO-TRUST-01
 *   3. Dynamic policy engine — Sprint AGENTIK-SECURITY-POLICY-ENGINE-01
 *   4. Policy simulation — Sprint AGENTIK-SECURITY-POLICY-SIM-01
 *
 * These interfaces are stubs. They establish the contract vocabulary
 * that future sprints will implement. No logic here — all methods
 * throw NotImplemented by design.
 *
 * No server-only. No Prisma. Pure interface definitions.
 */

import type { AccessResult, AuthorizationContext, RoleId, PermissionId } from "./rbac-types";

// ── ABAC — Attribute-Based Access Control ─────────────────────────────────────

/**
 * An ABAC attribute — a key-value pair attached to a subject, resource, or environment.
 */
export interface AccessAttribute {
  key:   string;
  value: string | number | boolean;
}

/**
 * ABAC evaluation context — extends AuthorizationContext with rich attributes.
 */
export interface AbacContext extends AuthorizationContext {
  /** Attributes of the requesting subject (user/agent). */
  subjectAttributes?:      AccessAttribute[];
  /** Attributes of the target resource instance. */
  resourceAttributes?:     AccessAttribute[];
  /** Environmental attributes (time, IP, device, etc.). */
  environmentAttributes?:  AccessAttribute[];
}

/**
 * ABAC policy condition — a single evaluable predicate.
 */
export interface AbacCondition {
  attribute: string;
  operator:  "eq" | "neq" | "gt" | "lt" | "in" | "contains" | "startsWith";
  value:     string | number | boolean | Array<string | number>;
}

/**
 * ABAC policy rule — a set of conditions that grant or deny a permission.
 */
export interface AbacPolicyRule {
  id:           string;
  description:  string;
  permissionId: PermissionId;
  effect:       "ALLOW" | "DENY";
  conditions:   AbacCondition[];
  priority:     number;
}

/**
 * IAbacEngine — contract for future ABAC evaluation engine.
 * Implement in AGENTIK-SECURITY-ABAC-01.
 */
export interface IAbacEngine {
  /** Evaluate an ABAC policy rule against a context. */
  evaluate(ctx: AbacContext): AccessResult;
  /** Register a new policy rule. */
  addRule(rule: AbacPolicyRule): void;
  /** Get all active rules for a permission. */
  getRulesForPermission(permissionId: PermissionId): AbacPolicyRule[];
}

// ── Zero Trust Policy ─────────────────────────────────────────────────────────

/**
 * Zero Trust signal — contextual signal used to compute trust score.
 */
export interface ZeroTrustSignal {
  type:      "DEVICE_TRUST" | "NETWORK_LOCATION" | "TIME_OF_DAY" | "BEHAVIOR_ANOMALY" | "MFA_STATUS";
  score:     number; // 0.0 (untrusted) to 1.0 (fully trusted)
  detail?:   string;
  capturedAt: string;
}

/**
 * Zero Trust evaluation result.
 */
export interface ZeroTrustResult {
  trustScore:      number; // aggregate 0.0–1.0
  isTrusted:       boolean;
  signals:         ZeroTrustSignal[];
  reason:          string;
  evaluatedAt:     string;
}

/**
 * IZeroTrustEvaluator — contract for future Zero Trust evaluation.
 * Implement in AGENTIK-SECURITY-ZERO-TRUST-01.
 */
export interface IZeroTrustEvaluator {
  /** Compute a trust score from available signals. */
  evaluate(signals: ZeroTrustSignal[]): ZeroTrustResult;
  /** Determine the minimum trust score required for a permission. */
  getRequiredTrustScore(permissionId: PermissionId): number;
  /** Combined RBAC + Zero Trust access check. */
  checkWithTrust(ctx: AuthorizationContext, signals: ZeroTrustSignal[]): AccessResult;
}

// ── Dynamic Policy Engine ─────────────────────────────────────────────────────

/**
 * PolicyEffect — outcome of a dynamic policy evaluation.
 */
export type PolicyEffect = "ALLOW" | "DENY" | "REQUIRE_MFA" | "REQUIRE_APPROVAL";

/**
 * DynamicPolicy — a tenant-defined policy that overrides or augments static RBAC.
 */
export interface DynamicPolicy {
  id:           string;
  orgSlug:      string;
  name:         string;
  description:  string;
  permissionId: PermissionId;
  effect:       PolicyEffect;
  conditions?:  AbacCondition[];
  priority:     number;
  createdAt:    string;
  expiresAt?:   string;
  isActive:     boolean;
}

/**
 * IDynamicPolicyEngine — contract for future dynamic policy evaluation.
 * Implement in AGENTIK-SECURITY-POLICY-ENGINE-01.
 */
export interface IDynamicPolicyEngine {
  /** Evaluate a user's access considering dynamic policies. */
  evaluate(ctx: AuthorizationContext): AccessResult;
  /** Add a dynamic policy for a tenant. */
  addPolicy(policy: DynamicPolicy): void;
  /** Get all active policies for a tenant. */
  getPoliciesForTenant(orgSlug: string): DynamicPolicy[];
  /** Deactivate a policy by ID. */
  deactivatePolicy(orgSlug: string, policyId: string): void;
}

// ── Policy Simulation ─────────────────────────────────────────────────────────

/**
 * PolicySimulationRequest — input for simulating an access check.
 */
export interface PolicySimulationRequest {
  userId:       string;
  orgSlug:      string;
  roles:        RoleId[];
  permissionId: PermissionId;
  attributes?:  AccessAttribute[];
  scenarios?:   string[];
}

/**
 * PolicySimulationResult — output of a simulated access check.
 */
export interface PolicySimulationResult {
  request:       PolicySimulationRequest;
  result:        AccessResult;
  explanation:   string[];
  alternativeRoles?: Array<{ roleId: RoleId; wouldAllow: boolean }>;
  simulatedAt:   string;
}

/**
 * IPolicySimulator — contract for future policy simulation tool.
 * Implement in AGENTIK-SECURITY-POLICY-SIM-01.
 */
export interface IPolicySimulator {
  /** Simulate an access check without writing to the real store. */
  simulate(request: PolicySimulationRequest): PolicySimulationResult;
  /** Explain why a user would or would not have access. */
  explain(ctx: AuthorizationContext): string[];
  /** List which roles would grant a given permission. */
  findGrantingRoles(permissionId: PermissionId): RoleId[];
}

// ── Compatibility Registry ────────────────────────────────────────────────────

/**
 * RbacCompatibilityCapabilities — catalog of future sprint capabilities.
 * Used by operational dashboards to show RBAC roadmap status.
 */
export const RBAC_FUTURE_CAPABILITIES = [
  {
    id:          "ABAC",
    name:        "Attribute-Based Access Control",
    sprint:      "AGENTIK-SECURITY-ABAC-01",
    status:      "PLANNED" as const,
    description: "Condition-based access rules using subject, resource, and environment attributes.",
  },
  {
    id:          "ZERO_TRUST",
    name:        "Zero Trust Policy Evaluation",
    sprint:      "AGENTIK-SECURITY-ZERO-TRUST-01",
    status:      "PLANNED" as const,
    description: "Trust score computation from device posture, network, behavior, and MFA signals.",
  },
  {
    id:          "DYNAMIC_POLICY",
    name:        "Dynamic Tenant Policy Engine",
    sprint:      "AGENTIK-SECURITY-POLICY-ENGINE-01",
    status:      "PLANNED" as const,
    description: "Tenant-configurable policies that extend static RBAC with time-bound or conditional rules.",
  },
  {
    id:          "POLICY_SIMULATION",
    name:        "Policy Simulation Tool",
    sprint:      "AGENTIK-SECURITY-POLICY-SIM-01",
    status:      "PLANNED" as const,
    description: "What-if simulator for testing access scenarios before deploying policy changes.",
  },
] as const;

export type FutureCapabilityId = typeof RBAC_FUTURE_CAPABILITIES[number]["id"];
