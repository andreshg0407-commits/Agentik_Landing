/**
 * lib/operational-map/audit/connection-detectors.ts
 *
 * Automatic connection issue detectors.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Each detector takes a KpiRegistryEntry and returns a partial AuditFlags
 * set indicating which issues are present. The generator applies all detectors
 * and merges the results.
 *
 * Sprint: AGENTIK-OPERATIONAL-CONNECTION-AUDIT-01
 */

import type { KpiRegistryEntry, AuditFlags } from "./operational-connection-audit-types";

// ─── Individual detectors ─────────────────────────────────────────────────────

/** Detects mock data: connectionHealth is "mock" */
export function detectMock(entry: KpiRegistryEntry): boolean {
  return entry.connectionHealth === "mock";
}

/** Detects partial connection: some fields real, others missing */
export function detectPartial(entry: KpiRegistryEntry): boolean {
  return entry.connectionHealth === "partial";
}

/** Detects stale data: connectionHealth is "stale" */
export function detectStale(entry: KpiRegistryEntry): boolean {
  return entry.connectionHealth === "stale";
}

/**
 * Detects wrong source: actual source differs from expected source by type.
 * Triggers when actualSources exists but doesn't match the expected sourceOfTruth.
 * E.g., Agentik computing a KPI that should come from SAG.
 */
export function detectWrongSource(entry: KpiRegistryEntry): boolean {
  if (entry.connectionHealth === "wrong_source") return true;
  if (entry.actualSources.length === 0) return false;
  // If expected source is SAG but actual is Agentik-only
  if (
    entry.sourceOfTruth === "SAG" &&
    entry.actualSources.every(s => s.toLowerCase().includes("agentik"))
  ) return true;
  return false;
}

/** Detects manual data: connectionHealth is "manual" */
export function detectManual(entry: KpiRegistryEntry): boolean {
  return entry.connectionHealth === "manual";
}

/** Detects disconnected: connectionHealth is "disconnected" */
export function detectDisconnected(entry: KpiRegistryEntry): boolean {
  return entry.connectionHealth === "disconnected";
}

/**
 * Detects unvalidated SAG query: sagQueryStatus is "placeholder" or "pending"
 * AND the source of truth includes SAG.
 */
export function detectSagUnvalidated(entry: KpiRegistryEntry): boolean {
  if (!["SAG", "SAG+Agentik"].includes(entry.sourceOfTruth)) return false;
  return entry.sagQueryStatus === "placeholder" || entry.sagQueryStatus === "pending";
}

// ─── Composed flag set ────────────────────────────────────────────────────────

/** Apply all detectors to an entry and return the complete AuditFlags. */
export function detectFlags(entry: KpiRegistryEntry): AuditFlags {
  return {
    isMock:           detectMock(entry),
    isPartial:        detectPartial(entry),
    isStale:          detectStale(entry),
    isWrongSource:    detectWrongSource(entry),
    isManual:         detectManual(entry),
    isDisconnected:   detectDisconnected(entry),
    isSagUnvalidated: detectSagUnvalidated(entry),
  };
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

/** Returns true if this entry has any active issue flag. */
export function hasAnyIssue(flags: AuditFlags): boolean {
  return flags.isMock
    || flags.isPartial
    || flags.isStale
    || flags.isWrongSource
    || flags.isManual
    || flags.isDisconnected
    || flags.isSagUnvalidated;
}

/** Returns true if this entry is critical AND has a blocking issue. */
export function isCriticalIssue(entry: KpiRegistryEntry, flags: AuditFlags): boolean {
  if (entry.priority !== "critical") return false;
  return flags.isMock || flags.isDisconnected || flags.isWrongSource;
}

/** Returns the primary issue label for display. */
export function primaryIssueLabel(flags: AuditFlags): string | null {
  if (flags.isMock)           return "Mock";
  if (flags.isDisconnected)   return "Desconectado";
  if (flags.isWrongSource)    return "Fuente incorrecta";
  if (flags.isManual)         return "Manual";
  if (flags.isPartial)        return "Parcial";
  if (flags.isStale)          return "Desactualizado";
  if (flags.isSagUnvalidated) return "SAG sin validar";
  return null;
}
