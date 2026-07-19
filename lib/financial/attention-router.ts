/**
 * lib/financial/attention-router.ts
 *
 * Financial Attention Router — priority, grouping, and noise reduction.
 *
 * ── What this module does ─────────────────────────────────────────────────────
 *
 *   routeAttention(observations, streams, memoryTier)
 *     — Takes the flat sorted CopilotObservation[] from generateAllObservations()
 *     — Groups related observations (same type, multiple streams)
 *     — Selects the primary observation (highest priority)
 *     — Derives escalation level and executive attention summary
 *     — Reduces noise (caps additional signals, collapses low-value observations)
 *
 * ── Priority rules (Task 2) ───────────────────────────────────────────────────
 *
 *   Rule P1: critical > elevated > watch > ok > info
 *   Rule P2: Among same severity — more basedOnSnapshots wins (better evidence)
 *   Rule P3: Among same severity + snapshots — relatedWorkspace != null wins
 *   Rule P4: ok/positive observations always below actionable signals
 *   Rule P5: memory_building and pure info always last (informational only)
 *
 * ── Grouping rules (Task 3) ───────────────────────────────────────────────────
 *
 *   When ≥2 observations share the same observationType:
 *     → Synthesize into one ObservationGroup with count + stream names
 *     → Use synthesized message (see GROUPED_MESSAGE_TEMPLATES)
 *     → Preserve highest severity in the group
 *
 *   Always-grouped types (even for 1 observation if low-value):
 *     → integration_missing  — structural, not operational; always grouped
 *     → memory_building      — honest state; collapsed into quietCount
 *
 * ── Noise reduction (Task 6) ─────────────────────────────────────────────────
 *
 *   UI shows at most: 1 primary + 3 additional grouped signals = 4 total
 *   Excess: counted in quietCount ("N señales adicionales")
 *   Always collapsed: integration_missing, memory_building, first_observation
 *
 * ── SAFE READ-ONLY ────────────────────────────────────────────────────────────
 *
 *   Zero Prisma. Zero SAG. Zero side effects.
 *   Pure transformation: CopilotObservation[] → AttentionRouterResult
 */

import type { FinancialStream }          from "@/lib/financial/stream-model";
import type {
  CopilotObservation,
  CopilotObservationType,
  MemoryReadinessTier,
} from "@/lib/financial/memory-model";

// ── Output types ──────────────────────────────────────────────────────────────

/**
 * Escalation level derived from the full observation set.
 *
 *   urgent    — At least one critical observation
 *   elevated  — At least one elevated, OR 3+ watch observations
 *   watch     — At least one watch observation
 *   positive  — Only ok observations; nothing to act on
 *   building  — Only memory_building/first_observation; history accumulating
 *   quiet     — No observations or only nominal info
 */
export type EscalationLevel =
  | "urgent"
  | "elevated"
  | "watch"
  | "positive"
  | "building"
  | "quiet";

/** A synthesis of ≥1 observations of the same type across ≥1 streams. */
export interface ObservationGroup {
  /** The common observation type across all grouped observations. */
  observationType:  CopilotObservationType;
  /** Highest severity among grouped observations. */
  severity:         CopilotObservation["severity"];
  /** Stream IDs in this group. */
  streamIds:        string[];
  /** Short names of affected streams (for display). */
  streamNames:      string[];
  /** Number of observations collapsed into this group. */
  count:            number;
  /** Synthesized summary message. */
  message:          string;
  /** Related workspace href — from any of the grouped observations, if present. */
  relatedWorkspace: string | null;
  /** Total snapshots backing the most-evidenced observation in the group. */
  maxBasedOnSnapshots: number;
}

/** Executive attention summary — what the operator should think about first. */
export interface AttentionSummary {
  /** Derived escalation level. */
  level:    EscalationLevel;
  /**
   * Short headline label.
   * "Atención principal" | "Seguimiento recomendado" | "Sin acción requerida" |
   * "Memoria acumulándose" | "Sin señales financieras relevantes"
   */
  headline: string;
  /** One-line context, e.g. "2 fuentes con pendientes en aumento consecutivo". */
  context:  string;
}

/** Full result of the attention router. */
export interface AttentionRouterResult {
  /** The single most important observation to surface. Null when quiet. */
  primaryObservation:  CopilotObservation | null;
  /**
   * Additional grouped signals to show below the primary.
   * Capped at 3. Low-value observations are collapsed into quietCount.
   */
  groupedSignals:      ObservationGroup[];
  /** Executive summary headline + context. */
  attentionSummary:    AttentionSummary;
  /** Number of distinct streams with at least one actionable observation. */
  affectedStreams:     number;
  /**
   * Short recommended focus text, e.g. "Revisar consignaciones sin identificar".
   * Null when no action is needed.
   */
  recommendedFocus:    string | null;
  /**
   * Count of observations that were collapsed (not shown individually).
   * Includes: excess signals, integration_missing, memory_building.
   */
  quietCount:          number;
  /** Top-level escalation level. */
  escalationLevel:     EscalationLevel;
}

// ── Internal constants ────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<CopilotObservation["severity"], number> = {
  critical: 5,
  elevated: 4,
  warning:  3,
  watch:    3,
  ok:       2,
  info:     1,
};

/**
 * Observation types that are always grouped (never shown individually)
 * regardless of count.
 */
const ALWAYS_GROUPED: Set<CopilotObservationType> = new Set([
  "integration_missing",
  "memory_building",
  "first_observation",
]);

/**
 * Observation types that are low-value enough to be collapsed into quietCount
 * when they are the only type present (no actionable signals).
 */
const BACKGROUND_TYPES: Set<CopilotObservationType> = new Set([
  "integration_missing",
  "memory_building",
  "first_observation",
  "no_activity",
]);

// Max number of additional grouped signals shown in UI after the primary.
const MAX_ADDITIONAL_SIGNALS = 3;

// ── Grouped message synthesis ─────────────────────────────────────────────────

/**
 * Synthesizes a message for a group of ≥1 observations of the same type.
 * Uses stream short names when count is small, generic label when count is large.
 */
function synthesizeGroupMessage(
  type:        CopilotObservationType,
  streamNames: string[],
  count:       number,
): string {
  const names = count <= 3
    ? streamNames.slice(0, 3).join(", ")
    : `${count} fuentes`;

  switch (type) {
    case "consecutive_increase":
      return count === 1
        ? `${names}: consignaciones en aumento consecutivo`
        : `${names}: consignaciones pendientes en aumento consecutivo`;
    case "consecutive_decrease":
      return count === 1
        ? `${names}: pendientes reduciéndose de forma consecutiva`
        : `${count} fuentes con pendientes reduciéndose consecutivamente`;
    case "chronic_pending":
      return count === 1
        ? `${names}: consignaciones sin resolver por más de 30 días`
        : `${count} fuentes con consignaciones crónicas sin resolver`;
    case "noise_detected":
      return count === 1
        ? `${names}: flujo operacional irregular detectado`
        : `${count} fuentes con flujo operacional irregular`;
    case "repeated_blocked":
      return count === 1
        ? `${names}: estado bloqueado repetido — integración inestable`
        : `${count} fuentes con bloqueos repetidos`;
    case "stale_stream":
      return count === 1
        ? `${names}: sin captura de datos reciente`
        : `${count} fuentes sin capturas recientes`;
    case "pending_resolved":
      return count === 1
        ? `${names}: consignaciones resueltas`
        : `${count} fuentes resolvieron consignaciones pendientes`;
    case "no_activity":
      return count === 1
        ? `${names}: sin consignaciones pendientes — estado limpio`
        : `${count} fuentes sin actividad pendiente`;
    case "recovery_pattern":
      return count === 1
        ? `${names}: recuperación operacional en curso`
        : `${count} fuentes en recuperación operacional`;
    case "integration_missing":
      return count === 1
        ? `${names}: sin lectura bancaria configurada`
        : `${count} fuentes sin lectura bancaria configurada`;
    case "memory_building":
      return count === 1
        ? `${names}: historial acumulándose`
        : `${count} fuentes acumulando historial operacional`;
    case "stream_blocked":
      return count === 1
        ? `${names}: fuente bloqueada`
        : `${count} fuentes bloqueadas`;
    default:
      return count === 1
        ? `${names}: señal operacional activa`
        : `${count} fuentes con señales activas`;
  }
}

// ── Stream name lookup ────────────────────────────────────────────────────────

function buildStreamNameMap(streams: FinancialStream[]): Map<string, string> {
  return new Map(streams.map(s => [s.id, s.shortName || s.displayName]));
}

// ── Priority comparator ───────────────────────────────────────────────────────

/**
 * Returns negative if a should come before b (higher priority first).
 * Rules P1–P4.
 */
function compareObservationPriority(
  a: CopilotObservation,
  b: CopilotObservation,
): number {
  const rankDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
  if (rankDiff !== 0) return rankDiff;

  // Rule P2: more snapshots = better evidence
  const snapDiff = b.basedOnSnapshots - a.basedOnSnapshots;
  if (snapDiff !== 0) return snapDiff;

  // Rule P3: has workspace link wins
  const wsA = a.relatedWorkspace !== null ? 1 : 0;
  const wsB = b.relatedWorkspace !== null ? 1 : 0;
  return wsB - wsA;
}

// ── Escalation level derivation ───────────────────────────────────────────────

function deriveEscalationLevel(
  observations:  CopilotObservation[],
  memoryTier?:   MemoryReadinessTier,
): EscalationLevel {
  if (observations.length === 0) {
    return memoryTier === "no_history" || memoryTier === "building" ? "building" : "quiet";
  }

  const hasCritical  = observations.some(o => o.severity === "critical");
  const hasElevated  = observations.some(o => o.severity === "elevated");
  const watchCount   = observations.filter(o => o.severity === "watch" || o.severity === "warning").length;
  const hasWatch     = watchCount > 0;
  const onlyPositive = observations.every(o => o.severity === "ok");
  const onlyBackground = observations.every(o => BACKGROUND_TYPES.has(o.observationType));
  const allMemory    = observations.every(o =>
    o.observationType === "memory_building" || o.observationType === "first_observation",
  );

  if (hasCritical)                      return "urgent";
  if (hasElevated || watchCount >= 3)   return "elevated";
  if (hasWatch)                         return "watch";
  if (onlyPositive)                     return "positive";
  if (allMemory)                        return "building";
  if (onlyBackground)                   return "building";
  return "quiet";
}

// ── Attention summary ─────────────────────────────────────────────────────────

function buildAttentionSummary(
  level:        EscalationLevel,
  observations: CopilotObservation[],
  streams:      FinancialStream[],
): AttentionSummary {
  const nameMap = buildStreamNameMap(streams);

  const headline = (() => {
    switch (level) {
      case "urgent":   return "Atención principal";
      case "elevated": return "Atención principal";
      case "watch":    return "Seguimiento recomendado";
      case "positive": return "Sin acción requerida";
      case "building": return "Memoria acumulándose";
      case "quiet":    return "Sin señales financieras relevantes";
    }
  })();

  // Context: short description of what is driving the level
  const context = (() => {
    if (level === "building") {
      const buildingCount = observations.filter(o =>
        o.observationType === "memory_building" || o.observationType === "first_observation",
      ).length;
      return buildingCount > 0
        ? `${buildingCount} fuente${buildingCount > 1 ? "s" : ""} acumulando historial`
        : "sin historial operacional suficiente";
    }

    if (level === "quiet" || level === "positive") {
      const quietStreams = observations.filter(o => o.severity === "ok").length;
      return quietStreams > 0
        ? `${quietStreams} fuente${quietStreams > 1 ? "s" : ""} en estado positivo`
        : "todas las fuentes en estado nominal";
    }

    // Actionable levels — describe the most critical group
    const actionable = observations.filter(
      o => o.severity === "critical" || o.severity === "elevated" || o.severity === "watch" || o.severity === "warning",
    );

    if (actionable.length === 0) return "";

    // Find the most common actionable type
    const typeCounts: Map<CopilotObservationType, number> = new Map();
    for (const ob of actionable) {
      typeCounts.set(ob.observationType, (typeCounts.get(ob.observationType) ?? 0) + 1);
    }
    const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const topCount = typeCounts.get(topType) ?? 0;
    const topObs = actionable.filter(o => o.observationType === topType);
    const topNames = topObs
      .map(o => nameMap.get(o.streamId) ?? o.streamId)
      .slice(0, 3)
      .join(", ");

    switch (topType) {
      case "consecutive_increase":
        return topCount === 1
          ? `${topNames} con pendientes en aumento consecutivo`
          : `${topCount} fuentes con consignaciones en aumento`;
      case "chronic_pending":
        return topCount === 1
          ? `${topNames}: consignaciones crónicas sin resolver`
          : `${topCount} fuentes con consignaciones crónicas`;
      case "noise_detected":
        return `flujo irregular detectado en ${topCount > 1 ? `${topCount} fuentes` : topNames}`;
      case "repeated_blocked":
        return `integración inestable en ${topCount > 1 ? `${topCount} fuentes` : topNames}`;
      case "stale_stream":
        return `${topCount > 1 ? `${topCount} fuentes` : topNames} sin capturas recientes`;
      default:
        return actionable.length === 1
          ? "1 señal operacional requiere atención"
          : `${actionable.length} señales operacionales requieren atención`;
    }
  })();

  return { level, headline, context };
}

// ── Main router ───────────────────────────────────────────────────────────────

/**
 * Routes a flat CopilotObservation[] into a prioritized, grouped result.
 *
 * @param observations  Output from generateAllObservations(). Must be pre-sorted.
 * @param streams       All FinancialStream entries (for name lookup).
 * @param memoryTier    Current memory readiness (for escalation context).
 */
export function routeAttention(
  observations: CopilotObservation[],
  streams:      FinancialStream[],
  memoryTier?:  MemoryReadinessTier,
): AttentionRouterResult {

  const nameMap = buildStreamNameMap(streams);

  // ── Step 1: Separate actionable from background observations ──────────────
  const actionable  = observations.filter(o => !BACKGROUND_TYPES.has(o.observationType));
  const background  = observations.filter(o =>  BACKGROUND_TYPES.has(o.observationType));

  // ── Step 2: Sort actionable by priority ───────────────────────────────────
  const sorted = [...actionable].sort(compareObservationPriority);

  // ── Step 3: Select primary observation ────────────────────────────────────
  // Primary = highest-priority actionable observation.
  // If none, check for positive signals (ok severity).
  const primaryObs = sorted[0] ?? null;

  // ── Step 4: Group remaining observations by type ──────────────────────────
  // Collect all non-primary observations (actionable + always-grouped background).
  const alwaysGrouped   = background.filter(o => ALWAYS_GROUPED.has(o.observationType));
  const remainingAction = sorted.slice(1);
  const toGroup         = [...remainingAction, ...alwaysGrouped];

  // Group by observationType
  const typeMap: Map<CopilotObservationType, CopilotObservation[]> = new Map();
  for (const ob of toGroup) {
    const existing = typeMap.get(ob.observationType) ?? [];
    typeMap.set(ob.observationType, [...existing, ob]);
  }

  // Build ObservationGroup[] sorted by highest severity in group
  const allGroups: ObservationGroup[] = [];
  for (const [type, obs] of typeMap.entries()) {
    const highestSeverity = obs.reduce((best, o) =>
      (SEVERITY_RANK[o.severity] ?? 0) > (SEVERITY_RANK[best.severity] ?? 0) ? o : best,
    ).severity;
    const streamIds   = [...new Set(obs.map(o => o.streamId))];
    const streamNames = streamIds.map(id => nameMap.get(id) ?? id);
    const workspace   = obs.find(o => o.relatedWorkspace)?.relatedWorkspace ?? null;
    const maxSnaps    = Math.max(...obs.map(o => o.basedOnSnapshots));

    allGroups.push({
      observationType:     type,
      severity:            highestSeverity,
      streamIds,
      streamNames,
      count:               obs.length,
      message:             synthesizeGroupMessage(type, streamNames, obs.length),
      relatedWorkspace:    workspace,
      maxBasedOnSnapshots: maxSnaps,
    });
  }

  // Sort groups by severity
  allGroups.sort((a, b) =>
    (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );

  // ── Step 5: Cap to MAX_ADDITIONAL_SIGNALS ──────────────────────────────────
  const shownGroups  = allGroups.slice(0, MAX_ADDITIONAL_SIGNALS);
  const hiddenGroups = allGroups.slice(MAX_ADDITIONAL_SIGNALS);

  // quietCount = background that's not shown + hidden excess groups (by individual obs count)
  const hiddenBgCount  = background.filter(o => !ALWAYS_GROUPED.has(o.observationType)).length;
  const hiddenGrpCount = hiddenGroups.reduce((s, g) => s + g.count, 0);
  const quietCount     = hiddenBgCount + hiddenGrpCount;

  // ── Step 6: Affected streams ───────────────────────────────────────────────
  const actionableStreamIds = new Set([
    ...(primaryObs ? [primaryObs.streamId] : []),
    ...remainingAction.map(o => o.streamId),
  ]);
  const affectedStreams = actionableStreamIds.size;

  // ── Step 7: Escalation level ───────────────────────────────────────────────
  const escalationLevel = deriveEscalationLevel(observations, memoryTier);

  // ── Step 8: Attention summary ──────────────────────────────────────────────
  const attentionSummary = buildAttentionSummary(escalationLevel, observations, streams);

  // ── Step 9: Recommended focus ─────────────────────────────────────────────
  const recommendedFocus = primaryObs?.suggestedAction ?? null;

  return {
    primaryObservation: primaryObs,
    groupedSignals:     shownGroups,
    attentionSummary,
    affectedStreams,
    recommendedFocus,
    quietCount,
    escalationLevel,
  };
}
