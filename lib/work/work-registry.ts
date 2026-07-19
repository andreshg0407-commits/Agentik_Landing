/**
 * lib/work/work-registry.ts
 *
 * Agentik — Work Type Registry
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Central catalog of all WorkTypes with their capabilities.
 * Pure data — no React, no Prisma, no Copilot.
 */

import type { WorkType } from "./work-types";

// ── Work type definition ──────────────────────────────────────────────────────

export interface WorkTypeDefinition {
  type:                WorkType;
  label:               string;
  description:         string;
  /** Can produce WorkArtifacts. */
  supportsArtifacts:   boolean;
  /** Can be assigned to a user, agent, or team. */
  supportsAssignments: boolean;
  /** Can run as a WorkExecution. */
  supportsExecution:   boolean;
  /** Requires human authorization before completing. */
  supportsApproval:    boolean;
  /** Can be scheduled for a future time. */
  supportsScheduling:  boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const WORK_TYPE_REGISTRY: Record<WorkType, WorkTypeDefinition> = {

  TASK: {
    type:                "TASK",
    label:               "Tarea",
    description:         "Unidad de trabajo operativo asignada a un actor para seguimiento y resolución.",
    supportsArtifacts:   true,
    supportsAssignments: true,
    supportsExecution:   true,
    supportsApproval:    false,
    supportsScheduling:  true,
  },

  REPORT: {
    type:                "REPORT",
    label:               "Informe",
    description:         "Documento ejecutivo generado por un agente con base en datos operativos.",
    supportsArtifacts:   true,
    supportsAssignments: false,
    supportsExecution:   true,
    supportsApproval:    false,
    supportsScheduling:  true,
  },

  DOCUMENT: {
    type:                "DOCUMENT",
    label:               "Documento",
    description:         "Soporte documental preparado para un proceso operativo o contable.",
    supportsArtifacts:   true,
    supportsAssignments: true,
    supportsExecution:   true,
    supportsApproval:    true,
    supportsScheduling:  false,
  },

  APPROVAL: {
    type:                "APPROVAL",
    label:               "Aprobación",
    description:         "Solicitud que requiere autorización humana antes de continuar.",
    supportsArtifacts:   true,
    supportsAssignments: true,
    supportsExecution:   true,
    supportsApproval:    true,
    supportsScheduling:  true,
  },

  ALERT: {
    type:                "ALERT",
    label:               "Alerta",
    description:         "Señal operativa que requiere atención inmediata.",
    supportsArtifacts:   true,
    supportsAssignments: true,
    supportsExecution:   false,
    supportsApproval:    false,
    supportsScheduling:  false,
  },

  WORKFLOW: {
    type:                "WORKFLOW",
    label:               "Flujo operativo",
    description:         "Secuencia de pasos automatizados conectados al sistema operativo.",
    supportsArtifacts:   true,
    supportsAssignments: false,
    supportsExecution:   true,
    supportsApproval:    true,
    supportsScheduling:  true,
  },

  MESSAGE: {
    type:                "MESSAGE",
    label:               "Mensaje",
    description:         "Comunicación enviada a un usuario, equipo o sistema externo.",
    supportsArtifacts:   true,
    supportsAssignments: true,
    supportsExecution:   true,
    supportsApproval:    false,
    supportsScheduling:  true,
  },

  EXPORT: {
    type:                "EXPORT",
    label:               "Exportación",
    description:         "Generación de un archivo exportable a partir de datos operativos.",
    supportsArtifacts:   true,
    supportsAssignments: false,
    supportsExecution:   true,
    supportsApproval:    false,
    supportsScheduling:  true,
  },

  IMPORT: {
    type:                "IMPORT",
    label:               "Importación",
    description:         "Ingestión de datos externos al sistema operativo.",
    supportsArtifacts:   true,
    supportsAssignments: false,
    supportsExecution:   true,
    supportsApproval:    true,
    supportsScheduling:  false,
  },

  ANALYSIS: {
    type:                "ANALYSIS",
    label:               "Análisis",
    description:         "Procesamiento contextual de datos para producir hallazgos e insights.",
    supportsArtifacts:   true,
    supportsAssignments: false,
    supportsExecution:   true,
    supportsApproval:    false,
    supportsScheduling:  true,
  },

};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getWorkTypeDefinition(type: WorkType): WorkTypeDefinition {
  return WORK_TYPE_REGISTRY[type];
}

export function getAllWorkTypeDefinitions(): WorkTypeDefinition[] {
  return Object.values(WORK_TYPE_REGISTRY);
}

export function getWorkTypesWithArtifacts(): WorkTypeDefinition[] {
  return getAllWorkTypeDefinitions().filter(d => d.supportsArtifacts);
}

export function getWorkTypesRequiringApproval(): WorkTypeDefinition[] {
  return getAllWorkTypeDefinitions().filter(d => d.supportsApproval);
}
