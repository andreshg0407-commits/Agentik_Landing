/**
 * adapters/adapter-contract.ts
 *
 * Official adapter interface for the Commercial Data Layer.
 * Every domain adapter must implement CommercialAdapter.
 */

import type { SynchronizationContext, SynchronizationResult } from "../contracts";
import type { QualityAssessment } from "../contracts";

// ── Commercial Adapter ──────────────────────────────────────────────────────

export interface CommercialAdapter<TInput, TOutput> {
  /** Adapter identity */
  readonly id: string;
  readonly version: string;
  readonly domain: string;

  /** Discover available records in the external system */
  discover(ctx: SynchronizationContext): Promise<DiscoveryResult>;

  /** Validate that the external system is reachable and schema-compatible */
  validate(ctx: SynchronizationContext): Promise<ValidationResult>;

  /** Normalize raw external data into canonical form */
  normalize(input: TInput, ctx: SynchronizationContext): Promise<NormalizationResult<TOutput>>;

  /** Execute a full synchronization cycle */
  synchronize(ctx: SynchronizationContext): Promise<SynchronizationResult>;

  /** Report adapter health */
  health(): Promise<AdapterHealthReport>;

  /** Declare adapter capabilities */
  capabilities(): AdapterCapabilities;
}

// ── Discovery ───────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  readonly totalRecords: number;
  readonly newRecords: number;
  readonly modifiedRecords: number;
  readonly deletedRecords: number;
  readonly discoveredAt: Date;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: ValidationIssue[];
  readonly validatedAt: Date;
}

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "ERROR" | "WARNING";
}

// ── Normalization ───────────────────────────────────────────────────────────

export interface NormalizationResult<T> {
  readonly normalized: T | null;
  readonly quality: QualityAssessment;
  readonly skipped: boolean;
  readonly skipReason?: string;
}

// ── Health ───────────────────────────────────────────────────────────────────

export interface AdapterHealthReport {
  readonly status: AdapterHealthStatus;
  readonly lastSuccessfulSync: Date | null;
  readonly lastError: string | null;
  readonly latencyMs: number | null;
  readonly checkedAt: Date;
}

export type AdapterHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

// ── Capabilities ────────────────────────────────────────────────────────────

export interface AdapterCapabilities {
  readonly supportsIncremental: boolean;
  readonly supportsWebhook: boolean;
  readonly supportsDiscovery: boolean;
  readonly supportsBulk: boolean;
  readonly maxBatchSize: number;
  readonly estimatedLatencyMs: number;
}
