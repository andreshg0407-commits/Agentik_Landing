/**
 * lib/reconciliation/run-service.ts
 *
 * AGENTIK-RECON-SESSIONS-01 — Task 6
 * AGENTIK-RECON-ENGINE-02   — Task 4 (engine mode support)
 * Reconciliation Run Service
 *
 * Wraps the reconciliation engine(s) into the session layer.
 * Manages ReconciliationRun lifecycle (create → running → completed/failed/unsupported).
 *
 * Engine mode behaviour (controlled by RECON_ENGINE_MODE env var):
 *
 *   "legacy"    — Use existing runOrdersVsSalesRecon (unchanged). Default safe path.
 *
 *   "shadow"    — Legacy engine provides the response.
 *                 Universal engine runs in parallel (fire-and-forget) after response is
 *                 committed. Parity result is logged to audit trail only — never affects
 *                 the run outcome or session status.
 *
 *   "universal" — Universal engine (runOrdersVsSalesViaEngine) provides the response.
 *                 If universal throws, falls back to legacy and emits
 *                 "engine_fallback_to_legacy" event.
 *
 * Other rules:
 *   - sag_orders + sag_sales: only supported combination
 *   - Any other source combination: run is created as "unsupported", no engine call
 *   - Failures are isolated: engine errors → run.status = "failed", session.status = "failed"
 *   - NO SAG writes, NO DIAN calls, NO financial side effects
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                  from "@/lib/prisma";
import { emitReconEvent }          from "./audit-trail";
import { runOrdersVsSalesRecon }   from "./adapters/orders-vs-sales";
import { runOrdersVsSalesViaEngine } from "./adapters/orders-vs-sales-canonical";
import { getEngineMode, shouldRunUniversal, universalIsAuthority } from "./engine/engine-mode";
import { compareReconResults }     from "./engine/validation/compare-results";
import type { ReconciliationSessionRun, ReconciliationSummarySnapshot } from "./session-types";
import type { EngineRunMetadata }  from "./engine/validation/validation-types";
import type { ReconResult }        from "./types";

// ── Public params ──────────────────────────────────────────────────────────────

export interface StartRunParams {
  organizationId: string;
  sessionId:      string;
  /** Source key for side A (e.g. "sag_pya", "csv", "all") */
  sourceAKey:     string;
  /** Source key for side B */
  sourceBKey:     string;
  /** Period in YYYYMM format */
  period:         string;
  /** ReconciliationSourceType for side A — determines which engine to call */
  sourceAType:    string;
  /** ReconciliationSourceType for side B */
  sourceBType:    string;
}

// ── startReconciliationRun ────────────────────────────────────────────────────

/**
 * Start a reconciliation run for the given session.
 *
 * Lifecycle:
 *   1. Determine run number (count existing runs + 1)
 *   2. Create ReconciliationRun row in "running" status
 *   3. Update session status to "running"
 *   4. Emit "run_started" audit event
 *   5. Dispatch to engine (or mark "unsupported")
 *   6. Update run + session with result
 *   7. Emit "run_completed" or "run_failed"
 *
 * Returns the completed ReconciliationSessionRun domain object.
 */
export async function startReconciliationRun(
  params: StartRunParams,
): Promise<ReconciliationSessionRun> {
  const { organizationId, sessionId, sourceAKey, sourceBKey, period, sourceAType, sourceBType } = params;

  // ── 1. Determine run number ──────────────────────────────────────────────────
  const existingCount = await prisma.reconciliationRun.count({
    where: { sessionId, organizationId },
  });
  const runNumber = existingCount + 1;

  // ── 2. Create run row in "running" status ────────────────────────────────────
  const run = await prisma.reconciliationRun.create({
    data: {
      organizationId,
      sessionId,
      runNumber,
      status:    "running",
      sourceAKey,
      sourceBKey,
      period,
      startedAt: new Date(),
    },
  });

  // ── 3. Update session to "running" ───────────────────────────────────────────
  await prisma.reconciliationSession.update({
    where: { id: sessionId },
    data:  { status: "RUNNING" as never, startedAt: new Date() },
  });

  // ── 4. Emit run_started event ────────────────────────────────────────────────
  await emitReconEvent({
    organizationId,
    sessionId,
    eventType: "run_started",
    message:   `Run #${runNumber} iniciado — ${sourceAKey} vs ${sourceBKey} · período ${period}`,
    actorType: "system",
    metadata:  { runId: run.id, runNumber, sourceAKey, sourceBKey, period, sourceAType, sourceBType },
  });

  // ── 5. Dispatch to engine ────────────────────────────────────────────────────
  const isOrdersVsSales =
    (sourceAType === "sag_orders" || sourceAType === "sag_sales") &&
    (sourceBType === "sag_orders" || sourceBType === "sag_sales") &&
    sourceAType !== sourceBType;

  if (!isOrdersVsSales) {
    // Unsupported source combination — no engine available yet
    const unsupportedRun = await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status:      "unsupported",
        completedAt: new Date(),
        errorJson: {
          reason:     "unsupported_source_combination",
          sourceAType,
          sourceBType,
          message:    `No existe motor de reconciliación para ${sourceAType} vs ${sourceBType}. Disponible: sag_orders vs sag_sales.`,
        },
      },
    });

    await prisma.reconciliationSession.update({
      where: { id: sessionId },
      data:  { status: "DRAFT" as never },
    });

    await emitReconEvent({
      organizationId,
      sessionId,
      eventType: "run_failed",
      message:   `Run #${runNumber} — combinación no soportada: ${sourceAType} vs ${sourceBType}`,
      actorType: "system",
      metadata:  { runId: run.id, reason: "unsupported_source_combination" },
    });

    return mapRun(unsupportedRun);
  }

  // ── 6. Run engine (mode-aware) ────────────────────────────────────────────────
  const engineMode = getEngineMode();

  let result: ReconResult;
  let fallbackUsed   = false;
  let fallbackReason: string | undefined;
  const engineLegacyMs0 = Date.now();

  if (universalIsAuthority(engineMode)) {
    // ── UNIVERSAL MODE — try universal first, fallback to legacy on error ──────
    let universalMs: number | undefined;
    try {
      const t0 = Date.now();
      result       = await runOrdersVsSalesViaEngine(organizationId, period, sourceAKey, sourceBKey);
      universalMs  = Date.now() - t0;

      await emitReconEvent({
        organizationId,
        sessionId,
        eventType: "engine_universal_completed",
        message:   `Run #${runNumber} — motor universal completado (${universalMs}ms)`,
        actorType: "system",
        metadata:  { runId: run.id, universalMs },
      });
    } catch (universalErr) {
      fallbackReason = universalErr instanceof Error ? universalErr.message : String(universalErr);
      fallbackUsed   = true;

      await emitReconEvent({
        organizationId,
        sessionId,
        eventType: "engine_fallback_to_legacy",
        message:   `Run #${runNumber} — motor universal falló, usando legado como respaldo: ${fallbackReason}`,
        actorType: "system",
        metadata:  { runId: run.id, fallbackReason },
      });

      // Fallback to legacy
      try {
        result = await runOrdersVsSalesRecon(organizationId, period, sourceAKey, sourceBKey);
      } catch (legacyErr) {
        const errorMessage = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
        return await _failRun(run.id, runNumber, sessionId, organizationId, errorMessage);
      }
    }
  } else {
    // ── LEGACY or SHADOW MODE — legacy is always the response ─────────────────
    try {
      result = await runOrdersVsSalesRecon(organizationId, period, sourceAKey, sourceBKey);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return await _failRun(run.id, runNumber, sessionId, organizationId, errorMessage);
    }
  }

  const legacyMs = Date.now() - engineLegacyMs0;

  // ── 7. Persist result + update session ──────────────────────────────────────
  const summary: ReconciliationSummarySnapshot = {
    total:              result.summary.total,
    matched:            result.summary.matched,
    mismatchAmount:     result.summary.mismatchAmount,
    onlyInA:            result.summary.onlyInA,
    onlyInB:            result.summary.onlyInB,
    possibleDuplicates: result.summary.possibleDuplicates,
    totalAmountA:       result.summary.totalAmountA,
    totalAmountB:       result.summary.totalAmountB,
    deltaTotal:         result.summary.deltaTotal,
    matchRate:          result.summary.matchRate,
  };

  const hasExceptions =
    result.summary.mismatchAmount > 0 ||
    result.summary.onlyInA > 0 ||
    result.summary.onlyInB > 0 ||
    result.summary.possibleDuplicates > 0;

  const sessionStatus = result.summary.matchRate >= 100
    ? ("RECONCILED" as never)
    : hasExceptions
      ? ("NEEDS_REVIEW" as never)
      : ("PARTIALLY_RECONCILED" as never);

  // Build engine metadata for metadataJson
  const engineMetadata: EngineRunMetadata = {
    engineMode,
    fallbackUsed:   fallbackUsed || undefined,
    fallbackReason: fallbackReason || undefined,
  };

  // engineMetadata is logged to the audit event below; metadataJson column
  // will be added to the schema in a future migration (RECON-ENGINE-03).
  void engineMetadata;

  const completedRun = await prisma.reconciliationRun.update({
    where: { id: run.id },
    data: {
      status:      "completed",
      summaryJson: summary as never,
      completedAt: new Date(),
    },
  });

  await prisma.reconciliationSession.update({
    where: { id: sessionId },
    data: {
      status:      sessionStatus,
      summaryJson: summary as never,
      completedAt: new Date(),
    },
  });

  // ── 8. Emit run_completed event ──────────────────────────────────────────────
  await emitReconEvent({
    organizationId,
    sessionId,
    eventType: "run_completed",
    message:   `Run #${runNumber} completado — ${result.summary.matched}/${result.summary.total} registros conciliados (${result.summary.matchRate.toFixed(1)}%)`,
    actorType: "system",
    metadata: {
      runId:       run.id,
      runNumber,
      summary,
      hasExceptions,
      engineMode,
    },
  });

  if (hasExceptions) {
    await emitReconEvent({
      organizationId,
      sessionId,
      eventType: "manual_review_required",
      message:   `Run #${runNumber} requiere revisión — ${result.summary.onlyInA + result.summary.onlyInB + result.summary.mismatchAmount} diferencias detectadas`,
      actorType: "system",
      metadata: {
        runId:          run.id,
        onlyInA:        result.summary.onlyInA,
        onlyInB:        result.summary.onlyInB,
        mismatchAmount: result.summary.mismatchAmount,
      },
    });
  }

  // ── 9. Shadow mode: fire-and-forget universal comparison ─────────────────────
  // Runs AFTER response is committed — never affects run/session status.
  if (shouldRunUniversal(engineMode) && !universalIsAuthority(engineMode)) {
    void _runShadowComparison({
      organizationId,
      sessionId,
      runId:     run.id,
      runNumber,
      period,
      sourceAKey,
      sourceBKey,
      legacySummary: summary,
      legacyMs,
    });
  }

  return mapRun(completedRun);
}

// ── Private helpers ───────────────────────────────────────────────────────────

type PrismaRunRow = Awaited<ReturnType<typeof prisma.reconciliationRun.findFirstOrThrow>>;

function mapRun(row: PrismaRunRow): ReconciliationSessionRun {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    sessionId:      row.sessionId,
    runNumber:      row.runNumber,
    status:         row.status as ReconciliationSessionRun["status"],
    sourceAKey:     row.sourceAKey     ?? null,
    sourceBKey:     row.sourceBKey     ?? null,
    period:         row.period         ?? null,
    summaryJson:    row.summaryJson    as ReconciliationSummarySnapshot | null,
    errorJson:      row.errorJson      as Record<string, unknown> | null,
    startedAt:      row.startedAt?.toISOString()   ?? null,
    completedAt:    row.completedAt?.toISOString()  ?? null,
    createdAt:      row.createdAt.toISOString(),
  };
}

/**
 * Mark a run as failed and update the session status.
 * Shared between legacy and universal-fallback-failed paths.
 */
async function _failRun(
  runId:          string,
  runNumber:      number,
  sessionId:      string,
  organizationId: string,
  errorMessage:   string,
): Promise<ReconciliationSessionRun> {
  const failedRun = await prisma.reconciliationRun.update({
    where: { id: runId },
    data: {
      status:      "failed",
      completedAt: new Date(),
      errorJson:   { error: errorMessage },
    },
  });

  await prisma.reconciliationSession.update({
    where: { id: sessionId },
    data:  { status: "FAILED" as never },
  });

  await emitReconEvent({
    organizationId,
    sessionId,
    eventType: "run_failed",
    message:   `Run #${runNumber} fallido — ${errorMessage}`,
    actorType: "system",
    metadata:  { runId, error: errorMessage },
  });

  return mapRun(failedRun);
}

/**
 * Fire-and-forget shadow comparison.
 *
 * Runs the universal engine after the legacy response is committed,
 * compares summaries, and logs the parity result to the audit trail.
 * Errors are caught silently — shadow comparison never affects run outcome.
 */
async function _runShadowComparison(params: {
  organizationId: string;
  sessionId:      string;
  runId:          string;
  runNumber:      number;
  period:         string;
  sourceAKey:     string;
  sourceBKey:     string;
  legacySummary:  ReconciliationSummarySnapshot;
  legacyMs:       number;
}): Promise<void> {
  const {
    organizationId, sessionId, runId, runNumber,
    period, sourceAKey, sourceBKey, legacySummary, legacyMs,
  } = params;

  try {
    const t0             = Date.now();
    const universalResult = await runOrdersVsSalesViaEngine(organizationId, period, sourceAKey, sourceBKey);
    const universalMs    = Date.now() - t0;

    // Compare summaries
    const parity = compareReconResults(
      legacySummary,
      universalResult.summary,
      legacyMs,
      universalMs,
    );

    // Log shadow completion
    await emitReconEvent({
      organizationId,
      sessionId,
      eventType: "engine_shadow_completed",
      message:   `Run #${runNumber} — shadow universal completado (${universalMs}ms), paridad: ${parity.parity ? "OK" : "DIFF"}`,
      actorType: "system",
      metadata: {
        runId,
        universalMs,
        parity: parity.parity,
        differences: parity.differences,
      },
    });

    // Log parity outcome
    await emitReconEvent({
      organizationId,
      sessionId,
      eventType: parity.parity ? "engine_parity_passed" : "engine_parity_failed",
      message:   parity.parity
        ? `Run #${runNumber} — motores legacy y universal coinciden`
        : `Run #${runNumber} — divergencia detectada: ${parity.differences.length} campo(s) difieren`,
      actorType: "system",
      metadata: {
        runId,
        differences:     parity.differences,
        legacyMs,
        universalMs,
        legacyMatchRate: legacySummary.matchRate,
        universalMatchRate: universalResult.summary.matchRate,
      },
    });

    // Parity info is captured in the audit events above.
    // metadataJson column will be added in a future schema migration (RECON-ENGINE-03).
  } catch (err) {
    // Shadow errors are swallowed — log only, never throw
    console.error(
      "[RECON_SHADOW]",
      JSON.stringify({
        level:          "error",
        organizationId,
        sessionId,
        runId,
        error:          err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
