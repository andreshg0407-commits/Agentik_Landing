/**
 * lib/security/secret-rotation/rotation-repository.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Repository — Contract (Interface Only)
 *
 * Defines the persistence contract for rotation records.
 * No Prisma here. No implementation.
 * The Prisma implementation lives in persistence/prisma-rotation-repository.ts.
 */

import type { SecretRotationStatus, RotationStrategy } from "./rotation-types";

// ── Rotation Record ───────────────────────────────────────────────────────────

/**
 * RotationRecord — a persisted rotation operation.
 * Never contains the actual secret value.
 */
export interface RotationRecord {
  id:           string;
  orgSlug:      string;
  secretId:     string;
  strategy:     RotationStrategy;
  status:       SecretRotationStatus;
  requestedBy:  string;
  approvedBy?:  string;
  reason:       string;
  metadata:     Record<string, string | number | boolean>;
  createdAt:    string;
  activatedAt?: string;
  revokedAt?:   string;
  completedAt?: string;
}

// ── Create Input ──────────────────────────────────────────────────────────────

export interface CreateRotationInput {
  orgSlug:     string;
  secretId:    string;
  strategy:    RotationStrategy;
  requestedBy: string;
  reason:      string;
  metadata?:   Record<string, string | number | boolean>;
}

// ── Query Options ─────────────────────────────────────────────────────────────

export interface RotationQueryOptions {
  limit?:  number;
  offset?: number;
}

// ── Repository Contract ───────────────────────────────────────────────────────

/**
 * RotationRepository — persistence contract for rotation records.
 */
export interface RotationRepository {
  /** Create a new rotation record. Returns the created record. */
  createRotation(input: CreateRotationInput): Promise<RotationRecord>;

  /** Get a rotation record by its ID. */
  getRotation(id: string): Promise<RotationRecord | null>;

  /** Update the status of a rotation record. */
  updateStatus(
    id:          string,
    status:      SecretRotationStatus,
    extra?:      Partial<Pick<RotationRecord, "approvedBy" | "activatedAt" | "revokedAt" | "completedAt">>,
  ): Promise<RotationRecord | null>;

  /** Find all rotations for a specific secret in a tenant. */
  findBySecret(
    orgSlug:    string,
    secretId:   string,
    options?:   RotationQueryOptions,
  ): Promise<RotationRecord[]>;

  /** Find all rotations in a given status for a tenant. */
  findByStatus(
    orgSlug:  string,
    status:   SecretRotationStatus,
    options?: RotationQueryOptions,
  ): Promise<RotationRecord[]>;

  /** Find all active rotations for a tenant. */
  findActiveRotations(orgSlug: string): Promise<RotationRecord[]>;

  /** Find all failed rotations for a tenant. */
  findFailedRotations(orgSlug: string, options?: RotationQueryOptions): Promise<RotationRecord[]>;

  /** Count rotations by status for a tenant. */
  countRotations(orgSlug: string, status?: SecretRotationStatus): Promise<number>;

  /** Find the most recent rotation for a secret in a tenant. */
  findLatestRotation(orgSlug: string, secretId: string): Promise<RotationRecord | null>;
}
