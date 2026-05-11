/**
 * lib/financial/observation-engine.ts
 *
 * Financial Observation Engine — deterministic operational observations.
 *
 * ── What this module does ─────────────────────────────────────────────────────
 *
 *   generateObservations(stream, snapshots, orgSlug)
 *     — Transforms FinancialStreamSnapshot[] into CopilotObservation[].
 *     — All observations are 100% derived from real snapshot data.
 *     — No AI. No ML. No invented signals.
 *
 *   Temporal pattern detectors (pure functions):
 *     detectConsecutiveIncrease(snapshots) → number of consecutive increasing days
 *     detectConsecutiveDecrease(snapshots) → number of consecutive decreasing days
 *     detectRecoveryPattern(snapshots)     → was growing ≥3d, now decreasing ≥2d
 *     detectNoActivityDays(snapshots)      → consecutive days with pendingCount=0
 *     detectRepeatedBlockedState(snapshots)→ how many times stream was blocked
 *     detectStaleStream(snapshots, today)  → no snapshot in last N days
 *
 * ── Observation philosophy ────────────────────────────────────────────────────
 *
 *   Every observation has:
 *     - A traceable rule (documented below each rule section)
 *     - A minimum snapshot count (enforced — no fabricated patterns)
 *     - An evidence-based message (specific counts and dates, not generic)
 *     - An honest fallback when history is insufficient
 *
 * ── Severity scale ────────────────────────────────────────────────────────────
 *
 *   ok        — Positive operational signal (resolved, stable, improving)
 *   info      — Neutral. Honest state or insufficient history.
 *   watch     — Low attention needed. Monitor (e.g. 2-day increase).
 *   elevated  — Action recommended. Pattern persisting (e.g. 4+ days).
 *   critical  — Urgent. Immediate attention (e.g. 6+ days, chronic).
 *
 * ── Minimum snapshots per rule ────────────────────────────────────────────────
 *
 *   Current state (no history needed): R_INTEGRATION, R_STALE
 *   1-day comparison:                  R_RESOLVED
 *   3+ snapshots:                      R_CONSECUTIVE_INC, R_CONSECUTIVE_DEC
 *   5+ snapshots:                      R_RECOVERY
 *   7+ snapshots:                      R_NO_ACTIVITY, R_NOISE, R_REPEATED_BLOCKED
 *   30+ days of history:               R_CHRONIC
 *
 * ── SAFE READ-ONLY ────────────────────────────────────────────────────────────
 *
 *   Zero Prisma. Zero SAG. Zero side effects.
 *   All inputs must already be fetched. All outputs are plain JSON.
 */

import type { FinancialStream }     from "@/lib/financial/stream-model";
import type {
  FinancialStreamSnapshot,
  CopilotObservation,
  CopilotObservationType,
} from "@/lib/financial/memory-model";
import { getAgingStatus, getNoiseLevel } from "@/lib/financial/memory-helpers";

// ── Internal utilities ────────────────────────────────────────────────────────

/** Sort snapshots newest-first. Pure — returns new array. */
function sortNewestFirst(snaps: FinancialStreamSnapshot[]): FinancialStreamSnapshot[] {
  return [...snaps].sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
}

/** Colombia calendar date "YYYY-MM-DD" (UTC-5, no DST). */
function colombiaDayISO(): string {
  const COT_OFFSET_MS = 5 * 60 * 60 * 1000;
  return new Date(Date.now() - COT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Days from date string to today (Colombia). */
function daysAgo(dateISO: string): number {
  const today  = colombiaDayISO();
  const msA    = new Date(dateISO).getTime();
  const msB    = new Date(today).getTime();
  return Math.round(Math.abs(msB - msA) / (1000 * 60 * 60 * 24));
}

// ── Temporal pattern detectors ────────────────────────────────────────────────
// All are pure functions. No side effects. No Prisma.

/**
 * R_CONSECUTIVE_INC — How many consecutive days at the HEAD of history
 * (most recent) the pendingCount has been strictly increasing.
 *
 * Returns 0 if the most recent day is not an increase.
 * Requires: sorted newest-first, ≥2 snapshots.
 *
 * Example: counts [12, 10, 7, 4, 2] newest-first → 4 consecutive increases
 * Example: counts [10, 12, 7, 4]   newest-first → 0 (most recent decreased)
 */
export function detectConsecutiveIncrease(sorted: FinancialStreamSnapshot[]): number {
  if (sorted.length < 2) return 0;
  let days = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].pendingCount > sorted[i + 1].pendingCount) {
      days++;
    } else {
      break;
    }
  }
  return days;
}

/**
 * R_CONSECUTIVE_DEC — How many consecutive days at the HEAD of history
 * (most recent) the pendingCount has been strictly decreasing.
 *
 * Returns 0 if the most recent day is not a decrease.
 * Requires: sorted newest-first, ≥2 snapshots.
 */
export function detectConsecutiveDecrease(sorted: FinancialStreamSnapshot[]): number {
  if (sorted.length < 2) return 0;
  let days = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].pendingCount < sorted[i + 1].pendingCount) {
      days++;
    } else {
      break;
    }
  }
  return days;
}

/**
 * R_RECOVERY — Detects recovery pattern:
 * stream was growing for ≥3 days, and is now decreasing for ≥2 days.
 *
 * Requires: sorted newest-first, ≥5 snapshots.
 *
 * Transition looks like: ... [grow grow grow] [decrease decrease] (current)
 */
export function detectRecoveryPattern(sorted: FinancialStreamSnapshot[]): boolean {
  if (sorted.length < 5) return false;

  const decDays = detectConsecutiveDecrease(sorted);
  if (decDays < 2) return false;

  // Look at the segment BEFORE the decrease — was there an increase?
  const afterDecrease = sorted.slice(decDays);
  const incDays = detectConsecutiveIncrease(afterDecrease);
  return incDays >= 3;
}

/**
 * R_NO_ACTIVITY — How many consecutive days at the HEAD of history
 * the pendingCount has been 0 (stream fully quiet).
 *
 * Returns 0 if current snapshot has pendingCount > 0.
 * Requires: sorted newest-first, ≥1 snapshot.
 */
export function detectNoActivityDays(sorted: FinancialStreamSnapshot[]): number {
  if (sorted.length === 0) return 0;
  if (sorted[0].pendingCount !== 0) return 0;
  let days = 0;
  for (const snap of sorted) {
    if (snap.pendingCount === 0) {
      days++;
    } else {
      break;
    }
  }
  return days;
}

/**
 * R_REPEATED_BLOCKED — How many times the stream appeared in "blocked_source"
 * or "missing_sag_mapping" status in the last N snapshots.
 *
 * Requires: ≥7 snapshots for a meaningful result.
 * @param sorted  Snapshots newest-first.
 * @param window  How many recent snapshots to inspect (default 10).
 */
export function detectRepeatedBlockedState(
  sorted: FinancialStreamSnapshot[],
  window: number = 10,
): number {
  return sorted
    .slice(0, window)
    .filter(s =>
      s.streamStatus === "blocked_source" ||
      s.streamStatus === "missing_sag_mapping",
    ).length;
}

/**
 * R_STALE — True when the most recent snapshot is older than maxDaysGap
 * AND the stream is expected to have active data (has SAG link).
 *
 * @param sorted       Snapshots newest-first.
 * @param maxDaysGap   Days threshold (default 3).
 */
export function detectStaleStream(
  sorted:      FinancialStreamSnapshot[],
  maxDaysGap:  number = 3,
): boolean {
  if (sorted.length === 0) return false;
  return daysAgo(sorted[0].snapshotDate) > maxDaysGap;
}

// ── Observation builder helpers ───────────────────────────────────────────────

type ObsSeverity = CopilotObservation["severity"];

function obs(
  stream:      FinancialStream,
  orgId:       string,
  type:        CopilotObservationType,
  severity:    ObsSeverity,
  message:     string,
  action:      string | null,
  workspace:   string | null,
  snapshotCount: number,
): CopilotObservation {
  return {
    streamId:         stream.id,
    orgId,
    generatedAt:      new Date().toISOString(),
    observationType:  type,
    severity,
    message,
    suggestedAction:  action,
    relatedWorkspace: workspace,
    confidence:       "RULE_BASED",
    basedOnSnapshots: snapshotCount,
  };
}

// ── Observation priority ──────────────────────────────────────────────────────

const SEVERITY_RANK: Record<ObsSeverity, number> = {
  critical: 5,
  elevated: 4,
  warning:  3,
  watch:    3,
  ok:       2,
  info:     1,
};

/** Sorts observations highest severity first. */
export function sortObservationsByPriority(
  observations: CopilotObservation[],
): CopilotObservation[] {
  return [...observations].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Generates deterministic operational observations for one financial stream.
 *
 * Applies temporal pattern rules in priority order. Each rule has a
 * documented minimum snapshot count — rules are skipped silently when
 * history is insufficient (honest degradation, not fabrication).
 *
 * Returns an empty array (not a fallback observation) when:
 *   - Stream is operationally nominal and no patterns are active
 *
 * Returns a memory_building observation when:
 *   - Fewer than 3 snapshots exist (not enough for pattern detection)
 *
 * @param stream     Current FinancialStream operational state.
 * @param snapshots  All snapshots for this stream (any order; filtered internally).
 * @param orgSlug    Org slug for workspace hrefs.
 */
export function generateObservations(
  stream:    FinancialStream,
  snapshots: FinancialStreamSnapshot[],
  orgSlug:   string,
): CopilotObservation[] {
  const result: CopilotObservation[] = [];
  const orgId  = snapshots[0]?.orgId ?? "";
  const sorted = sortNewestFirst(snapshots.filter(s => s.streamId === stream.id));
  const n      = sorted.length;
  const current = sorted[0] ?? null;
  const consignacionesPath = `/${orgSlug}/agentik/finanzas/torre-control/consignaciones`;

  // ── R_INTEGRATION — No SAG link ─────────────────────────────────────────────
  // Applies regardless of snapshot count.
  if (stream.status === "integration_pending") {
    result.push(obs(
      stream, orgId,
      "integration_missing", "info",
      `${stream.displayName}: sin lectura bancaria configurada — extracto requerido para conciliación`,
      `Validar código SAG PUC ${stream.sagAccountCode}`,
      null,
      n,
    ));
    return result;
  }

  // ── R_STALE — No recent snapshot on active stream ────────────────────────────
  // Applies when history exists but is stale (>3 days).
  // Does not apply to settlement_pending / integration_pending streams.
  if (
    n > 0 &&
    detectStaleStream(sorted, 3) &&
    stream.group === "bancos"
  ) {
    const daysMissing = daysAgo(sorted[0].snapshotDate);
    result.push(obs(
      stream, orgId,
      "stale_stream", "watch",
      `${stream.displayName}: sin captura de datos hace ${daysMissing} días — verificar ejecución del cron`,
      "Revisar ejecución del snapshot diario",
      null,
      n,
    ));
    // Continue — may have additional state observations below
  }

  // ── No snapshots yet — honest baseline ───────────────────────────────────────
  if (n === 0) {
    result.push(obs(
      stream, orgId,
      "first_observation", "info",
      `${stream.displayName}: primera observación — sin historial para comparar`,
      null,
      null,
      0,
    ));
    return result;
  }

  // ── R_RESOLVED — Pending cleared to 0 (1-day, requires 2 snapshots) ─────────
  if (n >= 2 && current!.pendingCount === 0 && sorted[1].pendingCount > 0) {
    result.push(obs(
      stream, orgId,
      "pending_resolved", "ok",
      `${stream.displayName}: consignaciones pendientes resueltas — de ${sorted[1].pendingCount} a 0`,
      null,
      null,
      n,
    ));
    return result; // Resolved is a terminal positive — no other patterns needed
  }

  // ── Insufficient history for pattern rules ────────────────────────────────────
  // When fewer than 3 snapshots exist, pattern rules cannot run honestly.
  // Emit memory_building and current-state info only.
  if (n < 3) {
    if (current && current.pendingCount > 0) {
      result.push(obs(
        stream, orgId,
        "memory_building", "info",
        `${stream.displayName}: ${current.pendingCount} consignaciones pendientes — memoria acumulándose (${n} día${n > 1 ? "s" : ""} de historial)`,
        "Se necesitan al menos 3 días de historial para detectar patrones",
        consignacionesPath,
        n,
      ));
    } else {
      result.push(obs(
        stream, orgId,
        "memory_building", "info",
        `${stream.displayName}: memoria acumulándose — ${n} día${n > 1 ? "s" : ""} de historial disponible`,
        null,
        null,
        n,
      ));
    }
    return result;
  }

  // ── Pattern rules (require ≥3 snapshots) ─────────────────────────────────────

  // R_CONSECUTIVE_INC — Pending count increasing for N consecutive days
  // Severity escalates with duration.
  const incDays = detectConsecutiveIncrease(sorted);
  if (incDays >= 2) {
    let severity: ObsSeverity;
    if      (incDays >= 6) severity = "critical";
    else if (incDays >= 4) severity = "elevated";
    else                   severity = "watch";

    const peak = sorted[0].pendingCount;
    result.push(obs(
      stream, orgId,
      "consecutive_increase", severity,
      `${stream.displayName}: consignaciones pendientes en aumento por ${incDays} días consecutivos — ahora ${peak} entradas`,
      "Revisar y gestionar consignaciones sin identificar",
      consignacionesPath,
      n,
    ));
  }

  // R_CONSECUTIVE_DEC — Pending count decreasing for N consecutive days (positive)
  const decDays = detectConsecutiveDecrease(sorted);
  if (decDays >= 2 && incDays === 0) {
    result.push(obs(
      stream, orgId,
      "consecutive_decrease", "ok",
      `${stream.displayName}: consignaciones pendientes reduciéndose por ${decDays} días consecutivos — de ${sorted[decDays].pendingCount} a ${sorted[0].pendingCount}`,
      null,
      null,
      n,
    ));
  }

  // R_RECOVERY — Was growing, now recovering
  if (n >= 5 && detectRecoveryPattern(sorted) && incDays === 0) {
    result.push(obs(
      stream, orgId,
      "recovery_pattern", "info",
      `${stream.displayName}: recuperación operacional — consignaciones pendientes bajando después de período de aumento`,
      null,
      null,
      n,
    ));
  }

  // R_NO_ACTIVITY — Zero pending for ≥7 consecutive days (requires ≥7 snapshots)
  if (n >= 7) {
    const quietDays = detectNoActivityDays(sorted);
    if (quietDays >= 7) {
      result.push(obs(
        stream, orgId,
        "no_activity", "ok",
        `${stream.displayName}: sin consignaciones pendientes por ${quietDays} días consecutivos — estado operacional limpio`,
        null,
        null,
        n,
      ));
    }
  }

  // R_REPEATED_BLOCKED — Blocked state appearing repeatedly (requires ≥7 snapshots)
  if (n >= 7) {
    const blockedCount = detectRepeatedBlockedState(sorted, 10);
    if (blockedCount >= 3) {
      const severity: ObsSeverity = blockedCount >= 5 ? "elevated" : "watch";
      result.push(obs(
        stream, orgId,
        "repeated_blocked", severity,
        `${stream.displayName}: estado bloqueado detectado en ${blockedCount} de los últimos 10 registros — integración inestable`,
        "Revisar configuración de la fuente SAG",
        null,
        n,
      ));
    }
  }

  // R_CHRONIC — Same reconciliation_pending for >30 days (aging check)
  if (current?.streamStatus === "reconciliation_pending") {
    const aging = getAgingStatus(stream.id, snapshots);
    if (aging.isStale) {
      result.push(obs(
        stream, orgId,
        "chronic_pending", "critical",
        `${stream.displayName}: consignaciones sin resolver por ${aging.agingLabel} — situación crónica`,
        "Revisar y conciliar consignaciones acumuladas urgentemente",
        consignacionesPath,
        n,
      ));
    }
  }

  // R_NOISE — High pendingCount variance (requires ≥7 snapshots)
  if (n >= 7) {
    const noise = getNoiseLevel(sorted);
    if (noise.noiseLevel === "high") {
      result.push(obs(
        stream, orgId,
        "noise_detected", "elevated",
        `${stream.displayName}: ${noise.reason} — flujo operacional irregular en los últimos ${n} registros`,
        "Verificar consistencia del flujo de extractos bancarios",
        null,
        n,
      ));
    }
  }

  // ── No actionable observations — stream is operationally nominal ──────────────
  // Only emit a nominal observation when the stream has pending items
  // (something to report). For streams with 0 pending, silence is the signal.
  if (result.length === 0 && current && current.pendingCount > 0) {
    result.push(obs(
      stream, orgId,
      "first_observation", "info",
      `${stream.displayName}: ${current.pendingCount} consignaciones pendientes — sin patrón detectado`,
      "Revisar consignaciones para identificar",
      consignacionesPath,
      n,
    ));
  }

  return result;
}

// ── Multi-stream engine ───────────────────────────────────────────────────────

/**
 * Runs generateObservations for all streams and returns a flat sorted list.
 *
 * Observations are sorted highest severity first.
 * Empty (nominal) streams produce no observations.
 *
 * @param streams    All FinancialStream entries for the org.
 * @param snapshots  All FinancialStreamSnapshot entries for the org.
 * @param orgSlug    Org slug for workspace hrefs.
 */
export function generateAllObservations(
  streams:   FinancialStream[],
  snapshots: FinancialStreamSnapshot[],
  orgSlug:   string,
): CopilotObservation[] {
  const all = streams.flatMap(stream =>
    generateObservations(stream, snapshots, orgSlug),
  );
  return sortObservationsByPriority(all);
}
