/**
 * lib/copilot/copilot-response-aggregator.ts
 *
 * Agentik — Copilot Intelligence — Response Aggregator
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Consolidates CopilotAgentResult[] into a single CopilotResponse.
 *
 * Rules:
 *   - Deterministic — no AI, no randomness, no external calls
 *   - Success = at least one agent succeeded
 *   - consolidatedSummary = ordered per-agent summaries, one per line
 *   - participatingAgents = display names of all agents that ran
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type {
  CopilotAgentResult,
  CopilotResponse,
  CopilotExecutionPlan,
  CopilotPlanPriority,
  CopilotPlanningContext,
} from "./copilot-types";

// ── Enrichment (optional) ─────────────────────────────────────────────────────

/**
 * Optional memory-aware planning enrichment to attach to the response.
 * When present, the response carries planning context, warnings, and actions.
 */
export interface CopilotResponseEnrichment {
  warnings?:        string[];
  suggestedActions?: string[];
  planningContext?: CopilotPlanningContext;
  priority?:        CopilotPlanPriority;
}

// ── ID generator ───────────────────────────────────────────────────────────────

let _respCounter = 0;

function generateResponseId(): string {
  _respCounter = (_respCounter + 1) % 1_000_000;
  return `cpr-${Date.now()}-${String(_respCounter).padStart(6, "0")}`;
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Consolidate per-agent execution results into a single CopilotResponse.
 *
 * @param requestId   Original copilot request ID for correlation.
 * @param orgSlug     Tenant org slug.
 * @param plan        The execution plan that was run.
 * @param results     Per-agent execution results.
 * @param startedAt   Wall-clock timestamp (ms) when execution started.
 * @param enrichment  Optional memory-aware planning enrichment to attach.
 */
export function aggregateCopilotResponse(
  requestId:  string,
  orgSlug:    string,
  plan:       CopilotExecutionPlan,
  results:    CopilotAgentResult[],
  startedAt:  number,
  enrichment?: CopilotResponseEnrichment,
): CopilotResponse {
  const durationMs = Date.now() - startedAt;

  // Collect errors from failed agents
  const errors = results
    .filter(r => !r.success && r.error)
    .map(r => `${r.displayName}: ${r.error}`);

  // Overall success: at least one agent succeeded
  const success = results.some(r => r.success);

  // Participating agent display names (in plan order)
  const participatingAgents = results.map(r => r.displayName);

  // Consolidated summary: ordered agent summaries, one per line
  const consolidatedSummary = buildConsolidatedSummary(results, plan);

  return {
    id:                  requestId,
    orgSlug,
    intent:              plan.intent,
    plan,
    agentResults:        results,
    consolidatedSummary,
    participatingAgents,
    success,
    errors,
    createdAt:           new Date().toISOString(),
    durationMs,
    // Memory-aware planning enrichment (undefined when no memory signals)
    planningContext:     enrichment?.planningContext,
    warnings:            enrichment?.warnings,
    suggestedActions:    enrichment?.suggestedActions,
    priority:            enrichment?.priority,
  };
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildConsolidatedSummary(
  results: CopilotAgentResult[],
  plan:    CopilotExecutionPlan,
): string {
  if (results.length === 0) {
    return "No hay agentes disponibles para esta consulta.";
  }

  const lines: string[] = [];

  for (const result of results) {
    if (result.success) {
      lines.push(`${result.displayName}: ${result.summary}`);
    } else {
      lines.push(`${result.displayName}: No disponible — ${result.error ?? "error desconocido"}`);
    }
  }

  // Add intent-level context for multi-domain
  if (plan.intent === "MULTI_DOMAIN" && results.length > 1) {
    const succeeded = results.filter(r => r.success).length;
    lines.push(`\n${succeeded} de ${results.length} agentes respondieron correctamente.`);
  }

  return lines.join("\n");
}
