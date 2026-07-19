/**
 * lib/security/mfa/mfa-enrollment.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Enrollment Service — Manages TOTP/MFA Enrollment Lifecycle
 *
 * Server-only. Orchestrates:
 *   1. Generate secret via provider
 *   2. Encrypt secret via mfa-encryption integration
 *   3. Persist enrollment via repository
 *   4. Generate recovery codes
 *   5. Confirm enrollment after first successful verification
 *
 * CRITICAL:
 *   - Raw secrets NEVER persisted
 *   - Recovery codes shown ONCE, then only hashes stored
 *   - All state transitions audited
 */

import "server-only";

import * as crypto from "crypto";
import type { MfaResult, MfaEnrollment, MfaEnrollmentInput } from "./mfa-types";
import { MFA_RECOVERY_CODE_COUNT } from "./mfa-types";
import type { MfaRepository } from "./mfa-repository";
import { totpProvider } from "./providers/totp-provider";
import { generateRecoveryCodes, hashAllRecoveryCodes, verifyRecoveryCode } from "./recovery-codes";
import { recordMfaEvent } from "./mfa-audit";

// ── Enrollment Output ──────────────────────────────────────────────────────────

export interface StartEnrollmentOutput {
  enrollment:    MfaEnrollment;
  setupPayload:  string;
  /** Plain recovery codes — shown ONCE to the user. Never store these. */
  recoveryCodes: string[];
}

export interface ConfirmEnrollmentOutput {
  enrollment: MfaEnrollment;
}

// ── MfaEnrollmentService ──────────────────────────────────────────────────────

export class MfaEnrollmentService {
  constructor(private readonly repo: MfaRepository) {}

  // ── startEnrollment ──────────────────────────────────────────────────────────

  /**
   * startEnrollment — initiate MFA enrollment for a user.
   *
   * Flow:
   *   1. Generate TOTP secret
   *   2. Encrypt secret ref (delegated to mfa-encryption)
   *   3. Generate recovery codes (return plain, store hashes only)
   *   4. Persist PENDING enrollment
   *   5. Return setup payload (QR URI) + recovery codes
   *
   * The enrollment status is PENDING until confirmEnrollment() is called.
   */
  async startEnrollment(
    input: MfaEnrollmentInput,
  ): Promise<MfaResult<StartEnrollmentOutput>> {
    try {
      if (!input.orgSlug || !input.userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }

      // Check for existing active enrollment
      const existing = await this.repo.getEnrollment(input.orgSlug, input.userId, input.method);
      if (existing && existing.status === "ENABLED") {
        return { ok: false, error: "enrollment_already_active", riskLevel: "HIGH" };
      }

      // Generate TOTP secret + setup payload
      const enrollResult = await totpProvider.enroll({ orgSlug: input.orgSlug, userId: input.userId });
      if (!enrollResult.ok) return enrollResult;

      const { enrollment: draft, setupPayload, encryptedSecret } = enrollResult.value;

      // Generate recovery codes (plain — shown once)
      const plainCodes    = generateRecoveryCodes(MFA_RECOVERY_CODE_COUNT);
      const hashedCodes   = await hashAllRecoveryCodes(plainCodes);

      // Build the enrollment record
      const enrollment: MfaEnrollment = {
        ...draft,
        id:        _generateId(),
        secretRef: encryptedSecret,
        status:    "PENDING",
      };

      // Persist enrollment
      const saveResult = await this.repo.saveEnrollment(enrollment);
      if (!saveResult.ok) return saveResult;

      // Persist hashed recovery codes
      const codeResult = await this.repo.saveRecoveryCodes(input.orgSlug, input.userId, hashedCodes);
      if (!codeResult.ok) return codeResult;

      // Audit
      void recordMfaEvent({
        eventType:   "MFA_ENROLLMENT_STARTED",
        orgSlug:     input.orgSlug,
        subjectId:   input.userId,
        subjectType: "USER",
        method:      input.method,
        success:     true,
        reasons:     ["enrollment_started"],
      });

      return {
        ok: true,
        value: {
          enrollment:   saveResult.value,
          setupPayload,
          recoveryCodes: plainCodes,  // Return ONCE — caller must show to user
        },
      };
    } catch {
      return { ok: false, error: "start_enrollment_failed", riskLevel: "HIGH" };
    }
  }

  // ── confirmEnrollment ────────────────────────────────────────────────────────

  /**
   * confirmEnrollment — confirm enrollment after user's first successful verification.
   * Transitions status: PENDING → ENABLED.
   * NEVER accepts enrollment without verified code.
   */
  async confirmEnrollment(
    orgSlug:  string,
    userId:   string,
    method:   MfaEnrollmentInput["method"],
    code:     string,  // NEVER log
  ): Promise<MfaResult<ConfirmEnrollmentOutput>> {
    try {
      if (!orgSlug || !userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }

      const enrollment = await this.repo.getEnrollment(orgSlug, userId, method);
      if (!enrollment) {
        return { ok: false, error: "enrollment_not_found", riskLevel: "HIGH" };
      }
      if (enrollment.status !== "PENDING") {
        return { ok: false, error: `enrollment_not_pending:${enrollment.status}`, riskLevel: "HIGH" };
      }

      // Verify code using provider
      const verifyResult = await totpProvider.verifyChallenge({
        orgSlug,
        userId,
        challengeId:     `confirm:${enrollment.id}`,
        code,            // NEVER logged
        encryptedSecret: enrollment.secretRef,
      });

      if (!verifyResult.ok || !verifyResult.value.valid) {
        void recordMfaEvent({
          eventType:   "MFA_FAILED",
          orgSlug,
          subjectId:   userId,
          subjectType: "USER",
          method,
          success:     false,
          reasons:     ["confirm_verification_failed"],
        });
        return { ok: false, error: "confirmation_code_invalid", riskLevel: "HIGH" };
      }

      // Activate enrollment
      const updated = await this.repo.updateEnrollment(enrollment.id, orgSlug, {
        status:    "ENABLED",
        enabledAt: new Date().toISOString(),
      });
      if (!updated.ok) return updated;

      void recordMfaEvent({
        eventType:   "MFA_ENABLED",
        orgSlug,
        subjectId:   userId,
        subjectType: "USER",
        method,
        success:     true,
        reasons:     ["enrollment_confirmed"],
      });

      return { ok: true, value: { enrollment: updated.value } };
    } catch {
      return { ok: false, error: "confirm_enrollment_failed", riskLevel: "HIGH" };
    }
  }

  // ── cancelEnrollment ─────────────────────────────────────────────────────────

  /**
   * cancelEnrollment — abort a PENDING enrollment.
   * Cannot cancel ENABLED enrollments — use disableEnrollment instead.
   */
  async cancelEnrollment(
    orgSlug: string,
    userId:  string,
    method:  MfaEnrollmentInput["method"],
  ): Promise<MfaResult<{ cancelled: boolean }>> {
    try {
      const enrollment = await this.repo.getEnrollment(orgSlug, userId, method);
      if (!enrollment) {
        return { ok: false, error: "enrollment_not_found", riskLevel: "HIGH" };
      }
      if (enrollment.status !== "PENDING") {
        return { ok: false, error: `enrollment_not_cancellable:${enrollment.status}`, riskLevel: "HIGH" };
      }

      const result = await this.repo.disableEnrollment(orgSlug, userId, method);
      if (!result.ok) return result;

      void recordMfaEvent({
        eventType:   "MFA_ENROLLMENT_CANCELLED",
        orgSlug,
        subjectId:   userId,
        subjectType: "USER",
        method,
        success:     true,
        reasons:     ["enrollment_cancelled"],
      });

      return { ok: true, value: { cancelled: true } };
    } catch {
      return { ok: false, error: "cancel_enrollment_failed", riskLevel: "HIGH" };
    }
  }

  // ── verifyRecoveryCode ───────────────────────────────────────────────────────

  /**
   * verifyRecoveryCode — validate an emergency recovery code.
   * Marks the code as used if valid (single-use enforcement).
   * NEVER logs the code.
   */
  async verifyRecoveryCode(
    orgSlug:   string,
    userId:    string,
    plainCode: string,  // NEVER log
  ): Promise<MfaResult<{ verified: boolean; codesRemaining: number }>> {
    try {
      const storedCodes = await this.repo.getRecoveryCodes(orgSlug, userId);
      if (!storedCodes || storedCodes.length === 0) {
        return { ok: false, error: "no_recovery_codes_found", riskLevel: "HIGH" };
      }

      let matchedId: string | undefined;
      for (const stored of storedCodes) {
        if (stored.usedAt) continue;  // Skip used codes
        const match = await verifyRecoveryCode(plainCode, stored.codeHash);
        if (match) {
          matchedId = stored.id;
          break;
        }
      }

      if (!matchedId) {
        void recordMfaEvent({
          eventType:   "MFA_FAILED",
          orgSlug,
          subjectId:   userId,
          subjectType: "USER",
          method:      "RECOVERY_CODE",
          success:     false,
          reasons:     ["recovery_code_invalid"],
        });
        return { ok: true, value: { verified: false, codesRemaining: storedCodes.filter(c => !c.usedAt).length } };
      }

      // Mark code as used
      await this.repo.markRecoveryCodeUsed(orgSlug, userId, matchedId);

      const remaining = storedCodes.filter(c => !c.usedAt && c.id !== matchedId).length;

      void recordMfaEvent({
        eventType:   "RECOVERY_CODE_USED",
        orgSlug,
        subjectId:   userId,
        subjectType: "USER",
        method:      "RECOVERY_CODE",
        success:     true,
        reasons:     [`recovery_code_used:remaining=${remaining}`],
      });

      return { ok: true, value: { verified: true, codesRemaining: remaining } };
    } catch {
      return { ok: false, error: "recovery_code_verify_failed", riskLevel: "HIGH" };
    }
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _generateId(): string {
  return crypto.randomBytes(12).toString("hex");
}
