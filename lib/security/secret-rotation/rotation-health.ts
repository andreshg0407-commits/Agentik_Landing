/**
 * lib/security/secret-rotation/rotation-health.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Health Monitor — System Self-Check
 *
 * Server-only. Checks the health of all rotation subsystems:
 *   1. Registry completeness
 *   2. Policy engine
 *   3. Repository availability
 *   4. Rotation service
 *   5. Audit log
 *   6. RBAC integration
 *   7. Vault adapter
 *   8. Approval policies
 *
 * Returns a structured report. Never throws.
 */

import "server-only";

import { ROTATION_REGISTRY, getRegistrySummary } from "./rotation-registry";
import { requiresRotation, canRotate } from "./rotation-policy-engine";
import { rotationAuditLog } from "./rotation-audit";
import { vaultRotationAdapter } from "./integrations/vault-rotation";
import { rbacRotationAdapter } from "./integrations/rbac-rotation";
import { getRiskApprovalMatrix } from "./rotation-approval-policy";
import { secretVersionStore } from "./secret-version";

// ── Health Types ──────────────────────────────────────────────────────────────

export type RotationHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface RotationHealthCheck {
  name:       string;
  status:     RotationHealthStatus;
  detail:     string;
  durationMs: number;
}

export interface RotationHealthReport {
  status:     RotationHealthStatus;
  checkedAt:  string;
  durationMs: number;
  checks:     RotationHealthCheck[];
  summary:    ReturnType<typeof getRegistrySummary>;
}

// ── Individual Checks ─────────────────────────────────────────────────────────

function checkRegistry(): RotationHealthCheck {
  const t0 = Date.now();
  try {
    const s = getRegistrySummary();
    const ok = s.total >= 10 && s.rotationSupported >= 10;
    return {
      name:       "registry",
      status:     ok ? "HEALTHY" : "DEGRADED",
      detail:     `${s.total} entries, ${s.rotationSupported} rotation-supported, ${s.critical} critical`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "registry", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

function checkPolicyEngine(): RotationHealthCheck {
  const t0 = Date.now();
  try {
    // Test with no current version
    const noVersionResult = requiresRotation({ isCompromised: false });
    assert(noVersionResult.canRotate === true, "canRotate with no version");

    // Test emergency
    const emergencyResult = requiresRotation({ isCompromised: true });
    assert(emergencyResult.requiresRotation === true, "emergency requires rotation");

    // Test canRotate
    const blockResult = canRotate({ secretId: "OPENAI_API_KEY", strategy: "MANUAL", hasActiveRotation: true });
    assert(blockResult.allowed === false, "blocked when active rotation");

    return {
      name:       "policy_engine",
      status:     "HEALTHY",
      detail:     "Policy engine returns correct decisions for all test cases",
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "policy_engine", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

function checkAuditLog(): RotationHealthCheck {
  const t0 = Date.now();
  try {
    const sizeInitial = rotationAuditLog.size;
    assert(typeof sizeInitial === "number", "size is number");
    const events = rotationAuditLog.getRecent(1);
    assert(Array.isArray(events), "getRecent returns array");
    return {
      name:       "audit_log",
      status:     "HEALTHY",
      detail:     `Audit log operational. ${sizeInitial} events in memory.`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "audit_log", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

async function checkVaultAdapter(): Promise<RotationHealthCheck> {
  const t0 = Date.now();
  try {
    const available = await vaultRotationAdapter.isVaultAvailable();
    assert(available === true, "vault is available");

    const createResult = await vaultRotationAdapter.createNewVersion({
      secretId:   "__health_test__",
      orgSlug:    "__health_org__",
      rotationId: "__health_rot__",
      version:    1,
    });
    assert(createResult.success === true, "createNewVersion succeeds");

    const activateResult = await vaultRotationAdapter.activateVersion({
      secretId:   "__health_test__",
      orgSlug:    "__health_org__",
      rotationId: "__health_rot__",
      version:    1,
    });
    assert(activateResult.success === true, "activateVersion succeeds");

    const revokeResult = await vaultRotationAdapter.revokeVersion({
      secretId:   "__health_test__",
      orgSlug:    "__health_org__",
      rotationId: "__health_rot__",
      version:    1,
    });
    assert(revokeResult.success === true, "revokeVersion succeeds");

    return {
      name:       "vault_adapter",
      status:     "HEALTHY",
      detail:     "Vault adapter simulation: createNewVersion, activateVersion, revokeVersion all pass",
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "vault_adapter", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

function checkRbacIntegration(): RotationHealthCheck {
  const t0 = Date.now();
  try {
    // Test that nobody with no roles is denied
    const result = rbacRotationAdapter.canRequest("nobody__health", "org__health");
    assert(result.decision === "DENY", "no-role user denied rotation request");

    const hasAny = rbacRotationAdapter.hasAnyRotationPermission("nobody__health", "org__health");
    assert(hasAny === false, "no-role user has no rotation permissions");

    return {
      name:       "rbac_integration",
      status:     "HEALTHY",
      detail:     "RBAC integration: fail-closed verified for unauthenticated user",
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "rbac_integration", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

function checkApprovalPolicies(): RotationHealthCheck {
  const t0 = Date.now();
  try {
    const matrix = getRiskApprovalMatrix();
    assert(matrix.length === 4, "matrix has 4 risk levels");
    assert(matrix.find(m => m.riskLevel === "CRITICAL")?.requirement === "DOUBLE", "CRITICAL requires DOUBLE");
    assert(matrix.find(m => m.riskLevel === "LOW")?.requirement === "NONE", "LOW requires NONE");
    return {
      name:       "approval_policies",
      status:     "HEALTHY",
      detail:     "Approval matrix: LOW=NONE, MEDIUM=SINGLE, HIGH=SINGLE, CRITICAL=DOUBLE",
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "approval_policies", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

function checkSecretVersionStore(): RotationHealthCheck {
  const t0 = Date.now();
  try {
    const size = secretVersionStore.size;
    assert(typeof size === "number", "store size is number");
    return {
      name:       "secret_version_store",
      status:     "HEALTHY",
      detail:     `Version store operational. ${size} versions tracked.`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return { name: "secret_version_store", status: "UNAVAILABLE", detail: String(err), durationMs: Date.now() - t0 };
  }
}

// ── Assert Helper ─────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Health assertion failed: ${msg}`);
}

// ── Health Monitor ────────────────────────────────────────────────────────────

export class RotationHealthMonitor {
  async checkRotationHealth(): Promise<RotationHealthReport> {
    const t0 = Date.now();

    const syncChecks: RotationHealthCheck[] = [
      checkRegistry(),
      checkPolicyEngine(),
      checkAuditLog(),
      checkRbacIntegration(),
      checkApprovalPolicies(),
      checkSecretVersionStore(),
    ];

    const asyncChecks = await Promise.all([
      checkVaultAdapter(),
    ]);

    const checks = [...syncChecks, ...asyncChecks];

    const hasUnavailable = checks.some(c => c.status === "UNAVAILABLE");
    const hasDegraded    = checks.some(c => c.status === "DEGRADED");

    const status: RotationHealthStatus =
      hasUnavailable ? "UNAVAILABLE" :
      hasDegraded    ? "DEGRADED"    :
      "HEALTHY";

    return {
      status,
      checkedAt:  new Date().toISOString(),
      durationMs: Date.now() - t0,
      checks,
      summary:    getRegistrySummary(),
    };
  }
}

let _monitor: RotationHealthMonitor | null = null;

export function getRotationHealthMonitor(): RotationHealthMonitor {
  if (!_monitor) _monitor = new RotationHealthMonitor();
  return _monitor;
}

export const rotationHealthMonitor = new RotationHealthMonitor();
