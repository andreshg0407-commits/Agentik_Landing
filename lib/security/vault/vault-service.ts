/**
 * lib/security/vault/vault-service.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — VaultService
 *
 * Main entry point for all VaultSecret CRUD operations.
 *
 * Enforces:
 *   - Tenant isolation (via vault-access-policy.ts)
 *   - Input validation (via vault-validation.ts)
 *   - AES-256-GCM encryption before write (via vault-encryption.ts)
 *   - Decryption after read (via vault-encryption.ts)
 *   - Secret masking in all returned records (via vault-masking.ts)
 *   - Full audit trail (via VaultServiceAuditLog)
 *
 * readSecret() is the ONLY method that returns plaintext — every call is audited.
 * All other methods return masked records only.
 *
 * IMPORTANT: server-side only — depends on VaultRepository (Prisma).
 */

import { canAccessVaultSecret } from "./vault-access-policy";
import { encryptRawSecret, decryptRawSecret } from "./vault-encryption";
import { validateCreateInput } from "./vault-validation";
import { maskSecret } from "./vault-masking";
import { globalVaultServiceAuditLog } from "./vault-service-audit";
import type { VaultRepository } from "./vault-repository";
import type {
  VaultCaller,
  VaultCreateInput,
  VaultDeleteResult,
  VaultListResult,
  VaultReadResult,
  VaultSecretRecord,
  VaultServiceError,
  VaultServiceErrorCode,
  VaultServiceResult,
  VaultUpdateInput,
  VaultWriteResult,
} from "./vault-secret-record";

// ── VaultService ──────────────────────────────────────────────────────────────

export class VaultService {
  constructor(private readonly repo: VaultRepository) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async createSecret(
    caller: VaultCaller,
    input:  VaultCreateInput,
  ): Promise<VaultServiceResult<VaultWriteResult>> {
    const start = Date.now();

    // Tenant check
    const decision = canAccessVaultSecret(caller, input.orgSlug, "CREATE");
    if (!decision.allowed) {
      globalVaultServiceAuditLog.record({
        orgSlug:       input.orgSlug,
        eventType:     "ACCESS_DENIED",
        actorId:       caller.actorId,
        actorType:     caller.actorType,
        success:       false,
        failureReason: decision.reason,
        durationMs:    Date.now() - start,
        requestId:     caller.requestId,
      });
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    // Validation
    const validation = validateCreateInput(input);
    if (!validation.valid) {
      return mkErr("VALIDATION_FAILED", validation.errors.join("; "), Date.now() - start);
    }

    // Encrypt
    let encryptedValue: string;
    let keyVersion: number;
    try {
      const result = encryptRawSecret(input.value);
      encryptedValue = result.ciphertext;
      keyVersion     = result.keyVersion;
    } catch (e) {
      globalVaultServiceAuditLog.record({
        orgSlug:       input.orgSlug,
        eventType:     "ENCRYPTION_FAILED",
        actorId:       caller.actorId,
        actorType:     caller.actorType,
        success:       false,
        failureReason: e instanceof Error ? e.message : "Unknown encryption error",
        durationMs:    Date.now() - start,
        requestId:     caller.requestId,
      });
      return mkErr("ENCRYPTION_FAILED", "Encryption failed — check VAULT_MASTER_KEY", Date.now() - start);
    }

    // Persist
    let metadata;
    try {
      metadata = await this.repo.create(input.orgSlug, input, encryptedValue, keyVersion);
    } catch {
      return mkErr("STORE_ERROR", "Failed to persist secret", Date.now() - start);
    }

    // Audit
    globalVaultServiceAuditLog.record({
      orgSlug:    metadata.orgSlug,
      eventType:  "SECRET_CREATED",
      secretId:   metadata.id,
      secretKind: metadata.kind,
      actorId:    caller.actorId,
      actorType:  caller.actorType,
      success:    true,
      durationMs: Date.now() - start,
      requestId:  caller.requestId,
    });

    const record: VaultSecretRecord = { ...metadata, maskedValue: maskSecret(input.value) };
    return { success: true, record, durationMs: Date.now() - start };
  }

  // ── Read (plaintext) ────────────────────────────────────────────────────────

  /**
   * Return the decrypted plaintext value.
   * Every call is audited. Callers must only use the value transiently.
   */
  async readSecret(
    caller:   VaultCaller,
    secretId: string,
  ): Promise<VaultServiceResult<VaultReadResult>> {
    const start = Date.now();

    // Fetch (repo filters by orgSlug for tenant isolation)
    let found;
    try {
      found = await this.repo.findById(secretId, caller.orgSlug);
    } catch {
      return mkErr("STORE_ERROR", "Failed to fetch secret", Date.now() - start);
    }

    if (!found) {
      return mkErr("NOT_FOUND", "Secret not found", Date.now() - start);
    }

    // Belt-and-suspenders tenant check
    const decision = canAccessVaultSecret(caller, found.metadata.orgSlug, "READ");
    if (!decision.allowed) {
      globalVaultServiceAuditLog.record({
        orgSlug:       caller.orgSlug,
        eventType:     "ACCESS_DENIED",
        secretId,
        actorId:       caller.actorId,
        actorType:     caller.actorType,
        success:       false,
        failureReason: decision.reason,
        durationMs:    Date.now() - start,
        requestId:     caller.requestId,
      });
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    // Status checks
    if (found.metadata.status === "REVOKED") {
      return mkErr("ALREADY_REVOKED", "Secret has been revoked", Date.now() - start);
    }

    // Expiry check
    if (found.metadata.expiresAt && new Date(found.metadata.expiresAt) < new Date()) {
      return mkErr("SECRET_EXPIRED", "Secret has expired", Date.now() - start);
    }

    // Decrypt
    let value: string;
    try {
      value = decryptRawSecret(found.encryptedValue);
    } catch (e) {
      globalVaultServiceAuditLog.record({
        orgSlug:       caller.orgSlug,
        eventType:     "DECRYPTION_FAILED",
        secretId,
        secretKind:    found.metadata.kind,
        actorId:       caller.actorId,
        actorType:     caller.actorType,
        success:       false,
        failureReason: e instanceof Error ? e.message : "Unknown decryption error",
        durationMs:    Date.now() - start,
        requestId:     caller.requestId,
      });
      return mkErr("DECRYPTION_FAILED", "Decryption failed", Date.now() - start);
    }

    // Audit successful read
    globalVaultServiceAuditLog.record({
      orgSlug:    found.metadata.orgSlug,
      eventType:  "SECRET_READ",
      secretId,
      secretKind: found.metadata.kind,
      actorId:    caller.actorId,
      actorType:  caller.actorType,
      success:    true,
      durationMs: Date.now() - start,
      requestId:  caller.requestId,
    });

    // Touch lastAccessedAt (fire-and-forget — must not fail the read)
    void this.repo.touchAccessedAt(secretId, caller.orgSlug);

    return { success: true, value, metadata: found.metadata, durationMs: Date.now() - start };
  }

  // ── List ────────────────────────────────────────────────────────────────────

  async listSecrets(
    caller:  VaultCaller,
    orgSlug: string,
  ): Promise<VaultServiceResult<VaultListResult>> {
    const start = Date.now();

    const decision = canAccessVaultSecret(caller, orgSlug, "LIST");
    if (!decision.allowed) {
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    let records: VaultSecretRecord[];
    try {
      const metadataList = await this.repo.listByOrg(orgSlug);
      records = metadataList.map(m => ({ ...m, maskedValue: "****" }));
    } catch {
      return mkErr("STORE_ERROR", "Failed to list secrets", Date.now() - start);
    }

    return { success: true, records, total: records.length, durationMs: Date.now() - start };
  }

  // ── Update metadata ──────────────────────────────────────────────────────────

  async updateSecret(
    caller:   VaultCaller,
    secretId: string,
    input:    VaultUpdateInput,
  ): Promise<VaultServiceResult<VaultWriteResult>> {
    const start = Date.now();

    const decision = canAccessVaultSecret(caller, caller.orgSlug, "UPDATE");
    if (!decision.allowed) {
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    let updated;
    try {
      updated = await this.repo.update(secretId, caller.orgSlug, input);
    } catch {
      return mkErr("STORE_ERROR", "Failed to update secret", Date.now() - start);
    }

    if (!updated) {
      return mkErr("NOT_FOUND", "Secret not found", Date.now() - start);
    }

    globalVaultServiceAuditLog.record({
      orgSlug:    updated.orgSlug,
      eventType:  "SECRET_UPDATED",
      secretId,
      secretKind: updated.kind,
      actorId:    caller.actorId,
      actorType:  caller.actorType,
      success:    true,
      durationMs: Date.now() - start,
      requestId:  caller.requestId,
    });

    return { success: true, record: { ...updated, maskedValue: "****" }, durationMs: Date.now() - start };
  }

  // ── Disable ──────────────────────────────────────────────────────────────────

  async disableSecret(
    caller:   VaultCaller,
    secretId: string,
  ): Promise<VaultServiceResult<VaultWriteResult>> {
    const start = Date.now();

    const decision = canAccessVaultSecret(caller, caller.orgSlug, "DISABLE");
    if (!decision.allowed) {
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    const disabled = await this.repo.disable(secretId, caller.orgSlug);
    if (!disabled) {
      return mkErr("NOT_FOUND", "Secret not found", Date.now() - start);
    }

    globalVaultServiceAuditLog.record({
      orgSlug:    disabled.orgSlug,
      eventType:  "SECRET_DISABLED",
      secretId,
      secretKind: disabled.kind,
      actorId:    caller.actorId,
      actorType:  caller.actorType,
      success:    true,
      durationMs: Date.now() - start,
      requestId:  caller.requestId,
    });

    return { success: true, record: { ...disabled, maskedValue: "****" }, durationMs: Date.now() - start };
  }

  // ── Revoke ───────────────────────────────────────────────────────────────────

  async revokeSecret(
    caller:   VaultCaller,
    secretId: string,
  ): Promise<VaultServiceResult<VaultWriteResult>> {
    const start = Date.now();

    const decision = canAccessVaultSecret(caller, caller.orgSlug, "REVOKE");
    if (!decision.allowed) {
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    const revoked = await this.repo.revoke(secretId, caller.orgSlug);
    if (!revoked) {
      return mkErr("NOT_FOUND", "Secret not found", Date.now() - start);
    }

    globalVaultServiceAuditLog.record({
      orgSlug:    revoked.orgSlug,
      eventType:  "SECRET_REVOKED",
      secretId,
      secretKind: revoked.kind,
      actorId:    caller.actorId,
      actorType:  caller.actorType,
      success:    true,
      durationMs: Date.now() - start,
      requestId:  caller.requestId,
    });

    return { success: true, record: { ...revoked, maskedValue: "****" }, durationMs: Date.now() - start };
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async deleteSecret(
    caller:   VaultCaller,
    secretId: string,
  ): Promise<VaultServiceResult<VaultDeleteResult>> {
    const start = Date.now();

    const decision = canAccessVaultSecret(caller, caller.orgSlug, "DELETE");
    if (!decision.allowed) {
      return mkErr("ACCESS_DENIED", decision.reason, Date.now() - start);
    }

    const deleted = await this.repo.delete(secretId, caller.orgSlug);
    if (!deleted) {
      return mkErr("NOT_FOUND", "Secret not found or already deleted", Date.now() - start);
    }

    globalVaultServiceAuditLog.record({
      orgSlug:    caller.orgSlug,
      eventType:  "SECRET_DELETED",
      secretId,
      actorId:    caller.actorId,
      actorType:  caller.actorType,
      success:    true,
      durationMs: Date.now() - start,
      requestId:  caller.requestId,
    });

    return { success: true, durationMs: Date.now() - start };
  }
}

// ── Error factory ─────────────────────────────────────────────────────────────

function mkErr(
  code:       VaultServiceErrorCode,
  error:      string,
  durationMs: number,
): VaultServiceError {
  return { success: false, error, code, durationMs };
}
