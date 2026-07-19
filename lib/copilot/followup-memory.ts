/**
 * lib/copilot/followup-memory.ts
 *
 * Agentik Copilot — Follow-up Memory V1 (deterministic mock)
 *
 * Phase 4 of Sprint AGENTIK-COPILOT-ACCOUNTABILITY-01
 *
 * Simulates persistent follow-up continuity for compound operations.
 * Enables Copilot to say "Diego mantiene seguimiento hace 3 sesiones"
 * without a real database.
 *
 * V1: deterministic per org + operation type prefix.
 * V2: Prisma.CopilotFollowupLog with real session events.
 */

import type { CompoundOperation }       from "./compound-operations";
import type { AccountabilitySignal }    from "./accountability-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FollowUpMemory {
  operationId:       string;
  followupCount:     number;    // How many sessions this has been tracked
  unresolvedSince:   string;    // e.g. "3 sesiones", "sesión anterior"
  lastReminderAt:    string;    // e.g. "esta sesión", "sesión anterior"
  escalationLevel:   number;    // 0 = none, 1 = watch, 2 = alert, 3 = urgent
  continuityMessage: string;    // Agent-authored continuation phrase
}

// ── Agent follow-up phrasing (Phase 11: Persona Accountability) ──────────────

const AGENT_FOLLOWUP_PHRASES: Record<string, {
  watching:   string[];
  stalled:    string[];
  blocked:    string[];
  escalating: string[];
}> = {
  diego: {
    watching:   [
      "Diego mantiene seguimiento operativo activo.",
      "La vigilancia financiera continúa sobre esta prioridad.",
      "Diego sostiene control sobre el estado de la operación.",
    ],
    stalled:    [
      "La operación permanece pausada — Diego sostiene presión.",
      "Diego mantiene seguimiento a pesar del bloqueo de runtime.",
      "El avance está detenido — Diego registra la situación.",
    ],
    blocked:    [
      "La operación está bloqueada. Diego insiste en la resolución.",
      "Persisten bloqueos sin resolver. Diego mantiene el caso abierto.",
      "Diego registra bloqueo activo — resolución requerida.",
    ],
    escalating: [
      "Riesgo sin resolución en múltiples sesiones. Diego escala la prioridad.",
      "El bloqueo persiste. Diego activa nivel de alerta superior.",
      "Situación requiere atención directa — Diego ha escalado.",
    ],
  },
  luca: {
    watching:   [
      "Luca sostiene el momentum comercial.",
      "La oportunidad de campaña permanece activa bajo seguimiento de Luca.",
      "Luca mantiene foco en la recuperación de ritmo.",
    ],
    stalled:    [
      "El ritmo comercial está pausado — Luca monitorea.",
      "Luca mantiene seguimiento a pesar de la demora.",
      "La campaña espera condiciones óptimas — Luca vigila.",
    ],
    blocked:    [
      "La campaña está bloqueada. Luca mantiene el caso activo.",
      "Luca registra bloqueo en el plan comercial.",
      "Oportunidad comercial en riesgo — Luca insiste.",
    ],
    escalating: [
      "El momentum comercial no recupera. Luca escala la prioridad.",
      "Luca activa nivel de alerta por deterioro del pipeline.",
      "Situación comercial requiere intervención directa.",
    ],
  },
  sofi: {
    watching:   [
      "Sofi vigila estabilidad técnica del sistema.",
      "La sincronización permanece bajo seguimiento de Sofi.",
      "Sofi mantiene seguimiento de conectores activos.",
    ],
    stalled:    [
      "La estabilidad está comprometida — Sofi sostiene vigilancia.",
      "Sofi registra pausa técnica en la operación.",
      "Los conectores esperan restauración — Sofi monitorea.",
    ],
    blocked:    [
      "Conector bloqueado — Sofi mantiene el caso abierto.",
      "Sofi registra degradación técnica activa.",
      "Integración bloqueada — Sofi insiste en la resolución.",
    ],
    escalating: [
      "Degradación técnica persistente. Sofi escala.",
      "Sofi activa nivel de alerta por inestabilidad sostenida.",
      "La estabilidad requiere intervención directa.",
    ],
  },
  mila: {
    watching:   [
      "Mila mantiene seguimiento comercial activo.",
      "Las conversaciones prioritarias están bajo seguimiento de Mila.",
      "Mila protege las oportunidades de venta activas.",
    ],
    stalled:    [
      "El seguimiento comercial está pausado — Mila sostiene.",
      "Mila registra demora en la respuesta comercial.",
      "Oportunidades en espera — Mila mantiene el foco.",
    ],
    blocked:    [
      "Pipeline bloqueado — Mila mantiene el caso activo.",
      "Mila registra oportunidades sin avance.",
      "Seguimiento comercial bloqueado — Mila insiste.",
    ],
    escalating: [
      "Oportunidades en riesgo de pérdida. Mila escala.",
      "Mila activa nivel de alerta por deals estancados.",
      "Pipeline requiere intervención directa.",
    ],
  },
};

function pickPhrase(phrases: string[], seed: number): string {
  return phrases[seed % phrases.length] ?? phrases[0] ?? "";
}

function buildContinuityMessage(
  agentId:      string,
  followup:     FollowUpMemory,
  operation:    CompoundOperation,
): string {
  const agent   = AGENT_FOLLOWUP_PHRASES[agentId] ?? AGENT_FOLLOWUP_PHRASES["diego"]!;
  const seed    = followup.followupCount;
  const isEsc   = followup.escalationLevel >= 2;
  const isBlock = operation.status === "blocked";
  const isStall = operation.executionReadiness !== "ready" && !isBlock;

  if (isEsc)   return pickPhrase(agent.escalating, seed);
  if (isBlock) return pickPhrase(agent.blocked,    seed);
  if (isStall) return pickPhrase(agent.stalled,    seed);
  return pickPhrase(agent.watching, seed);
}

// ── Mock memory registry ──────────────────────────────────────────────────────
// Keyed by orgSlug → operation type prefix

const MOCK_FOLLOWUP: Record<string, Record<string, Omit<FollowUpMemory, "continuityMessage">>> = {
  castillitos: {
    "op-liquidity": {
      operationId:     "op-liquidity-castillitos",
      followupCount:   3,
      unresolvedSince: "3 sesiones",
      lastReminderAt:  "esta sesión",
      escalationLevel: 1,
    },
    "op-close": {
      operationId:     "op-close-castillitos",
      followupCount:   2,
      unresolvedSince: "sesión anterior",
      lastReminderAt:  "sesión anterior",
      escalationLevel: 1,
    },
    "op-integrations": {
      operationId:     "op-integrations-castillitos",
      followupCount:   1,
      unresolvedSince: "esta sesión",
      lastReminderAt:  "esta sesión",
      escalationLevel: 0,
    },
  },
};

function matchFollowupKey(operationId: string): string {
  if (operationId.includes("liquidity"))    return "op-liquidity";
  if (operationId.includes("close"))        return "op-close";
  if (operationId.includes("integrations")) return "op-integrations";
  if (operationId.includes("commercial"))   return "op-commercial";
  return "op-stability";
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns follow-up memory for a given org + operation.
 * V1: deterministic mock keyed by org slug and operation type prefix.
 */
export function getFollowupMemory(
  orgSlug:     string,
  operationId: string,
  agentId:     string,
  operation:   CompoundOperation,
): FollowUpMemory | null {
  const orgMemory = MOCK_FOLLOWUP[orgSlug];
  if (!orgMemory) return null;

  const key     = matchFollowupKey(operationId);
  const partial = orgMemory[key];
  if (!partial) return null;

  const continuityMessage = buildContinuityMessage(agentId, partial as FollowUpMemory, operation);

  return { ...partial, continuityMessage };
}

/**
 * Merges follow-up state into the narrative context.
 * Returns the operation augmented with followup narrative.
 */
export function mergeFollowupState(
  operation: CompoundOperation,
  memory:    FollowUpMemory | null,
): CompoundOperation & { followupNarrative?: string } {
  if (!memory) return operation;

  return {
    ...operation,
    // Escalate status if memory says escalation level is high
    status: memory.escalationLevel >= 3
      ? "blocked"
      : operation.status,
    followupNarrative: memory.continuityMessage,
  };
}

/**
 * Builds a multi-line follow-up narrative for the "Seguimiento" rail section.
 * Combines agent continuity + accountability signal descriptions.
 */
export function buildFollowupNarrative(
  agentId:   string,
  memory:    FollowUpMemory,
  signals:   AccountabilitySignal[],
  operation: CompoundOperation,
): string[] {
  const lines: string[] = [];

  // Line 1: Agent continuity phrase
  lines.push(memory.continuityMessage);

  // Line 2: Most important accountability signal description (if any)
  const primary = signals.find(s => s.severity === "elevated" || s.severity === "critical");
  if (primary) {
    lines.push(primary.description);
  }

  // Line 3: Unresolved since (if > 1 session)
  if (memory.followupCount >= 2) {
    const agent = agentId.charAt(0).toUpperCase() + agentId.slice(1);
    const sinceText = memory.followupCount >= 3
      ? `La prioridad continúa activa desde ${memory.unresolvedSince}.`
      : `${agent} mantiene seguimiento desde ${memory.unresolvedSince}.`;
    lines.push(sinceText);
  }

  // Line 4: Escalation notice if applicable
  if (memory.escalationLevel >= 2) {
    lines.push("El riesgo permanece parcialmente contenido — se recomienda intervención directa.");
  }

  return lines.slice(0, 3); // Max 3 lines for compact display
}
