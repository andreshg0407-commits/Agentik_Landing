/**
 * lib/agent-runtime/execution-graph/execution-graph-explainer.ts
 *
 * Agentik Execution Graph — Deterministic Explainer
 *
 * Produces human-readable operational explanations from the graph structure.
 * NO LLM. NO external calls.
 * All explanations are fully deterministic from graph data.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import type { ExecutionGraph, ExecutionGraphNode } from "./execution-graph-types";
import {
  getNodeByRef,
  getExecutionChain,
  getDelegationChain,
  getPlanChain,
  getFailedChain,
  getBlockedChain,
  getRootCauses,
  getParents,
  getChildren,
} from "./execution-graph-query";

// ── Explanation types ─────────────────────────────────────────────────────────

export interface GraphExplanation {
  title:       string;
  summary:     string;
  steps:       string[];
  agents:      string[];
  status:      "ok" | "blocked" | "failed" | "partial" | "unknown";
  canRetry:    boolean;
  canCancel:   boolean;
  awaitingHuman: boolean;
}

// ── Main explainers ───────────────────────────────────────────────────────────

/**
 * Explains the full lifecycle of an execution chain for a given action.
 */
export function explainExecutionChain(
  graph:    ExecutionGraph,
  actionId: string,
): GraphExplanation {
  const { action, sessions, attempts } = getExecutionChain(graph, actionId);

  if (!action) {
    return unknown(`Acción "${actionId}" no encontrada en el grafo.`);
  }

  const steps: string[] = [];
  steps.push(`Acción "${action.label}" propuesta por ${agentLabel(action.agentId)} (estado: ${action.status}).`);

  for (const sess of sessions) {
    steps.push(`Ejecución ${sess.refId}: ${sess.status} · intento ${sess.metadata["attempt"] ?? 0}/${sess.metadata["maxAttempts"] ?? 3} · ${durStr(sess.metadata["durationMs"] as number | null)}`);
    const sessAttempts = attempts.filter(a => a.metadata["sessionId"] === sess.refId);
    for (const att of sessAttempts) {
      steps.push(`  Intento #${att.metadata["attemptNumber"]}: ${att.status}${att.metadata["error"] ? ` — ${att.metadata["error"]}` : ""}`);
    }
  }

  const lastSess = sessions.at(-1);
  const status = deriveStatus(action, lastSess ?? null);
  const canRetry = !!lastSess && (lastSess.status === "failed" || lastSess.status === "timed_out");
  const canCancel = !!lastSess && ["queued", "leasing", "running"].includes(lastSess.status);

  return {
    title:         `Cadena de ejecución: ${action.label}`,
    summary:       buildSummary(action, sessions.length, attempts.length),
    steps,
    agents:        uniqueAgents([action, ...sessions]),
    status,
    canRetry,
    canCancel,
    awaitingHuman: action.status === "pending_approval",
  };
}

/**
 * Explains why an execution chain failed and what failed first.
 */
export function explainFailureChain(
  graph:    ExecutionGraph,
  actionId: string,
): GraphExplanation {
  const action  = getNodeByRef(graph, actionId, "action");
  const failed  = getFailedChain(graph, actionId);

  if (!action) return unknown(`Acción "${actionId}" no encontrada.`);
  if (failed.length === 0) {
    return {
      title:         `Sin fallas en: ${action.label}`,
      summary:       "No se detectaron ejecuciones o intentos fallidos para esta acción.",
      steps:         [],
      agents:        [agentLabel(action.agentId)],
      status:        "ok",
      canRetry:      false,
      canCancel:     false,
      awaitingHuman: false,
    };
  }

  const steps: string[] = [];
  for (const node of failed) {
    const err = node.metadata["error"] as string | undefined;
    if (node.nodeType === "execution_session") {
      steps.push(`Ejecución ${node.refId} falló (${node.status})${err ? `: ${err}` : ""}.`);
    } else {
      steps.push(`  Intento #${node.metadata["attemptNumber"]} falló${err ? `: ${err}` : ""}.`);
    }
  }

  return {
    title:         `Cadena de falla: ${action.label}`,
    summary:       `${failed.length} entidad(es) fallaron en la cadena de ejecución.`,
    steps,
    agents:        uniqueAgents([action, ...failed]),
    status:        "failed",
    canRetry:      failed.some(n => n.nodeType === "execution_session" && n.status === "failed"),
    canCancel:     false,
    awaitingHuman: false,
  };
}

/**
 * Explains what is blocking an action from proceeding.
 */
export function explainBlockedChain(
  graph:    ExecutionGraph,
  actionId: string,
): GraphExplanation {
  const action  = getNodeByRef(graph, actionId, "action");
  const blocked = getBlockedChain(graph, actionId);

  if (!action) return unknown(`Acción "${actionId}" no encontrada.`);

  if (blocked.length === 0) {
    return {
      title:         `Sin bloqueos: ${action.label}`,
      summary:       "No hay bloqueos activos detectados para esta acción.",
      steps:         [],
      agents:        [agentLabel(action.agentId)],
      status:        "ok",
      canRetry:      false,
      canCancel:     false,
      awaitingHuman: action.status === "pending_approval",
    };
  }

  const steps: string[] = [];
  for (const node of blocked) {
    if (node.nodeType === "delegation") {
      const target = node.metadata["targetAgentId"] as string | undefined;
      steps.push(
        `Esta acción está bloqueada porque depende de una delegación ${node.metadata["reason"] ?? ""} ` +
        `hacia ${agentLabel(target ?? null)} que aún no fue completada (estado: ${node.status}).`,
      );
    } else if (node.nodeType === "execution_session") {
      steps.push(`Ejecución ${node.refId} está en estado "${node.status}".`);
    } else {
      steps.push(`${node.nodeType} "${node.label}" está bloqueado (${node.status}).`);
    }
  }

  return {
    title:         `Bloqueos en: ${action.label}`,
    summary:       `${blocked.length} bloqueo(s) impiden el progreso de esta acción.`,
    steps,
    agents:        uniqueAgents([action, ...blocked]),
    status:        "blocked",
    canRetry:      false,
    canCancel:     false,
    awaitingHuman: blocked.some(n => n.status === "pending_approval"),
  };
}

/**
 * Explains the delegation chain triggered by an action.
 */
export function explainDelegationChain(
  graph:    ExecutionGraph,
  actionId: string,
): GraphExplanation {
  const action      = getNodeByRef(graph, actionId, "action");
  const delegations = getDelegationChain(graph, actionId);

  if (!action) return unknown(`Acción "${actionId}" no encontrada.`);
  if (delegations.length === 0) {
    return {
      title:         `Sin delegaciones: ${action.label}`,
      summary:       "Esta acción no generó delegaciones.",
      steps:         [],
      agents:        [agentLabel(action.agentId)],
      status:        "ok",
      canRetry:      false,
      canCancel:     false,
      awaitingHuman: false,
    };
  }

  const steps = delegations.map(d => {
    const target = d.metadata["targetAgentId"] as string | undefined;
    return `${agentLabel(d.agentId)} delegó "${d.metadata["reason"] ?? d.label}" a ${agentLabel(target ?? null)} — estado: ${d.status}.`;
  });

  const blockedDels = delegations.filter(d => d.status === "blocked" || d.status === "pending_approval");
  const status: GraphExplanation["status"] = blockedDels.length > 0 ? "blocked" : "ok";

  return {
    title:         `Cadena de delegación: ${action.label}`,
    summary:       `${delegations.length} delegación(es) originadas por esta acción.`,
    steps,
    agents:        uniqueAgents([action, ...delegations]),
    status,
    canRetry:      false,
    canCancel:     false,
    awaitingHuman: blockedDels.some(d => d.status === "pending_approval"),
  };
}

/**
 * Explains the plan lineage for an action.
 */
export function explainPlanLineage(
  graph:    ExecutionGraph,
  actionId: string,
): GraphExplanation {
  const action = getNodeByRef(graph, actionId, "action");
  const plans  = getPlanChain(graph, actionId);

  if (!action) return unknown(`Acción "${actionId}" no encontrada.`);
  if (plans.length === 0) {
    return {
      title:         `Sin plan: ${action.label}`,
      summary:       "Esta acción no está asociada a ningún plan operacional.",
      steps:         [],
      agents:        [agentLabel(action.agentId)],
      status:        "ok",
      canRetry:      false,
      canCancel:     false,
      awaitingHuman: false,
    };
  }

  const steps = plans.map(p =>
    `Plan "${p.label}": ${p.status} · ${p.metadata["stepCount"] ?? 0} pasos · prioridad ${p.metadata["priority"] ?? "—"}`,
  );

  return {
    title:         `Linaje de plan: ${action.label}`,
    summary:       `${plans.length} plan(es) operacional(es) asociados a esta acción.`,
    steps,
    agents:        uniqueAgents([action, ...plans]),
    status:        "ok",
    canRetry:      false,
    canCancel:     false,
    awaitingHuman: false,
  };
}

/**
 * Explains the root causes of all failed/blocked chains in the graph.
 */
export function explainRootCause(graph: ExecutionGraph): GraphExplanation {
  const roots = getRootCauses(graph);

  if (roots.length === 0) {
    return {
      title:         "Sin causas raíz detectadas",
      summary:       "No hay nodos raíz en estado fallido o bloqueado.",
      steps:         [],
      agents:        [],
      status:        "ok",
      canRetry:      false,
      canCancel:     false,
      awaitingHuman: false,
    };
  }

  const steps = roots.map(r => {
    const descendants = getChildren(graph, r.id);
    return `"${r.label}" (${r.nodeType}) → ${descendants.length} nodo(s) afectado(s) · estado: ${r.status}`;
  });

  return {
    title:         `Causas raíz (${roots.length})`,
    summary:       `${roots.length} causa(s) raíz detectada(s) en estado fallido o bloqueado.`,
    steps,
    agents:        uniqueAgents(roots),
    status:        "failed",
    canRetry:      roots.some(r => r.status === "failed" || r.status === "timed_out"),
    canCancel:     false,
    awaitingHuman: roots.some(r => r.status === "pending_approval"),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David",
  diego_finance:    "Diego",
  luca_marketing:   "Luca",
  mila_collections: "Mila",
  agentik_copilot:  "Agentik",
  system:           "Sistema",
};

function agentLabel(agentId: string | null | undefined): string {
  if (!agentId) return "agente desconocido";
  return AGENT_LABELS[agentId] ?? agentId;
}

function uniqueAgents(nodes: ExecutionGraphNode[]): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    if (n.agentId) set.add(agentLabel(n.agentId));
  }
  return [...set];
}

function durStr(ms: number | null | undefined): string {
  if (ms == null) return "duración desconocida";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function deriveStatus(
  action:  ExecutionGraphNode,
  session: ExecutionGraphNode | null,
): GraphExplanation["status"] {
  if (!session) {
    if (action.status === "pending_approval") return "blocked";
    if (action.status === "failed")           return "failed";
    return "unknown";
  }
  if (session.status === "succeeded") return "ok";
  if (session.status === "failed" || session.status === "timed_out") return "failed";
  if (session.status === "running" || session.status === "validating") return "partial";
  return "unknown";
}

function buildSummary(
  action:       ExecutionGraphNode,
  sessionCount: number,
  attemptCount: number,
): string {
  return `Acción "${action.label}" · ${sessionCount} sesión(es) de ejecución · ${attemptCount} intento(s) · estado: ${action.status}`;
}

function unknown(message: string): GraphExplanation {
  return {
    title:         "Estado desconocido",
    summary:       message,
    steps:         [message],
    agents:        [],
    status:        "unknown",
    canRetry:      false,
    canCancel:     false,
    awaitingHuman: false,
  };
}
