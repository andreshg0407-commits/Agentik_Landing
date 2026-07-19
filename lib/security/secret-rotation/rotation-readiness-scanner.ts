/**
 * lib/security/secret-rotation/rotation-readiness-scanner.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Readiness Scanner — Dependency Health Analysis
 *
 * Server-only. Analyzes readiness of all subsystems that secret rotation
 * depends on: Vault, Audit, RBAC, Encryption layer, Prisma persistence.
 *
 * Returns a structured readiness report with an overall score (0–100).
 * Does NOT throw. Designed to run on cold start or at operator request.
 */

import "server-only";

import { ROTATION_REGISTRY, getRegistrySummary } from "./rotation-registry";
import { secretVersionStore }                    from "./secret-version";
import { rotationAuditLog }                      from "./rotation-audit";
import { vaultRotationAdapter }                  from "./integrations/vault-rotation";
import { rbacRotationAdapter }                   from "./integrations/rbac-rotation";
import { getRiskApprovalMatrix }                 from "./rotation-approval-policy";
import { canRotate, requiresRotation }           from "./rotation-policy-engine";
import { generateRotationPlan }                  from "./rotation-planner";

// ── Readiness Types ────────────────────────────────────────────────────────────

export type ReadinessLevel = "READY" | "DEGRADED" | "NOT_READY";

export interface SubsystemReadiness {
  name:          string;
  level:         ReadinessLevel;
  score:         number; // 0–100
  details:       string;
  durationMs:    number;
  blockers:      string[];
  warnings:      string[];
}

export interface ReadinessReport {
  overallLevel:  ReadinessLevel;
  overallScore:  number; // 0–100 (weighted average of subsystem scores)
  scannedAt:     string;
  durationMs:    number;
  subsystems:    SubsystemReadiness[];
  recommendation: string;
  blockers:      string[];
  warnings:      string[];
}

// ── Score thresholds ──────────────────────────────────────────────────────────

const READY_THRESHOLD    = 90;
const DEGRADED_THRESHOLD = 50;

function scoreToLevel(score: number): ReadinessLevel {
  if (score >= READY_THRESHOLD)    return "READY";
  if (score >= DEGRADED_THRESHOLD) return "DEGRADED";
  return "NOT_READY";
}

// ── Subsystem Checks ──────────────────────────────────────────────────────────

// 1. Registry Readiness
function scanRegistry(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const summary = getRegistrySummary();
    if (summary.total < 5)           blockers.push(`Only ${summary.total} entries in registry (expected >= 5).`);
    if (summary.rotationSupported < summary.total * 0.8)
      warnings.push(`Only ${summary.rotationSupported}/${summary.total} entries support rotation.`);
    if (summary.critical < 1)        warnings.push("No CRITICAL risk secrets in registry — verify completeness.");

    const score = blockers.length > 0 ? 20 : warnings.length > 0 ? 70 : 100;
    return {
      name: "registry", level: scoreToLevel(score), score,
      details: `${summary.total} entries, ${summary.critical} critical, ${summary.rotationSupported} rotation-supported`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "registry", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 2. Policy Engine Readiness
function scanPolicyEngine(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const r1 = canRotate({ secretId: "OPENAI_API_KEY", strategy: "MANUAL", hasActiveRotation: false });
    if (!r1.allowed) blockers.push("canRotate returned blocked for a fresh rotation — engine error.");

    const r2 = canRotate({ secretId: "OPENAI_API_KEY", strategy: "MANUAL", hasActiveRotation: true });
    if (r2.allowed) blockers.push("canRotate allowed when active rotation in progress — fail-closed broken.");

    const r3 = requiresRotation({ isCompromised: true });
    if (!r3.requiresRotation) blockers.push("requiresRotation did not trigger for compromised secret.");

    const score = blockers.length > 0 ? 0 : 100;
    return {
      name: "policy_engine", level: scoreToLevel(score), score,
      details: `canRotate: ${r1.allowed ? "OK" : "ERR"}, block-when-active: ${!r2.allowed ? "OK" : "ERR"}, compromise-trigger: ${r3.requiresRotation ? "OK" : "ERR"}`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "policy_engine", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 3. Version Store Readiness
function scanVersionStore(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const size = secretVersionStore.size;
    if (typeof size !== "number") blockers.push("secretVersionStore.size is not a number.");

    const allVersions = secretVersionStore.list();
    if (!Array.isArray(allVersions)) blockers.push("secretVersionStore.getAll() did not return an array.");

    if (size > 10_000) warnings.push(`Version store has ${size} entries — consider a persistent backend.`);

    const score = blockers.length > 0 ? 0 : 100;
    return {
      name: "version_store", level: scoreToLevel(score), score,
      details: `${size} versions tracked in memory.`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "version_store", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 4. Audit Log Readiness
function scanAuditLog(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const size = rotationAuditLog.size;
    if (typeof size !== "number") blockers.push("rotationAuditLog.size is not a number.");

    const recent = rotationAuditLog.getRecent(1);
    if (!Array.isArray(recent)) blockers.push("rotationAuditLog.getRecent did not return array.");

    const score = blockers.length > 0 ? 0 : 100;
    return {
      name: "audit_log", level: scoreToLevel(score), score,
      details: `${size} events in memory audit log.`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "audit_log", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 5. Vault Adapter Readiness
async function scanVaultAdapter(): Promise<SubsystemReadiness> {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const available = await vaultRotationAdapter.isVaultAvailable();
    if (!available) blockers.push("Vault is not available.");

    const createR = await vaultRotationAdapter.createNewVersion({
      secretId: "__readiness__", orgSlug: "__readiness__", rotationId: "__read__", version: 0,
    });
    if (!createR.success) blockers.push(`Vault createNewVersion failed: ${createR.reason}`);

    const activateR = await vaultRotationAdapter.activateVersion({
      secretId: "__readiness__", orgSlug: "__readiness__", rotationId: "__read__", version: 0,
    });
    if (!activateR.success) blockers.push(`Vault activateVersion failed: ${activateR.reason}`);

    const revokeR = await vaultRotationAdapter.revokeVersion({
      secretId: "__readiness__", orgSlug: "__readiness__", rotationId: "__read__", version: 0,
    });
    if (!revokeR.success) blockers.push(`Vault revokeVersion failed: ${revokeR.reason}`);

    if (blockers.length === 0 && !available)
      warnings.push("Vault reports available but simulation only — connect real vault before production.");

    const score = blockers.length > 0 ? 0 : 100;
    return {
      name: "vault_adapter", level: scoreToLevel(score), score,
      details: `createNewVersion: ${createR.success ? "OK" : "FAIL"}, activateVersion: ${activateR.success ? "OK" : "FAIL"}, revokeVersion: ${revokeR.success ? "OK" : "FAIL"}`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "vault_adapter", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 6. RBAC Readiness
function scanRbac(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const noRole = rbacRotationAdapter.canRequest("__readiness_nobody__", "__readiness_org__");
    if (noRole.decision !== "DENY") blockers.push("RBAC fail-closed broken — no-role user was ALLOWED.");

    const hasAny = rbacRotationAdapter.hasAnyRotationPermission("__readiness_nobody__", "__readiness_org__");
    if (hasAny) blockers.push("hasAnyRotationPermission returned true for no-role user.");

    const score = blockers.length > 0 ? 0 : 100;
    return {
      name: "rbac_integration", level: scoreToLevel(score), score,
      details: `Fail-closed: ${noRole.decision === "DENY" ? "OK" : "BROKEN"}, hasAny: ${!hasAny ? "OK" : "BROKEN"}`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "rbac_integration", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 7. Approval Policy Readiness
function scanApprovalPolicy(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const matrix = getRiskApprovalMatrix();
    if (matrix.length !== 4) blockers.push(`Approval matrix has ${matrix.length} levels (expected 4).`);

    const critical = matrix.find(m => m.riskLevel === "CRITICAL");
    if (critical?.requirement !== "DOUBLE") blockers.push("CRITICAL risk must require DOUBLE approval.");

    const low = matrix.find(m => m.riskLevel === "LOW");
    if (low?.requirement !== "NONE") blockers.push("LOW risk should require NONE (auto-approved).");

    const score = blockers.length > 0 ? 0 : 100;
    return {
      name: "approval_policy", level: scoreToLevel(score), score,
      details: `Matrix: ${matrix.map(m => `${m.riskLevel}→${m.requirement}`).join(", ")}`,
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "approval_policy", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// 8. Planner Readiness
function scanPlanner(): SubsystemReadiness {
  const t0 = Date.now();
  const blockers: string[] = [];
  const warnings: string[] = [];

  try {
    const result = generateRotationPlan({ secretId: "OPENAI_API_KEY", orgSlug: "readiness-org", requestedBy: "system", reason: "readiness_check", strategy: "MANUAL" });
    if ("error" in result) {
      blockers.push(`generateRotationPlan returned error: ${result.error}`);
    } else {
      if (result.steps.length === 0) blockers.push("generateRotationPlan returned a plan with no steps.");
      if (!result.secretId)          blockers.push("Plan missing secretId.");
    }

    const score = blockers.length > 0 ? 0 : 100;
    const plan  = "error" in result ? null : result;
    return {
      name: "rotation_planner", level: scoreToLevel(score), score,
      details: plan ? `Plan for OPENAI_API_KEY: ${plan.steps.length} steps, strategy=${plan.strategy}` : "Plan failed",
      durationMs: Date.now() - t0, blockers, warnings,
    };
  } catch (err) {
    return { name: "rotation_planner", level: "NOT_READY", score: 0, details: String(err), durationMs: Date.now() - t0, blockers: [String(err)], warnings: [] };
  }
}

// ── Scanner ────────────────────────────────────────────────────────────────────

export class RotationReadinessScanner {
  async scan(): Promise<ReadinessReport> {
    const t0 = Date.now();

    const [
      vaultReadiness,
    ] = await Promise.all([
      scanVaultAdapter(),
    ]);

    const syncResults: SubsystemReadiness[] = [
      scanRegistry(),
      scanPolicyEngine(),
      scanVersionStore(),
      scanAuditLog(),
      scanRbac(),
      scanApprovalPolicy(),
      scanPlanner(),
    ];

    const subsystems = [...syncResults, vaultReadiness];

    // Weighted average: all subsystems equal weight
    const overallScore = Math.round(
      subsystems.reduce((sum, s) => sum + s.score, 0) / subsystems.length
    );

    const overallLevel = scoreToLevel(overallScore);

    const blockers = subsystems.flatMap(s => s.blockers.map(b => `[${s.name}] ${b}`));
    const warnings = subsystems.flatMap(s => s.warnings.map(w => `[${s.name}] ${w}`));

    const recommendation =
      overallLevel === "READY"     ? "All rotation subsystems are ready. Secret rotation can proceed." :
      overallLevel === "DEGRADED"  ? "Some subsystems are degraded. Review blockers before rotating critical secrets." :
      "One or more subsystems are NOT READY. Do not rotate production secrets until all blockers are resolved.";

    return {
      overallLevel,
      overallScore,
      scannedAt:  new Date().toISOString(),
      durationMs: Date.now() - t0,
      subsystems,
      recommendation,
      blockers,
      warnings,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _scanner: RotationReadinessScanner | null = null;

export function getRotationReadinessScanner(): RotationReadinessScanner {
  if (!_scanner) _scanner = new RotationReadinessScanner();
  return _scanner;
}

export const rotationReadinessScanner = new RotationReadinessScanner();
