/**
 * lib/agent-intelligence/runtime-blocker-engine.ts
 *
 * Agentik Runtime Intelligence — Blocker Detection Engine
 *
 * Detects operational blockers: actions that are stuck, failed, dependent,
 * or generating signals without resulting in approved actions.
 *
 * All deterministic. No LLM. No Mastra.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

import type { ActionEnvelope }      from "@/lib/agent-runtime/action-envelope";
import type { RuntimeMemoryNode }    from "@/lib/agent-memory/runtime-memory-types";
import type { AgentObservation }     from "@/lib/agent-memory/runtime-memory-types";
import type { RuntimeBlocker }       from "./runtime-intelligence-types";
import { blockerId }                 from "./runtime-intelligence-types";

// ── Thresholds ────────────────────────────────────────────────────────────────

const APPROVAL_DELAY_WARN_MINS  = 30;
const APPROVAL_DELAY_CRIT_MINS  = 90;
const EXECUTION_LAG_WARN_MINS   = 15;
const SIGNAL_NO_ACTION_MINS     = 60;
const MODULE_OVERLOAD_THRESHOLD = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David",
  diego_finance:    "Diego",
  luca_marketing:   "Luca",
  mila_collections: "Mila",
  agentik_copilot:  "Agentik",
};
function agentLabel(id: string): string { return AGENT_LABELS[id] ?? id; }

// ── Blocker 1: Approval delayed ───────────────────────────────────────────────

function detectApprovalDelays(envelopes: ActionEnvelope[]): RuntimeBlocker[] {
  return envelopes
    .filter(e => e.agentStatus === "pending_approval")
    .filter(e => minutesSince(e.createdAt) > APPROVAL_DELAY_WARN_MINS)
    .map(e => {
      const mins  = Math.round(minutesSince(e.createdAt));
      const isCrit = mins >= APPROVAL_DELAY_CRIT_MINS;
      return {
        id:                  blockerId("approval_delayed"),
        blockerType:         "approval_delayed" as const,
        severity:            isCrit ? "critical" as const : "high" as const,
        actionId:            e.agentActionId ?? e.actionTaskId,
        moduleId:            e.moduleKey,
        agentId:             String(e.sourceAgentId),
        reason:              `"${e.title}" lleva ${mins} minutos esperando aprobación humana.`,
        suggestedResolution: `Revisar en Approval Center y aprobar o rechazar. Propuesta de ${agentLabel(String(e.sourceAgentId))}.`,
        detectedAt:          new Date().toISOString(),
      };
    });
}

// ── Blocker 2: Approved but not executed ─────────────────────────────────────

function detectApprovedNotExecuted(envelopes: ActionEnvelope[]): RuntimeBlocker[] {
  return envelopes
    .filter(e => e.agentStatus === "approved" && e.approvedAt)
    .filter(e => minutesSince(e.approvedAt!) > EXECUTION_LAG_WARN_MINS)
    .map(e => {
      const mins = Math.round(minutesSince(e.approvedAt!));
      return {
        id:                  blockerId("approved_not_executed"),
        blockerType:         "approved_not_executed" as const,
        severity:            "high" as const,
        actionId:            e.agentActionId ?? e.actionTaskId,
        moduleId:            e.moduleKey,
        agentId:             String(e.sourceAgentId),
        reason:              `"${e.title}" fue aprobada hace ${mins} minutos pero aún no se ejecutó.`,
        suggestedResolution: "Verificar que el execution handler esté registrado y activo para este tipo de acción.",
        detectedAt:          new Date().toISOString(),
      };
    });
}

// ── Blocker 3: Failed with no retry ──────────────────────────────────────────

function detectFailedNoRetry(envelopes: ActionEnvelope[]): RuntimeBlocker[] {
  return envelopes
    .filter(e => e.agentStatus === "failed")
    .map(e => ({
      id:                  blockerId("failed_no_retry"),
      blockerType:         "failed_no_retry" as const,
      severity:            "high" as const,
      actionId:            e.agentActionId ?? e.actionTaskId,
      moduleId:            e.moduleKey,
      agentId:             String(e.sourceAgentId),
      reason:              `"${e.title}" falló durante ejecución y no tiene retry programado.`,
      suggestedResolution: "Revisar el error de ejecución y decidir si re-aprobar o descartar la acción.",
      detectedAt:          new Date().toISOString(),
    }));
}

// ── Blocker 4: Module overloaded ──────────────────────────────────────────────

function detectModuleOverload(envelopes: ActionEnvelope[]): RuntimeBlocker[] {
  const pendingByModule = new Map<string, ActionEnvelope[]>();
  for (const e of envelopes) {
    if (e.agentStatus !== "pending_approval" && e.agentStatus !== "suggested") continue;
    const bucket = pendingByModule.get(e.moduleKey) ?? [];
    bucket.push(e);
    pendingByModule.set(e.moduleKey, bucket);
  }

  const blockers: RuntimeBlocker[] = [];
  for (const [moduleId, actions] of pendingByModule) {
    if (actions.length < MODULE_OVERLOAD_THRESHOLD) continue;
    blockers.push({
      id:                  blockerId("module_overloaded"),
      blockerType:         "module_overloaded" as const,
      severity:            actions.length >= 6 ? "critical" as const : "high" as const,
      actionId:            null,
      moduleId,
      agentId:             null,
      reason:              `${moduleId} tiene ${actions.length} acciones pendientes de aprobación. Capacidad de resolución superada.`,
      suggestedResolution: `Asignar tiempo dedicado para revisar el backlog de ${moduleId} en el Approval Center.`,
      detectedAt:          new Date().toISOString(),
    });
  }
  return blockers;
}

// ── Blocker 5: Agent signals without resulting action ────────────────────────

function detectUnactionedSignals(
  observations: AgentObservation[],
  envelopes:    ActionEnvelope[],
): RuntimeBlocker[] {
  // Find agents that emitted critical/high observations in the last hour
  // but have NO pending or approved actions
  const since = new Date(Date.now() - SIGNAL_NO_ACTION_MINS * 60_000).toISOString();
  const criticalObs = observations.filter(o =>
    (o.severity === "critical" || o.severity === "high") && o.timestamp >= since,
  );

  const signalAgents = new Set(criticalObs.map(o => o.agentId));
  const activeAgents = new Set(
    envelopes
      .filter(e => e.agentStatus === "pending_approval" || e.agentStatus === "approved")
      .map(e => String(e.sourceAgentId)),
  );

  const blockers: RuntimeBlocker[] = [];
  for (const agentId of signalAgents) {
    if (activeAgents.has(String(agentId))) continue; // Has active actions → not blocked
    const agentObs = criticalObs.filter(o => o.agentId === agentId);
    const modules  = [...new Set(agentObs.map(o => o.moduleId))];
    blockers.push({
      id:                  blockerId("agent_signals_unactioned"),
      blockerType:         "agent_signals_unactioned" as const,
      severity:            "medium" as const,
      actionId:            null,
      moduleId:            modules[0] ?? null,
      agentId:             String(agentId),
      reason:              `${agentLabel(String(agentId))} emitió ${agentObs.length} señal${agentObs.length !== 1 ? "es" : ""} crítica${agentObs.length !== 1 ? "s" : ""} en la última hora sin acción resultante.`,
      suggestedResolution: `Revisar las observaciones de ${agentLabel(String(agentId))} y determinar si se necesita una acción aprobada.`,
      detectedAt:          new Date().toISOString(),
    });
  }
  return blockers;
}

// ── Blocker 6: Dependency unresolved (from memory nodes) ─────────────────────

function detectDependencyBlockers(memoryNodes: RuntimeMemoryNode[]): RuntimeBlocker[] {
  // Find action_proposed nodes whose related memory chain includes action_failed or action_rejected
  const actionNodes = memoryNodes.filter(n => n.nodeType === "action_proposed" && n.actionId);
  const failedActionIds = new Set(
    memoryNodes
      .filter(n => n.nodeType === "action_failed" || n.nodeType === "action_rejected")
      .map(n => n.actionId)
      .filter(Boolean),
  );

  const blockers: RuntimeBlocker[] = [];
  for (const node of actionNodes) {
    if (node.actionId && failedActionIds.has(node.actionId)) continue; // It's the failed one itself
    // If this proposed action shares a moduleId with a failed action → dependency risk
    const moduleHasFailed = memoryNodes.some(n =>
      (n.nodeType === "action_failed") &&
      n.moduleId === node.moduleId &&
      n.agentId === node.agentId,
    );
    if (!moduleHasFailed) continue;

    blockers.push({
      id:                  blockerId("dependency_unresolved"),
      blockerType:         "dependency_unresolved" as const,
      severity:            "medium" as const,
      actionId:            node.actionId,
      moduleId:            node.moduleId,
      agentId:             String(node.agentId),
      reason:              `Acción propuesta en ${node.moduleId} podría depender de una acción fallida anterior del mismo agente.`,
      suggestedResolution: `Revisar el historial de ${node.moduleId} para asegurar que la dependencia previa esté resuelta antes de aprobar.`,
      detectedAt:          new Date().toISOString(),
    });
  }
  return blockers;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function detectRuntimeBlockers(
  envelopes:    ActionEnvelope[],
  memoryNodes:  RuntimeMemoryNode[],
  observations: AgentObservation[],
): RuntimeBlocker[] {
  return [
    ...detectApprovalDelays(envelopes),
    ...detectApprovedNotExecuted(envelopes),
    ...detectFailedNoRetry(envelopes),
    ...detectModuleOverload(envelopes),
    ...detectUnactionedSignals(observations, envelopes),
    ...detectDependencyBlockers(memoryNodes),
  ].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
  });
}
