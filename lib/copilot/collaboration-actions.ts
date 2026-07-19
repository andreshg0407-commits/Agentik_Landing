/**
 * lib/copilot/collaboration-actions.ts
 *
 * Agentik Copilot — Collaboration Action Drafts V1
 *
 * Phase 9 of Sprint AGENTIK-COPILOT-MULTI-AGENT-DELEGATION-01
 *
 * Prepares execution drafts for multi-agent collaboration actions.
 * V1: NO side effects. NO execution. Drafts only.
 * V2: integrate with Execution Layer V2 + real agent dispatch.
 *
 * Each draft is a structured intent that the Execution Layer can
 * consume when activated by an authorized user action.
 */

import type { AgentCollaboration } from "./agent-collaboration";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CollaborationActionType =
  | "request_technical_review"
  | "request_sales_followup"
  | "request_campaign_review"
  | "request_financial_validation"
  | "request_pipeline_recovery"
  | "request_runtime_check";

export interface CollaborationAction {
  id:           string;
  type:         CollaborationActionType;
  label:        string;          // Short human-readable label for rail display
  description:  string;         // What this action will trigger (conceptual)
  sourceAgentId: string;
  targetAgentId: string;
  relatedCollabId: string;
  canAutoExecute: false;         // V1 lock — always manual
  requiresConfirmation: boolean;
  estimatedImpact: string;       // Human-readable impact summary
}

export interface HandoffExecutionDraft {
  collaborationId: string;
  actions:         CollaborationAction[];
  readinessSummary: string;       // Can this draft be executed now?
  blockers:         string[];     // What's preventing execution
}

// ── Action catalog ─────────────────────────────────────────────────────────────

const ACTION_CATALOG: Record<CollaborationActionType, Omit<CollaborationAction,
  "id" | "sourceAgentId" | "targetAgentId" | "relatedCollabId"
>> = {
  request_technical_review: {
    type:                  "request_technical_review",
    label:                 "Preparar revisión técnica",
    description:           "Sofi revisará integraciones, conectores y fuentes de datos SAG",
    canAutoExecute:        false,
    requiresConfirmation:  true,
    estimatedImpact:       "Confirma estabilidad del runtime y valida la precisión de señales",
  },
  request_sales_followup: {
    type:                  "request_sales_followup",
    label:                 "Activar seguimiento comercial",
    description:           "Mila activará seguimiento de cobros y conversaciones de ventas",
    canAutoExecute:        false,
    requiresConfirmation:  true,
    estimatedImpact:       "Recupera cobros pendientes y reactiva oportunidades del pipeline",
  },
  request_campaign_review: {
    type:                  "request_campaign_review",
    label:                 "Revisar plan de campaña",
    description:           "Luca revisará el plan creativo y el ritmo de la campaña activa",
    canAutoExecute:        false,
    requiresConfirmation:  false,
    estimatedImpact:       "Ajusta la estrategia comercial basada en señales de conversión",
  },
  request_financial_validation: {
    type:                  "request_financial_validation",
    label:                 "Validar impacto financiero",
    description:           "Diego validará el costo y el impacto financiero del plan comercial",
    canAutoExecute:        false,
    requiresConfirmation:  true,
    estimatedImpact:       "Confirma viabilidad de la inversión y alinea con proyección de caja",
  },
  request_pipeline_recovery: {
    type:                  "request_pipeline_recovery",
    label:                 "Recuperar pipeline",
    description:           "Mila priorizará conversaciones y leads sin seguimiento activo",
    canAutoExecute:        false,
    requiresConfirmation:  false,
    estimatedImpact:       "Reactiva oportunidades de venta y reduce el tiempo de respuesta",
  },
  request_runtime_check: {
    type:                  "request_runtime_check",
    label:                 "Verificar runtime",
    description:           "Sofi confirmará el estado de sincronización y fuentes de datos",
    canAutoExecute:        false,
    requiresConfirmation:  false,
    estimatedImpact:       "Valida que el motor de señales tiene contexto completo",
  },
};

// ── Mapping: collaboration action ID → action type ────────────────────────────

const ACTION_ID_TO_TYPE: Record<string, CollaborationActionType> = {
  review_integrations:        "request_technical_review",
  validate_data_sources:      "request_runtime_check",
  activate_collections_followup: "request_sales_followup",
  send_whatsapp_reminder:     "request_sales_followup",
  recover_pipeline_conversations: "request_pipeline_recovery",
  prioritize_leads:           "request_pipeline_recovery",
  validate_campaign_budget:   "request_financial_validation",
  review_cac_impact:          "request_financial_validation",
  resolve_blocker:            "request_technical_review",
  escalate_to_owner:          "request_technical_review",
  share_context:              "request_campaign_review",
  align_on_priority:          "request_campaign_review",
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds a collaboration action from a collaboration + action ID.
 * Returns null if the action ID has no registered type.
 */
export function buildCollaborationAction(
  collab:   AgentCollaboration,
  actionId: string,
): CollaborationAction | null {
  const type = ACTION_ID_TO_TYPE[actionId];
  if (!type) return null;

  const template = ACTION_CATALOG[type];

  return {
    ...template,
    id:              `ca-${collab.id}-${actionId}`,
    sourceAgentId:   collab.sourceAgentId,
    targetAgentId:   collab.targetAgentId,
    relatedCollabId: collab.id,
  };
}

/**
 * Builds a handoff execution draft from a collaboration object.
 * V1: always returns canAutoExecute=false drafts with blockers noted.
 */
export function buildHandoffExecutionDraft(
  collab: AgentCollaboration,
): HandoffExecutionDraft {
  const actions = collab.suggestedActionIds
    .map(id => buildCollaborationAction(collab, id))
    .filter((a): a is CollaborationAction => a !== null);

  const blockers: string[] = [];

  // V1 blockers: always present since execution is not live
  if (collab.status === "blocked") {
    blockers.push("La colaboración está bloqueada — dependencias sin resolver");
  }
  if (collab.targetAgentId === "sofi" && collab.relatedModule === "integrations") {
    blockers.push("Requiere acceso a conectores SAG — ejecución manual necesaria");
  }
  // V1 universal blocker
  blockers.push("Ejecución automática no disponible en V1 — requiere confirmación manual");

  const readinessSummary = blockers.length <= 1
    ? "Listo para confirmación manual"
    : "Pendiente de resolución de dependencias";

  return {
    collaborationId:  collab.id,
    actions,
    readinessSummary,
    blockers,
  };
}
