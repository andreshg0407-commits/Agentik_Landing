/**
 * lib/security/secret-rotation/secret-version.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Secret Rotation — Secret Version Domain
 *
 * Defines the SecretVersion type and in-memory version store.
 * Versions track metadata ONLY — never the actual secret value.
 *
 * Principles:
 *   - Never store the secret value
 *   - Each rotation produces a new version
 *   - Multiple versions may coexist (grace period)
 *   - Only one version is ACTIVE at a time per secret+org
 */

import type { SecretRotationStatus } from "./rotation-types";

// ── Version Status ────────────────────────────────────────────────────────────

export type SecretVersionStatus =
  | "PENDING"    // created but not yet validated
  | "ACTIVE"     // currently in use
  | "GRACE"      // superseded but still valid during grace period
  | "REVOKED"    // no longer valid
  | "FAILED";    // version creation or validation failed

// ── Secret Version ────────────────────────────────────────────────────────────

/**
 * SecretVersion — metadata for one version of a secret.
 * Never stores the actual secret value.
 */
export interface SecretVersion {
  /** Unique version identifier. */
  id:             string;
  /** The secret this version belongs to (from RotationRegistry). */
  secretId:       string;
  /** The tenant scope. */
  orgSlug:        string;
  /** Sequential version number (1-based). */
  version:        number;
  /** Current status of this version. */
  status:         SecretVersionStatus;
  /** The rotation that created this version. */
  rotationId?:    string;
  /** Who created this version. */
  createdBy:      string;
  /** ISO 8601 timestamp when this version was created. */
  createdAt:      string;
  /** ISO 8601 timestamp when this version was activated (made live). */
  activatedAt?:   string;
  /** ISO 8601 timestamp when this version was revoked. */
  revokedAt?:     string;
  /** ISO 8601 timestamp when this version expires (null = no expiry). */
  expiresAt?:     string;
  /** Optional notes (e.g., who validated, rotation reason). */
  notes?:         string;
}

// ── Version Key ───────────────────────────────────────────────────────────────

export function versionKey(orgSlug: string, secretId: string, version: number): string {
  return `${orgSlug}:${secretId}:v${version}`;
}

export function activeVersionKey(orgSlug: string, secretId: string): string {
  return `${orgSlug}:${secretId}:active`;
}

// ── ID Generator ──────────────────────────────────────────────────────────────

function newVersionId(): string {
  return `sv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── In-Memory Version Store ───────────────────────────────────────────────────

/**
 * In-memory version store for integration tests and server-side caching.
 * Populated from Prisma by the rotation repository in production.
 */
export class SecretVersionStore {
  private readonly _store = new Map<string, SecretVersion>();

  set(version: SecretVersion): void {
    const key = versionKey(version.orgSlug, version.secretId, version.version);
    this._store.set(key, version);
  }

  get(orgSlug: string, secretId: string, version: number): SecretVersion | undefined {
    return this._store.get(versionKey(orgSlug, secretId, version));
  }

  getActive(orgSlug: string, secretId: string): SecretVersion | undefined {
    return [...this._store.values()].find(
      v => v.orgSlug === orgSlug && v.secretId === secretId && v.status === "ACTIVE",
    );
  }

  getAll(orgSlug: string, secretId: string): SecretVersion[] {
    return [...this._store.values()]
      .filter(v => v.orgSlug === orgSlug && v.secretId === secretId)
      .sort((a, b) => b.version - a.version);
  }

  getLatestVersion(orgSlug: string, secretId: string): number {
    const all = this.getAll(orgSlug, secretId);
    return all.length === 0 ? 0 : all[0].version;
  }

  getExpiring(orgSlug: string, withinDays: number): SecretVersion[] {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);
    return [...this._store.values()].filter(v =>
      v.orgSlug === orgSlug &&
      v.status === "ACTIVE" &&
      v.expiresAt !== undefined &&
      v.expiresAt <= threshold.toISOString(),
    );
  }

  remove(orgSlug: string, secretId: string, version: number): void {
    this._store.delete(versionKey(orgSlug, secretId, version));
  }

  /** Return all versions in the store (across all orgs/secrets). */
  list(): SecretVersion[] {
    return [...this._store.values()];
  }

  get size(): number { return this._store.size; }

  _reset(): void { this._store.clear(); }
}

export const secretVersionStore = new SecretVersionStore();

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSecretVersion(params: {
  secretId:    string;
  orgSlug:     string;
  createdBy:   string;
  rotationId?: string;
  expiresAt?:  string;
  notes?:      string;
}): SecretVersion {
  const latest = secretVersionStore.getLatestVersion(params.orgSlug, params.secretId);
  return {
    id:          newVersionId(),
    secretId:    params.secretId,
    orgSlug:     params.orgSlug,
    version:     latest + 1,
    status:      "PENDING",
    rotationId:  params.rotationId,
    createdBy:   params.createdBy,
    createdAt:   new Date().toISOString(),
    expiresAt:   params.expiresAt,
    notes:       params.notes,
  };
}

// ── Status Helpers ────────────────────────────────────────────────────────────

export function isVersionExpired(version: SecretVersion): boolean {
  if (!version.expiresAt) return false;
  return version.expiresAt <= new Date().toISOString();
}

export function isVersionActive(version: SecretVersion): boolean {
  return version.status === "ACTIVE" && !isVersionExpired(version);
}

export function isVersionRevoked(version: SecretVersion): boolean {
  return version.status === "REVOKED";
}

export function versionAgeInDays(version: SecretVersion): number {
  const created = new Date(version.createdAt).getTime();
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

/**
 * Map a SecretRotationStatus to the version status produced at that stage.
 */
export function rotationStatusToVersionStatus(
  rotationStatus: SecretRotationStatus,
): SecretVersionStatus {
  switch (rotationStatus) {
    case "PENDING":    return "PENDING";
    case "VALIDATING": return "PENDING";
    case "READY":      return "PENDING";
    case "ACTIVE":     return "ACTIVE";
    case "REVOKED":    return "REVOKED";
    case "FAILED":     return "FAILED";
    case "CANCELLED":  return "FAILED";
    default:           return "FAILED";
  }
}
