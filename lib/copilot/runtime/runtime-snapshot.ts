/**
 * lib/copilot/runtime/runtime-snapshot.ts
 *
 * Agentik Copilot Runtime — Runtime Snapshot
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Assembles the complete reasoning state of the Copilot at a point in time.
 * A snapshot captures: context + capability discovery + action recommendations
 * into a single serializable object.
 *
 * Used by:
 *   - CopilotSlot: to render agent UI
 *   - Server actions: to attach context to AI prompts
 *   - Analytics: to log what the agent surfaced and why
 *
 * No DB calls. No I/O. Pure composition.
 */

import type { CopilotRuntimeContext, CopilotContextInput } from "./context-builder";
import { buildCopilotContext, buildNullCopilotContext, isContextReady } from "./context-builder";
import {
  discoverCapabilities,
  type CapabilityDiscoveryResult,
} from "./capability-discovery";
import {
  recommendActions,
  type ActionRecommendationResult,
} from "./action-recommendation";

// ── Snapshot ─────────────────────────────────────────────────────────────────

export interface CopilotRuntimeSnapshot {
  /** ISO timestamp of snapshot creation */
  snapshotId:    string;
  createdAt:     Date;

  /** Navigation context */
  module:        string;
  screen:        string;

  /** Resolved context */
  context:       CopilotRuntimeContext;

  /** Discovered capabilities for this context */
  capabilities:  CapabilityDiscoveryResult;

  /** Recommended actions for this context */
  actions:       ActionRecommendationResult;

  /** High-level readiness assessment */
  readiness:     SnapshotReadiness;

  /** Summary for prompt injection */
  promptSummary: string;
}

export type SnapshotReadiness =
  | "ready"          // Lead agent assigned, capabilities and actions available
  | "partial"        // Context resolved but agent missing or limited
  | "empty"          // No domains resolved for this module
  | "blocked";       // User lacks permissions to act

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildRuntimeSnapshot(
  input: CopilotContextInput,
): CopilotRuntimeSnapshot {
  const context      = buildCopilotContext(input);
  const capabilities = discoverCapabilities(context);
  const actions      = recommendActions(context, capabilities);
  const readiness    = assessReadiness(context, actions);
  const promptSummary = buildPromptSummary(context, capabilities, actions);

  return {
    snapshotId:   generateSnapshotId(),
    createdAt:    context.timestamp,
    module:       context.module,
    screen:       context.screen,
    context,
    capabilities,
    actions,
    readiness,
    promptSummary,
  };
}

export function buildNullSnapshot(): CopilotRuntimeSnapshot {
  const context = buildNullCopilotContext();
  return {
    snapshotId:   generateSnapshotId(),
    createdAt:    new Date(),
    module:       "",
    screen:       "",
    context,
    capabilities: { primary: [], secondary: [], all: [] },
    actions:      { immediate: [], contextual: [], destructive: [], all: [] },
    readiness:    "empty",
    promptSummary: "",
  };
}

// ── Readiness ─────────────────────────────────────────────────────────────────

function assessReadiness(
  ctx:     CopilotRuntimeContext,
  actions: ActionRecommendationResult,
): SnapshotReadiness {
  if (!ctx.isResolved)                              return "empty";
  if (!ctx.user.permissions.canExecuteActions)      return "blocked";
  if (!isContextReady(ctx))                         return "partial";
  if (actions.immediate.length === 0 &&
      actions.contextual.length === 0)              return "partial";
  return "ready";
}

// ── Prompt summary builder ────────────────────────────────────────────────────

/**
 * Builds a compact natural-language summary for LLM prompt injection.
 * Kept intentionally short — prompt context, not documentation.
 */
function buildPromptSummary(
  ctx:          CopilotRuntimeContext,
  capabilities: CapabilityDiscoveryResult,
  actions:      ActionRecommendationResult,
): string {
  if (!ctx.isResolved) return "";

  const agentName   = ctx.leadAgent?.persona.nombre ?? "Agentik";
  const agentRol    = ctx.leadAgent?.persona.rol    ?? "";
  const domainNames = ctx.domainDefinitions.map(d => d.nombre).join(", ");
  const topCaps     = capabilities.primary.slice(0, 3).map(r => r.capability.name).join(", ");
  const topActions  = actions.immediate.slice(0, 3).map(r => r.action.name).join(", ");

  const lines: string[] = [
    `Agente: ${agentName} — ${agentRol}`,
    `Módulo activo: ${ctx.module}${ctx.screen ? ` / ${ctx.screen}` : ""}`,
    `Dominios: ${domainNames || "ninguno"}`,
  ];

  if (topCaps)    lines.push(`Capacidades principales: ${topCaps}`);
  if (topActions) lines.push(`Acciones disponibles: ${topActions}`);

  const supporting = ctx.supportingAgents.map(a => a.persona.nombre).join(", ");
  if (supporting) lines.push(`Agentes de soporte: ${supporting}`);

  return lines.join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Returns true if the snapshot has actionable state.
 */
export function isSnapshotReady(snapshot: CopilotRuntimeSnapshot): boolean {
  return snapshot.readiness === "ready" || snapshot.readiness === "partial";
}

/**
 * Returns a one-line label for the snapshot state — suitable for UI badges.
 */
export function getSnapshotReadinessLabel(snapshot: CopilotRuntimeSnapshot): string {
  const labels: Record<SnapshotReadiness, string> = {
    ready:   "Listo",
    partial: "Parcial",
    empty:   "Sin contexto",
    blocked: "Sin permisos",
  };
  return labels[snapshot.readiness];
}
