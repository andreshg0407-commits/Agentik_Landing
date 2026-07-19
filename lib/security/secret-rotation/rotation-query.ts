/**
 * lib/security/secret-rotation/rotation-query.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Query Helpers — Read-only access patterns for rotation domain
 *
 * No server-only. No Prisma. Pure composition over version store + repository.
 *
 * Functions:
 *   getActiveRotations()    — all rotations with ACTIVE status for an org
 *   getPendingRotations()   — PENDING + VALIDATING rotations for an org
 *   getExpiringSecrets()    — versions expiring within N days
 *   getRotationHistory()    — full rotation history for a secret
 *   getRotationSummary()    — aggregated counts for an org
 *   getVersionsByStatus()   — filter tracked versions by status
 *   getOrphanedVersions()   — GRACE versions with no active version (should be revoked)
 *   getStaleVersions()      — ACTIVE versions past recommended rotation age
 */

import type { RotationRecord }     from "./rotation-repository";
import type { SecretVersion }      from "./secret-version";
import { secretVersionStore }      from "./secret-version";
import { isVersionExpired, versionAgeInDays } from "./secret-version";

// ── Active Rotations ──────────────────────────────────────────────────────────

/**
 * Filter rotations to those currently ACTIVE.
 */
export function getActiveRotations(rotations: RotationRecord[]): RotationRecord[] {
  return rotations.filter(r => r.status === "ACTIVE");
}

// ── Pending Rotations ─────────────────────────────────────────────────────────

/**
 * Return rotations waiting to proceed (PENDING or VALIDATING).
 */
export function getPendingRotations(rotations: RotationRecord[]): RotationRecord[] {
  return rotations.filter(r => r.status === "PENDING" || r.status === "VALIDATING");
}

// ── Expiring Secrets ──────────────────────────────────────────────────────────

export interface ExpiringSecret {
  version:         SecretVersion;
  daysUntilExpiry: number;
  isExpired:       boolean;
}

/**
 * Find all tracked versions expiring within `withinDays` days.
 * Includes already-expired versions (daysUntilExpiry <= 0).
 * Results sorted by urgency (soonest first).
 */
export function getExpiringSecrets(withinDays: number = 30): ExpiringSecret[] {
  const allVersions = secretVersionStore.list();
  const results: ExpiringSecret[] = [];

  for (const version of allVersions) {
    if (!version.expiresAt) continue;
    const msLeft = new Date(version.expiresAt).getTime() - Date.now();
    const daysUntilExpiry = Math.ceil(msLeft / 86_400_000);
    const isExpired = daysUntilExpiry <= 0 || isVersionExpired(version);

    if (isExpired || daysUntilExpiry <= withinDays) {
      results.push({ version, daysUntilExpiry, isExpired });
    }
  }

  return results.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

// ── Rotation History ──────────────────────────────────────────────────────────

export interface RotationHistoryEntry {
  rotationId:  string;
  secretId:    string;
  strategy:    string;
  status:      string;
  requestedBy: string;
  createdAt:   string;
  activatedAt: string | null;
  revokedAt:   string | null;
  completedAt: string | null;
  reason:      string | null;
}

/**
 * Return all rotation records for a given secretId, sorted by createdAt descending.
 */
export function getRotationHistory(
  rotations: RotationRecord[],
  secretId:  string,
): RotationHistoryEntry[] {
  return rotations
    .filter(r => r.secretId === secretId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(r => ({
      rotationId:  r.id,
      secretId:    r.secretId,
      strategy:    r.strategy,
      status:      r.status,
      requestedBy: r.requestedBy,
      createdAt:   r.createdAt,
      activatedAt: r.activatedAt  ?? null,
      revokedAt:   r.revokedAt    ?? null,
      completedAt: r.completedAt  ?? null,
      reason:      r.reason       ?? null,
    }));
}

// ── Rotation Summary ──────────────────────────────────────────────────────────

export interface RotationSummary {
  orgSlug:            string;
  totalRotations:     number;
  activeRotations:    number;
  pendingRotations:   number;
  failedRotations:    number;
  cancelledRotations: number;
  revokedRotations:   number;
  trackedVersions:    number;
  activeVersions:     number;
  graceVersions:      number;
  expiringSoon:       number;
  expired:            number;
}

/**
 * Aggregated counts for dashboards and health displays.
 */
export function getRotationSummary(params: {
  orgSlug:   string;
  rotations: RotationRecord[];
}): RotationSummary {
  const { orgSlug, rotations } = params;

  const allVersions   = secretVersionStore.list().filter(v => v.orgSlug === orgSlug);
  const expiring      = getExpiringSecrets(30).filter(e => e.version.orgSlug === orgSlug);
  const expired       = expiring.filter(e => e.isExpired);
  const expiringSoon  = expiring.filter(e => !e.isExpired);

  return {
    orgSlug,
    totalRotations:     rotations.length,
    activeRotations:    rotations.filter(r => r.status === "ACTIVE").length,
    pendingRotations:   rotations.filter(r => r.status === "PENDING" || r.status === "VALIDATING").length,
    failedRotations:    rotations.filter(r => r.status === "FAILED").length,
    cancelledRotations: rotations.filter(r => r.status === "CANCELLED").length,
    revokedRotations:   rotations.filter(r => r.status === "REVOKED").length,
    trackedVersions:    allVersions.length,
    activeVersions:     allVersions.filter(v => v.status === "ACTIVE").length,
    graceVersions:      allVersions.filter(v => v.status === "GRACE").length,
    expiringSoon:       expiringSoon.length,
    expired:            expired.length,
  };
}

// ── Version Queries ────────────────────────────────────────────────────────────

/**
 * Return all tracked versions with a given status (across all orgs).
 */
export function getVersionsByStatus(
  status: SecretVersion["status"],
): SecretVersion[] {
  return secretVersionStore.list().filter(v => v.status === status);
}

/**
 * Return versions in GRACE status that have no corresponding ACTIVE version.
 * These should be revoked promptly.
 */
export function getOrphanedVersions(): SecretVersion[] {
  const all    = secretVersionStore.list();
  const grace  = all.filter(v => v.status === "GRACE");
  const active = all.filter(v => v.status === "ACTIVE");

  const activeKeys = new Set(active.map(v => `${v.orgSlug}:${v.secretId}`));

  return grace.filter(g => !activeKeys.has(`${g.orgSlug}:${g.secretId}`));
}

/**
 * Return active versions past recommended rotation age (stale).
 */
export function getStaleVersions(recommendedDays: number = 180): SecretVersion[] {
  return secretVersionStore
    .list()
    .filter(v => v.status === "ACTIVE" && versionAgeInDays(v) >= recommendedDays);
}

// ── Failed Rotation Query ─────────────────────────────────────────────────────

export interface FailedRotationEntry {
  rotationId:  string;
  secretId:    string;
  requestedBy: string;
  createdAt:   string;
  reason:      string | null;
  metadata:    Record<string, unknown>;
}

/**
 * Return all failed rotations, sorted by newest first.
 */
export function getFailedRotations(rotations: RotationRecord[]): FailedRotationEntry[] {
  return rotations
    .filter(r => r.status === "FAILED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(r => ({
      rotationId:  r.id,
      secretId:    r.secretId,
      requestedBy: r.requestedBy,
      createdAt:   r.createdAt,
      reason:      r.reason    ?? null,
      metadata:    r.metadata  ?? {},
    }));
}

// ── Rotation Lookup ───────────────────────────────────────────────────────────

/**
 * Find the most recent rotation record for a secret.
 */
export function getLatestRotation(
  rotations: RotationRecord[],
  secretId:  string,
): RotationRecord | null {
  const filtered = rotations.filter(r => r.secretId === secretId);
  if (filtered.length === 0) return null;
  return filtered.reduce((latest, r) =>
    new Date(r.createdAt) > new Date(latest.createdAt) ? r : latest,
  );
}

/**
 * Check whether a given secretId has an in-progress rotation
 * (PENDING, VALIDATING, or READY).
 */
export function hasInProgressRotation(
  rotations: RotationRecord[],
  secretId:  string,
): boolean {
  const inProgress = new Set(["PENDING", "VALIDATING", "READY"]);
  return rotations.some(r => r.secretId === secretId && inProgress.has(r.status));
}
