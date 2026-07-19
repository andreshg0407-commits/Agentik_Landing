/**
 * lib/comercial/maletas/maletas-ingestion.ts
 *
 * Incremental ingestion pipeline for Maletas operational data.
 *
 * Pipeline:
 *   Excel/SAG data source
 *   → normalize (maletas-normalizer)
 *   → runtime (buildMaletasRuntime)
 *   → snapshot persistence (maletas-snapshots)
 *   → event detection (maletas-events)
 *   → operational memory update
 *
 * Designed for:
 *   - Idempotent reruns (same data → same snapshots, deduplication by snapshotAt bucket)
 *   - Partial ingestion (fails gracefully, returns partial result)
 *   - Retry safety (each phase is independently catchable)
 *
 * Server-only — never import from client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 */

import { buildMaletasRuntime }              from "./maletas-runtime";
import { persistFullMaletasSnapshot }       from "./maletas-snapshots";
import { generateAndPersistOperationalEvents } from "./maletas-events";
import type { MaletasSnapshotResult }       from "./maletas-snapshots";
import type { CommercialEventRecord }       from "./maletas-events";

// ─── Ingestion options ────────────────────────────────────────────────────────

export interface MaletasIngestionOptions {
  /** Absolute path to MALETAS.xlsx (overrides env var) */
  maletasPath?: string;
  /** Absolute path to DISPONIBLE PARA MALETAS.xlsx (overrides env var) */
  disponiblePath?: string;
  /** Custom snapshot timestamp — defaults to now */
  snapshotAt?: Date;
  /** Skip event detection (useful for backfill runs) */
  skipEvents?: boolean;
  /** Skip snapshot persistence (dry-run mode) */
  dryRun?: boolean;
}

// ─── Ingestion result ─────────────────────────────────────────────────────────

export type IngestionPhase =
  | "bootstrap"     // Excel loading
  | "runtime"       // engine computation
  | "snapshot"      // Prisma persistence
  | "events"        // operational event detection
  | "complete";     // all phases succeeded

export type IngestionStatus = "success" | "partial" | "failed" | "dry_run";

export interface IngestionPhaseResult {
  phase:      IngestionPhase;
  success:    boolean;
  durationMs: number;
  detail:     string;
}

export interface MaletasIngestionResult {
  orgId:        string;
  status:       IngestionStatus;
  snapshotAt:   string;
  durationMs:   number;
  phases:       IngestionPhaseResult[];
  snapshot:     MaletasSnapshotResult | null;
  events:       CommercialEventRecord[];
  warnings:     string[];
  source:       "excel" | "prisma" | "empty";
}

// ─── Ingestion pipeline ───────────────────────────────────────────────────────

/**
 * Run the full Maletas ingestion pipeline for a given org.
 * Returns a detailed result with per-phase outcomes.
 *
 * Idempotency:
 * Snapshots use createMany (no upsert) — multiple runs on the same day
 * will accumulate snapshots. The temporal engine handles deduplication
 * by averaging within time windows. For backfill, pass explicit snapshotAt.
 */
export async function runMaletasIngestion(
  orgId: string,
  opts: MaletasIngestionOptions = {},
): Promise<MaletasIngestionResult> {
  const pipelineStart = Date.now();
  const snapshotAt    = opts.snapshotAt ?? new Date();
  const phases:        IngestionPhaseResult[] = [];
  const warnings:      string[] = [];
  let   source:        "excel" | "prisma" | "empty" = "empty";

  // ── Phase 1: Bootstrap runtime ───────────────────────────────────────────
  const bootstrapStart = Date.now();
  let runtime: Awaited<ReturnType<typeof buildMaletasRuntime>> | null = null;

  try {
    runtime = await buildMaletasRuntime(orgId, {
      maletasPath:    opts.maletasPath ?? process.env.MALETAS_EXCEL_PATH,
      disponiblePath: opts.disponiblePath ?? process.env.DISPONIBLE_EXCEL_PATH,
    });
    source = runtime.source;
    warnings.push(...runtime.warnings);

    phases.push({
      phase:      "runtime",
      success:    true,
      durationMs: Date.now() - bootstrapStart,
      detail:     `Source: ${runtime.source} · Items: ${runtime.context.items.length} · Cases: ${runtime.context.cases.length}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    phases.push({
      phase:      "runtime",
      success:    false,
      durationMs: Date.now() - bootstrapStart,
      detail:     `Runtime failed: ${msg}`,
    });
    warnings.push(`Runtime phase failed: ${msg}`);
    return {
      orgId,
      status:     "failed",
      snapshotAt: snapshotAt.toISOString(),
      durationMs: Date.now() - pipelineStart,
      phases,
      snapshot:   null,
      events:     [],
      warnings,
      source,
    };
  }

  // ── Dry run: return after runtime, no persistence ────────────────────────
  if (opts.dryRun) {
    return {
      orgId,
      status:     "dry_run",
      snapshotAt: snapshotAt.toISOString(),
      durationMs: Date.now() - pipelineStart,
      phases,
      snapshot:   null,
      events:     [],
      warnings,
      source,
    };
  }

  // ── Phase 2: Persist snapshots ───────────────────────────────────────────
  const snapshotStart = Date.now();
  let snapshotResult: MaletasSnapshotResult | null = null;

  try {
    snapshotResult = await persistFullMaletasSnapshot(
      orgId,
      runtime.context,
      snapshotAt,
    );
    warnings.push(...snapshotResult.warnings);

    phases.push({
      phase:      "snapshot",
      success:    true,
      durationMs: Date.now() - snapshotStart,
      detail:
        `Coverage: ${snapshotResult.coverageRows} · Cases: ${snapshotResult.caseRows} · ` +
        `Items: ${snapshotResult.itemRows} · Reps: ${snapshotResult.salesRepRows} · ` +
        `Production: ${snapshotResult.productionRows} · DeadStock: ${snapshotResult.deadStockRows}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    phases.push({
      phase:      "snapshot",
      success:    false,
      durationMs: Date.now() - snapshotStart,
      detail:     `Snapshot failed: ${msg}`,
    });
    warnings.push(`Snapshot phase failed: ${msg}`);
  }

  // ── Phase 3: Generate operational events ─────────────────────────────────
  const eventsStart = Date.now();
  let events: CommercialEventRecord[] = [];

  if (!opts.skipEvents) {
    try {
      events = await generateAndPersistOperationalEvents(orgId, runtime.context);
      phases.push({
        phase:      "events",
        success:    true,
        durationMs: Date.now() - eventsStart,
        detail:     `${events.length} operational event${events.length === 1 ? "" : "s"} generated`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      phases.push({
        phase:      "events",
        success:    false,
        durationMs: Date.now() - eventsStart,
        detail:     `Events failed: ${msg}`,
      });
      warnings.push(`Event phase failed: ${msg}`);
    }
  }

  // ── Result aggregation ───────────────────────────────────────────────────
  const allPhasesSucceeded = phases.every((p) => p.success);
  const anyPhaseFailed     = phases.some((p) => !p.success);

  const status: IngestionStatus =
    allPhasesSucceeded ? "success" :
    anyPhaseFailed     ? "partial" :
    "success";

  phases.push({
    phase:      "complete",
    success:    allPhasesSucceeded,
    durationMs: Date.now() - pipelineStart,
    detail:     `Pipeline ${status} in ${Date.now() - pipelineStart}ms`,
  });

  return {
    orgId,
    status,
    snapshotAt:  snapshotAt.toISOString(),
    durationMs:  Date.now() - pipelineStart,
    phases,
    snapshot:    snapshotResult,
    events,
    warnings,
    source,
  };
}

// ─── Backfill helper ──────────────────────────────────────────────────────────

/**
 * Run multiple ingestion passes with historical timestamps.
 * Used to seed an org's temporal history from existing Excel files.
 *
 * Each pass uses the same current Excel data but different snapshotAt timestamps,
 * creating a shallow historical baseline for the temporal engine.
 *
 * Note: This produces synthetic history from current data.
 * Real history requires persistent snapshots over time.
 */
export async function runMaletasBackfill(
  orgId: string,
  opts: MaletasIngestionOptions & { passesDaysBack?: number[] } = {},
): Promise<MaletasIngestionResult[]> {
  const daysBack = opts.passesDaysBack ?? [14, 7, 3, 1];
  const results: MaletasIngestionResult[] = [];

  for (const days of daysBack) {
    const snapshotAt = new Date();
    snapshotAt.setDate(snapshotAt.getDate() - days);

    const result = await runMaletasIngestion(orgId, {
      ...opts,
      snapshotAt,
      skipEvents: true, // backfill doesn't generate events
    });
    results.push(result);
  }

  // Final current run (today) with event generation
  const currentResult = await runMaletasIngestion(orgId, {
    ...opts,
    snapshotAt:  new Date(),
    skipEvents:  false,
  });
  results.push(currentResult);

  return results;
}
