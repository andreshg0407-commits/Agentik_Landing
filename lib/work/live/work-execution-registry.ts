/**
 * lib/work/live/work-execution-registry.ts
 *
 * Agentik — Live Work Execution Registry
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * Central catalog of all supported real executor types.
 * No React. No Prisma. Pure data.
 */

import type { WorkExecutorType } from "./work-execution-types";

// ── Executor definition ───────────────────────────────────────────────────────

export interface WorkExecutorDefinition {
  id:               WorkExecutorType;
  label:            string;
  description:      string;
  /** Module domain this executor belongs to. */
  module:           string;
  /** Whether this executor requires a prior human approval. */
  requiresApproval: boolean;
  /** Whether this executor supports rollback after execution. */
  supportsRollback: boolean;
  /** Whether this executor is currently live (vs stub). */
  isLive:           boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const WORK_EXECUTOR_REGISTRY: Record<WorkExecutorType, WorkExecutorDefinition> = {

  TASK_ASSIGNMENT: {
    id:               "TASK_ASSIGNMENT",
    label:            "Asignación de tarea",
    description:      "Crea una tarea formal asignada al módulo correspondiente, derivada de una aprobación.",
    module:           "tareas",
    requiresApproval: true,
    supportsRollback: true,
    isLive:           true,
  },

  CONCILIATION_APPROVAL: {
    id:               "CONCILIATION_APPROVAL",
    label:            "Conciliación aprobada",
    description:      "Registra la decisión de conciliación y actualiza los movimientos afectados.",
    module:           "conciliacion",
    requiresApproval: true,
    supportsRollback: false,
    isLive:           true,
  },

  PORTFOLIO_TRANSFER: {
    id:               "PORTFOLIO_TRANSFER",
    label:            "Transferencia de cartera",
    description:      "Ejecuta una transferencia o castigo de saldo en la cartera de cobranza.",
    module:           "cobranza",
    requiresApproval: true,
    supportsRollback: false,
    isLive:           false,
  },

  CAMPAIGN_LAUNCH: {
    id:               "CAMPAIGN_LAUNCH",
    label:            "Lanzamiento de campaña",
    description:      "Activa la publicación de una campaña de marketing aprobada.",
    module:           "marketing",
    requiresApproval: true,
    supportsRollback: true,
    isLive:           false,
  },

  REPORT_GENERATION: {
    id:               "REPORT_GENERATION",
    label:            "Generación de informe",
    description:      "Genera un informe ejecutivo basado en datos operativos actuales.",
    module:           "finanzas",
    requiresApproval: false,
    supportsRollback: false,
    isLive:           false,
  },

  DOCUMENT_GENERATION: {
    id:               "DOCUMENT_GENERATION",
    label:            "Generación de documento",
    description:      "Prepara un documento de soporte para un proceso operativo o contable.",
    module:           "documentos",
    requiresApproval: false,
    supportsRollback: false,
    isLive:           false,
  },

  WORKFLOW_EXECUTION: {
    id:               "WORKFLOW_EXECUTION",
    label:            "Ejecución de flujo",
    description:      "Ejecuta un flujo operativo conectado al sistema.",
    module:           "operaciones",
    requiresApproval: true,
    supportsRollback: false,
    isLive:           false,
  },

};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getExecutorDefinition(type: WorkExecutorType): WorkExecutorDefinition {
  return WORK_EXECUTOR_REGISTRY[type];
}

export function getLiveExecutors(): WorkExecutorDefinition[] {
  return Object.values(WORK_EXECUTOR_REGISTRY).filter(d => d.isLive);
}

export function getExecutorsRequiringApproval(): WorkExecutorDefinition[] {
  return Object.values(WORK_EXECUTOR_REGISTRY).filter(d => d.requiresApproval);
}
