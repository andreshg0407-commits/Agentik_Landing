/**
 * snapshots/snapshot-contract.ts
 *
 * Contracts for point-in-time snapshots of domain state.
 */

import type { CommercialDomain } from "../contracts";

// ── Snapshot Identity ───────────────────────────────────────────────────────

export interface SnapshotIdentity {
  /** Unique snapshot ID */
  readonly snapshotId: string;

  /** Tenant scope */
  readonly tenantId: string;

  /** Domain this snapshot belongs to */
  readonly domain: CommercialDomain;

  /** Entity type within the domain */
  readonly entityType: string;
}

// ── Snapshot Version ────────────────────────────────────────────────────────

export interface SnapshotVersion {
  /** Monotonically increasing version number */
  readonly version: number;

  /** Previous version (null for first snapshot) */
  readonly previousVersion: number | null;

  /** Correlation ID of the sync that produced this snapshot */
  readonly correlationId: string;
}

// ── Snapshot Metadata ───────────────────────────────────────────────────────

export interface SnapshotMetadata {
  readonly identity: SnapshotIdentity;
  readonly version: SnapshotVersion;
  readonly state: SnapshotState;
  readonly statistics: SnapshotStatistics;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
}

// ── Snapshot State ──────────────────────────────────────────────────────────

export type SnapshotState =
  | "CURRENT"
  | "SUPERSEDED"
  | "EXPIRED"
  | "CORRUPTED";

// ── Snapshot Statistics ─────────────────────────────────────────────────────

export interface SnapshotStatistics {
  /** Total records in this snapshot */
  readonly recordCount: number;

  /** Records added since previous snapshot */
  readonly added: number;

  /** Records modified since previous snapshot */
  readonly modified: number;

  /** Records removed since previous snapshot */
  readonly removed: number;

  /** Average quality score across records */
  readonly avgQuality: number;
}
