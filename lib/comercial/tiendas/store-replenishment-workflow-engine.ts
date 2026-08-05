/**
 * lib/comercial/tiendas/store-replenishment-workflow-engine.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-FULFILLMENT-01 — Workflow state machine.
 * AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01 — RESERVADO status added.
 *
 * Cadena certificada:
 *   BORRADOR → RESERVADO → APROBADO → PREPARACION → DESPACHADO → RECIBIDO → CERRADO
 *   LIBERAR_RESERVA desde RESERVADO → BORRADOR (releases inventory hold)
 *   CANCELAR permitido desde BORRADOR | RESERVADO | APROBADO | PREPARACION
 *   CERRADO y CANCELADO son terminales absolutos.
 *
 * PURO y agnóstico de BD. Las transiciones válidas se exportan como DATO
 * (`WORKFLOW_TRANSITIONS`, as const) — la UI y las APIs futuras derivan
 * botones y validaciones de ahí, sin duplicar reglas.
 */

import type { ReplenishmentDocumentStatus } from "./store-replenishment-document-types";

// ── Workflow version (los eventos viejos representan su versión) ─────────────

export const WORKFLOW_VERSION = 1 as const;

// ── Transitions (enum TS alineado 1:1 con el enum Prisma) ────────────────────

export const WORKFLOW_TRANSITION_VERBS = [
  "RESERVAR",
  "LIBERAR_RESERVA",
  "APROBAR",
  "INICIAR_PREPARACION",
  "DESPACHAR",
  "RECIBIR",
  "CERRAR",
  "CANCELAR",
] as const;

export type WorkflowTransition = (typeof WORKFLOW_TRANSITION_VERBS)[number];

// ── The transition matrix — DATO exportado, as const ─────────────────────────

export const WORKFLOW_TRANSITIONS = {
  BORRADOR:    { RESERVAR: "RESERVADO", CANCELAR: "CANCELADO" },
  RESERVADO:   { APROBAR: "APROBADO", LIBERAR_RESERVA: "BORRADOR", CANCELAR: "CANCELADO" },
  APROBADO:    { INICIAR_PREPARACION: "PREPARACION", CANCELAR: "CANCELADO" },
  PREPARACION: { DESPACHAR: "DESPACHADO", CANCELAR: "CANCELADO" },
  DESPACHADO:  { RECIBIR: "RECIBIDO" },
  RECIBIDO:    { CERRAR: "CERRADO" },
  CERRADO:     {},
  CANCELADO:   {},
} as const satisfies Record<
  ReplenishmentDocumentStatus,
  Partial<Record<WorkflowTransition, ReplenishmentDocumentStatus>>
>;

// ── Typed error ──────────────────────────────────────────────────────────────

export class InvalidWorkflowTransitionError extends Error {
  readonly code = "INVALID_WORKFLOW_TRANSITION";
  readonly fromStatus: ReplenishmentDocumentStatus;
  readonly transition: string;
  readonly allowed: readonly WorkflowTransition[];
  constructor(fromStatus: ReplenishmentDocumentStatus, transition: string) {
    const allowed = allowedTransitions(fromStatus);
    super(
      `[WORKFLOW] Transición "${transition}" no permitida desde ${fromStatus}. ` +
      (allowed.length > 0
        ? `Permitidas: ${allowed.join(", ")}.`
        : `${fromStatus} es un estado TERMINAL: no acepta comandos.`),
    );
    this.name = "InvalidWorkflowTransitionError";
    this.fromStatus = fromStatus;
    this.transition = transition;
    this.allowed = allowed;
  }
}

// ── Engine API (resolveTransition · allowedTransitions · isTerminal) ─────────

export interface ResolvedTransition {
  readonly fromStatus: ReplenishmentDocumentStatus;
  readonly transition: WorkflowTransition;
  readonly toStatus: ReplenishmentDocumentStatus;
  /** true si el estado DESTINO es terminal (CERRADO | CANCELADO). */
  readonly terminal: boolean;
  readonly workflowVersion: typeof WORKFLOW_VERSION;
}

/** Transiciones permitidas desde un estado (orden estable de declaración). */
export function allowedTransitions(
  status: ReplenishmentDocumentStatus,
): readonly WorkflowTransition[] {
  return Object.keys(WORKFLOW_TRANSITIONS[status]) as WorkflowTransition[];
}

/** true para CERRADO y CANCELADO — cero transiciones salientes. */
export function isTerminal(status: ReplenishmentDocumentStatus): boolean {
  return allowedTransitions(status).length === 0;
}

/**
 * Resuelve una transición o lanza InvalidWorkflowTransitionError.
 * Única fuente de verdad ejecutable — certificada en test contra la matriz
 * exportada (dato ↔ función siempre sincronizados).
 */
export function resolveTransition(
  fromStatus: ReplenishmentDocumentStatus,
  transition: WorkflowTransition | string,
): ResolvedTransition {
  const row = WORKFLOW_TRANSITIONS[fromStatus] as Partial<Record<string, ReplenishmentDocumentStatus>>;
  const toStatus = row?.[transition];
  if (!toStatus) {
    throw new InvalidWorkflowTransitionError(fromStatus, String(transition));
  }
  return {
    fromStatus,
    transition: transition as WorkflowTransition,
    toStatus,
    terminal: isTerminal(toStatus),
    workflowVersion: WORKFLOW_VERSION,
  };
}
