/**
 * repositories/repository-contract.ts
 *
 * Official repository interface for the Commercial Data Layer.
 * Every domain repository must implement CommercialRepository.
 */

import type { CanonicalRecord } from "../contracts";

// ── Commercial Repository ───────────────────────────────────────────────────

export interface CommercialRepository<T extends CanonicalRecord> {
  /** Find a record by canonical ID */
  find(canonicalId: string): Promise<T | null>;

  /** Find a record by its external system ID */
  findByExternalId(externalId: string, system: string): Promise<T | null>;

  /** Find multiple records matching a filter */
  findMany(filter: RepositoryFilter): Promise<RepositoryPage<T>>;

  /** Insert or update a single record (idempotent by naturalKey) */
  upsert(record: T): Promise<UpsertResult<T>>;

  /** Insert or update multiple records in a single operation */
  bulkUpsert(records: T[]): Promise<BulkUpsertResult>;

  /** Soft-delete a record (mark as DELETED, never physical delete) */
  delete(canonicalId: string): Promise<boolean>;

  /** Create a point-in-time snapshot of current state */
  snapshot(tenantId: string): Promise<SnapshotReference>;
}

// ── Filter ──────────────────────────────────────────────────────────────────

export interface RepositoryFilter {
  readonly tenantId: string;
  readonly domain?: string;
  readonly state?: string;
  readonly updatedAfter?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

// ── Pagination ──────────────────────────────────────────────────────────────

export interface RepositoryPage<T> {
  readonly records: T[];
  readonly total: number;
  readonly hasMore: boolean;
}

// ── Upsert Result ───────────────────────────────────────────────────────────

export interface UpsertResult<T> {
  readonly record: T;
  readonly action: "CREATED" | "UPDATED" | "UNCHANGED";
  readonly previousVersion: number | null;
}

// ── Bulk Upsert Result ──────────────────────────────────────────────────────

export interface BulkUpsertResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly errors: Array<{ recordId: string; message: string }>;
}

// ── Snapshot Reference ──────────────────────────────────────────────────────

export interface SnapshotReference {
  readonly snapshotId: string;
  readonly tenantId: string;
  readonly domain: string;
  readonly createdAt: Date;
  readonly recordCount: number;
}
