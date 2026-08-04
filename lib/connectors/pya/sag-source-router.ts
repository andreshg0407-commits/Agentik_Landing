/**
 * lib/connectors/pya/sag-source-router.ts
 *
 * AGENTIK-SAG-DUAL-DATABASE-ROUTER-01
 *
 * Single authority for resolving SAG database source routing.
 *
 * Business context:
 *   SAG/PYA operates two databases for Castillitos:
 *     CURRENT    — authority from 2026-07-21 inclusive (new production system)
 *     HISTORICAL — authority through 2026-07-20 inclusive (legacy system)
 *
 * This module provides:
 *   - SagSource type discrimination
 *   - Connection resolution (database + token per source)
 *   - Date-based source routing (single date)
 *   - Range-based source routing (date range → segments)
 *   - Fail-fast env validation
 *
 * Security rules:
 *   - Tokens are NEVER logged, serialized to errors, or returned in diagnostic output.
 *   - Only source, database, and endpoint may appear in logs.
 *   - No global mutable state. Source is explicit per call.
 *   - No cross-contamination: CURRENT DB always pairs with CURRENT token.
 *
 * Legacy compatibility:
 *   - PYA_SAG_BD and PYA_SOAP_TOKEN remain in .env (DEPRECATED, not removed).
 *   - getLegacySagConnection() provides backward-compatible access for
 *     consumers not yet migrated to source-aware calls.
 */

import type { PyaApiConfig } from "./types";

// ══════════════════════════════════════════════════════════════════════════════
// Source type
// ══════════════════════════════════════════════════════════════════════════════

/** Discriminated SAG database source. */
export type SagSource = "CURRENT" | "HISTORICAL";

// ══════════════════════════════════════════════════════════════════════════════
// Cutoff constants — single source of truth
// ══════════════════════════════════════════════════════════════════════════════

/**
 * First date where CURRENT database is authoritative (inclusive).
 * All documents with date >= this belong to CURRENT.
 */
export const SAG_CURRENT_START_DATE = "2026-07-21";

/**
 * Last date where HISTORICAL database is authoritative (inclusive).
 * All documents with date <= this belong to HISTORICAL.
 */
export const SAG_HISTORICAL_END_DATE = "2026-07-20";

// ══════════════════════════════════════════════════════════════════════════════
// ENV validation
// ══════════════════════════════════════════════════════════════════════════════

interface SagSourceEnv {
  database: string;
  token: string;
  endpoint: string;
}

/**
 * Reads and validates all required dual-database env vars.
 * Throws with a clear message (no token values) if any are missing.
 *
 * Called lazily on first getSagConnection() — NOT at module import time,
 * so non-SAG code paths are not affected by missing env vars.
 */
function loadSourceEnv(source: SagSource): SagSourceEnv {
  const suffix = source === "CURRENT" ? "_CURRENT" : "_HISTORICAL";

  const database = process.env[`PYA_SAG_BD${suffix}`]?.trim();
  if (!database) {
    throw new Error(
      `[SAG-ROUTER] PYA_SAG_BD${suffix} is not set. ` +
      `Required for ${source} source resolution.`
    );
  }

  const token = process.env[`PYA_SOAP_TOKEN${suffix}`]?.trim();
  if (!token) {
    throw new Error(
      `[SAG-ROUTER] PYA_SOAP_TOKEN${suffix} is not set. ` +
      `Required for ${source} source resolution.`
    );
  }

  const endpoint =
    process.env.PYA_SOAP_ENDPOINT?.trim() ||
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  return { database, token, endpoint };
}

// ══════════════════════════════════════════════════════════════════════════════
// Connection resolver
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the PyaApiConfig for the given SAG source.
 *
 * Guarantees:
 *   - CURRENT source → CURRENT database + CURRENT token
 *   - HISTORICAL source → HISTORICAL database + HISTORICAL token
 *   - No cross-contamination is possible (env vars are suffix-matched)
 *   - Shared endpoint (PYA_SOAP_ENDPOINT)
 *
 * Fails fast if required env vars are missing.
 */
export function getSagConnection(source: SagSource): PyaApiConfig {
  const env = loadSourceEnv(source);
  return {
    endpointUrl: env.endpoint,
    token: env.token,
    database: env.database,
  };
}

/**
 * Returns diagnostic info safe for logging (NO token).
 */
export function describeSagConnection(source: SagSource): {
  source: SagSource;
  database: string;
  endpoint: string;
} {
  const env = loadSourceEnv(source);
  return {
    source,
    database: env.database,
    endpoint: env.endpoint,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Legacy fallback — DEPRECATED
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the legacy (pre-dual-database) connection config.
 *
 * Resolution:
 *   database → PYA_SAG_BD (legacy env var)
 *   token    → PYA_SOAP_TOKEN (legacy env var)
 *   endpoint → PYA_SOAP_ENDPOINT
 *
 * @deprecated Use getSagConnection(source) instead.
 * Scheduled for removal once all consumers are migrated.
 */
export function getLegacySagConnection(): PyaApiConfig {
  const token =
    process.env.PYA_SOAP_TOKEN?.trim() ||
    process.env.SAG_TEST_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "[SAG-ROUTER] No legacy token found. " +
      "Set PYA_SOAP_TOKEN or migrate to getSagConnection(source)."
    );
  }

  const database = process.env.PYA_SAG_BD?.trim();
  if (!database) {
    throw new Error(
      "[SAG-ROUTER] PYA_SAG_BD is not set. " +
      "Set the legacy database or migrate to getSagConnection(source)."
    );
  }

  const endpoint =
    process.env.PYA_SOAP_ENDPOINT?.trim() ||
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  return {
    endpointUrl: endpoint,
    token,
    database,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Date resolver — pure function
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Resolves the authoritative SAG source for a single calendar date.
 *
 * Law:
 *   date <= 2026-07-20 → HISTORICAL
 *   date >= 2026-07-21 → CURRENT
 *
 * @param date — ISO date string (YYYY-MM-DD). Must be a valid calendar date.
 * @returns The authoritative SagSource for that date.
 * @throws If the date string is not a valid YYYY-MM-DD format.
 *
 * Pure function: no clock, no DB, no side effects.
 */
export function resolveSagSourceForDate(date: string): SagSource {
  assertValidDateString(date);
  return date <= SAG_HISTORICAL_END_DATE ? "HISTORICAL" : "CURRENT";
}

// ══════════════════════════════════════════════════════════════════════════════
// Range resolver — pure function
// ══════════════════════════════════════════════════════════════════════════════

/** A contiguous date segment routed to a single SAG source. */
export interface SagRouteSegment {
  source: SagSource;
  from: string; // ISO date (inclusive)
  to: string;   // ISO date (inclusive)
}

/** Result of resolving a date range to SAG sources. */
export interface SagRouteResult {
  /** Sources used in this range (1 or 2 elements). */
  sourcesUsed: SagSource[];
  /** The cutoff date where the split occurs (null if single-source). */
  splitAt: string | null;
  /** Contiguous segments, each routed to exactly one source. Ordered chronologically. */
  segments: SagRouteSegment[];
}

/**
 * Resolves the authoritative SAG source(s) for a date range.
 *
 * Cases:
 *   A. to <= 2026-07-20 → single HISTORICAL segment
 *   B. from >= 2026-07-21 → single CURRENT segment
 *   C. range crosses cutoff → two segments:
 *        HISTORICAL: from → 2026-07-20
 *        CURRENT:    2026-07-21 → to
 *
 * Guarantees:
 *   - Segments are exactly contiguous (no gap, no overlap)
 *   - HISTORICAL ends at 2026-07-20, CURRENT starts at 2026-07-21
 *   - Every calendar day in [from, to] is covered by exactly one segment
 *
 * @param from — ISO date string (YYYY-MM-DD), inclusive start
 * @param to   — ISO date string (YYYY-MM-DD), inclusive end
 * @returns Route result with segments
 * @throws If from > to or dates are invalid
 *
 * Pure function: no clock, no DB, no side effects.
 */
export function resolveSagSourcesForRange(from: string, to: string): SagRouteResult {
  assertValidDateString(from);
  assertValidDateString(to);

  if (from > to) {
    throw new Error(
      `[SAG-ROUTER] Invalid range: from (${from}) > to (${to}). ` +
      `Range must satisfy from <= to.`
    );
  }

  // Case A: entire range is historical
  if (to <= SAG_HISTORICAL_END_DATE) {
    return {
      sourcesUsed: ["HISTORICAL"],
      splitAt: null,
      segments: [{ source: "HISTORICAL", from, to }],
    };
  }

  // Case B: entire range is current
  if (from >= SAG_CURRENT_START_DATE) {
    return {
      sourcesUsed: ["CURRENT"],
      splitAt: null,
      segments: [{ source: "CURRENT", from, to }],
    };
  }

  // Case C: range crosses the cutoff — split into two exact segments
  return {
    sourcesUsed: ["HISTORICAL", "CURRENT"],
    splitAt: SAG_CURRENT_START_DATE,
    segments: [
      { source: "HISTORICAL", from, to: SAG_HISTORICAL_END_DATE },
      { source: "CURRENT", from: SAG_CURRENT_START_DATE, to },
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Source-aware query execution helper
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convenience: builds a PyaApiConfig for the given source, ready for
 * consultaSagJson(). This is the recommended entry point for new
 * source-aware consumers.
 *
 * Usage:
 *   const config = buildSagQueryConfig("CURRENT");
 *   const rows = await consultaSagJson(config, "SELECT ...");
 *
 * Equivalent to getSagConnection(source) — exported as a semantic alias
 * for query-execution contexts.
 */
export function buildSagQueryConfig(source: SagSource): PyaApiConfig {
  return getSagConnection(source);
}

// ══════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ══════════════════════════════════════════════════════════════════════════════

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that a string is a well-formed ISO date (YYYY-MM-DD).
 * Does NOT validate calendar correctness (e.g. 2026-02-30 passes format check).
 * This is intentional — SAG dates may include edge cases, and the comparison
 * is purely lexicographic on the string.
 */
function assertValidDateString(date: string): void {
  if (!DATE_REGEX.test(date)) {
    throw new Error(
      `[SAG-ROUTER] Invalid date format: "${date}". Expected YYYY-MM-DD.`
    );
  }
}
