/**
 * lib/security/kms/integrations/kms-zero-trust.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Zero Trust Integration — Zero Trust Gate for KMS Operations
 *
 * Server-only. Adapts KmsAccessContext → ZeroTrustContext and calls
 * the Zero Trust policy engine before any KMS operation proceeds.
 *
 * All KMS operations target the ENCRYPTION_KEY resource type.
 * Operations map to ZeroTrustActions:
 *   GENERATE_KEY → ADMIN
 *   ENCRYPT      → EXECUTE
 *   DECRYPT      → EXECUTE
 *   ROTATE_KEY   → ROTATE_SECRET
 *   DISABLE_KEY  → ADMIN
 *   ENABLE_KEY   → ADMIN
 *   DELETE_KEY   → DELETE
 *
 * Fail-closed: any error or evaluation failure → DENY.
 */

import "server-only";

import type { KmsOperation } from "../kms-types";
import type { KmsAccessContext } from "../kms-types";
import type { ZeroTrustContext, ZeroTrustAction, ZeroTrustEvaluation } from "../../zero-trust/zero-trust-types";
import { evaluateZeroTrust } from "../../zero-trust/zero-trust-policy-engine";

// ── KMS Zero Trust Input ──────────────────────────────────────────────────────

export interface KmsZeroTrustInput extends KmsAccessContext {
  /** Explicitly pass the operation (may differ from context.operation). */
  operation: KmsOperation;
}

// ── Operation → Action Map ────────────────────────────────────────────────────

const OPERATION_ACTION_MAP: Record<KmsOperation, ZeroTrustAction> = {
  GENERATE_KEY: "ADMIN",
  ENCRYPT:      "EXECUTE",
  DECRYPT:      "EXECUTE",
  ROTATE_KEY:   "ROTATE_SECRET",
  DISABLE_KEY:  "ADMIN",
  ENABLE_KEY:   "ADMIN",
  DELETE_KEY:   "DELETE",
};

// ── checkKmsZeroTrust ─────────────────────────────────────────────────────────

/**
 * checkKmsZeroTrust — evaluate Zero Trust policy for a KMS operation.
 *
 * Maps the KMS access context to a Zero Trust evaluation and returns
 * the decision. Never throws — fail-closed on any error.
 */
export function checkKmsZeroTrust(input: KmsZeroTrustInput): ZeroTrustEvaluation {
  try {
    const action = OPERATION_ACTION_MAP[input.operation] ?? "ADMIN";

    const ztContext: ZeroTrustContext = {
      orgSlug:      input.orgSlug,
      subjectType:  mapSubjectType(input.subjectType),
      userId:       input.subjectType === "USER"             ? input.subjectId : undefined,
      agentId:      input.subjectType === "AGENT"            ? input.subjectId : undefined,
      apiKeyId:     input.subjectType === "SERVICE_ACCOUNT"  ? input.subjectId : undefined,
      resourceType: "ENCRYPTION_KEY",
      resourceId:   input.keyId ?? input.keyAlias,
      action,
      ipAddress:    input.ipAddress,
      sessionId:    input.sessionId,
      timestamp:    new Date().toISOString(),
      mfaVerified:  input.mfaVerified,
    };

    return evaluateZeroTrust(ztContext);

  } catch {
    // Fail-closed: evaluation error → synthetic DENY
    return {
      decision:          "DENY",
      riskLevel:         "CRITICAL",
      score:             0,
      reasons:           ["kms_zero_trust_evaluation_error_fail_closed"],
      requiredApprovals: [],
      auditRequired:     true,
      evaluatedAt:       new Date().toISOString(),
      durationMs:        0,
      context: {
        orgSlug:      input.orgSlug,
        subjectType:  mapSubjectType(input.subjectType),
        resourceType: "ENCRYPTION_KEY",
        action:       OPERATION_ACTION_MAP[input.operation] ?? "ADMIN",
        timestamp:    new Date().toISOString(),
      },
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapSubjectType(
  subjectType: KmsAccessContext["subjectType"],
): ZeroTrustContext["subjectType"] {
  switch (subjectType) {
    case "USER":            return "USER";
    case "AGENT":           return "AGENT";
    case "SYSTEM":          return "SYSTEM";
    case "SERVICE_ACCOUNT": return "SERVICE_ACCOUNT";
    default:                return "SYSTEM";
  }
}

/** Return the Zero Trust action for a KMS operation. */
export function getKmsZeroTrustAction(operation: KmsOperation): ZeroTrustAction {
  return OPERATION_ACTION_MAP[operation] ?? "ADMIN";
}
