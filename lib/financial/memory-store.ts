/**
 * lib/financial/memory-store.ts
 *
 * Financial Stream Memory — MetricSnapshot read/write layer.
 *
 * ── Storage convention ────────────────────────────────────────────────────────
 *
 *   Model:       MetricSnapshot
 *   code:        "financial.stream.{streamId}"
 *   valueJson:   FinancialStreamSnapshot
 *   snapshotAt:  UTC midnight of snapshot date
 *
 *   Index used:  [organizationId, code, snapshotAt]
 *
 * ── Functions ─────────────────────────────────────────────────────────────────
 *
 *   getStreamSnapshots(orgId, streamId, limit)
 *     — Reads up to `limit` historical snapshots for one stream. Read-only.
 *
 *   getAllStreamSnapshots(orgId, limit)
 *     — Reads recent snapshots across ALL streams for one org. Read-only.
 *
 *   buildCurrentSnapshot(stream, orgId)
 *     — Derives today's FinancialStreamSnapshot from live FinancialStream data.
 *     — NO Prisma write. Pure derivation. Safe to call at every page render.
 *
 *   persistStreamSnapshot(snapshot)
 *     — Upserts today's snapshot into MetricSnapshot.
 *     — Idempotent: one row per stream per day (upsert by code + snapshotDate).
 *     — NOT called automatically. Must be explicitly triggered by a scheduled job.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *
 *   READ functions: pure Prisma SELECT — zero side effects.
 *   WRITE function: Prisma upsert — idempotent. Only one row per stream per day.
 *   buildCurrentSnapshot: zero Prisma — pure derivation from already-fetched data.
 */

import { prisma }           from "@/lib/prisma";
import type { FinancialStream }           from "@/lib/financial/stream-model";
import type { FinancialStreamSnapshot }   from "@/lib/financial/memory-model";

// ── Metric code ───────────────────────────────────────────────────────────────

/** Builds the MetricSnapshot code for a given stream. */
export function streamMetricCode(streamId: string): string {
  return `financial.stream.${streamId}`;
}

/**
 * Returns the current calendar date in Colombia time (UTC-5) as "YYYY-MM-DD".
 *
 * Timezone decision: Colombia does not observe daylight saving time.
 * UTC-5 is constant year-round. The cron runs at 06:00 UTC (= 01:00 COT),
 * which always falls on the correct Colombia calendar day.
 *
 * Using Colombia date (not UTC) ensures the snapshot date matches the
 * business day that operators see in their dashboard.
 */
function colombiaDayISO(): string {
  const now      = new Date();
  const COT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5, fixed (no DST)
  const cotDate  = new Date(now.getTime() - COT_OFFSET_MS);
  return cotDate.toISOString().slice(0, 10);
}

// ── Read layer ────────────────────────────────────────────────────────────────

/**
 * Returns up to `limit` historical snapshots for one stream, newest first.
 *
 * Returns [] when no snapshots exist — callers must handle this state.
 */
export async function getStreamSnapshots(
  orgId:    string,
  streamId: string,
  limit:    number = 30,
): Promise<FinancialStreamSnapshot[]> {
  const rows = await prisma.metricSnapshot.findMany({
    where: {
      organizationId: orgId,
      code:           streamMetricCode(streamId),
    },
    orderBy: { snapshotAt: "desc" },
    take:    limit,
    select:  { valueJson: true },
  });

  return rows
    .map(r => r.valueJson as FinancialStreamSnapshot | null)
    .filter((v): v is FinancialStreamSnapshot => v !== null);
}

/**
 * Returns up to `limit` recent snapshots across ALL financial streams for one org.
 *
 * Uses the [organizationId, code, snapshotAt] index efficiently by filtering
 * on the "financial.stream." prefix — no full table scan.
 *
 * Returns [] when no history exists.
 */
export async function getAllStreamSnapshots(
  orgId: string,
  limit: number = 90,
): Promise<FinancialStreamSnapshot[]> {
  const rows = await prisma.metricSnapshot.findMany({
    where: {
      organizationId: orgId,
      code:           { startsWith: "financial.stream." },
    },
    orderBy: { snapshotAt: "desc" },
    take:    limit,
    select:  { valueJson: true },
  });

  return rows
    .map(r => r.valueJson as FinancialStreamSnapshot | null)
    .filter((v): v is FinancialStreamSnapshot => v !== null);
}

// ── Snapshot builders ─────────────────────────────────────────────────────────

/** Derives StreamHealthState from stream status + pending count. Pure. */
function deriveHealthState(
  status:       FinancialStream["status"],
  pendingCount: number,
): FinancialStreamSnapshot["healthState"] {
  switch (status) {
    case "reconciliation_pending": return pendingCount > 50 ? "noisy" : "quiet";
    case "healthy":                return "healthy";
    case "blocked_source":         return "blocked";
    case "integration_pending":
    case "missing_sag_mapping":    return "no_data";
    default:                       return "quiet";
  }
}

/** Derives system reason string from stream status + pending count. Pure. */
function deriveSystemReason(
  status:       FinancialStream["status"],
  pendingCount: number,
): string | null {
  if (status === "reconciliation_pending" && pendingCount > 0) {
    return `${pendingCount} consignaciones sin identificar en SAG`;
  }
  if (status === "blocked_source")     return "Fuente bloqueada — no se puede procesar";
  if (status === "missing_sag_mapping") return "Código PUC no encontrado en plan de cuentas SAG";
  return null;
}

/**
 * Builds a FinancialStreamSnapshot from EXPLICIT raw data.
 *
 * Preferred over buildCurrentSnapshot() — receives real numeric data
 * directly from getCobrosBreakdown() instead of parsing signal text.
 *
 * @param stream              Live FinancialStream (for status + metadata).
 * @param orgId               Organization id.
 * @param pendingDepositsTotal Real pending deposit totals from getCobrosBreakdown().
 *
 * This is the function the orchestrator calls. NOT written to DB here.
 */
export function buildSnapshotFromRawData(
  stream:               FinancialStream,
  orgId:                string,
  pendingDepositsTotal: { amount: number; count: number },
): FinancialStreamSnapshot {
  const snapshotDate = colombiaDayISO();
  const snapshotAt   = new Date().toISOString();

  // Only streams with a SAG link carry real pending deposit data
  const hasPendingLink = stream.relatedSagSourceCode !== null;
  const pendingCount   = hasPendingLink ? pendingDepositsTotal.count  : 0;
  const pendingAmount  = hasPendingLink ? pendingDepositsTotal.amount : 0;

  return {
    streamId:       stream.id,
    sagAccountCode: stream.sagAccountCode,
    orgId,
    snapshotDate,
    snapshotAt,
    pendingCount,
    pendingAmount,
    streamStatus:   stream.status,
    healthState:    deriveHealthState(stream.status, pendingCount),
    systemReason:   deriveSystemReason(stream.status, pendingCount),
    matchedCount:   null,
    unmatchedCount: null,
    reviewCount:    null,
    lastSeenAt:     null,
  };
}

/**
 * Derives a FinancialStreamSnapshot from a live FinancialStream via signal parsing.
 *
 * @deprecated Prefer buildSnapshotFromRawData() which takes explicit numeric data.
 *   Use this only when the raw getCobrosBreakdown() result is unavailable.
 *
 * @param stream  Live FinancialStream from buildFinancialStreams().
 * @param orgId   Organization id.
 */
export function buildCurrentSnapshot(
  stream: FinancialStream,
  orgId:  string,
): FinancialStreamSnapshot {
  // Best-effort extraction from signal text (fragile — prefer buildSnapshotFromRawData)
  const pendingSignal = stream.signals.find(s => s.label === "Sin identificar");
  const pendingCount  = pendingSignal
    ? parseInt(pendingSignal.value?.replace(/\D/g, "") ?? "0", 10) || 0
    : 0;
  const poolSignal    = stream.signals.find(s => s.label === "Pool total");
  const pendingAmount = poolSignal
    ? parseFloat(poolSignal.value?.replace(/[^0-9.]/g, "") ?? "0") || 0
    : 0;

  return buildSnapshotFromRawData(stream, orgId, { count: pendingCount, amount: pendingAmount });
}

// ── Write layer ───────────────────────────────────────────────────────────────

/**
 * Persists a FinancialStreamSnapshot to MetricSnapshot (upsert).
 *
 * Idempotent: one row per stream per day.
 * The upsert key is (organizationId, code) scoped to the snapshot date.
 *
 * IMPORTANT: This function is NOT called automatically at page render.
 * It MUST be called explicitly from a scheduled job or manual trigger.
 *
 * @param snapshot  Snapshot to persist. orgId must be populated.
 */
export async function persistStreamSnapshot(
  snapshot: FinancialStreamSnapshot,
): Promise<void> {
  const code       = streamMetricCode(snapshot.streamId);
  const snapshotAt = new Date(`${snapshot.snapshotDate}T00:00:00.000Z`);

  // Find existing row for this stream + date
  const existing = await prisma.metricSnapshot.findFirst({
    where: {
      organizationId: snapshot.orgId,
      code,
      snapshotAt: {
        gte: new Date(`${snapshot.snapshotDate}T00:00:00.000Z`),
        lt:  new Date(`${snapshot.snapshotDate}T23:59:59.999Z`),
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.metricSnapshot.update({
      where: { id: existing.id },
      data:  { valueJson: snapshot as object },
    });
  } else {
    await prisma.metricSnapshot.create({
      data: {
        organizationId: snapshot.orgId,
        code,
        label:          `Financial stream: ${snapshot.streamId}`,
        valueJson:      snapshot as object,
        snapshotAt,
      },
    });
  }
}
