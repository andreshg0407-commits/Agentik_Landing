/**
 * lib/reconciliation/engine/shadow-config.ts
 *
 * AGENTIK-RECON-ENGINE-03
 * Adaptive Shadow Run Configuration
 *
 * Controls how the shadow engine (universal engine running alongside legacy)
 * samples records and adapts its sampling rate based on parity history.
 *
 * Shadow mode strategy:
 *   - Start at initialRate (default 1.0 = full sampling)
 *   - After rampDownAfter consecutive parity passes → reduce rate by rampDownFactor
 *   - On any parity failure → increase rate by rampUpFactor (more validation)
 *   - Hard floor at minRate (default 10%) — never turn off completely
 *   - Hard ceiling at maxRate (default 100%)
 *
 * Parity check:
 *   Pass if |legacyMatchRate - universalMatchRate| / legacyMatchRate <= parityTolerance
 *
 * State persistence:
 *   AdaptiveShadowState is stored in ReconciliationRun.metadataJson.shadowState so
 *   each run can continue where the previous left off.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../canonical-record";

// ── Configuration ──────────────────────────────────────────────────────────────

export interface ShadowRunConfig {
  /** Whether shadow mode is active at all. */
  enabled:          boolean;
  /** Starting fraction of records to shadow-run (0.0–1.0). */
  initialRate:      number;
  /** Minimum sample rate — floor even after many consecutive passes. */
  minRate:          number;
  /** Maximum sample rate — ceiling. */
  maxRate:          number;
  /** How many consecutive parity passes trigger a rate reduction. */
  rampDownAfter:    number;
  /** Multiply current rate by this on ramp-down (e.g. 0.7 = -30%). */
  rampDownFactor:   number;
  /** Multiply current rate by this on parity failure (e.g. 1.5 = +50%). */
  rampUpFactor:     number;
  /**
   * Maximum allowed relative parity delta for a pass.
   * Relative delta = |legacy - universal| / legacy.
   * Default 0.01 = 1% relative difference allowed.
   */
  parityTolerance:  number;
}

// ── Adaptive state ─────────────────────────────────────────────────────────────

/**
 * Runtime state of the adaptive shadow sampler.
 * Persist in ReconciliationRun.metadataJson to carry forward across runs.
 */
export interface AdaptiveShadowState {
  config:              ShadowRunConfig;
  /** Current effective sample rate (may differ from initialRate after adaptation). */
  currentRate:         number;
  /** Consecutive parity passes without a failure. Reset to 0 on failure. */
  consecutivePasses:   number;
  /** Total shadow runs observed. */
  totalRuns:           number;
  totalParityPasses:   number;
  totalParityFails:    number;
  lastUpdatedAt:       string;  // ISO
}

// ── Defaults ───────────────────────────────────────────────────────────────────

export const DEFAULT_SHADOW_CONFIG: ShadowRunConfig = {
  enabled:         true,
  initialRate:     1.0,    // full sample to start
  minRate:         0.10,   // never drop below 10%
  maxRate:         1.0,
  rampDownAfter:   5,      // ramp down after 5 consecutive clean runs
  rampDownFactor:  0.70,   // reduce by 30% per ramp-down step
  rampUpFactor:    1.50,   // increase by 50% on any parity failure
  parityTolerance: 0.01,   // 1% relative delta = pass
};

// ── State factory ──────────────────────────────────────────────────────────────

export function buildInitialShadowState(
  config: ShadowRunConfig = DEFAULT_SHADOW_CONFIG,
): AdaptiveShadowState {
  return {
    config,
    currentRate:       config.initialRate,
    consecutivePasses: 0,
    totalRuns:         0,
    totalParityPasses: 0,
    totalParityFails:  0,
    lastUpdatedAt:     new Date().toISOString(),
  };
}

// ── Parity check ───────────────────────────────────────────────────────────────

export interface ParityCheckResult {
  passed:           boolean;
  relativeDeltaPct: number;  // 0–100
  legacyMatchRate:  number;
  universalMatchRate: number;
  tolerance:        number;
}

/**
 * Check parity between legacy and universal match rates.
 *
 * A pass means the two engines agree within tolerance.
 * This is the gate for promoting to "universal" mode.
 */
export function checkParity(params: {
  legacyMatchRate:    number;  // 0–100
  universalMatchRate: number;  // 0–100
  tolerance:          number;  // fraction, e.g. 0.01
}): ParityCheckResult {
  const delta = Math.abs(params.legacyMatchRate - params.universalMatchRate);
  const relativeDelta = params.legacyMatchRate > 0
    ? delta / params.legacyMatchRate
    : delta > 0 ? 1 : 0;

  return {
    passed:             relativeDelta <= params.tolerance,
    relativeDeltaPct:   Math.round(relativeDelta * 10000) / 100,
    legacyMatchRate:    params.legacyMatchRate,
    universalMatchRate: params.universalMatchRate,
    tolerance:          params.tolerance,
  };
}

// ── Rate adaptation ────────────────────────────────────────────────────────────

/**
 * Update adaptive state based on the outcome of the last shadow run.
 *
 * Returns a new state object (immutable update pattern).
 */
export function updateAdaptiveRate(
  state:        AdaptiveShadowState,
  parityPassed: boolean,
): AdaptiveShadowState {
  const { config } = state;
  const newConsecutive = parityPassed ? state.consecutivePasses + 1 : 0;

  let newRate = state.currentRate;

  if (!parityPassed) {
    // Failure: ramp up sample rate to increase validation coverage
    newRate = Math.min(config.maxRate, state.currentRate * config.rampUpFactor);
  } else if (newConsecutive >= config.rampDownAfter) {
    // Enough consecutive passes: reduce sample rate to lower overhead
    newRate = Math.max(config.minRate, state.currentRate * config.rampDownFactor);
  }

  // Round to 4 decimal places to avoid floating point drift
  newRate = Math.round(newRate * 10000) / 10000;

  return {
    ...state,
    currentRate:       newRate,
    consecutivePasses: newConsecutive,
    totalRuns:         state.totalRuns + 1,
    totalParityPasses: state.totalParityPasses + (parityPassed ? 1 : 0),
    totalParityFails:  state.totalParityFails  + (parityPassed ? 0 : 1),
    lastUpdatedAt:     new Date().toISOString(),
  };
}

// ── Record sampling ────────────────────────────────────────────────────────────

/**
 * Sample an evenly distributed subset of records for shadow execution.
 *
 * Sampling is deterministic given the same inputs (evenly spaced indices).
 * At rate >= 1.0, returns the original array unchanged (no copy).
 * At rate <= 0.0, returns [].
 */
export function sampleRecords(
  records: CanonicalReconRecord[],
  rate:    number,
): CanonicalReconRecord[] {
  if (rate >= 1.0) return records;
  if (rate <= 0.0 || records.length === 0) return [];

  const n    = Math.max(1, Math.round(records.length * rate));
  const step = records.length / n;
  const sampled: CanonicalReconRecord[] = [];

  for (let i = 0; i < n; i++) {
    sampled.push(records[Math.floor(i * step)]);
  }

  return sampled;
}

// ── Summary helper ─────────────────────────────────────────────────────────────

/**
 * Human-readable summary of the current adaptive shadow state.
 * For logging and audit trail messages.
 */
export function describeShadowState(state: AdaptiveShadowState): string {
  const pct = Math.round(state.currentRate * 100);
  const passRate = state.totalRuns > 0
    ? Math.round((state.totalParityPasses / state.totalRuns) * 100)
    : 0;
  return (
    `Shadow: ${state.config.enabled ? "activo" : "inactivo"} · ` +
    `Muestra: ${pct}% · ` +
    `Paridad: ${state.totalParityPasses}/${state.totalRuns} (${passRate}%) · ` +
    `Racha: ${state.consecutivePasses} pases consecutivos`
  );
}
