/**
 * secure-vault.ts
 *
 * AGENTIK-SECURE-VAULT-01
 * Multi-Tenant Secrets Vault — Main Facade
 *
 * The SecureVault class is the single entry point for all secret operations
 * across the Agentik platform. It provides:
 *
 *   READ    — Decrypt a secret from an Integration.secretsJson envelope
 *   WRITE   — Encrypt a secret and pack it into an envelope for storage
 *   ROTATE  — Re-encrypt all secrets in an envelope under a new key
 *   PACK    — Serialize an envelope to JSON for Integration.secretsJson
 *   UNPACK  — Deserialize Integration.secretsJson to a typed envelope
 *
 * Storage model:
 *   Integration.secretsJson is the persistence layer.
 *   SecureVault does NOT write to Prisma — callers write the result of
 *   packEnvelope() to the DB after calling writeSecret().
 *
 *   Pattern:
 *     const env = SecureVault.unpackEnvelope(integration.secretsJson);
 *     const payload = SecureVault.readSecret(ref, env, context);
 *
 *     const { env: newEnv } = SecureVault.writeSecret(ref, payload, env, context);
 *     await prisma.integration.update({ data: { secretsJson: SecureVault.packEnvelope(newEnv) } });
 *
 * Tenant isolation:
 *   SecureVault.readSecret() enforces that ref.organizationId matches
 *   the envelope's organizationId (resolved from the Integration row).
 *   Callers must not pass envelopes from different orgs.
 *
 * Role enforcement:
 *   All operations check VAULT_ROLE_PERMISSIONS and VAULT_ROLE_SECRET_TYPES
 *   from vault-types.ts before executing.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never log VaultSecretPayload values.
 */

import {
  encryptSecret,
  decryptSecret,
  rotateSecret,
  hashSecretReference,
  VaultCryptoError,
} from "./vault-crypto";
import {
  logVaultAccess,
  buildAuditSuccess,
  buildAuditFailure,
} from "./vault-audit";
import { safeSecretMetadata } from "./vault-redaction";
import type {
  SecretRef,
  VaultSecretPayload,
  VaultAccessContext,
  VaultSecretEnvelope,
  EncryptedSecretEntry,
  VaultResult,
  VaultErrorResult,
  VaultAccessRole,
  VaultSecretType,
} from "./vault-types";
import {
  VAULT_ROLE_PERMISSIONS,
  VAULT_ROLE_SECRET_TYPES,
} from "./vault-types";

// ── Current envelope version ──────────────────────────────────────────────────

const ENVELOPE_VERSION = "2" as const;
const ALGORITHM        = "aes-256-gcm" as const;

// ── SecureVault ───────────────────────────────────────────────────────────────

export class SecureVault {

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Decrypt and return a secret payload from a vault envelope.
   *
   * Enforces role permissions and tenant isolation before decryption.
   * Emits a vault audit event on every call (success or failure).
   *
   * @param ref      SecretRef identifying the secret to read
   * @param envelope VaultSecretEnvelope unpacked from Integration.secretsJson
   * @param context  VaultAccessContext with caller identity and role
   */
  static readSecret<T extends VaultSecretPayload = VaultSecretPayload>(
    ref:      SecretRef,
    envelope: VaultSecretEnvelope,
    context:  VaultAccessContext,
  ): VaultResult<T> {
    const startedAt = Date.now();
    const refHash   = hashSecretReference(ref.uri);

    // Role check
    const roleError = checkRolePermission(context.role, "READ", ref.type);
    if (roleError) {
      logVaultAccess(buildAuditFailure(
        "DENIED", context.organizationId, ref.provider, ref.type,
        refHash, context.accessedBy, context.role, roleError,
        Date.now() - startedAt, context.requestId,
      ));
      return errResult("ACCESS_DENIED", roleError, startedAt);
    }

    // Find entry
    const entry = envelope.secrets.find(s => s.id === ref.secretId);
    if (!entry) {
      const reason = `Secret "${ref.secretId}" not found in envelope for provider "${ref.provider}"`;
      logVaultAccess(buildAuditFailure(
        "READ", context.organizationId, ref.provider, ref.type,
        refHash, context.accessedBy, context.role, reason,
        Date.now() - startedAt, context.requestId,
      ));
      return errResult("NOT_FOUND", reason, startedAt);
    }

    // Decrypt
    let payload: VaultSecretPayload;
    try {
      payload = decryptSecret(entry.ciphertext);
    } catch (err) {
      const reason = err instanceof VaultCryptoError ? err.message : "Decryption failed";
      logVaultAccess(buildAuditFailure(
        "READ", context.organizationId, ref.provider, ref.type,
        refHash, context.accessedBy, context.role, reason,
        Date.now() - startedAt, context.requestId,
      ));
      return errResult("DECRYPTION_FAILED", reason, startedAt);
    }

    const durationMs = Date.now() - startedAt;
    logVaultAccess(buildAuditSuccess(
      "READ", context.organizationId, ref.provider, ref.type,
      refHash, context.accessedBy, context.role, durationMs, context.requestId,
    ));

    return {
      success:    true,
      payload:    payload as T,
      ref,
      durationMs,
    };
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  /**
   * Encrypt a secret payload and add (or replace) it in a vault envelope.
   *
   * The returned envelope must be packed and saved to Integration.secretsJson
   * by the caller. SecureVault does not write to the database.
   *
   * If the secretId already exists in the envelope, it is replaced.
   * If it does not exist, a new entry is created.
   *
   * @param ref      SecretRef identifying where to store the secret
   * @param payload  VaultSecretPayload to encrypt
   * @param envelope Existing envelope (or a new empty one from newEnvelope())
   * @param context  VaultAccessContext with caller identity and role
   */
  static writeSecret(
    ref:      SecretRef,
    payload:  VaultSecretPayload,
    envelope: VaultSecretEnvelope,
    context:  VaultAccessContext,
  ): { env: VaultSecretEnvelope } | VaultErrorResult {
    const startedAt = Date.now();
    const refHash   = hashSecretReference(ref.uri);

    // Role check
    const roleError = checkRolePermission(context.role, "WRITE", ref.type);
    if (roleError) {
      logVaultAccess(buildAuditFailure(
        "DENIED", context.organizationId, ref.provider, ref.type,
        refHash, context.accessedBy, context.role, roleError,
        Date.now() - startedAt, context.requestId,
      ));
      return errResult("ACCESS_DENIED", roleError, startedAt);
    }

    // Encrypt
    let ciphertext: string;
    let keyVersion: number;
    try {
      const result = encryptSecret(payload);
      ciphertext = result.ciphertext;
      keyVersion = result.keyVersion;
    } catch (err) {
      const reason = err instanceof VaultCryptoError ? err.message : "Encryption failed";
      logVaultAccess(buildAuditFailure(
        "WRITE", context.organizationId, ref.provider, ref.type,
        refHash, context.accessedBy, context.role, reason,
        Date.now() - startedAt, context.requestId,
      ));
      return errResult("ENCRYPTION_FAILED", reason, startedAt);
    }

    const now = new Date().toISOString();
    const existingIdx = envelope.secrets.findIndex(s => s.id === ref.secretId);

    const newEntry: EncryptedSecretEntry = {
      id:         ref.secretId,
      type:       ref.type,
      ciphertext,
      keyVersion,
      createdAt:  existingIdx >= 0
        ? (envelope.secrets[existingIdx]?.createdAt ?? now)
        : now,
      rotatedAt:  existingIdx >= 0 ? now : null,
    };

    const newSecrets = [...envelope.secrets];
    if (existingIdx >= 0) {
      newSecrets[existingIdx] = newEntry;
    } else {
      newSecrets.push(newEntry);
    }

    const newEnv: VaultSecretEnvelope = {
      version:   ENVELOPE_VERSION,
      algorithm: ALGORITHM,
      secrets:   newSecrets,
    };

    const durationMs = Date.now() - startedAt;
    logVaultAccess(buildAuditSuccess(
      "WRITE", context.organizationId, ref.provider, ref.type,
      refHash, context.accessedBy, context.role, durationMs, context.requestId,
    ));

    return { env: newEnv };
  }

  // ── Rotate ──────────────────────────────────────────────────────────────────

  /**
   * Re-encrypt all secrets in an envelope under the current VAULT_MASTER_KEY.
   *
   * Use when rotating the master key:
   *   1. Set VAULT_MASTER_KEY to the new key
   *   2. Pass the old key as oldKey
   *   3. Call rotateEnvelope() for each tenant's integration
   *   4. Save the returned envelope to Integration.secretsJson
   *   5. Decommission the old key after all envelopes are rotated
   *
   * @param envelope  Existing envelope to rotate
   * @param oldKey    Previous master key as 32-byte Buffer
   * @param context   Caller context (must have ROTATE permission)
   */
  static rotateEnvelope(
    envelope:  VaultSecretEnvelope,
    oldKey:    Buffer,
    context:   VaultAccessContext,
    newKeyVersion: number,
  ): { env: VaultSecretEnvelope } | VaultErrorResult {
    const startedAt = Date.now();

    const roleError = checkRolePermission(context.role, "ROTATE", "api_token"); // type doesn't matter for rotation
    if (roleError) {
      return errResult("ACCESS_DENIED", roleError, startedAt);
    }

    const rotated: EncryptedSecretEntry[] = [];

    for (const entry of envelope.secrets) {
      try {
        const result = rotateSecret(entry.ciphertext, oldKey, newKeyVersion);
        rotated.push({
          ...entry,
          ciphertext: result.ciphertext,
          keyVersion: result.keyVersion,
          rotatedAt:  new Date().toISOString(),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Rotation failed";
        return errResult("DECRYPTION_FAILED", `Key rotation failed on entry "${entry.id}": ${reason}`, startedAt);
      }
    }

    const durationMs = Date.now() - startedAt;
    logVaultAccess(buildAuditSuccess(
      "ROTATE", context.organizationId, "vault", "api_token",
      "rotation", context.accessedBy, context.role, durationMs, context.requestId,
    ));

    return {
      env: {
        version:   ENVELOPE_VERSION,
        algorithm: ALGORITHM,
        secrets:   rotated,
      },
    };
  }

  // ── Envelope helpers ─────────────────────────────────────────────────────────

  /**
   * Create a new, empty VaultSecretEnvelope.
   *
   * Use when creating a DIAN integration for a new tenant.
   */
  static newEnvelope(): VaultSecretEnvelope {
    return { version: ENVELOPE_VERSION, algorithm: ALGORITHM, secrets: [] };
  }

  /**
   * Parse Integration.secretsJson into a typed VaultSecretEnvelope.
   *
   * Handles:
   *   - null / undefined / empty → returns an empty envelope (not an error)
   *   - version "1" (legacy ad-hoc shape) → returns empty envelope
   *   - version "2" (vault-managed) → returns parsed envelope
   *   - malformed JSON → throws VaultEnvelopeError
   *
   * NEVER log the raw argument — it may contain encrypted secret material.
   */
  static unpackEnvelope(raw: unknown): VaultSecretEnvelope {
    if (!raw) return SecureVault.newEnvelope();

    if (typeof raw !== "object" || Array.isArray(raw)) {
      throw new VaultEnvelopeError(
        "Integration.secretsJson is not a JSON object. " +
        "Expected a VaultSecretEnvelope (version 2) or null.",
      );
    }

    const obj = raw as Record<string, unknown>;

    // Version 1 (legacy) — return empty envelope (force migration on next write)
    if (obj["version"] === "1") {
      return SecureVault.newEnvelope();
    }

    // Version 2 (vault-managed)
    if (obj["version"] === "2") {
      if (!Array.isArray(obj["secrets"])) {
        throw new VaultEnvelopeError(
          "VaultSecretEnvelope version 2 is missing the \"secrets\" array.",
        );
      }
      return raw as VaultSecretEnvelope;
    }

    // Unknown version
    if (obj["version"]) {
      throw new VaultEnvelopeError(
        `Unknown VaultSecretEnvelope version: "${obj["version"]}". ` +
        "Expected version \"2\".",
      );
    }

    // No version field — return empty
    return SecureVault.newEnvelope();
  }

  /**
   * Serialize a VaultSecretEnvelope to a plain object for storage in
   * Integration.secretsJson via Prisma.
   *
   * The result is a POJO safe to pass to Prisma as a JSON field.
   */
  static packEnvelope(envelope: VaultSecretEnvelope): Record<string, unknown> {
    return {
      version:   envelope.version,
      algorithm: envelope.algorithm,
      secrets:   envelope.secrets.map(entry => ({
        id:         entry.id,
        type:       entry.type,
        ciphertext: entry.ciphertext,
        keyVersion: entry.keyVersion,
        createdAt:  entry.createdAt,
        rotatedAt:  entry.rotatedAt,
      })),
    };
  }

  /**
   * Check if an envelope contains a specific secretId.
   */
  static hasSecret(envelope: VaultSecretEnvelope, secretId: string): boolean {
    return envelope.secrets.some(s => s.id === secretId);
  }

  /**
   * List all secret IDs in an envelope (no payloads — metadata only).
   */
  static listSecretIds(envelope: VaultSecretEnvelope): string[] {
    return envelope.secrets.map(s => s.id);
  }
}

// ── Role check helper ─────────────────────────────────────────────────────────

function checkRolePermission(
  role:       VaultAccessRole,
  operation:  "READ" | "WRITE" | "ROTATE" | "DELETE",
  secretType: VaultSecretType,
): string | null {
  const allowedOps = VAULT_ROLE_PERMISSIONS[role];
  if (!allowedOps.includes(operation)) {
    return (
      `Role "${role}" is not permitted to perform "${operation}" on vault secrets. ` +
      `Allowed operations: ${allowedOps.length ? allowedOps.join(", ") : "none"}.`
    );
  }

  const allowedTypes = VAULT_ROLE_SECRET_TYPES[role];
  if (allowedTypes !== "*" && !allowedTypes.includes(secretType)) {
    return (
      `Role "${role}" is not permitted to access secrets of type "${secretType}". ` +
      `Allowed types: ${allowedTypes.length ? allowedTypes.join(", ") : "none"}.`
    );
  }

  return null;
}

// ── Result helpers ────────────────────────────────────────────────────────────

function errResult(
  code:       VaultErrorResult["code"],
  error:      string,
  startedAt:  number,
): VaultErrorResult {
  return { success: false, error, code, durationMs: Date.now() - startedAt };
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class VaultEnvelopeError extends Error {
  constructor(message: string) {
    super(`[VaultEnvelope] ${message}`);
    this.name = "VaultEnvelopeError";
  }
}
