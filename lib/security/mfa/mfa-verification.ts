/**
 * lib/security/mfa/mfa-verification.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Verification Service — Core Challenge/Response Engine
 *
 * Server-only. Central responsibility for MFA verification.
 *
 * Responsibilities:
 *   - Validate enrollment exists and is ENABLED
 *   - Dispatch to correct provider
 *   - Track failure counts, enforce lock
 *   - Produce audit events
 *   - Return structured MfaVerificationResult
 *
 * CRITICAL:
 *   - NEVER log code values
 *   - Fail-closed: any unexpected error = failed verification
 */

import "server-only";

import type {
  MfaVerificationResult,
  MfaVerificationOutcome,
  MfaResult,
  MfaChallengeType,
} from "./mfa-types";
import { MFA_MAX_FAIL_COUNT } from "./mfa-types";
import type { MfaRepository } from "./mfa-repository";
import { totpProvider } from "./providers/totp-provider";
import { recordMfaEvent } from "./mfa-audit";

// ── Verification Input ────────────────────────────────────────────────────────

export interface MfaVerificationInput {
  orgSlug:     string;
  userId:      string;
  method:      "TOTP" | "EMAIL" | "SMS" | "PASSKEY" | "WEBAUTHN";
  challengeId: string;
  /** User-provided code. NEVER log this. */
  code:        string;
  type?:       MfaChallengeType;
}

// ── MfaVerificationService ────────────────────────────────────────────────────

export class MfaVerificationService {
  constructor(private readonly repo: MfaRepository) {}

  // ── verifyMfa ───────────────────────────────────────────────────────────────

  /**
   * verifyMfa — central MFA verification method.
   *
   * 1. Load enrollment — fail if not found or not ENABLED
   * 2. Check if locked — deny immediately
   * 3. Dispatch to provider
   * 4. On failure: increment failCount, lock if at limit
   * 5. On success: reset failCount, record lastUsedAt
   * 6. Always audit
   */
  async verifyMfa(
    input: MfaVerificationInput,
  ): Promise<MfaVerificationResult> {
    const now = new Date().toISOString();

    const base: Omit<MfaVerificationResult, "outcome" | "reasons" | "trustDelta"> = {
      method:      input.method,
      orgSlug:     input.orgSlug,
      userId:      input.userId,
      challengeId: input.challengeId,
      verifiedAt:  now,
    };

    try {
      if (!input.orgSlug || !input.userId) {
        return _result(base, "FAILED", ["org_slug_and_user_id_required"], 0);
      }

      // Load enrollment
      const enrollment = await this.repo.getEnrollment(input.orgSlug, input.userId, input.method);

      if (!enrollment) {
        void this._audit(input, false, ["not_enrolled"]);
        return _result(base, "NOT_ENROLLED", ["not_enrolled"], 0);
      }

      if (enrollment.status === "LOCKED") {
        void this._audit(input, false, ["enrollment_locked"]);
        return _result(base, "LOCKED", ["enrollment_locked"], 0);
      }

      if (enrollment.status !== "ENABLED") {
        void this._audit(input, false, [`enrollment_not_enabled:${enrollment.status}`]);
        return _result(base, "FAILED", [`enrollment_not_enabled:${enrollment.status}`], 0);
      }

      // Dispatch to provider — NEVER log input.code
      const verifyResult = await this._dispatch(input, enrollment.secretRef);

      if (!verifyResult.ok) {
        void this._audit(input, false, [verifyResult.error]);
        return _result(base, "FAILED", [verifyResult.error], 0);
      }

      const { valid, reasons, trustDelta } = verifyResult.value;

      if (!valid) {
        // Increment fail count
        const newFailCount = enrollment.failCount + 1;
        const shouldLock   = newFailCount >= MFA_MAX_FAIL_COUNT;

        await this.repo.updateEnrollment(enrollment.id, input.orgSlug, {
          failCount: newFailCount,
          ...(shouldLock && { status: "LOCKED" }),
        });

        void this._audit(input, false, [...reasons, shouldLock ? "enrollment_now_locked" : "fail_count_incremented"]);

        if (shouldLock) {
          return _result(base, "LOCKED", [...reasons, "max_failures_reached"], 0);
        }
        return _result(base, "FAILED", reasons, 0);
      }

      // Success — reset fail count
      await this.repo.updateEnrollment(enrollment.id, input.orgSlug, {
        failCount:  0,
        lastUsedAt: now,
      });

      void this._audit(input, true, reasons);
      return _result(base, "SUCCESS", reasons, trustDelta);

    } catch {
      void this._audit(input, false, ["verification_exception"]);
      return _result(base, "FAILED", ["verification_exception"], 0);
    }
  }

  // ── evaluateVerification ────────────────────────────────────────────────────

  /**
   * evaluateVerification — check if a user has active MFA and what state it's in.
   * Does not perform verification — just inspects the enrollment.
   */
  async evaluateVerification(
    orgSlug: string,
    userId:  string,
    method:  "TOTP" | "EMAIL" | "SMS" | "PASSKEY" | "WEBAUTHN",
  ): Promise<MfaResult<{
    hasEnrollment: boolean;
    status:        string;
    failCount:     number;
    lastUsedAt?:   string;
  }>> {
    try {
      const enrollment = await this.repo.getEnrollment(orgSlug, userId, method);
      if (!enrollment) {
        return { ok: true, value: { hasEnrollment: false, status: "NOT_ENROLLED", failCount: 0 } };
      }
      return {
        ok: true,
        value: {
          hasEnrollment: true,
          status:        enrollment.status,
          failCount:     enrollment.failCount,
          lastUsedAt:    enrollment.lastUsedAt,
        },
      };
    } catch {
      return { ok: false, error: "evaluate_verification_failed", riskLevel: "HIGH" };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _dispatch(
    input: MfaVerificationInput,
    secretRef: string,
  ): Promise<MfaResult<{ valid: boolean; reasons: string[]; trustDelta: number }>> {
    switch (input.method) {
      case "TOTP":
        return totpProvider.verifyChallenge({
          orgSlug:         input.orgSlug,
          userId:          input.userId,
          challengeId:     input.challengeId,
          code:            input.code,     // NEVER log
          encryptedSecret: secretRef,
        });
      default:
        return { ok: false, error: `method_not_implemented:${input.method}`, riskLevel: "MEDIUM" };
    }
  }

  private async _audit(
    input: MfaVerificationInput,
    success: boolean,
    reasons: string[],
  ): Promise<void> {
    void recordMfaEvent({
      eventType:   success ? "MFA_VERIFIED" : "MFA_FAILED",
      orgSlug:     input.orgSlug,
      subjectId:   input.userId,
      subjectType: "USER",
      method:      input.method,
      success,
      reasons,
    });
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _result(
  base:       Omit<MfaVerificationResult, "outcome" | "reasons" | "trustDelta">,
  outcome:    MfaVerificationOutcome,
  reasons:    string[],
  trustDelta: number,
): MfaVerificationResult {
  return { ...base, outcome, reasons, trustDelta };
}
