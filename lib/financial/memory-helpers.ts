/**
 * lib/financial/memory-helpers.ts
 *
 * Financial Stream Memory — Pure helper functions.
 *
 * All functions are pure: no Prisma, no SAG, no side effects, no writes.
 * Input: FinancialStreamSnapshot[] (from memory-store.ts)
 * Output: typed analysis structs (SnapshotDelta, StreamAgingStatus, etc.)
 *
 * ── What this module does ─────────────────────────────────────────────────────
 *
 *   compareSnapshots(current, prior)
 *     — Computes SnapshotDelta: movement direction, count/amount deltas.
 *
 *   getStreamMovement(current, prior)
 *     — Derives StreamMovement from two snapshots.
 *
 *   getAgingStatus(streamId, snapshots)
 *     — How long the stream has been in its current status.
 *
 *   getNoiseLevel(snapshots)
 *     — Variance-based noise assessment across snapshot history.
 *
 *   getMemorySummary(orgId, allSnapshots)
 *     — Org-level summary: history range, readiness tier, health breakdown.
 *
 *   buildRuleBasedObservations(stream, snapshots, orgSlug)
 *     — Deterministic Copilot observations from real data only.
 *     — NO AI, NO heuristics, NO invented signals.
 *
 * ── SAFE READ-ONLY ────────────────────────────────────────────────────────────
 *
 *   Zero side effects. Pure TypeScript only.
 */

import type { FinancialStream }     from "@/lib/financial/stream-model";
import type {
  FinancialStreamSnapshot,
  SnapshotDelta,
  StreamMovement,
  StreamAgingStatus,
  StreamNoiseAssessment,
  NoiseLevel,
  MemorySummary,
  MemoryReadinessTier,
  CopilotObservation,
  CopilotObservationType,
} from "@/lib/financial/memory-model";

// ── Internal ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Sort snapshots newest-first. Pure — returns new array. */
function sortNewestFirst(snapshots: FinancialStreamSnapshot[]): FinancialStreamSnapshot[] {
  return [...snapshots].sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
}

/** Days between two "YYYY-MM-DD" strings. Positive when b > a. */
function daysBetween(a: string, b: string): number {
  const msA = new Date(a).getTime();
  const msB = new Date(b).getTime();
  return Math.round(Math.abs(msB - msA) / (1000 * 60 * 60 * 24));
}

// ── compareSnapshots ──────────────────────────────────────────────────────────

/**
 * Computes SnapshotDelta between two stream snapshots.
 *
 * @param current  The newer snapshot.
 * @param prior    The older snapshot. If null, returns no_baseline.
 * @param label    Human label for this comparison period (e.g. "vs ayer").
 */
export function compareSnapshots(
  current: FinancialStreamSnapshot,
  prior:   FinancialStreamSnapshot | null,
  label:   string = "vs período anterior",
): SnapshotDelta {
  if (prior === null) {
    return {
      periodLabel:        label,
      pendingCountDelta:  0,
      pendingAmountDelta: 0,
      movement:           "no_baseline",
      deltaPercent:       null,
    };
  }

  const pendingCountDelta  = current.pendingCount  - prior.pendingCount;
  const pendingAmountDelta = current.pendingAmount - prior.pendingAmount;
  const movement           = getStreamMovement(current, prior);

  const deltaPercent = prior.pendingAmount !== 0
    ? Math.round((pendingAmountDelta / prior.pendingAmount) * 100)
    : null;

  return {
    periodLabel: label,
    pendingCountDelta,
    pendingAmountDelta,
    movement,
    deltaPercent,
  };
}

// ── getStreamMovement ─────────────────────────────────────────────────────────

/**
 * Derives StreamMovement by comparing pending state between two snapshots.
 * Both snapshots must belong to the same stream.
 */
export function getStreamMovement(
  current: FinancialStreamSnapshot,
  prior:   FinancialStreamSnapshot,
): StreamMovement {
  const wasZero    = prior.pendingCount   === 0;
  const isZero     = current.pendingCount === 0;
  const countDelta = current.pendingCount - prior.pendingCount;

  if (wasZero && isZero)    return "stable";
  if (wasZero && !isZero)   return "appeared";
  if (!wasZero && isZero)   return "resolved";
  if (countDelta > 0)       return "growing";
  if (countDelta < 0)       return "shrinking";
  return "stable";
}

// ── getAgingStatus ────────────────────────────────────────────────────────────

/**
 * Computes how long a stream has been in its current operational status.
 *
 * Requires at least 2 snapshots for a meaningful result.
 * Scans history newest-first until the status changes.
 *
 * @param streamId  Stream to analyze.
 * @param snapshots All snapshots for this stream, any order.
 */
export function getAgingStatus(
  streamId:  string,
  snapshots: FinancialStreamSnapshot[],
): StreamAgingStatus {
  const sorted = sortNewestFirst(snapshots.filter(s => s.streamId === streamId));

  if (sorted.length === 0) {
    return {
      streamId,
      currentStatus:      "low_activity",
      daysInCurrentState: null,
      firstSeenAt:        null,
      isStale:            false,
      agingLabel:         "sin historial",
    };
  }

  const current       = sorted[0];
  const currentStatus = current.streamStatus;

  // Walk back while status is the same — find first snapshot with same status
  let firstSameStatus = current;
  for (const snap of sorted) {
    if (snap.streamStatus === currentStatus) {
      firstSameStatus = snap;
    } else {
      break;
    }
  }

  if (sorted.length < 2) {
    return {
      streamId,
      currentStatus,
      daysInCurrentState: null,
      firstSeenAt:        firstSameStatus.snapshotAt,
      isStale:            false,
      agingLabel:         "sin historial suficiente",
    };
  }

  const days    = daysBetween(firstSameStatus.snapshotDate, todayISO());
  const isStale = days > 30 && currentStatus !== "healthy" && currentStatus !== "partial_visibility";

  let agingLabel: string;
  if (days === 0)      agingLabel = "desde hoy";
  else if (days === 1) agingLabel = "desde ayer";
  else if (days < 7)   agingLabel = `${days} días`;
  else if (days < 30)  agingLabel = `${Math.floor(days / 7)} sem.`;
  else                 agingLabel = `${Math.floor(days / 30)} mes${Math.floor(days / 30) > 1 ? "es" : ""}`;

  if (isStale) agingLabel += " (crónico)";

  return {
    streamId,
    currentStatus,
    daysInCurrentState: days,
    firstSeenAt:        firstSameStatus.snapshotAt,
    isStale,
    agingLabel,
  };
}

// ── getNoiseLevel ─────────────────────────────────────────────────────────────

/**
 * Assesses operational noise (churn) for a stream from its snapshot history.
 *
 * Noise = variance in pendingCount across snapshots.
 * Requires at least 3 snapshots for a meaningful result.
 *
 * @param snapshots Snapshots for one stream, any order.
 */
export function getNoiseLevel(snapshots: FinancialStreamSnapshot[]): StreamNoiseAssessment {
  if (snapshots.length === 0) {
    return { streamId: "", noiseLevel: "unknown", reason: "Sin historial" };
  }

  const streamId = snapshots[0].streamId;

  if (snapshots.length < 3) {
    return { streamId, noiseLevel: "unknown", reason: "Historial insuficiente para calcular varianza" };
  }

  const counts = snapshots.map(s => s.pendingCount);
  const mean   = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation: stdDev / mean — scale-independent noise measure
  const cv = mean > 0 ? stdDev / mean : 0;

  let noiseLevel: NoiseLevel;
  let reason:     string;

  if (cv < 0.15) {
    noiseLevel = "low";
    reason     = "Movimiento estable — varianza de consignaciones baja";
  } else if (cv < 0.40) {
    noiseLevel = "medium";
    reason     = "Fluctuación moderada en consignaciones pendientes";
  } else {
    noiseLevel = "high";
    reason     = "Alta varianza en consignaciones — flujo operacional irregular";
  }

  return { streamId, noiseLevel, reason };
}

// ── getMemorySummary ──────────────────────────────────────────────────────────

/**
 * Computes org-level memory summary from all stream snapshots.
 *
 * No queries. Pure computation from provided snapshot array.
 *
 * @param orgId     Organization id.
 * @param snapshots All snapshots for this org, all streams, any order.
 */
export function getMemorySummary(
  orgId:     string,
  snapshots: FinancialStreamSnapshot[],
): MemorySummary {
  const computedAt = new Date().toISOString();

  if (snapshots.length === 0) {
    return {
      orgId,
      computedAt,
      hasHistory:          false,
      snapshotCount:       0,
      oldestSnapshotAt:    null,
      newestSnapshotAt:    null,
      historyDays:         0,
      healthyStreams:      0,
      noisyStreams:        0,
      blockedStreams:      0,
      noDataStreams:       0,
      totalPendingCount:  0,
      totalPendingAmount: 0,
      readinessLabel:     "sin historial suficiente",
      readinessTier:      "no_history",
    };
  }

  const sorted            = sortNewestFirst(snapshots);
  const newest            = sorted[0];
  const oldest            = sorted[sorted.length - 1];
  const historyDays       = daysBetween(oldest.snapshotDate, newest.snapshotDate);

  // Health breakdown from LATEST snapshot per stream
  const latestPerStream = new Map<string, FinancialStreamSnapshot>();
  for (const snap of sorted) {
    if (!latestPerStream.has(snap.streamId)) {
      latestPerStream.set(snap.streamId, snap);
    }
  }
  const latestSnapshots = Array.from(latestPerStream.values());

  const healthyStreams = latestSnapshots.filter(s => s.healthState === "healthy").length;
  const noisyStreams   = latestSnapshots.filter(s => s.healthState === "noisy").length;
  const blockedStreams = latestSnapshots.filter(s => s.healthState === "blocked").length;
  const noDataStreams  = latestSnapshots.filter(s => s.healthState === "no_data").length;

  const totalPendingCount  = latestSnapshots.reduce((a, s) => a + s.pendingCount,  0);
  const totalPendingAmount = latestSnapshots.reduce((a, s) => a + s.pendingAmount, 0);

  // Staleness check — is the newest snapshot >2 calendar days old?
  const daysSinceNewest = daysBetween(newest.snapshotDate, todayISO());
  const isStaleData     = daysSinceNewest > 2;

  // Readiness tier
  let readinessTier:  MemoryReadinessTier;
  let readinessLabel: string;

  if (isStaleData) {
    readinessTier  = "degraded";
    readinessLabel = `última captura hace ${daysSinceNewest} días — historial desactualizado`;
  } else if (historyDays >= 14) {
    readinessTier  = "ready";
    readinessLabel = `${historyDays} días de historial — análisis completo disponible`;
  } else if (historyDays >= 7) {
    readinessTier  = "warming";
    readinessLabel = `${historyDays} días de historial — patrones semanales emergiendo`;
  } else if (historyDays >= 1) {
    readinessTier  = "building";
    readinessLabel = `${historyDays} día${historyDays > 1 ? "s" : ""} de historial — acumulando`;
  } else {
    readinessTier  = "no_history";
    readinessLabel = "sin historial suficiente";
  }

  return {
    orgId,
    computedAt,
    hasHistory:         true,
    snapshotCount:      snapshots.length,
    oldestSnapshotAt:   oldest.snapshotAt,
    newestSnapshotAt:   newest.snapshotAt,
    historyDays,
    healthyStreams,
    noisyStreams,
    blockedStreams,
    noDataStreams,
    totalPendingCount,
    totalPendingAmount,
    readinessLabel,
    readinessTier,
  };
}

// ── buildRuleBasedObservations ────────────────────────────────────────────────

/**
 * Generates deterministic Copilot observations for one stream.
 *
 * ALL observations come from real snapshot data — no AI, no heuristics.
 * Confidence is always "RULE_BASED".
 *
 * @param stream    Current FinancialStream operational state.
 * @param snapshots Snapshot history for this stream (newest first preferred).
 * @param orgSlug   Org slug for building relatedWorkspace href.
 */
export function buildRuleBasedObservations(
  stream:    FinancialStream,
  snapshots: FinancialStreamSnapshot[],
  orgSlug:   string,
): CopilotObservation[] {
  const observations: CopilotObservation[] = [];
  const generatedAt  = new Date().toISOString();
  const sorted       = sortNewestFirst(snapshots.filter(s => s.streamId === stream.id));
  const current      = sorted[0] ?? null;
  const prior        = sorted[1] ?? null;

  const base: Pick<CopilotObservation, "streamId" | "orgId" | "generatedAt" | "confidence"> = {
    streamId:    stream.id,
    orgId:       current?.orgId ?? "",
    generatedAt,
    confidence:  "RULE_BASED",
  };

  // No snapshots yet — first observation
  if (sorted.length === 0) {
    observations.push({
      ...base,
      observationType: "first_observation",
      severity:        "info",
      message:         `${stream.displayName}: primera observación — sin historial previo para comparar`,
      suggestedAction: null,
      relatedWorkspace: null,
      basedOnSnapshots: 0,
    });
    return observations;
  }

  // Integration missing — no SAG link configured
  if (stream.status === "integration_pending") {
    observations.push({
      ...base,
      observationType:  "integration_missing",
      severity:         "info",
      message:          `${stream.displayName}: sin lectura bancaria configurada — extracto requerido para conciliación`,
      suggestedAction:  "Validar código SAG PUC " + stream.sagAccountCode,
      relatedWorkspace: null,
      basedOnSnapshots: sorted.length,
    });
    return observations;
  }

  // Pending growing between last two snapshots
  if (current && prior) {
    const movement = getStreamMovement(current, prior);

    if (movement === "growing") {
      observations.push({
        ...base,
        observationType:  "pending_growing",
        severity:         "warning",
        message:          `${stream.displayName}: consignaciones pendientes creciendo — ${current.pendingCount} entradas (era ${prior.pendingCount})`,
        suggestedAction:  "Revisar consignaciones sin identificar",
        relatedWorkspace: `/${orgSlug}/agentik/finanzas/torre-control/consignaciones`,
        basedOnSnapshots: sorted.length,
      });
    }

    if (movement === "resolved") {
      observations.push({
        ...base,
        observationType:  "pending_resolved",
        severity:         "ok",
        message:          `${stream.displayName}: consignaciones pendientes resueltas — de ${prior.pendingCount} a 0`,
        suggestedAction:  null,
        relatedWorkspace: null,
        basedOnSnapshots: sorted.length,
      });
    }
  }

  // Chronic pending — same reconciliation_pending status for >30 days
  if (current?.healthState === "degraded") {
    const aging = getAgingStatus(stream.id, snapshots);
    if (aging.isStale) {
      observations.push({
        ...base,
        observationType:  "chronic_pending",
        severity:         "critical",
        message:          `${stream.displayName}: consignaciones sin resolver por ${aging.agingLabel} — requiere atención operacional urgente`,
        suggestedAction:  "Revisar y conciliar consignaciones acumuladas",
        relatedWorkspace: `/${orgSlug}/agentik/finanzas/torre-control/consignaciones`,
        basedOnSnapshots: sorted.length,
      });
    }
  }

  // High noise signal
  if (sorted.length >= 3) {
    const noise = getNoiseLevel(sorted);
    if (noise.noiseLevel === "high") {
      observations.push({
        ...base,
        observationType:  "noise_detected",
        severity:         "warning",
        message:          `${stream.displayName}: ${noise.reason}`,
        suggestedAction:  "Verificar si el flujo de extractos bancarios es consistente",
        relatedWorkspace: null,
        basedOnSnapshots: sorted.length,
      });
    }
  }

  // No observations generated — stream is operationally nominal
  if (observations.length === 0 && current) {
    const obsType: CopilotObservationType =
      current.pendingCount > 0 ? "first_observation" : "first_observation";

    observations.push({
      ...base,
      observationType:  obsType,
      severity:         "info",
      message:          `${stream.displayName}: estado operativo nominal`,
      suggestedAction:  null,
      relatedWorkspace: null,
      basedOnSnapshots: sorted.length,
    });
  }

  return observations;
}
