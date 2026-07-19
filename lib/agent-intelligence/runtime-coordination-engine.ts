/**
 * lib/agent-intelligence/runtime-coordination-engine.ts
 *
 * Agentik Runtime Intelligence — Coordination Engine
 *
 * Suggests agent-to-agent coordination based on pending actions,
 * module overlaps, and operational domain rules.
 *
 * This engine does NOT execute delegations.
 * It only recommends. Humans remain in the loop for approval.
 *
 * Coordination rules (V1):
 *   David (commercial) → Diego (finance): production proposals affect cash flow
 *   David (commercial) → Luca (marketing): low stock should trigger campaign pause
 *   Luca (marketing) → David (commercial): campaign activity signals inventory demand
 *   Mila (collections) → Diego (finance): collection outcomes affect liquidity
 *   Diego (finance) → David (commercial): budget constraints affect production capacity
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

import type { ActionEnvelope }            from "@/lib/agent-runtime/action-envelope";
import type { RuntimeMemoryNode }          from "@/lib/agent-memory/runtime-memory-types";
import type { AgentObservation }           from "@/lib/agent-memory/runtime-memory-types";
import type { CoordinationRecommendation } from "./runtime-intelligence-types";
import { coordId }                         from "./runtime-intelligence-types";

// ── Agent domain map ──────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David",
  diego_finance:    "Diego",
  luca_marketing:   "Luca",
  mila_collections: "Mila",
  agentik_copilot:  "Agentik",
};
function label(id: string): string { return AGENT_LABELS[id] ?? id; }

// ── Coordination rule 1: David → Diego ───────────────────────────────────────
// David proposes production → Diego should evaluate cash flow impact

function coordinateDavidDiego(
  envelopes: ActionEnvelope[],
): CoordinationRecommendation[] {
  const davidPending = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    e.agentStatus === "pending_approval",
  );
  if (davidPending.length === 0) return [];

  const totalQty = davidPending.reduce((sum, e) => {
    const qty = typeof e.payloadSummary?.qty === "number" ? e.payloadSummary.qty : 0;
    return sum + qty;
  }, 0);

  return [{
    id:                    coordId("david_commercial", "diego_finance"),
    sourceAgentId:         "david_commercial",
    targetAgentId:         "diego_finance",
    reason:                `${label("david_commercial")} tiene ${davidPending.length} propuesta${davidPending.length !== 1 ? "s" : ""} de producción pendiente${davidPending.length !== 1 ? "s" : ""}${totalQty > 0 ? ` (${totalQty} unidades totales)` : ""}. ${label("diego_finance")} debería evaluar el impacto en flujo de caja.`,
    sourceActionId:        davidPending[0]!.agentActionId ?? davidPending[0]!.actionTaskId,
    recommendedAction:     `Revisar el impacto de las ${davidPending.length} propuesta${davidPending.length !== 1 ? "s" : ""} de producción sobre la liquidez disponible antes de aprobar.`,
    priority:              davidPending.length >= 3 ? "high" : "medium",
    requiresHumanApproval: true,
  }];
}

// ── Coordination rule 2: David → Luca ────────────────────────────────────────
// Pending production proposals may indicate low inventory → Luca should evaluate campaign impact

function coordinateDavidLuca(
  envelopes: ActionEnvelope[],
  memoryNodes: RuntimeMemoryNode[],
): CoordinationRecommendation[] {
  const davidPending = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    e.agentStatus === "pending_approval",
  );

  // Only signal to Luca if there are failed or repeated proposals (stock risk signals)
  const davidFailed = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    (e.agentStatus === "failed" || e.agentStatus === "rejected"),
  );

  const criticalMemorySignals = memoryNodes.filter(n =>
    n.moduleId.startsWith("comercial") &&
    (n.severity === "critical" || n.severity === "high") &&
    n.agentId === "david_commercial",
  );

  if (davidPending.length === 0 && davidFailed.length < 2 && criticalMemorySignals.length === 0) {
    return [];
  }

  const hasStockRisk = davidFailed.length >= 2 || criticalMemorySignals.length > 0;

  return [{
    id:                    coordId("david_commercial", "luca_marketing"),
    sourceAgentId:         "david_commercial",
    targetAgentId:         "luca_marketing",
    reason:                hasStockRisk
      ? `${label("david_commercial")} registra señales de riesgo de inventario. ${label("luca_marketing")} debería evaluar pausar campañas activas de los productos afectados.`
      : `${label("david_commercial")} tiene ${davidPending.length} propuesta${davidPending.length !== 1 ? "s" : ""} de producción. ${label("luca_marketing")} debe verificar cobertura antes de activar campañas.`,
    sourceActionId:        davidPending[0]?.agentActionId ?? davidPending[0]?.actionTaskId ?? null,
    recommendedAction:     hasStockRisk
      ? "Pausar campañas de productos con riesgo de desabastecimiento hasta confirmar cobertura de inventario."
      : "Verificar que la cobertura de inventario es suficiente antes de escalar campañas de demanda.",
    priority:              hasStockRisk ? "high" : "medium",
    requiresHumanApproval: true,
  }];
}

// ── Coordination rule 3: Luca → David ────────────────────────────────────────
// Luca has active campaigns → David should monitor inventory demand signals

function coordinateLucaDavid(envelopes: ActionEnvelope[]): CoordinationRecommendation[] {
  const lucaActive = envelopes.filter(e =>
    String(e.sourceAgentId) === "luca_marketing" &&
    (e.agentStatus === "approved" || e.agentStatus === "executing"),
  );
  if (lucaActive.length === 0) return [];

  return [{
    id:                    coordId("luca_marketing", "david_commercial"),
    sourceAgentId:         "luca_marketing",
    targetAgentId:         "david_commercial",
    reason:                `${label("luca_marketing")} tiene ${lucaActive.length} campaña${lucaActive.length !== 1 ? "s" : ""} activa${lucaActive.length !== 1 ? "s" : ""}. El incremento de demanda generado debe ser anticipado por ${label("david_commercial")}.`,
    sourceActionId:        lucaActive[0]!.agentActionId ?? lucaActive[0]!.actionTaskId,
    recommendedAction:     "Revisar stock de productos en campaña y generar propuesta de cobertura si el nivel es insuficiente.",
    priority:              "medium",
    requiresHumanApproval: false,
  }];
}

// ── Coordination rule 4: Mila → Diego ────────────────────────────────────────
// Mila collection outcomes affect liquidity → Diego should monitor

function coordinateMilaDiego(envelopes: ActionEnvelope[]): CoordinationRecommendation[] {
  const milaActions = envelopes.filter(e =>
    String(e.sourceAgentId) === "mila_collections" &&
    (e.agentStatus === "pending_approval" || e.agentStatus === "failed"),
  );
  if (milaActions.length === 0) return [];

  const failedCount = milaActions.filter(e => e.agentStatus === "failed").length;

  return [{
    id:                    coordId("mila_collections", "diego_finance"),
    sourceAgentId:         "mila_collections",
    targetAgentId:         "diego_finance",
    reason:                failedCount > 0
      ? `${label("mila_collections")} tiene ${failedCount} gestión${failedCount !== 1 ? "es" : ""} de cartera fallida${failedCount !== 1 ? "s" : ""}. Impacto directo en liquidez proyectada.`
      : `${label("mila_collections")} tiene ${milaActions.length} gestión${milaActions.length !== 1 ? "es" : ""} pendiente${milaActions.length !== 1 ? "s" : ""} con impacto potencial en flujo de caja.`,
    sourceActionId:        milaActions[0]!.agentActionId ?? milaActions[0]!.actionTaskId,
    recommendedAction:     "Actualizar el modelo de liquidez con los resultados reales de cartera de Mila.",
    priority:              failedCount > 0 ? "high" : "medium",
    requiresHumanApproval: false,
  }];
}

// ── Coordination rule 5: Diego → David ────────────────────────────────────────
// Budget constraints detected by Diego → David should adjust production scope

function coordinateDiegoDavid(
  memoryNodes: RuntimeMemoryNode[],
): CoordinationRecommendation[] {
  const diegoCritical = memoryNodes.filter(n =>
    n.agentId === "diego_finance" &&
    (n.severity === "critical" || n.severity === "high") &&
    n.moduleId.startsWith("finanzas"),
  );
  if (diegoCritical.length === 0) return [];

  return [{
    id:                    coordId("diego_finance", "david_commercial"),
    sourceAgentId:         "diego_finance",
    targetAgentId:         "david_commercial",
    reason:                `${label("diego_finance")} registra ${diegoCritical.length} señal${diegoCritical.length !== 1 ? "es" : ""} financiera${diegoCritical.length !== 1 ? "s" : ""} de alta severidad. ${label("david_commercial")} debe considerar restricciones presupuestarias al proponer producción.`,
    sourceActionId:        null,
    recommendedAction:     "Revisar el techo presupuestario actual antes de enviar nuevas propuestas de producción.",
    priority:              "high",
    requiresHumanApproval: true,
  }];
}

// ── Coordination rule 6: Multi-agent same module ─────────────────────────────
// Multiple agents proposing in same module → explicit coordination needed

function coordinateMultiAgentSameModule(
  envelopes: ActionEnvelope[],
): CoordinationRecommendation[] {
  const pendingByModule = new Map<string, ActionEnvelope[]>();
  for (const e of envelopes) {
    if (e.agentStatus !== "pending_approval") continue;
    const bucket = pendingByModule.get(e.moduleKey) ?? [];
    bucket.push(e);
    pendingByModule.set(e.moduleKey, bucket);
  }

  const recs: CoordinationRecommendation[] = [];
  for (const [moduleId, actions] of pendingByModule) {
    const agents = [...new Set(actions.map(a => String(a.sourceAgentId)))];
    if (agents.length < 2) continue;

    recs.push({
      id:                    coordId(agents[0]!, agents[1]!),
      sourceAgentId:         agents[0]!,
      targetAgentId:         agents[1]!,
      reason:                `${agents.map(label).join(" y ")} tienen propuestas simultáneas en ${moduleId}. Se requiere coordinación para evitar conflictos.`,
      sourceActionId:        actions[0]?.agentActionId ?? actions[0]?.actionTaskId ?? null,
      recommendedAction:     `Revisar las propuestas de ${agents.map(label).join(" y ")} en ${moduleId} de forma conjunta antes de aprobar cualquiera de ellas.`,
      priority:              "high",
      requiresHumanApproval: true,
    });
  }
  return recs;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function buildCoordinationRecommendations(
  envelopes:    ActionEnvelope[],
  memoryNodes:  RuntimeMemoryNode[],
  observations: AgentObservation[],
): CoordinationRecommendation[] {
  void observations; // Reserved for V2 observation-driven coordination

  return [
    ...coordinateDavidDiego(envelopes),
    ...coordinateDavidLuca(envelopes, memoryNodes),
    ...coordinateLucaDavid(envelopes),
    ...coordinateMilaDiego(envelopes),
    ...coordinateDiegoDavid(memoryNodes),
    ...coordinateMultiAgentSameModule(envelopes),
  ];
}
