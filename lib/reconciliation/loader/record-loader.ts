/**
 * lib/reconciliation/loader/record-loader.ts
 *
 * AGENTIK-RECON-RECORD-LOADER-01 — Phase 2
 * ReconciliationRecordLoader Interface
 *
 * Universal contract for all reconciliation source loaders.
 * The Rule Engine operates on LoadResult.records — it never depends
 * on the internal structure of any source system.
 *
 * Design principles:
 *   - loadRecords() NEVER throws — always returns a LoadResult.
 *   - isEmpty + emptyReason replace error states for unavailable sources.
 *   - readiness mirrors source-contract.ts — same vocabulary everywhere.
 *   - loaderUsed + normalizationVersion feed the governance layer.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord }         from "../canonical-record";
import type {
  ReconciliationSourceType,
  ReconciliationSourceReadiness,
}                                            from "../source-contract";

// ── Loader capabilities ────────────────────────────────────────────────────────

/**
 * Static description of what a loader can do.
 * Used by the registry and governance layer.
 */
export interface LoaderCapabilities {
  /** Source types this loader can serve. */
  supportedSources:     ReconciliationSourceType[];
  /** Whether the loader accepts arbitrary filter objects (importKey, docType…). */
  supportsFilters:      boolean;
  /** Whether the loader can accept a date range (from/to) in addition to YYYYMM period. */
  supportsDateRange:    boolean;
  /** Normalization version — embedded in every governance snapshot. */
  normalizationVersion: string;
  /** Human-readable loader name for audit trail. */
  loaderName:           string;
}

// ── Load result ────────────────────────────────────────────────────────────────

/**
 * Result of a single loader.loadRecords() call.
 *
 * Always returned — even for unavailable or empty sources.
 * Callers inspect `readiness` and `isEmpty` before consuming `records`.
 *
 * Governance fields (loaderUsed, normalizationVersion, loadTimeMs) are
 * persisted in audit snapshots for traceability.
 */
export interface LoadResult {
  /** Normalized records ready for the Rule Engine. Empty array when source unavailable. */
  records:              CanonicalReconRecord[];
  sourceType:           ReconciliationSourceType;
  organizationId:       string;
  period:               string;
  /** True when the source has no records to return for any reason. */
  isEmpty:              boolean;
  /** Human-readable explanation of why result is empty (loader-provided). Null when not empty. */
  emptyReason:          string | null;
  /** Operational readiness of this source at load time. */
  readiness:            ReconciliationSourceReadiness;
  /** Readiness note from the source contract — shown in the workspace UI. */
  readinessNote:        string;
  /** Total normalized records loaded (0 when isEmpty). */
  recordCount:          number;
  /** Wall-clock milliseconds for the load + normalize pass. */
  loadTimeMs:           number;
  /** Normalization version string — for governance audit. */
  normalizationVersion: string;
  /** Loader class name — for governance audit. */
  loaderUsed:           string;
}

// ── Loader interface ───────────────────────────────────────────────────────────

/**
 * Universal record loader interface.
 *
 * Every source adapter (SAG, DIAN, bank, gateway, manual upload) must
 * implement this contract. The Rule Engine and the Conciliación workspace
 * call only this interface — they never depend on SAG, DIAN, or bank internals.
 *
 * Implementation checklist:
 *   ✓ supportsSource() — fast sync check, no I/O
 *   ✓ loadRecords()    — async, must NEVER throw, must return LoadResult
 *   ✓ normalize()      — pure, sync, for single-record use and testing
 *   ✓ getCapabilities() — sync, returns static metadata
 */
export interface ReconciliationRecordLoader {
  /**
   * Returns true when this loader can serve the given source type.
   * The registry calls this to route source types to the correct loader.
   */
  supportsSource(sourceType: ReconciliationSourceType): boolean;

  /**
   * Load and normalize records for the given organization and period.
   *
   * Contract:
   *   - MUST return a LoadResult (never throw).
   *   - MUST NOT fabricate data. If source is unavailable, return isEmpty=true.
   *   - MUST NOT write to any database or emit side effects.
   *   - MUST respect tenant isolation via organizationId.
   *
   * @param organizationId  Tenant isolation key.
   * @param period          YYYYMM period string (e.g. "202605").
   * @param filters         Optional source-specific filter bag (importKey, docType, etc.).
   */
  loadRecords(
    organizationId: string,
    period:         string,
    filters?:       Record<string, unknown>,
  ): Promise<LoadResult>;

  /**
   * Normalize a single raw source record to CanonicalReconRecord.
   *
   * Exposed for unit testing and the normalization pipeline.
   * In production, loadRecords() calls normalization internally.
   *
   * Returns null when the raw record cannot be normalized (malformed input).
   */
  normalize(raw: unknown, index: number): CanonicalReconRecord | null;

  /**
   * Describe the static capabilities of this loader.
   * Used by the registry and governance metadata.
   */
  getCapabilities(): LoaderCapabilities;
}
