/**
 * lib/copilot/handoff-memory.ts
 *
 * Agentik Copilot — Agent Handoff Memory V1
 *
 * Phase 3 of Sprint AGENTIK-COPILOT-MULTI-AGENT-DELEGATION-01
 *
 * Simulates persistent memory of past agent handoffs and collaboration requests.
 * Enables Copilot to say "Diego ya solicitó apoyo técnico a Sofi"
 * without a real database.
 *
 * V1: deterministic per org + source + target pair.
 * V2: Prisma.CopilotHandoffLog with real resolution history.
 */

import type { AgentCollaboration } from "./agent-collaboration";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentHandoffMemory {
  handoffId:       string;
  sourceAgentId:   string;
  targetAgentId:   string;
  status:          "pending" | "active" | "resolved" | "stale";
  continuityMessage: string;   // Agent-authored phrase about the handoff state
  lastSeenAt:      string;     // Relative time — serializable
  attempts:        number;     // How many sessions this has been active
}

// ── Continuity phrase tables ───────────────────────────────────────────────────

const HANDOFF_PHRASES: Record<string, Record<string, {
  pending:  string[];
  active:   string[];
  stale:    string[];
}>> = {
  diego: {
    sofi: {
      pending: [
        "Diego ya solicitó apoyo técnico a Sofi.",
        "La revisión de integraciones está pendiente de respuesta de Sofi.",
        "Diego espera confirmación de Sofi sobre el estado del runtime.",
      ],
      active: [
        "Sofi está revisando las integraciones a pedido de Diego.",
        "Diego y Sofi coordinan la estabilidad técnica del sistema.",
        "El diagnóstico técnico de Sofi está en curso.",
      ],
      stale: [
        "Diego solicitó apoyo técnico a Sofi — sin respuesta registrada.",
        "La colaboración con Sofi permanece abierta desde sesión anterior.",
        "Diego mantiene el pedido técnico sin resolución.",
      ],
    },
    mila: {
      pending: [
        "Diego solicitó a Mila activar seguimiento de cobranza.",
        "Mila mantiene seguimiento comercial pendiente.",
        "Diego espera que Mila active el pipeline de cobros.",
      ],
      active: [
        "Mila está ejecutando seguimiento comercial coordinado con Diego.",
        "El plan de cobranza está activo bajo supervisión de Diego y Mila.",
        "Mila recupera conversaciones mientras Diego monitorea liquidez.",
      ],
      stale: [
        "Diego solicitó cobranza a Mila — seguimiento sin confirmar.",
        "La colaboración de cobros con Mila permanece abierta.",
        "Diego mantiene el pedido comercial a Mila sin resolución.",
      ],
    },
  },
  luca: {
    mila: {
      pending: [
        "Luca solicitó a Mila recuperar conversaciones comerciales.",
        "Mila tiene pendiente la activación de seguimiento de leads de Luca.",
        "Luca espera que Mila priorice las oportunidades del pipeline.",
      ],
      active: [
        "Mila está recuperando leads a pedido de Luca.",
        "Luca y Mila coordinan la recuperación del ritmo comercial.",
        "El seguimiento de conversaciones está activo entre Luca y Mila.",
      ],
      stale: [
        "Luca solicitó apoyo comercial a Mila — sin respuesta registrada.",
        "La colaboración comercial con Mila permanece abierta.",
        "Luca mantiene el pedido a Mila sin confirmación.",
      ],
    },
    diego: {
      pending: [
        "Luca espera validación de conversión de Diego.",
        "Diego tiene pendiente revisar el impacto financiero de la campaña.",
        "Luca solicitó a Diego validar el costo antes de escalar la inversión.",
      ],
      active: [
        "Diego está validando el impacto financiero de la campaña de Luca.",
        "Luca y Diego coordinan la viabilidad del plan comercial.",
        "La revisión de costo-beneficio está activa entre Diego y Luca.",
      ],
      stale: [
        "Luca solicitó validación financiera a Diego — sin respuesta.",
        "La consulta comercial con Diego permanece sin resolver.",
        "Luca mantiene la solicitud a Diego abierta.",
      ],
    },
  },
};

function pickPhrase(phrases: string[], seed: number): string {
  return phrases[seed % phrases.length] ?? phrases[0] ?? "";
}

function buildHandoffContinuityMessage(
  source:   string,
  target:   string,
  status:   AgentHandoffMemory["status"],
  attempts: number,
): string {
  const sourceMap = HANDOFF_PHRASES[source];
  if (!sourceMap) return `${source} coordina con ${target}.`;
  const pairMap = sourceMap[target];
  if (!pairMap) return `${source} solicitó apoyo a ${target}.`;

  const phraseKey: "pending" | "active" | "stale" =
    status === "active"  ? "active"  :
    status === "stale"   ? "stale"   :
    "pending";

  return pickPhrase(pairMap[phraseKey], attempts);
}

// ── Mock registry ───────────────────────────────────────────────────────────────
// Keyed by orgSlug → "sourceId:targetId"

const MOCK_HANDOFFS: Record<string, Record<string, Omit<AgentHandoffMemory, "continuityMessage">>> = {
  castillitos: {
    "diego:sofi": {
      handoffId:     "hoff-diego-sofi-castillitos",
      sourceAgentId: "diego",
      targetAgentId: "sofi",
      status:        "pending",
      lastSeenAt:    "sesión anterior",
      attempts:      2,
    },
    "diego:mila": {
      handoffId:     "hoff-diego-mila-castillitos",
      sourceAgentId: "diego",
      targetAgentId: "mila",
      status:        "pending",
      lastSeenAt:    "esta sesión",
      attempts:      1,
    },
    "luca:mila": {
      handoffId:     "hoff-luca-mila-castillitos",
      sourceAgentId: "luca",
      targetAgentId: "mila",
      status:        "stale",
      lastSeenAt:    "hace 2 sesiones",
      attempts:      3,
    },
  },
};

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Returns handoff memory for a given org + source + target pair.
 * V1: deterministic mock.
 */
export function getHandoffMemory(
  orgSlug:       string,
  sourceAgentId: string,
  targetAgentId: string,
): AgentHandoffMemory | null {
  const orgHandoffs = MOCK_HANDOFFS[orgSlug];
  if (!orgHandoffs) return null;

  const key     = `${sourceAgentId}:${targetAgentId}`;
  const partial = orgHandoffs[key];
  if (!partial) return null;

  const continuityMessage = buildHandoffContinuityMessage(
    sourceAgentId,
    targetAgentId,
    partial.status,
    partial.attempts,
  );

  return { ...partial, continuityMessage };
}

/**
 * Merges handoff memory into an existing collaboration object.
 * Returns the collaboration augmented with memory state.
 */
export function mergeHandoffMemory(
  collab: AgentCollaboration,
  memory: AgentHandoffMemory | null,
): AgentCollaboration & { memoryPhrase?: string; memoryAttempts?: number } {
  if (!memory) return collab;

  return {
    ...collab,
    // Escalate priority if memory shows repeated unresolved attempts
    priority: memory.attempts >= 3 && collab.priority === "medium"
      ? "high"
      : collab.priority,
    memoryPhrase:   memory.continuityMessage,
    memoryAttempts: memory.attempts,
  };
}

/**
 * Builds a single-line handoff continuity summary for rail display.
 */
export function summarizeHandoffContinuity(
  collaborations: AgentCollaboration[],
  orgSlug:        string,
): string | null {
  if (collaborations.length === 0) return null;

  const primary = collaborations[0];
  if (!primary) return null;

  const memory = getHandoffMemory(orgSlug, primary.sourceAgentId, primary.targetAgentId);
  if (memory && memory.attempts >= 2) {
    return memory.continuityMessage;
  }

  // Fresh collaboration — build from type
  const TYPE_LABEL: Record<string, string> = {
    handoff:        "solicita handoff a",
    consultation:   "consulta a",
    support_request: "solicita apoyo a",
    escalation:     "escala a",
    shared_context: "comparte contexto con",
  };
  const verb = TYPE_LABEL[primary.type] ?? "coordina con";
  const src  = primary.sourceAgentId.charAt(0).toUpperCase() + primary.sourceAgentId.slice(1);
  const tgt  = primary.targetAgentId.charAt(0).toUpperCase() + primary.targetAgentId.slice(1);
  return `${src} ${verb} ${tgt}.`;
}
