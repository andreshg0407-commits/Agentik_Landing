/**
 * lib/security/zero-trust/zero-trust-policy-engine.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust Policy Engine — Core Access Evaluation
 *
 * Server-only. Uses RBAC engine for role-based authorization.
 *
 * Evaluation flow:
 *   1. Validate tenant isolation (fail immediately if wrong org)
 *   2. Determine resource risk level
 *   3. Compute trust score
 *   4. Evaluate RBAC permission (for USER subjects)
 *   5. Apply action multiplier
 *   6. Determine final decision (DENY/ALLOW/CHALLENGE)
 *   7. Record required approvals for high-risk actions
 *
 * Fail-closed: if ANY step fails to evaluate, decision = DENY.
 */

import "server-only";

import type {
  ZeroTrustContext,
  ZeroTrustEvaluation,
  ZeroTrustDecision,
  ZeroTrustRiskLevel,
  ZeroTrustResourceType,
  ZeroTrustAction,
  TrustScoreInput,
} from "./zero-trust-types";
import {
  RESOURCE_RISK_LEVELS,
  ACTION_RISK_MULTIPLIERS,
  TRUST_THRESHOLDS,
} from "./zero-trust-types";
import { calculateTrustScore, isTrustedForRisk } from "./trust-score-engine";
import { verifyTenantIsolation } from "./tenant-isolation";
import type { PermissionId }     from "../rbac/rbac-types";
import { evaluateAccess }        from "../rbac/rbac-engine";
import { userRoleAssignmentStore } from "../rbac/user-role-assignment";

// ── Permission Map ─────────────────────────────────────────────────────────────

/**
 * Maps (resourceType, action) → PermissionId for RBAC evaluation.
 * If no mapping exists, the action is NOT permitted (fail-closed).
 */
type PermissionMapKey = `${ZeroTrustResourceType}:${ZeroTrustAction}`;

const PERMISSION_MAP: Partial<Record<PermissionMapKey, PermissionId>> = {
  "FINANCIAL_DATA:READ":     "FINANCE_VIEW",
  "FINANCIAL_DATA:WRITE":    "FINANCE_CREATE",
  "FINANCIAL_DATA:DELETE":   "FINANCE_DELETE",
  "FINANCIAL_DATA:EXPORT":   "FINANCE_EXPORT",
  "FINANCIAL_DATA:ADMIN":    "FINANCE_ADMIN",
  "FINANCIAL_DATA:APPROVE":  "FINANCE_ADMIN",

  "CUSTOMER_DATA:READ":      "COMMERCIAL_VIEW",
  "CUSTOMER_DATA:WRITE":     "COMMERCIAL_CREATE",
  "CUSTOMER_DATA:DELETE":    "COMMERCIAL_DELETE",
  "CUSTOMER_DATA:EXPORT":    "COMMERCIAL_EXPORT",
  "CUSTOMER_DATA:ADMIN":     "COMMERCIAL_ADMIN",

  "MARKETING_DATA:READ":     "MARKETING_VIEW",
  "MARKETING_DATA:WRITE":    "MARKETING_CREATE",
  "MARKETING_DATA:ADMIN":    "MARKETING_ADMIN",

  "COMMERCIAL_DATA:READ":    "COMMERCIAL_VIEW",
  "COMMERCIAL_DATA:WRITE":   "COMMERCIAL_CREATE",
  "COMMERCIAL_DATA:EXPORT":  "COMMERCIAL_EXPORT",
  "COMMERCIAL_DATA:ADMIN":   "COMMERCIAL_ADMIN",

  "TENANT_SETTINGS:READ":    "SETTINGS_VIEW",
  "TENANT_SETTINGS:WRITE":   "SETTINGS_UPDATE",
  "TENANT_SETTINGS:ADMIN":   "SETTINGS_ADMIN",
  "TENANT_SETTINGS:MANAGE_USERS": "TENANT_ADMIN",

  "SECRET:READ":             "VAULT_READ",
  "SECRET:WRITE":            "VAULT_WRITE",
  "SECRET:DELETE":           "VAULT_ADMIN",
  "SECRET:ROTATE_SECRET":    "VAULT_ADMIN",
  "SECRET:ADMIN":            "VAULT_ADMIN",

  "VAULT:READ":              "VAULT_READ",
  "VAULT:WRITE":             "VAULT_WRITE",
  "VAULT:ROTATE_SECRET":     "VAULT_ADMIN",
  "VAULT:ADMIN":             "VAULT_ADMIN",

  "INTEGRATION:READ":        "INTEGRATIONS_VIEW",
  "INTEGRATION:WRITE":       "INTEGRATIONS_MANAGE",
  "INTEGRATION:ADMIN":       "INTEGRATIONS_ADMIN",

  "AUDIT_LOG:READ":          "AUDIT_VIEW",
  "AUDIT_LOG:EXPORT":        "AUDIT_EXPORT",
  "AUDIT_LOG:ADMIN":         "AUDIT_ADMIN",

  "AI_MEMORY:READ":          "MEMORY_READ",
  "AI_MEMORY:WRITE":         "MEMORY_WRITE",
  "AI_MEMORY:ADMIN":         "MEMORY_ADMIN",

  "AI_PLAYBOOK:READ":        "PLAYBOOK_VIEW",
  "AI_PLAYBOOK:WRITE":       "PLAYBOOK_MANAGE",
  "AI_PLAYBOOK:ADMIN":       "PLAYBOOK_ADMIN",

  "AI_EXECUTIVE_BRAIN:READ": "EXECUTIVE_VIEW",
  "AI_EXECUTIVE_BRAIN:WRITE":"EXECUTIVE_ADMIN",
  "AI_EXECUTIVE_BRAIN:ADMIN":"EXECUTIVE_ADMIN",

  "AI_AGENT:EXECUTE":        "COPILOT_EXECUTE",
  "AI_AGENT:ADMIN":          "COPILOT_ADMIN",

  "ENCRYPTION_KEY:READ":     "ENCRYPTION_VIEW",
  "ENCRYPTION_KEY:ADMIN":    "ENCRYPTION_ADMIN",

  "USER_IDENTITY:READ":      "SETTINGS_VIEW",
  "USER_IDENTITY:WRITE":     "TENANT_ADMIN",
  "USER_IDENTITY:MANAGE_USERS": "TENANT_ADMIN",
  "USER_IDENTITY:ADMIN":     "TENANT_ADMIN",
};

// ── Required Approvals ────────────────────────────────────────────────────────

const APPROVAL_REQUIREMENTS: Partial<Record<PermissionMapKey, string[]>> = {
  "SECRET:ROTATE_SECRET":      ["SECURITY_ADMIN"],
  "VAULT:ROTATE_SECRET":       ["SECURITY_ADMIN"],
  "VAULT:ADMIN":               ["SECURITY_ADMIN"],
  "SECRET:DELETE":             ["SECURITY_ADMIN", "ORG_ADMIN"],
  "TENANT_SETTINGS:MANAGE_USERS": ["ORG_ADMIN"],
  "AI_EXECUTIVE_BRAIN:WRITE":  ["ORG_ADMIN"],
  "FINANCIAL_DATA:DELETE":     ["FINANCE_ADMIN"],
  "ENCRYPTION_KEY:ADMIN":      ["SECURITY_ADMIN", "ORG_ADMIN"],
};

// ── CHALLENGE Threshold ────────────────────────────────────────────────────────

/**
 * If trust score is within this range above the minimum threshold,
 * return CHALLENGE instead of DENY (step-up auth required).
 */
const CHALLENGE_BAND = 10;

// ── evaluateZeroTrust ─────────────────────────────────────────────────────────

/**
 * evaluateZeroTrust — the central Zero Trust decision function.
 *
 * Never throws. Always returns a decision.
 * Fail-closed: any evaluation error → DENY + CRITICAL.
 */
export function evaluateZeroTrust(context: ZeroTrustContext): ZeroTrustEvaluation {
  const t0      = Date.now();
  const reasons: string[] = [];

  try {
    // ── Step 1: Tenant isolation ───────────────────────────────────────────
    const isolation = verifyTenantIsolation(context);
    if (!isolation.isolated) {
      return denyResult(context, "CRITICAL", 0, isolation.reasons, [], t0);
    }
    reasons.push("tenant_isolated");

    // ── Step 2: Subject validation ────────────────────────────────────────
    if (!hasValidSubject(context)) {
      reasons.push("subject_identity_missing");
      return denyResult(context, "CRITICAL", 0, reasons, [], t0);
    }

    // ── Step 3: Resource risk level ───────────────────────────────────────
    const baseRisk     = RESOURCE_RISK_LEVELS[context.resourceType] ?? "CRITICAL";
    const multiplier   = ACTION_RISK_MULTIPLIERS[context.action]    ?? 2.0;
    const riskLevel    = elevateRisk(baseRisk, multiplier);

    // ── Step 4: Trust score ───────────────────────────────────────────────
    const scoreInput   = buildScoreInput(context);
    const scoreResult  = calculateTrustScore(scoreInput);
    const threshold    = TRUST_THRESHOLDS[riskLevel];

    reasons.push(`trust_score:${scoreResult.score}`);

    // ── Step 5: RBAC permission check (for USER subjects) ─────────────────
    const permKey      = `${context.resourceType}:${context.action}` as PermissionMapKey;
    const permissionId = PERMISSION_MAP[permKey];

    if (context.subjectType === "USER") {
      if (!context.userId) {
        return denyResult(context, "CRITICAL", scoreResult.score, ["user_id_missing"], [], t0);
      }
      if (!permissionId) {
        reasons.push(`no_permission_mapped_for:${permKey}`);
        return denyResult(context, riskLevel, scoreResult.score, reasons, [], t0);
      }
      const rbacResult = evaluateAccess({
        userId:       context.userId,
        orgSlug:      context.orgSlug,
        permissionId: permissionId as PermissionId,
      });
      if (rbacResult.decision !== "ALLOW") {
        reasons.push(`rbac_denied:${rbacResult.reason}`);
        return denyResult(context, riskLevel, scoreResult.score, reasons, [], t0);
      }
      reasons.push(`rbac_allowed:${rbacResult.grantingRole ?? "super_admin"}`);
    }

    // ── Step 6: Trust score threshold ─────────────────────────────────────
    if (!isTrustedForRisk(scoreResult.score, riskLevel)) {
      const decision: ZeroTrustDecision =
        scoreResult.score >= threshold - CHALLENGE_BAND ? "CHALLENGE" : "DENY";
      reasons.push(`score_below_threshold: score=${scoreResult.score} required=${threshold}`);
      return {
        decision,
        riskLevel,
        score:             scoreResult.score,
        reasons,
        requiredApprovals: [],
        auditRequired:     true,
        evaluatedAt:       new Date().toISOString(),
        durationMs:        Date.now() - t0,
        context:           stripMetadata(context),
      };
    }

    // ── Step 7: Required approvals ─────────────────────────────────────────
    const requiredApprovals = APPROVAL_REQUIREMENTS[permKey] ?? [];

    // ── Step 8: ALLOW ─────────────────────────────────────────────────────
    reasons.push("all_checks_passed");

    return {
      decision:          "ALLOW",
      riskLevel,
      score:             scoreResult.score,
      reasons,
      requiredApprovals,
      auditRequired:     riskLevel !== "LOW",
      evaluatedAt:       new Date().toISOString(),
      durationMs:        Date.now() - t0,
      context:           stripMetadata(context),
    };

  } catch {
    // Fail-closed: any error → DENY
    return denyResult(context, "CRITICAL", 0, ["evaluation_error_fail_closed"], [], t0);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function denyResult(
  context:           ZeroTrustContext,
  riskLevel:         ZeroTrustRiskLevel,
  score:             number,
  reasons:           string[],
  requiredApprovals: string[],
  t0:                number,
): ZeroTrustEvaluation {
  return {
    decision:          "DENY",
    riskLevel,
    score,
    reasons,
    requiredApprovals,
    auditRequired:     true,
    evaluatedAt:       new Date().toISOString(),
    durationMs:        Date.now() - t0,
    context:           stripMetadata(context),
  };
}

function hasValidSubject(ctx: ZeroTrustContext): boolean {
  switch (ctx.subjectType) {
    case "USER":            return !!ctx.userId;
    case "AGENT":           return !!ctx.agentId;
    case "INTEGRATION":     return !!ctx.integrationId;
    case "API_KEY":         return !!ctx.apiKeyId;
    case "SERVICE_ACCOUNT": return true; // system-issued, no individual ID
    case "SYSTEM":          return true;
    default:                return false;
  }
}

function buildScoreInput(ctx: ZeroTrustContext): TrustScoreInput {
  const hasValidRole = ctx.subjectType === "USER"
    ? ctx.userId != null && userRoleAssignmentStore.getRolesForUser(ctx.userId, ctx.orgSlug).length > 0
    : ctx.subjectType === "SYSTEM" || ctx.subjectType === "SERVICE_ACCOUNT";

  return {
    hasValidRole,
    hasValidSession:     !!ctx.sessionId,
    hasValidTenant:      !!ctx.orgSlug,
    mfaVerified:         ctx.mfaVerified  ?? false,
    isKnownIp:           !!ctx.ipAddress,
    isKnownDevice:       !!ctx.deviceId,
    hasRecentActivity:   true,  // assume true unless anomaly service signals otherwise
    noSuspiciousSignals: true,  // assume true unless anomaly service signals otherwise
    subjectType:         ctx.subjectType,
  };
}

function elevateRisk(base: ZeroTrustRiskLevel, multiplier: number): ZeroTrustRiskLevel {
  const LEVELS: ZeroTrustRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const idx = LEVELS.indexOf(base);
  const elevated = Math.min(LEVELS.length - 1, Math.floor(idx + (multiplier - 1)));
  return LEVELS[elevated];
}

function stripMetadata(ctx: ZeroTrustContext): Omit<ZeroTrustContext, "metadata"> {
  const { metadata: _m, ...rest } = ctx;
  return rest;
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * isAllowed — quick boolean check.
 */
export function isZeroTrustAllowed(context: ZeroTrustContext): boolean {
  return evaluateZeroTrust(context).decision === "ALLOW";
}

/**
 * assertZeroTrust — throw if access is denied.
 */
export function assertZeroTrust(context: ZeroTrustContext): ZeroTrustEvaluation {
  const evaluation = evaluateZeroTrust(context);
  if (evaluation.decision === "DENY") {
    throw new Error(
      `ZeroTrust: access denied — ${evaluation.reasons.join(", ")}`
    );
  }
  return evaluation;
}
