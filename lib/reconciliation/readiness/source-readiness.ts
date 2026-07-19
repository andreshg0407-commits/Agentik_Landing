/**
 * lib/reconciliation/readiness/source-readiness.ts
 *
 * AGENTIK-RECON-SOURCE-READINESS-BOARD-01 — Phase 1
 * Source Readiness Aggregator
 *
 * Derives a flat, serializable readiness report for every registered
 * reconciliation source by combining:
 *
 *   1. ReconciliationSourceContract  — readiness, readinessNote, label, provider
 *   2. LoaderCapabilities            — loaderName, normalizationVersion
 *
 * Design principles:
 *   - Pure function — no I/O, no DB, no async
 *   - Serializable output — safe to pass as RSC props to client components
 *   - No hardcoded states — everything derived from live registries
 *   - Ordered by board tier: ready → partial → others
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { RECONCILIATION_SOURCES } from "../source-contract";
import { getAllLoaderCapabilities } from "../loader/record-loader-registry";
import type { ReconciliationSourceType } from "../source-contract";

// ── Board readiness tier ───────────────────────────────────────────────────────

/**
 * Collapsed readiness tier used by the board UI.
 *
 *   ready               → available; can run right now
 *   partial             → data exists but needs validation (pending_sag_validation)
 *   pending_integration → API/feed not yet configured
 *   requires_upload     → operator must supply a file
 *   requires_credentials → needs API key / certificate
 *   not_available       → blocked or not planned
 */
export type BoardReadinessTier =
  | "ready"
  | "partial"
  | "pending_integration"
  | "requires_upload"
  | "requires_credentials"
  | "not_available";

// ── Output type ───────────────────────────────────────────────────────────────

export interface SourceReadinessEntry {
  sourceType:           ReconciliationSourceType;
  label:                string;
  shortLabel:           string;
  provider:             string;
  /** Collapsed tier for the board UI */
  tier:                 BoardReadinessTier;
  /** Verbatim readiness from source-contract — for detail view */
  rawReadiness:         string;
  readinessNote:        string;
  loaderName:           string;
  normalizationVersion: string;
  requiresCredential:   boolean;
  requiresUpload:       boolean;
  requiresIntegration:  boolean;
  /** Number of SAG PUC codes associated with this source */
  sagCodeCount:         number;
}

export interface SourceReadinessReport {
  entries:            SourceReadinessEntry[];
  ready:              SourceReadinessEntry[];
  partial:            SourceReadinessEntry[];
  pending:            SourceReadinessEntry[];
  readyCount:         number;
  partialCount:       number;
  pendingCount:       number;
  totalCount:         number;
  /** True when every source is ready or partial */
  allOperational:     boolean;
}

// ── Tier mapping ───────────────────────────────────────────────────────────────

function toTier(rawReadiness: string): BoardReadinessTier {
  switch (rawReadiness) {
    case "available":               return "ready";
    case "pending_sag_validation":  return "partial";
    case "pending_integration":     return "pending_integration";
    case "requires_integration":    return "pending_integration";
    case "requires_upload":         return "requires_upload";
    case "requires_credential":     return "requires_credentials";
    case "unavailable":             return "not_available";
    default:                        return "not_available";
  }
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Derive the full source readiness report from live registries.
 *
 * Called once server-side (e.g. in a Server Component or API route)
 * and passed as serializable props to the client board component.
 *
 * No I/O — pure derivation from in-memory registries.
 */
export function buildSourceReadinessReport(): SourceReadinessReport {
  // Build a map: sourceType → loaderName + normalizationVersion
  const capMap = new Map(
    getAllLoaderCapabilities().map(({ sourceType, capabilities }) => [
      sourceType,
      { loaderName: capabilities.loaderName, normalizationVersion: capabilities.normalizationVersion },
    ]),
  );

  const entries: SourceReadinessEntry[] = (
    Object.values(RECONCILIATION_SOURCES) as typeof RECONCILIATION_SOURCES[ReconciliationSourceType][]
  ).map(contract => {
    const caps = capMap.get(contract.sourceId) ?? {
      loaderName:           `StubLoader(${contract.sourceId})`,
      normalizationVersion: "—",
    };
    return {
      sourceType:           contract.sourceId,
      label:                contract.label,
      shortLabel:           contract.shortLabel,
      provider:             contract.provider,
      tier:                 toTier(contract.readiness),
      rawReadiness:         contract.readiness,
      readinessNote:        contract.readinessNote,
      loaderName:           caps.loaderName,
      normalizationVersion: caps.normalizationVersion,
      requiresCredential:   contract.requiresCredential,
      requiresUpload:       contract.requiresUpload,
      requiresIntegration:  contract.requiresIntegration,
      sagCodeCount:         contract.relatedSagCodes.length,
    };
  });

  // Sort: ready → partial → others
  const tierOrder: Record<BoardReadinessTier, number> = {
    ready:                0,
    partial:              1,
    pending_integration:  2,
    requires_upload:      3,
    requires_credentials: 4,
    not_available:        5,
  };
  entries.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

  const ready   = entries.filter(e => e.tier === "ready");
  const partial = entries.filter(e => e.tier === "partial");
  const pending = entries.filter(e => e.tier !== "ready" && e.tier !== "partial");

  return {
    entries,
    ready,
    partial,
    pending,
    readyCount:     ready.length,
    partialCount:   partial.length,
    pendingCount:   pending.length,
    totalCount:     entries.length,
    allOperational: pending.length === 0,
  };
}
