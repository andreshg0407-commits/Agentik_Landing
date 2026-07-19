/**
 * shared/health-metrics.ts
 *
 * Health and metrics contracts for the Commercial Data Layer.
 */

// ── Adapter Health ──────────────────────────────────────────────────────────

export interface AdapterHealth {
  readonly adapterId: string;
  readonly domain: string;
  readonly status: HealthStatus;
  readonly lastCheck: Date;
  readonly uptimePercent: number;
  readonly consecutiveFailures: number;
}

export type HealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

// ── Synchronization Metrics ─────────────────────────────────────────────────

export interface SynchronizationMetrics {
  readonly domain: string;
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly avgDurationMs: number;
  readonly avgRecordsPerRun: number;
  readonly lastRunAt: Date | null;
}

// ── Quality Metrics ─────────────────────────────────────────────────────────

export interface QualityMetrics {
  readonly domain: string;
  readonly avgCompleteness: number;
  readonly avgConsistency: number;
  readonly avgFreshness: number;
  readonly avgValidity: number;
  readonly avgConfidence: number;
  readonly rejectionRate: number;
  readonly totalRecords: number;
}

// ── Latency Metrics ─────────────────────────────────────────────────────────

export interface LatencyMetrics {
  readonly adapterId: string;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly sampleCount: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

// ── Snapshot Metrics ────────────────────────────────────────────────────────

export interface SnapshotMetrics {
  readonly domain: string;
  readonly totalSnapshots: number;
  readonly currentRecords: number;
  readonly avgDeltaPerSnapshot: number;
  readonly lastSnapshotAt: Date | null;
  readonly storageEstimateBytes: number;
}
