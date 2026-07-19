/**
 * lib/security/secret-rotation/rotation-service.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Service — Central Orchestrator
 *
 * Server-only. Coordinates all rotation operations:
 *   - requestRotation()
 *   - validateRotation()
 *   - activateRotation()
 *   - revokeRotation()
 *   - cancelRotation()
 *
 * Responsibilities:
 *   - Validate input against policy engine
 *   - Delegate persistence to RotationRepository
 *   - Emit audit events for every state change
 *   - Never access Vault directly (uses VaultRotationAdapter interface)
 *   - Never store secret values
 *
 * Fail-closed: any unexpected error returns a failed RotationResult.
 */

import "server-only";

import type {
  RotationRequest,
  RotationValidationInput,
  RotationResult,
} from "./rotation-types";
import {
  successResult,
  failedResult,
  cancelledResult,
} from "./rotation-types";
import type { RotationRepository } from "./rotation-repository";
import {
  canRotate,
  requiresRotation as evaluateRequirement,
} from "./rotation-policy-engine";
import { getRotationEntry } from "./rotation-registry";
import {
  secretVersionStore,
  createSecretVersion,
} from "./secret-version";
import {
  emitRotationRequested,
  emitRotationStarted,
  emitRotationValidated,
  emitRotationActivated,
  emitRotationRevoked,
  emitRotationFailed,
  emitRotationCancelled,
} from "./rotation-audit";

// ── ID Generator ──────────────────────────────────────────────────────────────

function newRotationId(): string {
  return `rot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SecretRotationService {

  constructor(private readonly repo: RotationRepository) {}

  // ── requestRotation ──────────────────────────────────────────────────────

  /**
   * requestRotation — initiate a rotation for a secret.
   *
   * Checks:
   *   - Secret is in registry
   *   - Secret supports rotation
   *   - Policy allows rotation right now
   *   - No active rotation already in progress
   *
   * Creates: RotationRecord (PENDING), version (PENDING), audit event
   */
  async requestRotation(request: RotationRequest): Promise<RotationResult> {
    const t0 = Date.now();
    const { secretId, orgSlug, requestedBy, reason, strategy } = request;

    try {
      // Validate registry entry
      const entry = getRotationEntry(secretId);
      if (!entry) {
        return failedResult("secret_not_in_registry", `Secret '${secretId}' is not registered for rotation.`, t0);
      }
      if (!entry.rotationSupported) {
        return failedResult("rotation_not_supported", `Secret '${secretId}' does not support rotation.`, t0);
      }

      // Check for active rotations
      const activeRotations = await this.repo.findActiveRotations(orgSlug);
      const hasActive = activeRotations.some(r => r.secretId === secretId);

      // Check policy
      const lastRotation = await this.repo.findLatestRotation(orgSlug, secretId);
      const policyCheck  = canRotate({
        secretId,
        strategy,
        hasActiveRotation: hasActive,
        lastRotationAt:    lastRotation?.activatedAt,
      });

      if (!policyCheck.allowed) {
        return failedResult(policyCheck.reason, `Rotation blocked: ${policyCheck.reason}`, t0);
      }

      // Create rotation record
      const record = await this.repo.createRotation({
        orgSlug,
        secretId,
        strategy,
        requestedBy,
        reason,
        metadata: request.metadata ?? {},
      });

      // Create version (metadata only — no secret value)
      const version = createSecretVersion({
        secretId,
        orgSlug,
        createdBy:  requestedBy,
        rotationId: record.id,
      });
      secretVersionStore.set(version);

      // Emit audit
      emitRotationRequested({
        rotationId: record.id,
        secretId,
        orgSlug,
        actor:      requestedBy,
        strategy,
        reason,
      });

      return {
        success:    true,
        rotationId: record.id,
        status:     "PENDING",
        reason:     "rotation_requested",
        message:    `Rotation for '${secretId}' has been requested.`,
        resultAt:   new Date().toISOString(),
        durationMs: Date.now() - t0,
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      emitRotationFailed({ secretId, orgSlug, actor: requestedBy, reason: msg, durationMs: Date.now() - t0 });
      return failedResult("unexpected_error", msg, t0);
    }
  }

  // ── validateRotation ─────────────────────────────────────────────────────

  /**
   * validateRotation — mark a rotation as validated (new secret confirmed working).
   * Transitions: PENDING → VALIDATING → READY
   */
  async validateRotation(input: RotationValidationInput): Promise<RotationResult> {
    const t0 = Date.now();
    const { rotationId, orgSlug, validatedBy, passed, notes } = input;

    try {
      const record = await this.repo.getRotation(rotationId);
      if (!record) {
        return failedResult("rotation_not_found", `Rotation '${rotationId}' not found.`, t0);
      }
      if (record.orgSlug !== orgSlug) {
        return failedResult("tenant_mismatch", "Rotation belongs to a different tenant.", t0);
      }
      if (!["PENDING", "VALIDATING"].includes(record.status)) {
        return failedResult("invalid_status", `Rotation is in status '${record.status}', cannot validate.`, t0);
      }

      emitRotationStarted({ rotationId, secretId: record.secretId, orgSlug, actor: validatedBy });

      if (!passed) {
        await this.repo.updateStatus(rotationId, "FAILED", { completedAt: new Date().toISOString() });
        emitRotationFailed({
          rotationId, secretId: record.secretId, orgSlug,
          actor: validatedBy, reason: notes ?? "validation_failed", durationMs: Date.now() - t0,
        });
        return failedResult("validation_failed", notes ?? "Validation failed.", t0);
      }

      await this.repo.updateStatus(rotationId, "READY");
      emitRotationValidated({ rotationId, secretId: record.secretId, orgSlug, actor: validatedBy });

      return {
        success:    true,
        rotationId,
        status:     "READY",
        reason:     "validation_passed",
        message:    `Rotation '${rotationId}' validated. Ready for activation.`,
        resultAt:   new Date().toISOString(),
        durationMs: Date.now() - t0,
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return failedResult("unexpected_error", msg, t0);
    }
  }

  // ── activateRotation ─────────────────────────────────────────────────────

  /**
   * activateRotation — activate the new secret version, making it live.
   * Transitions: READY → ACTIVE
   * Old version enters GRACE status.
   */
  async activateRotation(params: {
    rotationId:  string;
    orgSlug:     string;
    activatedBy: string;
  }): Promise<RotationResult> {
    const t0 = Date.now();
    const { rotationId, orgSlug, activatedBy } = params;

    try {
      const record = await this.repo.getRotation(rotationId);
      if (!record) {
        return failedResult("rotation_not_found", `Rotation '${rotationId}' not found.`, t0);
      }
      if (record.orgSlug !== orgSlug) {
        return failedResult("tenant_mismatch", "Rotation belongs to a different tenant.", t0);
      }
      if (record.status !== "READY") {
        return failedResult("invalid_status", `Rotation must be READY to activate (got '${record.status}').`, t0);
      }

      const now = new Date().toISOString();

      // Transition old active version to GRACE
      const oldActive = secretVersionStore.getActive(orgSlug, record.secretId);
      if (oldActive) {
        secretVersionStore.set({ ...oldActive, status: "GRACE" });
      }

      // Activate pending version
      const versions = secretVersionStore.getAll(orgSlug, record.secretId);
      const pendingVersion = versions.find(v => v.status === "PENDING" && v.rotationId === rotationId);
      if (pendingVersion) {
        secretVersionStore.set({ ...pendingVersion, status: "ACTIVE", activatedAt: now });
      }

      await this.repo.updateStatus(rotationId, "ACTIVE", { activatedAt: now });

      emitRotationActivated({
        rotationId,
        secretId:   record.secretId,
        orgSlug,
        actor:      activatedBy,
        durationMs: Date.now() - t0,
      });

      return successResult("rotation_activated", `Rotation '${rotationId}' activated successfully.`, rotationId, t0);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return failedResult("unexpected_error", msg, t0);
    }
  }

  // ── revokeRotation ───────────────────────────────────────────────────────

  /**
   * revokeRotation — revoke the old version after the grace period.
   * Transitions: ACTIVE → REVOKED
   */
  async revokeRotation(params: {
    rotationId: string;
    orgSlug:    string;
    revokedBy:  string;
    reason:     string;
  }): Promise<RotationResult> {
    const t0 = Date.now();
    const { rotationId, orgSlug, revokedBy, reason } = params;

    try {
      const record = await this.repo.getRotation(rotationId);
      if (!record) {
        return failedResult("rotation_not_found", `Rotation '${rotationId}' not found.`, t0);
      }
      if (record.orgSlug !== orgSlug) {
        return failedResult("tenant_mismatch", "Rotation belongs to a different tenant.", t0);
      }
      if (record.status !== "ACTIVE") {
        return failedResult("invalid_status", `Rotation must be ACTIVE to revoke (got '${record.status}').`, t0);
      }

      const now = new Date().toISOString();

      // Revoke any GRACE versions
      const graceVersions = secretVersionStore
        .getAll(orgSlug, record.secretId)
        .filter(v => v.status === "GRACE");
      for (const v of graceVersions) {
        secretVersionStore.set({ ...v, status: "REVOKED", revokedAt: now });
      }

      await this.repo.updateStatus(rotationId, "REVOKED", {
        revokedAt:   now,
        completedAt: now,
      });

      emitRotationRevoked({
        rotationId,
        secretId:   record.secretId,
        orgSlug,
        actor:      revokedBy,
        durationMs: Date.now() - t0,
      });

      return {
        success:    true,
        rotationId,
        status:     "REVOKED",
        reason:     "rotation_revoked",
        message:    `Rotation '${rotationId}' completed. Old version revoked.`,
        resultAt:   new Date().toISOString(),
        durationMs: Date.now() - t0,
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return failedResult("unexpected_error", msg, t0);
    }
  }

  // ── cancelRotation ───────────────────────────────────────────────────────

  /**
   * cancelRotation — cancel a rotation before activation.
   * Only PENDING and READY rotations can be cancelled.
   */
  async cancelRotation(params: {
    rotationId:   string;
    orgSlug:      string;
    cancelledBy:  string;
    reason:       string;
  }): Promise<RotationResult> {
    const t0 = Date.now();
    const { rotationId, orgSlug, cancelledBy, reason } = params;

    try {
      const record = await this.repo.getRotation(rotationId);
      if (!record) {
        return cancelledResult("rotation_not_found", `Rotation '${rotationId}' not found.`, t0);
      }
      if (record.orgSlug !== orgSlug) {
        return cancelledResult("tenant_mismatch", "Rotation belongs to a different tenant.", t0);
      }
      if (!["PENDING", "VALIDATING", "READY"].includes(record.status)) {
        return failedResult("invalid_status", `Rotation in status '${record.status}' cannot be cancelled.`, t0);
      }

      await this.repo.updateStatus(rotationId, "CANCELLED", {
        completedAt: new Date().toISOString(),
      });

      // Mark pending version as failed
      const versions = secretVersionStore.getAll(orgSlug, record.secretId);
      const pendingVersion = versions.find(v => v.status === "PENDING" && v.rotationId === rotationId);
      if (pendingVersion) {
        secretVersionStore.set({ ...pendingVersion, status: "FAILED" });
      }

      emitRotationCancelled({ rotationId, secretId: record.secretId, orgSlug, actor: cancelledBy, reason });

      return cancelledResult("rotation_cancelled", `Rotation '${rotationId}' has been cancelled.`, t0);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return failedResult("unexpected_error", msg, t0);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: SecretRotationService | null = null;

export function getRotationService(): SecretRotationService {
  if (_instance) return _instance;
  const { prismaRotationRepository } = require("./persistence/prisma-rotation-repository");
  _instance = new SecretRotationService(prismaRotationRepository);
  return _instance;
}
