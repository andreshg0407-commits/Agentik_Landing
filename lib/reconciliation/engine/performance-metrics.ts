/**
 * lib/reconciliation/engine/performance-metrics.ts
 *
 * AGENTIK-RECON-ENGINE-03
 * Reconciliation Engine Performance Metrics
 *
 * Tracks wall-clock time per engine phase and produces a
 * ReconPerformanceMetrics snapshot that is stored in ReconciliationRun.metadataJson.
 *
 * Design:
 *   - PerformanceTracker is created at the start of a run
 *   - markPhase() is called at each phase boundary
 *   - finish() produces the final metrics snapshot
 *   - Metrics include shadow run stats when applicable
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReconPhaseTimings {
  /** Time spent in PHASE 1: input validation (ms) */
  validationMs:    number;
  /** Time spent in PHASE 2: duplicate detection (ms) */
  deduplicationMs: number;
  /** Time spent in PHASE 3: index construction (ms) */
  indexingMs:      number;
  /** Time spent in PHASE 4: exact match pass (ms) */
  exactMatchMs:    number;
  /** Time spent in PHASE 5: fuzzy match pass (ms) */
  fuzzyMatchMs:    number;
  /** Time spent in PHASE 6: result assembly (ms) */
  buildResultMs:   number;
}

export interface ShadowRunMetrics {
  /** Fraction of records that were shadow-run (0.0–1.0) */
  sampleRate:     number;
  /** Wall time of the universal engine shadow run (ms) */
  shadowTimeMs:   number;
  /** Whether legacy and universal match rates agreed within tolerance */
  parityPassed:   boolean;
  /** |legacyMatchRate - universalMatchRate| / legacyMatchRate (0.0–1.0) */
  parityDeltaPct: number;
  /** Records used in shadow run */
  shadowInputA:   number;
  shadowInputB:   number;
}

/**
 * Full performance snapshot for one reconciliation run.
 * Stored as ReconciliationRun.metadataJson.performance.
 */
export interface ReconPerformanceMetrics {
  /** Total wall time including all phases (ms) */
  processingTimeMs:  number;
  /** Records from source A */
  totalInputA:       number;
  /** Records from source B */
  totalInputB:       number;
  /** Number of processing batches (1 = not batched) */
  batchCount:        number;
  /** Average records per batch for source A */
  avgBatchSizeA:     number;
  /** Average records per batch for source B */
  avgBatchSizeB:     number;
  /** Combined throughput: (A + B) records / second */
  throughputPerSec:  number;
  /** Per-phase wall times */
  phaseTimings:      ReconPhaseTimings;
  /** Present when shadow mode ran for this execution */
  shadow?:           ShadowRunMetrics;
  /** Engine version that produced this run */
  engineVersion:     string;
}

// ── Phase names ────────────────────────────────────────────────────────────────

export const PHASE = {
  validation:    "validation",
  deduplication: "deduplication",
  indexing:      "indexing",
  exactMatch:    "exactMatch",
  fuzzyMatch:    "fuzzyMatch",
  buildResult:   "buildResult",
} as const;

export type PhaseName = typeof PHASE[keyof typeof PHASE];

// ── PerformanceTracker ─────────────────────────────────────────────────────────

/**
 * Stateful performance tracker for one reconciliation run.
 *
 * Usage:
 *   const tracker = new PerformanceTracker("1.0.0");
 *   // ... phase 1 ...
 *   tracker.markPhase(PHASE.validation);
 *   // ... phase 2 ...
 *   tracker.markPhase(PHASE.deduplication);
 *   // ...
 *   const metrics = tracker.finish({ totalInputA, totalInputB });
 */
export class PerformanceTracker {
  private readonly t0:         number;
  private phaseT0:             number;
  private readonly phases:     Map<PhaseName, number>;
  private readonly version:    string;

  constructor(engineVersion: string) {
    this.t0      = Date.now();
    this.phaseT0 = this.t0;
    this.phases  = new Map();
    this.version = engineVersion;
  }

  /**
   * Record the elapsed time since the last markPhase() (or construction)
   * and reset the phase timer.
   */
  markPhase(name: PhaseName): void {
    const now = Date.now();
    this.phases.set(name, now - this.phaseT0);
    this.phaseT0 = now;
  }

  /**
   * Produce the final metrics snapshot.
   * Call after all phases have been marked.
   */
  finish(params: {
    totalInputA:    number;
    totalInputB:    number;
    batchCount?:    number;
    shadow?:        ShadowRunMetrics;
  }): ReconPerformanceMetrics {
    const totalMs = Date.now() - this.t0;
    const records = params.totalInputA + params.totalInputB;
    const throughput = totalMs > 0
      ? Math.round((records / totalMs) * 1000)
      : records;

    const bc = params.batchCount ?? 1;

    return {
      processingTimeMs: totalMs,
      totalInputA:      params.totalInputA,
      totalInputB:      params.totalInputB,
      batchCount:       bc,
      avgBatchSizeA:    bc > 1 ? Math.round(params.totalInputA / bc) : params.totalInputA,
      avgBatchSizeB:    bc > 1 ? Math.round(params.totalInputB / bc) : params.totalInputB,
      throughputPerSec: throughput,
      phaseTimings: {
        validationMs:    this.phases.get(PHASE.validation)    ?? 0,
        deduplicationMs: this.phases.get(PHASE.deduplication) ?? 0,
        indexingMs:      this.phases.get(PHASE.indexing)      ?? 0,
        exactMatchMs:    this.phases.get(PHASE.exactMatch)    ?? 0,
        fuzzyMatchMs:    this.phases.get(PHASE.fuzzyMatch)    ?? 0,
        buildResultMs:   this.phases.get(PHASE.buildResult)   ?? 0,
      },
      shadow:        params.shadow,
      engineVersion: this.version,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Compute parity delta percentage between two match rates.
 * Returns a fraction 0.0–1.0.
 */
export function computeParityDelta(
  legacyMatchRate:    number,
  universalMatchRate: number,
): number {
  if (legacyMatchRate === 0) return universalMatchRate > 0 ? 1 : 0;
  return Math.abs(legacyMatchRate - universalMatchRate) / legacyMatchRate;
}
