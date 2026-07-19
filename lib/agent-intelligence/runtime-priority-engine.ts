/**
 * lib/agent-intelligence/runtime-priority-engine.ts
 *
 * Agentik Runtime Intelligence — Priority Engine
 *
 * Deterministic analysis of ActionEnvelopes + MemoryNodes + Observations.
 * Produces RuntimeInsight[] focused on priority and pressure signals.
 *
 * Thresholds (V1 — no config file yet):
 *   STALE_PENDING_MINS       = 30   min pending before flagged stale
 *   AGENT_OVERLOAD_THRESHOLD = 3    pending_approval for same agent
 *   MODULE_PRESSURE_THRESHOLD= 3    pending actions for same module
 *   REJECTION_CLUSTER_COUNT  = 2    same action type rejected n times
 *   FAILURE_CLUSTER_COUNT    = 2    same module failed n times
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

import type { ActionEnvelope }          from "@/lib/agent-runtime/action-envelope";
import type { RuntimeMemoryNode }        from "@/lib/agent-memory/runtime-memory-types";
import type { AgentObservation }         from "@/lib/agent-memory/runtime-memory-types";
import type { RuntimeInsight }           from "./runtime-intelligence-types";
import { insightId }                     from "./runtime-intelligence-types";

// ── Thresholds ─────────────────────────────────────────────────────────────────

const STALE_PENDING_MINS        = 30;
const AGENT_OVERLOAD_THRESHOLD  = 3;
const MODULE_PRESSURE_THRESHOLD = 3;
const REJECTION_CLUSTER_COUNT   = 2;
const FAILURE_CLUSTER_COUNT     = 2;

// ── Agent display labels ──────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David",
  diego_finance:    "Diego",
  luca_marketing:   "Luca",
  mila_collections: "Mila",
  agentik_copilot:  "Agentik",
};

function agentLabel(id: string): string {
  return AGENT_LABELS[id] ?? id;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function confidence(signals: number, max = 10): number {
  return clamp(signals / max, 0.1, 1.0);
}

// ── Detector 1: Stale pending actions ────────────────────────────────────────

function detectStalePendingActions(
  envelopes: ActionEnvelope[],
  orgId:     string,
): RuntimeInsight[] {
  const stale = envelopes.filter(e =>
    e.agentStatus === "pending_approval" &&
    minutesSince(e.createdAt) > STALE_PENDING_MINS,
  );
  if (stale.length === 0) return [];

  return stale.map(e => ({
    id:                  insightId("stale_pending_action"),
    orgId,
    type:                "stale_pending_action" as const,
    severity:            minutesSince(e.createdAt) > 120 ? "high" : "medium" as const,
    title:               `Propuesta sin resolver — ${Math.round(minutesSince(e.createdAt))}m`,
    summary:             `"${e.title}" de ${agentLabel(String(e.sourceAgentId))} lleva ${Math.round(minutesSince(e.createdAt))} minutos sin aprobación.`,
    source:              "priority_engine" as const,
    relatedAgentIds:     [String(e.sourceAgentId)],
    relatedModuleIds:    [e.moduleKey],
    relatedActionIds:    [e.agentActionId ?? e.actionTaskId ?? e.id],
    recommendedNextStep: `Revisar y aprobar o rechazar la propuesta de ${agentLabel(String(e.sourceAgentId))} en el Approval Center.`,
    confidence:          confidence(minutesSince(e.createdAt), 120),
    createdAt:           new Date().toISOString(),
  }));
}

// ── Detector 2: Agent overload ────────────────────────────────────────────────

function detectAgentOverload(
  envelopes: ActionEnvelope[],
  orgId:     string,
): RuntimeInsight[] {
  const pendingByAgent = new Map<string, ActionEnvelope[]>();
  for (const e of envelopes) {
    if (e.agentStatus !== "pending_approval") continue;
    const aid = String(e.sourceAgentId);
    const bucket = pendingByAgent.get(aid) ?? [];
    bucket.push(e);
    pendingByAgent.set(aid, bucket);
  }

  const insights: RuntimeInsight[] = [];
  for (const [agentId, actions] of pendingByAgent) {
    if (actions.length < AGENT_OVERLOAD_THRESHOLD) continue;
    const modules = [...new Set(actions.map(a => a.moduleKey))];
    insights.push({
      id:                  insightId("agent_overload"),
      orgId,
      type:                "agent_overload",
      severity:            actions.length >= 5 ? "high" : "medium",
      title:               `${agentLabel(agentId)} — ${actions.length} propuestas sin aprobación`,
      summary:             `${agentLabel(agentId)} tiene ${actions.length} acciones pendientes de aprobación en ${modules.join(", ")}. Posible cuello de botella.`,
      source:              "priority_engine",
      relatedAgentIds:     [agentId],
      relatedModuleIds:    modules,
      relatedActionIds:    actions.map(a => a.agentActionId ?? a.actionTaskId ?? a.id),
      recommendedNextStep: `Procesar las ${actions.length} propuestas de ${agentLabel(agentId)} o evaluar si alguna puede ser rechazada.`,
      confidence:          confidence(actions.length, 8),
      createdAt:           new Date().toISOString(),
    });
  }
  return insights;
}

// ── Detector 3: Module pressure ───────────────────────────────────────────────

function detectModulePressure(
  envelopes: ActionEnvelope[],
  orgId:     string,
): RuntimeInsight[] {
  const pendingByModule = new Map<string, ActionEnvelope[]>();
  for (const e of envelopes) {
    if (e.agentStatus !== "pending_approval") continue;
    const bucket = pendingByModule.get(e.moduleKey) ?? [];
    bucket.push(e);
    pendingByModule.set(e.moduleKey, bucket);
  }

  const insights: RuntimeInsight[] = [];
  for (const [moduleId, actions] of pendingByModule) {
    if (actions.length < MODULE_PRESSURE_THRESHOLD) continue;
    const agents = [...new Set(actions.map(a => String(a.sourceAgentId)))];
    insights.push({
      id:                  insightId("approval_bottleneck"),
      orgId,
      type:                "approval_bottleneck",
      severity:            actions.length >= 5 ? "critical" : "high",
      title:               `Módulo bajo presión — ${moduleId}`,
      summary:             `${moduleId} acumula ${actions.length} acciones pendientes de ${agents.map(agentLabel).join(", ")}. El módulo necesita atención.`,
      source:              "priority_engine",
      relatedAgentIds:     agents,
      relatedModuleIds:    [moduleId],
      relatedActionIds:    actions.map(a => a.agentActionId ?? a.actionTaskId ?? a.id),
      recommendedNextStep: `Revisar y resolver las ${actions.length} acciones pendientes en ${moduleId}.`,
      confidence:          confidence(actions.length, 8),
      createdAt:           new Date().toISOString(),
    });
  }
  return insights;
}

// ── Detector 4: Repeated rejections ──────────────────────────────────────────

function detectRepeatedRejections(
  envelopes: ActionEnvelope[],
  orgId:     string,
): RuntimeInsight[] {
  const rejectedByType = new Map<string, ActionEnvelope[]>();
  for (const e of envelopes) {
    if (e.agentStatus !== "rejected") continue;
    const key = `${e.type}:${String(e.sourceAgentId)}`;
    const bucket = rejectedByType.get(key) ?? [];
    bucket.push(e);
    rejectedByType.set(key, bucket);
  }

  const insights: RuntimeInsight[] = [];
  for (const [key, actions] of rejectedByType) {
    if (actions.length < REJECTION_CLUSTER_COUNT) continue;
    const [actionType, agentId] = key.split(":");
    const latest = actions[0]!;
    insights.push({
      id:                  insightId("repeated_rejection"),
      orgId,
      type:                "repeated_rejection",
      severity:            actions.length >= 4 ? "high" : "medium",
      title:               `Rechazos repetidos — ${agentLabel(agentId ?? "")} · ${actionType}`,
      summary:             `${agentLabel(agentId ?? "")} ha tenido ${actions.length} propuestas del tipo "${actionType}" rechazadas. Patrón de fricción detectado.`,
      source:              "priority_engine",
      relatedAgentIds:     [agentId ?? ""],
      relatedModuleIds:    [latest.moduleKey],
      relatedActionIds:    actions.map(a => a.agentActionId ?? a.actionTaskId ?? a.id),
      recommendedNextStep: `Revisar las reglas de ${actionType} con ${agentLabel(agentId ?? "")} para reducir rechazos recurrentes.`,
      confidence:          confidence(actions.length, 6),
      createdAt:           new Date().toISOString(),
    });
  }
  return insights;
}

// ── Detector 5: Failed execution clusters ────────────────────────────────────

function detectFailedExecutionClusters(
  envelopes: ActionEnvelope[],
  orgId:     string,
): RuntimeInsight[] {
  const failedByModule = new Map<string, ActionEnvelope[]>();
  for (const e of envelopes) {
    if (e.agentStatus !== "failed") continue;
    const bucket = failedByModule.get(e.moduleKey) ?? [];
    bucket.push(e);
    failedByModule.set(e.moduleKey, bucket);
  }

  const insights: RuntimeInsight[] = [];
  for (const [moduleId, actions] of failedByModule) {
    if (actions.length < FAILURE_CLUSTER_COUNT) continue;
    const agents = [...new Set(actions.map(a => String(a.sourceAgentId)))];
    insights.push({
      id:                  insightId("failed_execution_cluster"),
      orgId,
      type:                "failed_execution_cluster",
      severity:            actions.length >= 3 ? "critical" : "high",
      title:               `Cluster de fallos — ${moduleId}`,
      summary:             `${moduleId} registra ${actions.length} ejecuciones fallidas. Posible problema de integración o conectividad.`,
      source:              "priority_engine",
      relatedAgentIds:     agents,
      relatedModuleIds:    [moduleId],
      relatedActionIds:    actions.map(a => a.agentActionId ?? a.actionTaskId ?? a.id),
      recommendedNextStep: `Revisar el estado del conector de ${moduleId} y reintentar las ejecuciones fallidas.`,
      confidence:          confidence(actions.length, 5),
      createdAt:           new Date().toISOString(),
    });
  }
  return insights;
}

// ── Detector 6: Unresolved critical actions from memory ──────────────────────

function detectUnresolvedCritical(
  memoryNodes: RuntimeMemoryNode[],
  orgId:       string,
): RuntimeInsight[] {
  const critical = memoryNodes.filter(n =>
    (n.severity === "critical" || n.severity === "high") &&
    (n.nodeType === "action_proposed" || n.nodeType === "action_failed") &&
    minutesSince(n.timestamp) > 15,
  );
  if (critical.length === 0) return [];

  const modules = [...new Set(critical.map(n => n.moduleId))];
  const agents  = [...new Set(critical.map(n => String(n.agentId)))];

  return [{
    id:                  insightId("unresolved_critical_action"),
    orgId,
    type:                "unresolved_critical_action",
    severity:            "critical",
    title:               `${critical.length} señal${critical.length !== 1 ? "es" : ""} crítica${critical.length !== 1 ? "s" : ""} sin resolver`,
    summary:             `El memory graph registra ${critical.length} nodos de severidad crítica/alta sin resolución en ${modules.join(", ")}.`,
    source:              "priority_engine",
    relatedAgentIds:     agents,
    relatedModuleIds:    modules,
    relatedActionIds:    critical.map(n => n.actionId).filter((id): id is string => id !== null),
    recommendedNextStep: `Revisar los nodos críticos del memory graph y tomar acción en ${modules[0] ?? "los módulos afectados"}.`,
    confidence:          confidence(critical.length, 5),
    createdAt:           new Date().toISOString(),
  }];
}

// ── Detector 7: Actions without clear owner ───────────────────────────────────

function detectOwnerlessActions(
  envelopes: ActionEnvelope[],
  orgId:     string,
): RuntimeInsight[] {
  const ownerless = envelopes.filter(e =>
    e.agentStatus === "pending_approval" &&
    !e.proposedBy &&
    !e.sourceAgentId,
  );
  if (ownerless.length === 0) return [];

  return [{
    id:                  insightId("unresolved_critical_action"),
    orgId,
    type:                "unresolved_critical_action",
    severity:            "medium",
    title:               `${ownerless.length} acción${ownerless.length !== 1 ? "es" : ""} sin propietario`,
    summary:             `${ownerless.length} acción${ownerless.length !== 1 ? "es" : ""} pendiente${ownerless.length !== 1 ? "s" : ""} sin agente o usuario propietario identificado.`,
    source:              "priority_engine",
    relatedAgentIds:     [],
    relatedModuleIds:    [...new Set(ownerless.map(e => e.moduleKey))],
    relatedActionIds:    ownerless.map(e => e.agentActionId ?? e.actionTaskId ?? e.id),
    recommendedNextStep: "Asignar propietario o rechazar las acciones sin identificación de agente.",
    confidence:          0.6,
    createdAt:           new Date().toISOString(),
  }];
}

// ── Public entry point ────────────────────────────────────────────────────────

export function buildRuntimePriorities(
  envelopes:    ActionEnvelope[],
  memoryNodes:  RuntimeMemoryNode[],
  observations: AgentObservation[],
  orgId:        string,
): RuntimeInsight[] {
  void observations; // Reserved for Phase 2 observation-driven priority signals

  return [
    ...detectStalePendingActions(envelopes, orgId),
    ...detectAgentOverload(envelopes, orgId),
    ...detectModulePressure(envelopes, orgId),
    ...detectRepeatedRejections(envelopes, orgId),
    ...detectFailedExecutionClusters(envelopes, orgId),
    ...detectUnresolvedCritical(memoryNodes, orgId),
    ...detectOwnerlessActions(envelopes, orgId),
  ].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
  });
}
