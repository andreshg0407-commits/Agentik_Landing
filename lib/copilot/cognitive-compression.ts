/**
 * lib/copilot/cognitive-compression.ts
 *
 * Agentik Copilot — Cognitive Compression Engine
 *
 * Sprint: AGENTIK-COPILOT-THREE-CARD-RAIL-01 — Block D
 *
 * Transforms multiple operational signals, runtime state, governance,
 * memory, incidents, and execution state into a minimal set of
 * prioritized, actionable executive pieces.
 *
 * PRINCIPLE: compress complexity → surface clarity.
 * The underlying system remains fully operational.
 * Only what gets rendered changes.
 */

// ── Priority levels ───────────────────────────────────────────────────────────

export type AttentionLevel = "critical" | "elevated" | "normal" | "low";

// ── Compressed signal ─────────────────────────────────────────────────────────

export interface CompressedSignal {
  id:          string;
  title:       string;
  description: string;
  level:       AttentionLevel;
  actionLabel: string;
  targetHref:  string;
  source:      "signal" | "incident" | "governance" | "execution" | "accountability";
}

// ── Executive priority ────────────────────────────────────────────────────────

export interface ExecutivePriority {
  score:       number;        // 0–100 attention score
  level:       AttentionLevel;
  label:       string;        // "Requiere atención inmediata" / "Todo en orden"
  description: string;        // 1-line summary
}

// ── Compression input ─────────────────────────────────────────────────────────

export interface CompressionInput {
  // Signals
  criticalSignalCount: number;
  elevatedSignalCount: number;
  totalSignalCount:    number;

  // Runtime
  runtimeState:   string;    // "HEALTHY" | "DEGRADED" | "STALE" | "SYNCING"
  runtimeDegraded: boolean;

  // Governance
  governanceBlocked: boolean;

  // Incidents
  criticalIncidents: number;
  totalIncidents:    number;

  // Execution
  pendingApprovals:   number;
  hasBlockedDispatch: boolean;
  hasSupervisedExec:  boolean;

  // Memory & accountability
  memoryContinuityScore:   number;   // 0–100
  accountabilityPressure?: string;   // "urgent" | "high" | "medium" | "low"
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Compresses all operational signals into a ranked list of compressed signals.
 * Returns at most `limit` items sorted by attention score.
 */
export function compressOperationalSignals(params: {
  signals: Array<{
    id: string;
    severity: string;
    titulo: string;
    descripcion: string;
    accion: string;
    targetPath: string;
  }>;
  orgSlug: string;
  limit?: number;
}): CompressedSignal[] {
  const limit = params.limit ?? 3;

  return params.signals
    .slice(0, limit * 2)
    .map(s => ({
      id:          s.id,
      title:       s.titulo,
      description: s.descripcion,
      level:       severityToLevel(s.severity),
      actionLabel: s.accion,
      targetHref:  `/${params.orgSlug}${s.targetPath}`,
      source:      "signal" as const,
    }))
    .sort((a, b) => levelScore(b.level) - levelScore(a.level))
    .slice(0, limit);
}

/**
 * Resolves the executive priority from all compressed signals.
 */
export function resolveExecutivePriority(input: CompressionInput): ExecutivePriority {
  const score = computeAttentionScore(input);

  if (score >= 80) {
    return {
      score, level: "critical",
      label:       "Requiere atención inmediata",
      description: buildPriorityDescription("critical", input),
    };
  }
  if (score >= 50) {
    return {
      score, level: "elevated",
      label:       "Atención recomendada",
      description: buildPriorityDescription("elevated", input),
    };
  }
  if (score >= 20) {
    return {
      score, level: "normal",
      label:       "Monitoreo activo",
      description: buildPriorityDescription("normal", input),
    };
  }
  return {
    score, level: "low",
    label:       "Todo en orden",
    description: "Sistema operando con normalidad. Sin señales de atención.",
  };
}

/**
 * Computes a 0–100 attention score from all operational inputs.
 * Higher = more urgent attention required.
 */
export function computeAttentionScore(input: CompressionInput): number {
  let score = 0;

  // Critical signals / incidents (heavy weight)
  score += input.criticalSignalCount * 30;
  score += input.criticalIncidents * 25;

  // Governance / execution blocks (high weight)
  if (input.governanceBlocked)  score += 20;
  if (input.hasBlockedDispatch) score += 15;
  if (input.pendingApprovals > 0) score += input.pendingApprovals * 8;

  // Runtime degradation (medium weight)
  if (input.runtimeDegraded) score += 15;
  if (input.runtimeState === "STALE") score += 8;

  // Elevated signals (low weight)
  score += input.elevatedSignalCount * 5;
  score += input.totalIncidents * 3;

  // Accountability pressure
  if (input.accountabilityPressure === "urgent") score += 20;
  else if (input.accountabilityPressure === "high") score += 10;

  // Memory continuity gap (minor)
  if (input.memoryContinuityScore < 50) score += 5;

  return Math.min(100, score);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityToLevel(severity: string): AttentionLevel {
  switch (severity) {
    case "critica":     return "critical";
    case "elevada":     return "elevated";
    case "vigilancia":  return "normal";
    default:            return "low";
  }
}

function levelScore(level: AttentionLevel): number {
  switch (level) {
    case "critical": return 4;
    case "elevated": return 3;
    case "normal":   return 2;
    case "low":      return 1;
  }
}

function buildPriorityDescription(level: AttentionLevel, input: CompressionInput): string {
  const parts: string[] = [];

  if (input.criticalSignalCount > 0) {
    parts.push(`${input.criticalSignalCount} señal${input.criticalSignalCount > 1 ? "es" : ""} crítica${input.criticalSignalCount > 1 ? "s" : ""}`);
  }
  if (input.pendingApprovals > 0) {
    parts.push(`${input.pendingApprovals} aprobación${input.pendingApprovals > 1 ? "es" : ""} pendiente${input.pendingApprovals > 1 ? "s" : ""}`);
  }
  if (input.governanceBlocked) {
    parts.push("gobernanza bloqueada");
  }
  if (input.runtimeDegraded) {
    parts.push("runtime degradado");
  }
  if (input.criticalIncidents > 0) {
    parts.push(`${input.criticalIncidents} incidente${input.criticalIncidents > 1 ? "s" : ""} crítico${input.criticalIncidents > 1 ? "s" : ""}`);
  }

  if (parts.length === 0) {
    return level === "normal"
      ? `${input.totalSignalCount} señal${input.totalSignalCount !== 1 ? "es" : ""} operativa${input.totalSignalCount !== 1 ? "s" : ""} activa${input.totalSignalCount !== 1 ? "s" : ""}`
      : "Condiciones operativas estables";
  }

  return parts.join(" · ");
}
