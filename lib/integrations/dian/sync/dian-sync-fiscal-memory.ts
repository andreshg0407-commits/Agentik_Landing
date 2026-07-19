/**
 * dian-sync-fiscal-memory.ts
 *
 * AGENTIK-DIAN-SYNC-01
 * DIAN Integration Layer — Fiscal Sync Memory
 *
 * Tracks DIAN sync health per operation per environment, stored in
 * Integration.metaJson under the "fiscalSync" key.
 *
 * Provides:
 *   - Rolling latency tracking (last 20 samples — ring buffer)
 *   - Success/failure counters
 *   - Certificate expiry awareness
 *   - P99 latency approximation (max of last 20 samples)
 *
 * Storage format: Integration.metaJson → DianFiscalMemory (version "1")
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never store raw XML, keys, tokens, or passwords in metaJson.
 */

import { prisma } from "@/lib/prisma";
import type {
  DianFiscalMemory,
  DianFiscalMemoryEntry,
  DianSyncOutcomeEntry,
  DianSyncOperation,
  DianSyncStatus,
} from "./dian-sync-types";
import type { DianEnvironment } from "../types/dian-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const LATENCY_RING_BUFFER_SIZE = 20;
const OUTCOME_RING_BUFFER_SIZE = 10;
const FISCAL_MEMORY_VERSION    = "1" as const;

// ── Reader ────────────────────────────────────────────────────────────────────

/**
 * Load the current DianFiscalMemory from Integration.metaJson.
 * Returns an empty initialized memory if missing or malformed.
 */
export async function loadFiscalMemory(
  integrationId: string,
): Promise<DianFiscalMemory> {
  const row = await prisma.integration.findUnique({
    where:  { id: integrationId },
    select: { metaJson: true },
  });

  return parseFiscalMemory(row?.metaJson);
}

export function parseFiscalMemory(raw: unknown): DianFiscalMemory {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>)["version"] === FISCAL_MEMORY_VERSION
  ) {
    return raw as DianFiscalMemory;
  }
  return { version: "1", fiscalSync: {} };
}

// ── Writer ────────────────────────────────────────────────────────────────────

/**
 * Record the outcome of a completed sync job into fiscal memory.
 *
 * Updates counters, rolling latency buffer, and last error code.
 * Persists to Integration.metaJson.
 *
 * @param integrationId    DIAN Integration record id
 * @param operation        Which DIAN operation ran
 * @param environment      habilitacion | produccion
 * @param status           final job status
 * @param durationMs       wall time of the operation
 * @param retryCount       high-level orchestrator retries used (0 = no retry)
 * @param errorCode        error code on failure (code only, no message)
 * @param certExpiresAt    populated from parsed cert (when available)
 */
export async function recordSyncOutcome(params: {
  integrationId:  string;
  operation:      DianSyncOperation;
  environment:    DianEnvironment;
  status:         DianSyncStatus;
  durationMs:     number;
  retryCount?:    number;
  errorCode?:     string;
  certExpiresAt?: string;
}): Promise<void> {
  const {
    integrationId, operation, environment,
    status, durationMs, retryCount = 0, errorCode, certExpiresAt,
  } = params;

  // Read current memory (or initialize)
  const memory = await loadFiscalMemory(integrationId);

  // Ensure nested path exists
  if (!memory.fiscalSync[operation]) {
    memory.fiscalSync[operation] = {};
  }
  const byEnv = memory.fiscalSync[operation]!;

  const now = new Date().toISOString();
  const prev: DianFiscalMemoryEntry = byEnv[environment] ?? {
    lastRunAt:         now,
    lastStatus:        status,
    successCount:      0,
    failureCount:      0,
    avgLatencyMs:      0,
    p99LatencyMs:      0,
    recentLatencies:   [],
    operationalStreak: 0,
    retryStreak:       0,
    recentOutcomes:    [],
  };

  // Build this run's outcome entry
  const outcomeEntry: DianSyncOutcomeEntry = {
    status:     status === "succeeded" ? "succeeded" : "failed",
    errorCode:  status !== "succeeded" ? (errorCode ?? "UNKNOWN") : undefined,
    retryCount,
    durationMs,
    at:         now,
  };

  // Update counters and streaks
  const succeeded = status === "succeeded";
  const newOutcomes = updateRingBuffer(prev.recentOutcomes, outcomeEntry, OUTCOME_RING_BUFFER_SIZE);

  const newEntry: DianFiscalMemoryEntry = {
    lastRunAt:         now,
    lastStatus:        status,
    successCount:      succeeded ? prev.successCount + 1 : prev.successCount,
    failureCount:      succeeded ? prev.failureCount      : prev.failureCount + 1,
    recentLatencies:   updateLatencyBuffer(prev.recentLatencies, durationMs),
    avgLatencyMs:      0,    // will be computed below
    p99LatencyMs:      0,    // will be computed below
    lastErrorCode:     succeeded ? prev.lastErrorCode : (errorCode ?? prev.lastErrorCode),
    certExpiresAt:     certExpiresAt ?? prev.certExpiresAt,
    // OBSERVATIONS-01 fields
    lastHealthyAt:     succeeded ? now : prev.lastHealthyAt,
    operationalStreak: succeeded ? (prev.operationalStreak ?? 0) + 1 : 0,
    retryStreak:       retryCount > 0 ? (prev.retryStreak ?? 0) + 1 : 0,
    recentOutcomes:    newOutcomes,
  };

  const latencies = newEntry.recentLatencies;
  newEntry.avgLatencyMs = computeAvg(latencies);
  newEntry.p99LatencyMs = computeP99Approx(latencies);

  byEnv[environment] = newEntry;
  memory.fiscalSync[operation] = byEnv;

  // Persist back to Integration.metaJson
  await prisma.integration.update({
    where: { id: integrationId },
    data:  { metaJson: memory as never },
  });
}

// ── Readers ───────────────────────────────────────────────────────────────────

/**
 * Read the fiscal memory entry for a specific operation + environment.
 * Returns null if no history recorded yet.
 */
export async function getFiscalMemoryEntry(
  integrationId: string,
  operation:     DianSyncOperation,
  environment:   DianEnvironment,
): Promise<DianFiscalMemoryEntry | null> {
  const memory = await loadFiscalMemory(integrationId);
  return memory.fiscalSync[operation]?.[environment] ?? null;
}

/**
 * Returns the last successful run timestamp for an operation + environment.
 * Used to determine if a sync is overdue.
 */
export async function getLastSuccessAt(
  integrationId: string,
  operation:     DianSyncOperation,
  environment:   DianEnvironment,
): Promise<Date | null> {
  const entry = await getFiscalMemoryEntry(integrationId, operation, environment);
  if (!entry || entry.lastStatus !== "succeeded") return null;
  return new Date(entry.lastRunAt);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function updateRingBuffer<T>(existing: T[], newItem: T, maxSize: number): T[] {
  const updated = [...existing, newItem];
  if (updated.length > maxSize) {
    return updated.slice(updated.length - maxSize);
  }
  return updated;
}

function updateLatencyBuffer(existing: number[], newSample: number): number[] {
  const updated = [...existing, newSample];
  if (updated.length > LATENCY_RING_BUFFER_SIZE) {
    return updated.slice(updated.length - LATENCY_RING_BUFFER_SIZE);
  }
  return updated;
}

function computeAvg(samples: number[]): number {
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
}

/**
 * P99 approximation: maximum of the last N samples.
 * For small ring buffers (≤20), max ≈ p99 for operational purposes.
 */
function computeP99Approx(samples: number[]): number {
  if (samples.length === 0) return 0;
  return Math.max(...samples);
}
