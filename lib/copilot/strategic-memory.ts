/**
 * lib/copilot/strategic-memory.ts
 *
 * Agentik Copilot — Strategic Memory Layer V1
 *
 * Phases A1 + A2 of Sprint AGENTIK-STRATEGIC-MEMORY-AND-CAPABILITIES-01
 *
 * Builds and maintains organizational memory that persists across sessions.
 * Detects patterns, recurring risks, and operational continuity signals
 * that inform higher-level decision-making.
 *
 * V1: deterministic mock — castillitos-specific patterns.
 * V2: Prisma.CopilotMemoryEntry with real pattern detection from logs.
 */

import type { CopilotContextSnapshot }  from "./context-engine";
import type { AccountabilitySignal }    from "./accountability-engine";
import type { AgentCollaboration }      from "./agent-collaboration";
import type { ExecutiveIntent }         from "./executive-intent";

// ── Types ──────────────────────────────────────────────────────────────────────

export type StrategicMemoryType =
  | "operational_pattern"    // Recurring operational behaviors or rhythms
  | "executive_decision"     // Key decisions made with lasting impact
  | "recurring_risk"         // Risk that appears repeatedly across sessions
  | "tenant_preference"      // Organizational preferences and priorities
  | "unresolved_issue"       // Active issue that remains open across sessions
  | "resolved_issue"         // Past issue that was resolved (for reference)
  | "execution_history"      // Track record of completed operations
  | "collaboration_pattern"  // Recurring multi-agent coordination patterns
  | "business_context";      // Persistent business environment context

export type MemoryImportance = "low" | "medium" | "high" | "critical";

export interface StrategicMemoryEntry {
  id:                  string;
  orgSlug:             string;
  type:                StrategicMemoryType;
  title:               string;          // Short title for indexing
  summary:             string;          // 1–2 sentence description
  relatedModules:      string[];
  relatedAgents:       string[];
  importance:          MemoryImportance;
  continuityScore:     number;          // 0–100: how strongly this pattern persists
  createdAt:           string;          // Relative time — serializable
  updatedAt:           string;
  lastReferencedAt:    string;
  tags:                string[];
}

// ── Castillitos static memory registry (V1 mock) ──────────────────────────────
// These represent organizational learnings built from prior sessions.

const CASTILLITOS_MEMORY: StrategicMemoryEntry[] = [
  {
    id:               "mem-castillitos-recon-block",
    orgSlug:          "castillitos",
    type:             "recurring_risk",
    title:            "Bloqueos recurrentes en conciliación",
    summary:          "Castillitos presenta bloqueos repetidos en conciliación financiera. Las excepciones críticas se acumulan entre períodos sin resolución completa.",
    relatedModules:   ["finanzas/conciliacion", "finanzas/cierre"],
    relatedAgents:    ["diego"],
    importance:       "high",
    continuityScore:  82,
    createdAt:        "hace 3 sesiones",
    updatedAt:        "sesión anterior",
    lastReferencedAt: "esta sesión",
    tags:             ["conciliacion", "bloqueo", "finanzas"],
  },
  {
    id:               "mem-castillitos-diego-sofi",
    orgSlug:          "castillitos",
    type:             "collaboration_pattern",
    title:            "Coordinación Diego–Sofi ante runtime degradado",
    summary:          "Diego y Sofi coordinan frecuentemente ante degradaciones del runtime SAG. El patrón se repite cuando los conectores presentan inestabilidad.",
    relatedModules:   ["integrations", "finanzas"],
    relatedAgents:    ["diego", "sofi"],
    importance:       "high",
    continuityScore:  75,
    createdAt:        "hace 4 sesiones",
    updatedAt:        "esta sesión",
    lastReferencedAt: "esta sesión",
    tags:             ["colaboracion", "runtime", "integraciones"],
  },
  {
    id:               "mem-castillitos-tenant-priority",
    orgSlug:          "castillitos",
    type:             "tenant_preference",
    title:            "Prioridad: control financiero antes de expansión",
    summary:          "El tenant prioriza consistentemente el control financiero y la liquidez operativa antes de activar iniciativas de expansión comercial.",
    relatedModules:   ["finanzas", "finanzas/tesoreria", "executive"],
    relatedAgents:    ["diego"],
    importance:       "medium",
    continuityScore:  90,
    createdAt:        "hace 6 sesiones",
    updatedAt:        "hace 2 sesiones",
    lastReferencedAt: "esta sesión",
    tags:             ["preferencia", "finanzas", "liquidez"],
  },
  {
    id:               "mem-castillitos-sag-degradation",
    orgSlug:          "castillitos",
    type:             "operational_pattern",
    title:            "Runtime SAG presenta degradaciones frecuentes",
    summary:          "El runtime SAG de Castillitos ha presentado estados degradados o desactualizados en múltiples sesiones. Sofi mantiene monitoreo activo.",
    relatedModules:   ["integrations"],
    relatedAgents:    ["sofi"],
    importance:       "high",
    continuityScore:  68,
    createdAt:        "hace 5 sesiones",
    updatedAt:        "sesión anterior",
    lastReferencedAt: "esta sesión",
    tags:             ["runtime", "sag", "integraciones"],
  },
  {
    id:               "mem-castillitos-cartera-mila",
    orgSlug:          "castillitos",
    type:             "unresolved_issue",
    title:            "Cartera activa sin seguimiento comercial completo",
    summary:          "La cartera de cobros activa requiere seguimiento comercial continuo. Mila ha sido activada múltiples veces sin resolución completa del pipeline.",
    relatedModules:   ["collections", "sales"],
    relatedAgents:    ["mila", "diego"],
    importance:       "medium",
    continuityScore:  60,
    createdAt:        "hace 2 sesiones",
    updatedAt:        "esta sesión",
    lastReferencedAt: "esta sesión",
    tags:             ["cartera", "cobranza", "pipeline"],
  },
];

// ── Pattern detection from live context ───────────────────────────────────────

function detectRuntimePattern(
  ctx: CopilotContextSnapshot,
): StrategicMemoryEntry | null {
  if (ctx.runtimeState !== "DEGRADED" && ctx.runtimeState !== "STALE") return null;
  return {
    id:               `mem-runtime-${ctx.orgSlug}`,
    orgSlug:          ctx.orgSlug,
    type:             "operational_pattern",
    title:            "Runtime en estado no óptimo",
    summary:          ctx.runtimeState === "DEGRADED"
      ? "El runtime presenta estado degradado en esta sesión — patrón que puede indicar inestabilidad recurrente."
      : "Sincronización pendiente — los datos operativos pueden tener retraso.",
    relatedModules:   ["integrations"],
    relatedAgents:    [ctx.activeAgentId],
    importance:       ctx.runtimeState === "DEGRADED" ? "high" : "medium",
    continuityScore:  45,
    createdAt:        "esta sesión",
    updatedAt:        "esta sesión",
    lastReferencedAt: "esta sesión",
    tags:             ["runtime", "sesion-actual"],
  };
}

function detectCollaborationPattern(
  collaborations: AgentCollaboration[],
  orgSlug: string,
): StrategicMemoryEntry | null {
  if (collaborations.length === 0) return null;
  const primary = collaborations[0]!;
  const src = primary.sourceAgentId.charAt(0).toUpperCase() + primary.sourceAgentId.slice(1);
  const tgt = primary.targetAgentId.charAt(0).toUpperCase() + primary.targetAgentId.slice(1);
  return {
    id:               `mem-collab-${primary.sourceAgentId}-${primary.targetAgentId}-${orgSlug}`,
    orgSlug,
    type:             "collaboration_pattern",
    title:            `Coordinación activa ${src}–${tgt}`,
    summary:          primary.contextSummary,
    relatedModules:   [primary.relatedModule],
    relatedAgents:    [primary.sourceAgentId, primary.targetAgentId],
    importance:       primary.priority === "urgent" ? "critical"
                    : primary.priority === "high"   ? "high"
                    : "medium",
    continuityScore:  55,
    createdAt:        "esta sesión",
    updatedAt:        "esta sesión",
    lastReferencedAt: "esta sesión",
    tags:             ["colaboracion", "sesion-actual"],
  };
}

function detectAccountabilityPattern(
  signals: AccountabilitySignal[],
  orgSlug: string,
  agentId: string,
): StrategicMemoryEntry | null {
  const critical = signals.filter(s => s.severity === "critical" || s.severity === "elevated");
  if (critical.length === 0) return null;
  const primary = critical[0]!;
  return {
    id:               `mem-acc-${primary.id}`,
    orgSlug,
    type:             "unresolved_issue",
    title:            primary.title,
    summary:          primary.description,
    relatedModules:   [],
    relatedAgents:    [agentId],
    importance:       primary.severity === "critical" ? "critical" : "high",
    continuityScore:  50,
    createdAt:        "esta sesión",
    updatedAt:        "esta sesión",
    lastReferencedAt: "esta sesión",
    tags:             ["accountability", "sesion-actual"],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Builds the strategic memory for a given org + session context.
 * Returns entries sorted by continuityScore × importance descending.
 */
export function buildStrategicMemory(
  ctx:            CopilotContextSnapshot,
  signals:        AccountabilitySignal[],
  collaborations: AgentCollaboration[],
  _intents:       ExecutiveIntent[],
): StrategicMemoryEntry[] {
  // Start from static org memory
  const orgMemory = CASTILLITOS_MEMORY.filter(m => m.orgSlug === ctx.orgSlug);

  // Add session-derived entries
  const dynamic: StrategicMemoryEntry[] = [];

  const runtimePattern = detectRuntimePattern(ctx);
  if (runtimePattern) dynamic.push(runtimePattern);

  const collabPattern = detectCollaborationPattern(collaborations, ctx.orgSlug);
  if (collabPattern) dynamic.push(collabPattern);

  const accPattern = detectAccountabilityPattern(signals, ctx.orgSlug, ctx.activeAgentId);
  if (accPattern) dynamic.push(accPattern);

  const all = [...orgMemory, ...dynamic];
  return mergeStrategicMemory(all);
}

/**
 * Deduplicates and sorts memory entries by composite priority.
 */
export function mergeStrategicMemory(
  entries: StrategicMemoryEntry[],
): StrategicMemoryEntry[] {
  const seen = new Set<string>();
  const unique: StrategicMemoryEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      unique.push(e);
    }
  }

  const IMPORTANCE_SCORE: Record<MemoryImportance, number> = {
    critical: 40, high: 28, medium: 15, low: 5,
  };

  return unique.sort((a, b) => {
    const aScore = (IMPORTANCE_SCORE[a.importance] ?? 0) + a.continuityScore * 0.5;
    const bScore = (IMPORTANCE_SCORE[b.importance] ?? 0) + b.continuityScore * 0.5;
    return bScore - aScore;
  });
}

/**
 * Scores the overall memory continuity for a session.
 * Higher score = more persistent organizational patterns.
 */
export function scoreMemoryContinuity(entries: StrategicMemoryEntry[]): number {
  if (entries.length === 0) return 0;
  const topEntries = entries.slice(0, 5);
  const avg = topEntries.reduce((sum, e) => sum + e.continuityScore, 0) / topEntries.length;
  return Math.round(avg);
}

/**
 * Returns a 1-line summary of strategic memory state for header display.
 */
export function summarizeStrategicMemory(entries: StrategicMemoryEntry[]): string {
  if (entries.length === 0) return "Sin patrones organizacionales registrados";
  const critical = entries.filter(e => e.importance === "critical").length;
  const high     = entries.filter(e => e.importance === "high").length;
  if (critical > 0)  return `${critical} patrón${critical > 1 ? "es" : ""} crítico${critical > 1 ? "s" : ""} activo${critical > 1 ? "s" : ""}`;
  if (high > 0)      return `${high} patrón${high > 1 ? "es" : ""} de alta importancia`;
  return `${entries.length} entrada${entries.length > 1 ? "s" : ""} de memoria activa${entries.length > 1 ? "s" : ""}`;
}
