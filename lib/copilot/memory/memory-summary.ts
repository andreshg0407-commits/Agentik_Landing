/**
 * lib/copilot/memory/memory-summary.ts
 *
 * Agentik — Copilot Memory Engine — Memory Summaries
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * Deterministic, rule-based summary builders for memory entries.
 * No AI. No LLM. No external calls. Pure aggregation.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { MemoryRepository }    from "./memory-repository";
import type { MemoryEntry }         from "./memory-types";
import { defaultMemoryRepository }  from "./in-memory-memory-repository";

// ── Summary types ─────────────────────────────────────────────────────────────

export interface MemorySummary {
  orgSlug:     string;
  totalCount:  number;
  summaryText: string;
  entries:     MemoryEntry[];
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEntry(entry: MemoryEntry): string {
  return `• [${entry.importance}] ${entry.title}`;
}

function buildSummaryBlock(
  label:   string,
  entries: MemoryEntry[],
): string {
  if (entries.length === 0) return "";
  const lines = entries.map(formatEntry);
  return `${label}:\n${lines.join("\n")}`;
}

// ── Summary builders ──────────────────────────────────────────────────────────

/**
 * Build a summary of all STRATEGIC memories for a tenant.
 *
 * Examples of what this covers:
 *   - Castillitos usa SAG para facturación [CRITICAL]
 *   - PagosNet está pendiente de integración [HIGH]
 */
export async function buildStrategicSummary(
  orgSlug: string,
  repo:    MemoryRepository = defaultMemoryRepository,
): Promise<MemorySummary> {
  const entries = await repo.searchMemory(orgSlug, {
    type:  "STRATEGIC",
    limit: 20,
  });

  const summaryText = entries.length > 0
    ? buildSummaryBlock("Contexto estratégico", entries)
    : "No hay hechos estratégicos registrados.";

  return {
    orgSlug,
    totalCount:  entries.length,
    summaryText,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a summary of all OPERATIONAL memories for a tenant.
 *
 * Examples:
 *   - Cierre de mayo 2026 en proceso [MEDIUM]
 *   - Conciliación de junio completada [MEDIUM]
 */
export async function buildOperationalSummary(
  orgSlug:   string,
  moduleId?: string,
  repo:      MemoryRepository = defaultMemoryRepository,
): Promise<MemorySummary> {
  const entries = await repo.searchMemory(orgSlug, {
    type:     "OPERATIONAL",
    moduleId: moduleId,
    limit:    20,
  });

  const label = moduleId
    ? `Estado operacional — módulo ${moduleId}`
    : "Estado operacional";

  const summaryText = entries.length > 0
    ? buildSummaryBlock(label, entries)
    : "No hay hechos operacionales registrados.";

  return {
    orgSlug,
    totalCount:  entries.length,
    summaryText,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a summary of all PREFERENCE memories for a tenant.
 *
 * Examples:
 *   - Andrés prefiere agentes especializados [MEDIUM]
 *   - El tenant prefiere resúmenes cortos [LOW]
 */
export async function buildPreferenceSummary(
  orgSlug: string,
  repo:    MemoryRepository = defaultMemoryRepository,
): Promise<MemorySummary> {
  const entries = await repo.searchMemory(orgSlug, {
    type:  "PREFERENCE",
    limit: 20,
  });

  const summaryText = entries.length > 0
    ? buildSummaryBlock("Preferencias del tenant", entries)
    : "No hay preferencias registradas.";

  return {
    orgSlug,
    totalCount:  entries.length,
    summaryText,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a combined full-context summary for a tenant.
 * Used as the primary memory context block for executive queries.
 */
export async function buildFullContextSummary(
  orgSlug: string,
  repo:    MemoryRepository = defaultMemoryRepository,
): Promise<MemorySummary> {
  const [strategic, operational, preference] = await Promise.all([
    repo.searchMemory(orgSlug, { type: "STRATEGIC",   limit: 10 }),
    repo.searchMemory(orgSlug, { type: "OPERATIONAL", limit: 5 }),
    repo.searchMemory(orgSlug, { type: "PREFERENCE",  limit: 5 }),
  ]);

  const blocks: string[] = [];
  const strategicBlock   = buildSummaryBlock("Contexto estratégico", strategic);
  const operationalBlock = buildSummaryBlock("Estado operacional",   operational);
  const preferenceBlock  = buildSummaryBlock("Preferencias",         preference);

  if (strategicBlock)   blocks.push(strategicBlock);
  if (operationalBlock) blocks.push(operationalBlock);
  if (preferenceBlock)  blocks.push(preferenceBlock);

  const allEntries = [...strategic, ...operational, ...preference];
  const summaryText = blocks.length > 0
    ? blocks.join("\n\n")
    : "No hay contexto de memoria registrado para este tenant.";

  return {
    orgSlug,
    totalCount:  allEntries.length,
    summaryText,
    entries:     allEntries,
    generatedAt: new Date().toISOString(),
  };
}
