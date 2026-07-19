/**
 * lib/work/chaining/workflow-chain-registry.ts
 *
 * Agentik — Workflow Chain Registry
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Central catalog of all registered workflow chains.
 * Pure data — no React, no Prisma, no server-only.
 *
 * Each chain is a named multi-step business process.
 * Steps with requiresApproval=true pause for human decision.
 */

import type { WorkflowChainDefinition } from "./workflow-chain-types";

// ── Chain definitions ─────────────────────────────────────────────────────────

/**
 * FINANCE_RECONCILIATION_CHAIN
 * Triggered by: FINANCE / RECONCILIATION execution completing.
 * Flow: Conciliar → (approval) Transferir tesorería → Asignar tarea de cierre
 */
const FINANCE_RECONCILIATION_CHAIN: WorkflowChainDefinition = {
  id:          "FINANCE_RECONCILIATION_CHAIN",
  name:        "Conciliación + Transferencia de Tesorería",
  description: "Flujo financiero completo: conciliación de movimientos, transferencia autorizada y tarea de cierre.",
  category:    "FINANCE",
  trigger:     "EXECUTION_COMPLETED",
  isActive:    true,
  createdAt:   "2026-06-03T00:00:00.000Z",
  version:     "1.0",
  metadata:    {},
  steps: [
    {
      id:               "step_recon_1",
      label:            "Conciliación bancaria",
      description:      "Cruzar movimientos bancarios con registros internos.",
      module:           "finanzas",
      actionType:       "RECONCILIATION",
      requiresApproval: false,
      maxRetries:       1,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_recon_2",
      label:            "Transferencia de tesorería",
      description:      "Autorizar y ejecutar transferencia de fondos post-conciliación.",
      module:           "tesoreria",
      actionType:       "TREASURY_TRANSFER",
      requiresApproval: true,
      dependsOn:        ["step_recon_1"],
      maxRetries:       0,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_recon_3",
      label:            "Tarea de cierre financiero",
      description:      "Crear tarea formal para validar el cierre del período.",
      module:           "management",
      actionType:       "TASK_ASSIGNMENT",
      requiresApproval: false,
      dependsOn:        ["step_recon_2"],
      maxRetries:       1,
      onFailure:        "SKIP",
      metadata:         {},
    },
  ],
};

/**
 * COMMERCIAL_PORTFOLIO_CHAIN
 * Triggered by: COMMERCIAL / PORTFOLIO_TRANSFER execution completing.
 * Flow: Transferir cartera → Asignar tarea → (approval) Liberar pedido
 */
const COMMERCIAL_PORTFOLIO_CHAIN: WorkflowChainDefinition = {
  id:          "COMMERCIAL_PORTFOLIO_CHAIN",
  name:        "Transferencia de Cartera + Liberación de Pedido",
  description: "Flujo comercial: transferencia de cartera, asignación interna y liberación de pedido autorizada.",
  category:    "COMMERCIAL",
  trigger:     "EXECUTION_COMPLETED",
  isActive:    true,
  createdAt:   "2026-06-03T00:00:00.000Z",
  version:     "1.0",
  metadata:    {},
  steps: [
    {
      id:               "step_portfolio_1",
      label:            "Transferencia de cartera",
      description:      "Reasignar la cartera de clientes al equipo correspondiente.",
      module:           "comercial",
      actionType:       "PORTFOLIO_TRANSFER",
      requiresApproval: false,
      maxRetries:       1,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_portfolio_2",
      label:            "Asignación interna",
      description:      "Crear tarea de seguimiento para el equipo comercial.",
      module:           "management",
      actionType:       "TASK_ASSIGNMENT",
      requiresApproval: false,
      dependsOn:        ["step_portfolio_1"],
      maxRetries:       1,
      onFailure:        "SKIP",
      metadata:         {},
    },
    {
      id:               "step_portfolio_3",
      label:            "Liberación de pedido",
      description:      "Autorizar la liberación del pedido asociado a la cartera transferida.",
      module:           "comercial",
      actionType:       "ORDER_RELEASE",
      requiresApproval: true,
      dependsOn:        ["step_portfolio_1"],
      maxRetries:       0,
      onFailure:        "STOP",
      metadata:         {},
    },
  ],
};

/**
 * MARKETING_CAMPAIGN_CHAIN
 * Triggered by: MARKETING / GENERATE_ASSETS execution completing.
 * Flow: Generar assets → Programar → (approval) Publicar
 */
const MARKETING_CAMPAIGN_CHAIN: WorkflowChainDefinition = {
  id:          "MARKETING_CAMPAIGN_CHAIN",
  name:        "Generación y Publicación de Campaña",
  description: "Flujo de marketing: generación de materiales, programación y publicación autorizada.",
  category:    "MARKETING",
  trigger:     "EXECUTION_COMPLETED",
  isActive:    true,
  createdAt:   "2026-06-03T00:00:00.000Z",
  version:     "1.0",
  metadata:    {},
  steps: [
    {
      id:               "step_campaign_1",
      label:            "Generación de materiales",
      description:      "Crear y almacenar assets para la campaña.",
      module:           "marketing",
      actionType:       "GENERATE_ASSETS",
      requiresApproval: false,
      maxRetries:       2,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_campaign_2",
      label:            "Programación de publicación",
      description:      "Agendar la publicación en los canales seleccionados.",
      module:           "marketing",
      actionType:       "SCHEDULE_POST",
      requiresApproval: false,
      dependsOn:        ["step_campaign_1"],
      maxRetries:       1,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_campaign_3",
      label:            "Publicación de contenido",
      description:      "Autorizar y ejecutar la publicación en canales aprobados.",
      module:           "marketing",
      actionType:       "PUBLISH_CONTENT",
      requiresApproval: true,
      dependsOn:        ["step_campaign_2"],
      maxRetries:       0,
      onFailure:        "STOP",
      metadata:         {},
    },
  ],
};

/**
 * COLLECTIONS_FOLLOWUP_CHAIN
 * Triggered by: COLLECTIONS / FOLLOW_UP execution completing.
 * Flow: Seguimiento → (approval) Plan de pago → Tarea de gestión
 */
const COLLECTIONS_FOLLOWUP_CHAIN: WorkflowChainDefinition = {
  id:          "COLLECTIONS_FOLLOWUP_CHAIN",
  name:        "Seguimiento + Plan de Pago",
  description: "Flujo de cobranza: seguimiento de cartera, plan de pago autorizado y tarea de gestión.",
  category:    "COLLECTIONS",
  trigger:     "EXECUTION_COMPLETED",
  isActive:    true,
  createdAt:   "2026-06-03T00:00:00.000Z",
  version:     "1.0",
  metadata:    {},
  steps: [
    {
      id:               "step_collections_1",
      label:            "Seguimiento de cartera",
      description:      "Registrar gestión de seguimiento al cliente con saldo vencido.",
      module:           "cobranza",
      actionType:       "FOLLOW_UP",
      requiresApproval: false,
      maxRetries:       1,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_collections_2",
      label:            "Plan de pago",
      description:      "Autorizar el plan de pago negociado con el cliente.",
      module:           "cobranza",
      actionType:       "PAYMENT_PLAN",
      requiresApproval: true,
      dependsOn:        ["step_collections_1"],
      maxRetries:       0,
      onFailure:        "STOP",
      metadata:         {},
    },
    {
      id:               "step_collections_3",
      label:            "Tarea de seguimiento de cobranza",
      description:      "Crear tarea de seguimiento del acuerdo de pago.",
      module:           "management",
      actionType:       "TASK_ASSIGNMENT",
      requiresApproval: false,
      dependsOn:        ["step_collections_2"],
      maxRetries:       1,
      onFailure:        "SKIP",
      metadata:         {},
    },
  ],
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const WORKFLOW_CHAIN_REGISTRY: Record<string, WorkflowChainDefinition> = {
  FINANCE_RECONCILIATION_CHAIN,
  COMMERCIAL_PORTFOLIO_CHAIN,
  MARKETING_CAMPAIGN_CHAIN,
  COLLECTIONS_FOLLOWUP_CHAIN,
};

export const ACTIVE_WORKFLOW_CHAINS: WorkflowChainDefinition[] = Object.values(
  WORKFLOW_CHAIN_REGISTRY,
).filter(c => c.isActive);

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getChainById(id: string): WorkflowChainDefinition | null {
  return WORKFLOW_CHAIN_REGISTRY[id] ?? null;
}

export function getChainsByCategory(category: string): WorkflowChainDefinition[] {
  return ACTIVE_WORKFLOW_CHAINS.filter(c => c.category === category);
}
