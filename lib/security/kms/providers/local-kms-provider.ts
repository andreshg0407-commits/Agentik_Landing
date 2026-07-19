/**
 * lib/security/kms/providers/local-kms-provider.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * Local KMS Provider — AES-256-GCM In-Process Implementation
 *
 * Server-only. Uses Node.js crypto module.
 *
 * This is the default provider for Agentik. It uses AES-256-GCM for
 * symmetric encryption with per-operation random IVs.
 *
 * Security model:
 *   - Key material is stored in an internal Map<keyId, Buffer>
 *   - Key bytes are NEVER returned through any public method
 *   - Each key version is a separate 32-byte random key
 *   - Encrypted envelopes contain: IV(12) + AuthTag(16) + Ciphertext
 *   - Envelope format is base64-encoded for JSON safety
 *
 * Limitations (acceptable for LOCAL provider):
 *   - Keys are in-memory only — not persistent across restarts
 *   - Use prisma-kms-repository for persistence of metadata
 *   - For production, migrate to AWS/Azure/GCP provider
 */

import "server-only";

import * as crypto from "crypto";
import type {
  KmsProvider,
  KmsEncryptParams,
  KmsDecryptParams,
  KmsDecryptResult,
  KmsRotateParams,
  KmsRotateResult,
  KmsKeyLifecycleParams,
  KmsProviderHealthResult,
} from "../kms-provider";
import type {
  KmsKeyMetadata,
  KmsKeyCreateInput,
  KmsEncryptedEnvelope,
} from "../kms-key";
import { buildKeyVersionRef, isKeyOperational } from "../kms-key";
import type { KmsResult } from "../kms-types";

// ── Internal types ─────────────────────────────────────────────────────────────

interface InternalKeyEntry {
  metadata:  KmsKeyMetadata;
  /** Key material — NEVER exposed outside this module. */
  keyBytes:  Buffer;
  /** Previous key versions (for decrypting old data during rotation grace period). */
  oldVersions: Map<number, Buffer>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALGORITHM  = "aes-256-gcm";
const IV_LENGTH  = 12;   // 96-bit IV for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag
const KEY_SIZE   = 32;   // 256-bit key

// ── LocalKmsProvider ──────────────────────────────────────────────────────────

/**
 * LocalKmsProvider — in-process AES-256-GCM key management.
 * Implements the KmsProvider contract for local/development use.
 */
export class LocalKmsProvider implements KmsProvider {
  readonly providerType = "LOCAL" as const;

  /** Internal key store — contains key material, never exposed. */
  private readonly _keys: Map<string, InternalKeyEntry> = new Map();

  /** Alias → keyId index for fast lookup. */
  private readonly _aliasByOrg: Map<string, string> = new Map();

  // ── generateKey ─────────────────────────────────────────────────────────────

  async generateKey(input: KmsKeyCreateInput): Promise<KmsResult<KmsKeyMetadata>> {
    try {
      if (!input.orgSlug || !input.keyAlias) {
        return { ok: false, error: "org_slug_and_key_alias_required", riskLevel: "CRITICAL" };
      }

      const compositeKey = this._compositeKey(input.keyAlias, input.orgSlug);
      if (this._aliasByOrg.has(compositeKey)) {
        return { ok: false, error: "key_alias_already_exists_for_org", riskLevel: "HIGH" };
      }

      const keyId      = this._generateId();
      const keyBytes   = crypto.randomBytes(KEY_SIZE);
      const now        = new Date().toISOString();

      const metadata: KmsKeyMetadata = {
        keyId,
        keyAlias:    input.keyAlias,
        provider:    "LOCAL",
        status:      "ACTIVE",
        version:     1,
        algorithm:   "AES-256-GCM",
        orgSlug:     input.orgSlug,
        createdAt:   now,
        rotatedAt:   undefined,
        expiresAt:   input.expiresAt ?? undefined,
        description: input.description,
        tags:        input.tags,
      };

      this._keys.set(keyId, { metadata, keyBytes, oldVersions: new Map() });
      this._aliasByOrg.set(compositeKey, keyId);

      // Return metadata — NOT key bytes
      return { ok: true, value: { ...metadata } };
    } catch {
      return { ok: false, error: "key_generation_failed", riskLevel: "CRITICAL" };
    }
  }

  // ── encrypt ─────────────────────────────────────────────────────────────────

  async encrypt(params: KmsEncryptParams): Promise<KmsResult<KmsEncryptedEnvelope>> {
    try {
      const entry = this._resolveByAlias(params.keyAlias, params.orgSlug);
      if (!entry) {
        return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      }
      if (!isKeyOperational(entry.metadata)) {
        return { ok: false, error: `key_not_operational:${entry.metadata.status}`, riskLevel: "CRITICAL" };
      }

      const iv       = crypto.randomBytes(IV_LENGTH);
      const cipher   = crypto.createCipheriv(ALGORITHM, entry.keyBytes, iv, { authTagLength: TAG_LENGTH });
      const encrypted = Buffer.concat([
        cipher.update(params.plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Format: IV(12) | AuthTag(16) | Ciphertext
      const payload    = Buffer.concat([iv, authTag, encrypted]);
      const ciphertext = payload.toString("base64");

      const envelope: KmsEncryptedEnvelope = {
        ciphertext,
        keyRef:      buildKeyVersionRef(entry.metadata),
        algorithm:   `${ALGORITHM}/${TAG_LENGTH * 8}bit-tag`,
        encryptedAt: new Date().toISOString(),
        context:     params.context,
      };

      return { ok: true, value: envelope };
    } catch {
      return { ok: false, error: "encryption_failed", riskLevel: "CRITICAL" };
    }
  }

  // ── decrypt ─────────────────────────────────────────────────────────────────

  async decrypt(params: KmsDecryptParams): Promise<KmsResult<KmsDecryptResult>> {
    try {
      const { envelope, orgSlug } = params;

      // Tenant check
      if (envelope.keyRef.orgSlug !== orgSlug) {
        return { ok: false, error: "tenant_mismatch", riskLevel: "CRITICAL" };
      }

      const entry = this._keys.get(envelope.keyRef.keyId);
      if (!entry) {
        return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      }

      // Resolve the correct key version for decryption
      let keyBytes: Buffer;
      if (envelope.keyRef.version === entry.metadata.version) {
        keyBytes = entry.keyBytes;
      } else {
        const old = entry.oldVersions.get(envelope.keyRef.version);
        if (!old) {
          return { ok: false, error: "key_version_not_found", riskLevel: "HIGH" };
        }
        keyBytes = old;
      }

      const payload  = Buffer.from(envelope.ciphertext, "base64");
      const iv       = payload.subarray(0, IV_LENGTH);
      const authTag  = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const cipherBuf = payload.subarray(IV_LENGTH + TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, keyBytes, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([decipher.update(cipherBuf), decipher.final()]).toString("utf8");

      return {
        ok: true,
        value: {
          plaintext,
          keyAlias:   entry.metadata.keyAlias,
          keyVersion: envelope.keyRef.version,
        },
      };
    } catch {
      return { ok: false, error: "decryption_failed", riskLevel: "CRITICAL" };
    }
  }

  // ── rotateKey ───────────────────────────────────────────────────────────────

  async rotateKey(params: KmsRotateParams): Promise<KmsResult<KmsRotateResult>> {
    try {
      const entry = this._resolveByAlias(params.keyAlias, params.orgSlug);
      if (!entry) {
        return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      }
      if (entry.metadata.status === "DISABLED" || entry.metadata.status === "REVOKED") {
        return { ok: false, error: `key_not_rotatable:${entry.metadata.status}`, riskLevel: "CRITICAL" };
      }
      if (entry.metadata.status === "ROTATING") {
        return { ok: false, error: "rotation_already_in_progress", riskLevel: "HIGH" };
      }

      const previousVersion = entry.metadata.version;
      const newVersion      = previousVersion + 1;
      const newKeyBytes     = crypto.randomBytes(KEY_SIZE);

      // Preserve old key version for grace-period decryption
      entry.oldVersions.set(previousVersion, entry.keyBytes);

      // Update to new key (material not exposed)
      entry.keyBytes = newKeyBytes;
      entry.metadata.version   = newVersion;
      entry.metadata.rotatedAt = new Date().toISOString();
      entry.metadata.status    = "ACTIVE";

      return {
        ok: true,
        value: {
          previousVersion,
          newVersion,
          metadata: { ...entry.metadata },
        },
      };
    } catch {
      return { ok: false, error: "rotation_failed", riskLevel: "CRITICAL" };
    }
  }

  // ── disableKey ──────────────────────────────────────────────────────────────

  async disableKey(params: KmsKeyLifecycleParams): Promise<KmsResult<KmsKeyMetadata>> {
    return this._setStatus(params, "DISABLED");
  }

  // ── enableKey ───────────────────────────────────────────────────────────────

  async enableKey(params: KmsKeyLifecycleParams): Promise<KmsResult<KmsKeyMetadata>> {
    const entry = this._resolveByAlias(params.keyAlias, params.orgSlug);
    if (!entry) {
      return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
    }
    if (entry.metadata.status === "REVOKED") {
      return { ok: false, error: "revoked_key_cannot_be_enabled", riskLevel: "CRITICAL" };
    }
    entry.metadata.status = "ACTIVE";
    return { ok: true, value: { ...entry.metadata } };
  }

  // ── deleteKey ───────────────────────────────────────────────────────────────

  async deleteKey(params: KmsKeyLifecycleParams): Promise<KmsResult<{ deleted: boolean; keyAlias: string }>> {
    try {
      const compositeKey = this._compositeKey(params.keyAlias, params.orgSlug);
      const keyId = this._aliasByOrg.get(compositeKey);
      if (!keyId) {
        return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      }

      const entry = this._keys.get(keyId);
      if (entry) {
        // Securely wipe key material before removing
        entry.keyBytes.fill(0);
        entry.oldVersions.forEach(buf => buf.fill(0));
        entry.oldVersions.clear();
      }

      this._keys.delete(keyId);
      this._aliasByOrg.delete(compositeKey);

      return { ok: true, value: { deleted: true, keyAlias: params.keyAlias } };
    } catch {
      return { ok: false, error: "delete_failed", riskLevel: "CRITICAL" };
    }
  }

  // ── healthCheck ─────────────────────────────────────────────────────────────

  async healthCheck(): Promise<KmsProviderHealthResult> {
    const t0 = Date.now();
    try {
      // Verify crypto module is functional by generating and wiping a test key
      const testKey = crypto.randomBytes(KEY_SIZE);
      testKey.fill(0);

      return {
        status:    "HEALTHY",
        provider:  "LOCAL",
        latencyMs: Date.now() - t0,
        details:   `local_kms_healthy: ${this._keys.size} key(s) registered`,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        status:    "UNAVAILABLE",
        provider:  "LOCAL",
        latencyMs: Date.now() - t0,
        details:   "local_kms_crypto_unavailable",
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // ── getKeyMetadata ──────────────────────────────────────────────────────────

  async getKeyMetadata(keyAlias: string, orgSlug: string): Promise<KmsResult<KmsKeyMetadata>> {
    const entry = this._resolveByAlias(keyAlias, orgSlug);
    if (!entry) {
      return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
    }
    return { ok: true, value: { ...entry.metadata } };
  }

  // ── listKeys (additional helper) ─────────────────────────────────────────────

  listKeys(orgSlug: string): KmsKeyMetadata[] {
    return Array.from(this._keys.values())
      .filter(e => e.metadata.orgSlug === orgSlug)
      .map(e => ({ ...e.metadata }));
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _compositeKey(keyAlias: string, orgSlug: string): string {
    return `${orgSlug}::${keyAlias}`;
  }

  private _resolveByAlias(keyAlias: string, orgSlug: string): InternalKeyEntry | null {
    const compositeKey = this._compositeKey(keyAlias, orgSlug);
    const keyId = this._aliasByOrg.get(compositeKey);
    if (!keyId) return null;
    return this._keys.get(keyId) ?? null;
  }

  private _setStatus(
    params: KmsKeyLifecycleParams,
    status: "DISABLED" | "REVOKED",
  ): Promise<KmsResult<KmsKeyMetadata>> {
    const entry = this._resolveByAlias(params.keyAlias, params.orgSlug);
    if (!entry) {
      return Promise.resolve({ ok: false, error: "key_not_found", riskLevel: "HIGH" as const });
    }
    entry.metadata.status = status;
    return Promise.resolve({ ok: true, value: { ...entry.metadata } });
  }

  private _generateId(): string {
    return crypto.randomBytes(12).toString("hex");
  }
}

/** Default singleton instance for the local provider. */
export const localKmsProvider = new LocalKmsProvider();
