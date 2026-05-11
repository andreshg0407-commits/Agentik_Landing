/**
 * lib/financial/snapshot-orchestrator.ts
 *
 * Financial Snapshot Orchestrator — daily snapshot capture.
 *
 * ── Responsibility ────────────────────────────────────────────────────────────
 *
 *   captureFinancialSnapshots(orgId)
 *     — Loads active streams for the org
 *     — Fetches real pending deposit data from getCobrosBreakdown()
 *     — Builds one FinancialStreamSnapshot per stream from real data
 *     — Persists each snapshot (idempotent — safe to re-run)
 *     — Returns structured summary with counts and errors
 *
 * ── Design principles ─────────────────────────────────────────────────────────
 *
 *   DETERMINISTIC  — Same inputs always produce the same snapshot.
 *   IDEMPOTENT     — Running twice the same day produces one row per stream.
 *   PARTIAL SUCCESS — One stream failure does not abort the others.
 *   NO SIDE EFFECTS — Only writes to MetricSnapshot; touches nothing else.
 *   AUDITABLE      — Every call returns a structured summary for logging.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────────
 *
 *   NOT: modify SAG data
 *   NOT: modify reconciliation logic
 *   NOT: recalculate historical states
 *   NOT: invoke any LLM
 *   NOT: alter financial calculations
 *   NOT: write to any table except MetricSnapshot
 *
 * ── Timezone contract ─────────────────────────────────────────────────────────
 *
 *   Snapshot date = Colombia calendar date (UTC-5, no DST).
 *   Cron fires at 06:00 UTC = 01:00 COT — always the correct Colombia day.
 *   Implemented in buildSnapshotFromRawData() via colombiaDayISO().
 */

import { getCobrosBreakdown }      from "@/lib/finance/cobros-breakdown";
import { BANK_ACCOUNT_SOURCES }    from "@/lib/financial/bank-account-registry";
import { buildFinancialStreams }    from "@/lib/financial/stream-model";
import {
  buildSnapshotFromRawData,
  persistStreamSnapshot,
} from "@/lib/financial/memory-store";

// ── Result types ──────────────────────────────────────────────────────────────

export interface StreamCaptureResult {
  streamId:  string;
  status:    "captured" | "skipped" | "error";
  /** Populated on "error" status. */
  reason?:   string;
}

export interface SnapshotCaptureResult {
  orgId:         string;
  capturedAt:    string;
  snapshotDate:  string;
  totalStreams:  number;
  captured:     number;
  skipped:      number;
  errors:       number;
  streams:      StreamCaptureResult[];
  /** True when at least one stream was captured successfully. */
  partialSuccess: boolean;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Captures today's financial snapshot for all streams in an org.
 *
 * Safe to call multiple times per day — idempotent per stream per day.
 *
 * @param orgId  Organization id to capture snapshots for.
 * @returns      SnapshotCaptureResult — structured summary for logging and API response.
 */
export async function captureFinancialSnapshots(
  orgId: string,
): Promise<SnapshotCaptureResult> {
  const capturedAt = new Date().toISOString();

  // ── 1. Load stream registry ───────────────────────────────────────────────
  // BANK_ACCOUNT_SOURCES is a static registry. Org scoping is implicit:
  // all sources are registered for the same operational context.
  // Multi-tenant isolation is enforced at storage level via organizationId.
  const allSources = Object.values(BANK_ACCOUNT_SOURCES);

  // ── 2. Fetch real pending deposit data ────────────────────────────────────
  // getCobrosBreakdown is the authoritative source for pending deposit pool.
  // If it fails, we still capture snapshots for non-linked streams.
  let pendingDepositsTotal = { amount: 0, count: 0 };
  let cobrosOk = true;

  try {
    const cobrosBreakdown   = await getCobrosBreakdown(orgId);
    pendingDepositsTotal = cobrosBreakdown.consignacionesPendientes ?? { amount: 0, count: 0 };
  } catch (err) {
    cobrosOk = false;
    console.warn(`[snapshot-orchestrator] org=${orgId} getCobrosBreakdown failed:`, (err as Error).message);
    // Continue — non-linked streams (tarjetas, plataformas) still get captured
    // with pendingCount=0 which is the correct honest state for them
  }

  // ── 3. Build all financial streams ───────────────────────────────────────
  const streams = buildFinancialStreams(allSources, pendingDepositsTotal);

  // ── 4. Capture snapshot per stream ───────────────────────────────────────
  const streamResults: StreamCaptureResult[] = [];
  let snapshotDate = "";

  for (const stream of streams) {
    try {
      const snapshot = buildSnapshotFromRawData(stream, orgId, pendingDepositsTotal);
      snapshotDate   = snapshot.snapshotDate; // same for all — set once

      await persistStreamSnapshot(snapshot);

      streamResults.push({ streamId: stream.id, status: "captured" });
    } catch (err) {
      const reason = (err as Error).message ?? "unknown error";
      console.error(
        `[snapshot-orchestrator] org=${orgId} stream=${stream.id} persist failed:`,
        reason,
      );
      streamResults.push({ streamId: stream.id, status: "error", reason });
    }
  }

  // ── 5. Build summary ──────────────────────────────────────────────────────
  const captured       = streamResults.filter(r => r.status === "captured").length;
  const skipped        = streamResults.filter(r => r.status === "skipped").length;
  const errors         = streamResults.filter(r => r.status === "error").length;
  const partialSuccess = captured > 0;

  const result: SnapshotCaptureResult = {
    orgId,
    capturedAt,
    snapshotDate:   snapshotDate || new Date().toISOString().slice(0, 10),
    totalStreams:   streams.length,
    captured,
    skipped,
    errors,
    streams:        streamResults,
    partialSuccess,
  };

  console.info(
    `[snapshot-orchestrator] org=${orgId} date=${result.snapshotDate}` +
    ` streams=${result.totalStreams} captured=${captured} errors=${errors}` +
    ` cobrosOk=${cobrosOk}`,
  );

  return result;
}
