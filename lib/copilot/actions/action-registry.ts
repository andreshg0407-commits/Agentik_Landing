/**
 * lib/copilot/actions/action-registry.ts
 *
 * Agentik Copilot — Central Action Registry
 * Sprint: AGENTIK-COPILOT-ACTION-SYSTEM-01
 *
 * Single source of truth for all Copilot action definitions.
 * Pure data — no React, no router, no Prisma.
 */

import type {
  CopilotActionDefinition,
  CopilotActionKind,
} from "./action-types";

// ── Registry ──────────────────────────────────────────────────────────────────

export const ACTION_REGISTRY: Record<CopilotActionKind, CopilotActionDefinition> = {

  OPEN_MODULE: {
    id:                   "open_module",
    kind:                 "OPEN_MODULE",
    label:                "Abrir módulo",
    description:          "Navegar al módulo operativo correspondiente.",
    risk:                 "low",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub", "live"],
    defaultMode:          "live",
  },

  CREATE_TASK: {
    id:                   "create_task",
    kind:                 "CREATE_TASK",
    label:                "Crear tarea",
    description:          "Crear una tarea para dar seguimiento a este hallazgo.",
    risk:                 "low",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub", "preview"],
    defaultMode:          "stub",
  },

  SCHEDULE_FOLLOWUP: {
    id:                   "schedule_followup",
    kind:                 "SCHEDULE_FOLLOWUP",
    label:                "Programar seguimiento",
    description:          "Dejar una revisión futura en la agenda operativa.",
    risk:                 "low",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub"],
    defaultMode:          "stub",
  },

  GENERATE_REPORT: {
    id:                   "generate_report",
    kind:                 "GENERATE_REPORT",
    label:                "Generar informe",
    description:          "Preparar un informe ejecutivo basado en el contexto actual.",
    risk:                 "medium",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub"],
    defaultMode:          "stub",
  },

  CREATE_ALERT: {
    id:                   "create_alert",
    kind:                 "CREATE_ALERT",
    label:                "Crear alerta",
    description:          "Registrar una alerta operativa para este hallazgo.",
    risk:                 "low",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub"],
    defaultMode:          "stub",
  },

  REQUEST_APPROVAL: {
    id:                   "request_approval",
    kind:                 "REQUEST_APPROVAL",
    label:                "Solicitar aprobación",
    description:          "Crear una solicitud de aprobación real para revisión y autorización humana.",
    risk:                 "medium",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub", "live"],
    defaultMode:          "live",
  },

  PREPARE_DOCUMENT: {
    id:                   "prepare_document",
    kind:                 "PREPARE_DOCUMENT",
    label:                "Preparar documento",
    description:          "Preparar un documento de soporte para este proceso.",
    risk:                 "low",
    status:               "available",
    requiresConfirmation: false,
    availableModes:       ["stub"],
    defaultMode:          "stub",
  },

  RUN_WORKFLOW: {
    id:                   "run_workflow",
    kind:                 "RUN_WORKFLOW",
    label:                "Ejecutar flujo",
    description:          "Iniciar un flujo operativo conectado al sistema.",
    risk:                 "high",
    status:               "coming_soon",
    requiresConfirmation: true,
    availableModes:       ["stub"],
    defaultMode:          "stub",
  },

  SEND_MESSAGE: {
    id:                   "send_message",
    kind:                 "SEND_MESSAGE",
    label:                "Enviar mensaje",
    description:          "Notificar a un usuario o equipo sobre este hallazgo.",
    risk:                 "medium",
    status:               "coming_soon",
    requiresConfirmation: true,
    availableModes:       ["stub"],
    defaultMode:          "stub",
  },

};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getActionDefinition(kind: CopilotActionKind): CopilotActionDefinition {
  return ACTION_REGISTRY[kind];
}

export function getAllActionDefinitions(): CopilotActionDefinition[] {
  return Object.values(ACTION_REGISTRY);
}
