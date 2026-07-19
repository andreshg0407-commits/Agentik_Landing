/**
 * lib/security/kms/kms-repository.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Repository Interface — Persistence Contract
 *
 * No server-only. No Prisma. Pure interface contract.
 *
 * Defines the persistence interface for KMS key metadata.
 * Implemented by:
 *   - persistence/prisma-kms-repository.ts (PostgreSQL via Prisma)
 *   - InMemoryKmsRepository (testing)
 *
 * CRITICAL: Only metadata is persisted. Key material stays
 * in the provider (never written to the repository).
 */

import type { KmsKeyMetadata, KmsKeyCreateInput } from "./kms-key";
import type { KmsKeyStatus, KmsResult } from "./kms-types";

// ── KmsRepository ─────────────────────────────────────────────────────────────

/**
 * KmsRepository — persistence interface for KMS key metadata.
 *
 * All operations are tenant-scoped (orgSlug required).
 * No key material is stored at any point.
 */
export interface KmsRepository {
  /**
   * saveKey — persist new key metadata.
   * Returns error if keyId already exists for this org.
   */
  saveKey(metadata: KmsKeyMetadata): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * updateKey — update mutable fields of an existing key.
   * keyId and orgSlug cannot be changed.
   */
  updateKey(
    keyId:   string,
    orgSlug: string,
    updates: Partial<Omit<KmsKeyMetadata, "keyId" | "orgSlug">>,
  ): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * deleteKey — permanently remove key metadata.
   * Used after key material has been destroyed.
   */
  deleteKey(keyId: string, orgSlug: string): Promise<KmsResult<{ deleted: boolean }>>;

  /**
   * findByKeyId — look up metadata by keyId within a tenant.
   */
  findByKeyId(keyId: string, orgSlug: string): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * findByAlias — look up metadata by (orgSlug, keyAlias).
   */
  findByAlias(orgSlug: string, keyAlias: string): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * listByOrg — return all key metadata for a tenant.
   */
  listByOrg(orgSlug: string): Promise<KmsKeyMetadata[]>;

  /**
   * listByStatus — return all keys in a given status for a tenant.
   */
  listByStatus(orgSlug: string, status: KmsKeyStatus): Promise<KmsKeyMetadata[]>;

  /**
   * countByOrg — return the number of keys for a tenant.
   */
  countByOrg(orgSlug: string): Promise<number>;
}

// ── InMemoryKmsRepository ─────────────────────────────────────────────────────

/**
 * InMemoryKmsRepository — test/development implementation of KmsRepository.
 * Not for production. Use PrismaKmsRepository in production.
 */
export class InMemoryKmsRepository implements KmsRepository {
  private readonly _store = new Map<string, KmsKeyMetadata>();

  private _key(keyId: string, orgSlug: string): string {
    return `${orgSlug}::${keyId}`;
  }

  async saveKey(metadata: KmsKeyMetadata): Promise<KmsResult<KmsKeyMetadata>> {
    const k = this._key(metadata.keyId, metadata.orgSlug);
    if (this._store.has(k)) {
      return { ok: false, error: "key_already_exists", riskLevel: "HIGH" };
    }
    this._store.set(k, { ...metadata });
    return { ok: true, value: { ...metadata } };
  }

  async updateKey(
    keyId:   string,
    orgSlug: string,
    updates: Partial<Omit<KmsKeyMetadata, "keyId" | "orgSlug">>,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    const k    = this._key(keyId, orgSlug);
    const meta = this._store.get(k);
    if (!meta) return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
    const updated = { ...meta, ...updates, keyId, orgSlug };
    this._store.set(k, updated);
    return { ok: true, value: { ...updated } };
  }

  async deleteKey(keyId: string, orgSlug: string): Promise<KmsResult<{ deleted: boolean }>> {
    const k = this._key(keyId, orgSlug);
    if (!this._store.has(k)) {
      return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
    }
    this._store.delete(k);
    return { ok: true, value: { deleted: true } };
  }

  async findByKeyId(keyId: string, orgSlug: string): Promise<KmsResult<KmsKeyMetadata>> {
    const meta = this._store.get(this._key(keyId, orgSlug));
    if (!meta) return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
    return { ok: true, value: { ...meta } };
  }

  async findByAlias(orgSlug: string, keyAlias: string): Promise<KmsResult<KmsKeyMetadata>> {
    for (const meta of this._store.values()) {
      if (meta.orgSlug === orgSlug && meta.keyAlias === keyAlias) {
        return { ok: true, value: { ...meta } };
      }
    }
    return { ok: false, error: "key_alias_not_found", riskLevel: "HIGH" };
  }

  async listByOrg(orgSlug: string): Promise<KmsKeyMetadata[]> {
    return Array.from(this._store.values())
      .filter(m => m.orgSlug === orgSlug)
      .map(m => ({ ...m }));
  }

  async listByStatus(orgSlug: string, status: KmsKeyStatus): Promise<KmsKeyMetadata[]> {
    return Array.from(this._store.values())
      .filter(m => m.orgSlug === orgSlug && m.status === status)
      .map(m => ({ ...m }));
  }

  async countByOrg(orgSlug: string): Promise<number> {
    return Array.from(this._store.values()).filter(m => m.orgSlug === orgSlug).length;
  }

  /** Reset for testing. */
  clear(): void {
    this._store.clear();
  }
}

/** Default in-memory repository instance for testing. */
export const inMemoryKmsRepository = new InMemoryKmsRepository();
