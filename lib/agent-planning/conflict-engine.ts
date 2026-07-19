/**
 * lib/agent-planning/conflict-engine.ts
 *
 * Agentik Runtime Planning — Conflict Detection Engine
 *
 * Detects operational conflicts between actions, delegations, plans.
 * Never resolves conflicts automatically — only detects and explains.
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

import type { ActionEnvelope }    from "@/lib/agent-runtime/action-envelope";
import type { AgentDelegation }   from "@/lib/agent-orchestration/delegation-types";
import type { RuntimeMemoryNode } from "@/lib/agent-memory/runtime-memory-types";
import type {
  PlanConflict,
  OperationalPlan,
  ConflictType,
  DependencyGraph,
} from "./planning-types";
import { cnfId } from "./planning-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function conflict(
  type:         ConflictType,
  severity:     PlanConflict["severity"],
  description:  string,
  agentIds:     string[],
  stepIds:      string[] = [],
  resolution:   string | null = null,
): PlanConflict {
  return {
    id:               cnfId(),
    conflictType:     type,
    severity,
    description,
    affectedStepIds:  stepIds,
    affectedAgentIds: agentIds,
    resolution,
  };
}

// ── Conflict 1: Cyclic dependencies ──────────────────────────────────────────

export function detectCyclicDependencies(
  graph: DependencyGraph,
): PlanConflict[] {
  return graph.cycles.map(cycle => {
    const nodeLabels = cycle.map(id => {
      const node = graph.nodes.get(id);
      return node?.label ?? id;
    });
    const agents = cycle.map(id => graph.nodes.get(id)?.agentId ?? "").filter(Boolean);
    return conflict(
      "cyclic_dependency",
      "critical",
      `Ciclo detectado en grafo de dependencias: ${nodeLabels.join(" → ")}. Las acciones involucradas no pueden resolverse sin intervención.`,
      [...new Set(agents)],
      cycle,
      "Resolver manualmente: identificar qué acción del ciclo puede completarse primero.",
    );
  });
}

// ── Conflict 2: Conflicting actions (same module, contradictory intent) ───────

export function detectConflictingActions(
  envelopes: ActionEnvelope[],
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];
  const activeByModule = new Map<string, ActionEnvelope[]>();

  for (const e of envelopes) {
    if (!["pending_approval", "approved", "executing"].includes(e.agentStatus)) continue;
    const bucket = activeByModule.get(e.moduleKey) ?? [];
    bucket.push(e);
    activeByModule.set(e.moduleKey, bucket);
  }

  for (const [moduleId, actions] of activeByModule) {
    if (actions.length < 2) continue;

    // Detect: same reference with different actions from different agents
    const byRef = new Map<string, ActionEnvelope[]>();
    for (const a of actions) {
      const ref = String(a.payloadSummary?.reference ?? "");
      if (!ref) continue;
      const bucket = byRef.get(ref) ?? [];
      bucket.push(a);
      byRef.set(ref, bucket);
    }

    for (const [ref, refActions] of byRef) {
      if (refActions.length < 2) continue;
      const agents = [...new Set(refActions.map(a => String(a.sourceAgentId)))];
      if (agents.length < 2) continue; // Same agent proposing twice — not a conflict

      conflicts.push(conflict(
        "conflicting_actions",
        "high",
        `Referencia "${ref}" en módulo ${moduleId} tiene ${refActions.length} acciones activas de agentes distintos (${agents.join(", ")}). Riesgo de duplicación o contradicción.`,
        agents,
        refActions.map(a => a.agentActionId ?? a.actionTaskId ?? a.id),
        "Revisar y conservar solo una de las propuestas activas.",
      ));
    }
  }

  return conflicts;
}

// ── Conflict 3: Stale dependencies ───────────────────────────────────────────

export function detectStaleDependencies(
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];
  const terminalStatuses = new Set(["rejected", "failed", "expired", "dismissed", "canceled"]);

  for (const d of delegations) {
    if (!d.parentActionId) continue;
    if (terminalStatuses.has(d.status)) continue; // Delegation itself is terminal — ok

    // Check if parent action is terminal
    const parentEnvelope = envelopes.find(e =>
      (e.agentActionId ?? e.actionTaskId) === d.parentActionId,
    );
    if (!parentEnvelope) continue;

    if (terminalStatuses.has(parentEnvelope.agentStatus)) {
      conflicts.push(conflict(
        "stale_dependency",
        "medium",
        `Delegación "${d.reason}" referencia la acción "${parentEnvelope.title}" que está en estado terminal (${parentEnvelope.agentStatus}). La delegación debería cancelarse.`,
        [d.sourceAgentId, d.targetAgentId],
        [d.id],
        `Cancelar la delegación ${d.id} ya que su acción padre está ${parentEnvelope.agentStatus}.`,
      ));
    }
  }

  return conflicts;
}

// ── Conflict 4: Missing owner ─────────────────────────────────────────────────

export function detectMissingOwners(envelopes: ActionEnvelope[]): PlanConflict[] {
  const ownerless = envelopes.filter(e =>
    e.agentStatus === "pending_approval" &&
    !e.sourceAgentId &&
    !e.proposedBy,
  );
  if (ownerless.length === 0) return [];

  return [conflict(
    "missing_owner",
    "medium",
    `${ownerless.length} acción${ownerless.length !== 1 ? "es" : ""} pendiente${ownerless.length !== 1 ? "s" : ""} sin propietario identificado (sin agente ni usuario asignado).`,
    [],
    ownerless.map(e => e.agentActionId ?? e.actionTaskId ?? e.id),
    "Asignar un agente o usuario responsable a cada acción sin propietario.",
  )];
}

// ── Conflict 5: Unresolved delegation blocking approved action ────────────────

export function detectUnresolvedDelegationBlockers(
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];

  for (const e of envelopes) {
    if (e.agentStatus !== "approved") continue;
    const actionId = e.agentActionId ?? e.actionTaskId ?? e.id;

    const blockingDels = delegations.filter(d =>
      d.parentActionId === actionId &&
      ["pending_approval", "proposed", "accepted", "in_progress"].includes(d.status),
    );
    if (blockingDels.length === 0) continue;

    const agents = [...new Set(blockingDels.flatMap(d => [d.sourceAgentId, d.targetAgentId]))];
    conflicts.push(conflict(
      "unresolved_delegation",
      "high",
      `La acción "${e.title}" fue aprobada pero tiene ${blockingDels.length} delegación${blockingDels.length !== 1 ? "es" : ""} pendiente${blockingDels.length !== 1 ? "s" : ""} (${blockingDels.map(d => d.reason).join(", ")}). No debe ejecutarse aún.`,
      agents,
      [actionId, ...blockingDels.map(d => d.id)],
      `Resolver las delegaciones pendientes antes de ejecutar "${e.title}".`,
    ));
  }

  return conflicts;
}

// ── Conflict 6: Cross-module conflict ────────────────────────────────────────
// David wants to produce, Diego signals financial constraint

export function detectCrossModuleConflicts(
  envelopes:   ActionEnvelope[],
  memoryNodes: RuntimeMemoryNode[],
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];

  const davidPending = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    e.agentStatus === "pending_approval",
  );
  const diegoCritical = memoryNodes.filter(n =>
    n.agentId === "diego_finance" &&
    n.severity === "critical",
  );

  if (davidPending.length > 0 && diegoCritical.length > 0) {
    conflicts.push(conflict(
      "cross_module_conflict",
      "high",
      `David tiene ${davidPending.length} propuesta${davidPending.length !== 1 ? "s" : ""} de producción pendiente${davidPending.length !== 1 ? "s" : ""} pero Diego registra ${diegoCritical.length} señal${diegoCritical.length !== 1 ? "es" : ""} financiera${diegoCritical.length !== 1 ? "s" : ""} crítica${diegoCritical.length !== 1 ? "s" : ""}. Conflicto comercial/financiero.`,
      ["david_commercial", "diego_finance"],
      davidPending.map(e => e.agentActionId ?? e.actionTaskId ?? e.id),
      "Resolver la situación financiera con Diego antes de aprobar nuevas propuestas de producción.",
    ));
  }

  return conflicts;
}

// ── Conflict 7: Duplicated plans ─────────────────────────────────────────────

export function detectDuplicatedPlans(plans: OperationalPlan[]): PlanConflict[] {
  const byRootAction = new Map<string, OperationalPlan[]>();

  for (const p of plans) {
    if (!p.rootActionId) continue;
    if (["completed", "canceled", "failed"].includes(p.status)) continue;
    const bucket = byRootAction.get(p.rootActionId) ?? [];
    bucket.push(p);
    byRootAction.set(p.rootActionId, bucket);
  }

  const conflicts: PlanConflict[] = [];
  for (const [rootId, dups] of byRootAction) {
    if (dups.length < 2) continue;
    conflicts.push(conflict(
      "duplicated_plan",
      "medium",
      `La acción raíz "${rootId}" tiene ${dups.length} planes activos simultáneos. Solo debe haber uno.`,
      [...new Set(dups.flatMap(p => p.agentsInvolved))],
      dups.map(p => p.id),
      "Cancelar los planes duplicados y conservar el más reciente.",
    ));
  }

  return conflicts;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function detectAllConflicts(
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
  memoryNodes: RuntimeMemoryNode[],
  graph:       DependencyGraph,
  plans:       OperationalPlan[] = [],
): PlanConflict[] {
  return [
    ...detectCyclicDependencies(graph),
    ...detectConflictingActions(envelopes),
    ...detectStaleDependencies(envelopes, delegations),
    ...detectMissingOwners(envelopes),
    ...detectUnresolvedDelegationBlockers(envelopes, delegations),
    ...detectCrossModuleConflicts(envelopes, memoryNodes),
    ...detectDuplicatedPlans(plans),
  ].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });
}
