/**
 * lib/autonomous-operations/autonomous-operation-fixtures.ts
 *
 * Agentik — Autonomous Operations Fixtures
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Test fixtures for the autonomous operations layer.
 * Pure domain. No Prisma. No React. No Next.
 */

import type { AutonomousOperationInput } from "./autonomous-operation-types";
import type { ProposedAction }           from "../agents/runtime/agent-runtime-result";

// ── Proposed Action fixtures ───────────────────────────────────────────────────

export const diegoFinanceApprovalProposedAction: ProposedAction = {
  id:                     "pa_diego_finance_approval_01",
  type:                   "CREATE_APPROVAL_DRAFT",
  label:                  "Aprobación: Conciliación cuenta 4120",
  description:            "Diferencia de $3.2M en cuenta 4120 requiere revisión de gerencia financiera.",
  targetDomain:           "FINANCE",
  targetModule:           "conciliacion",
  requiresApproval:       true,
  sourceRecommendationId: "rec_finance_recon_01",
  confidence:             "HIGH",
  score:                  70,
  navigationTarget:       "/castillitos/finanzas/conciliacion",
  payload: {
    signalId:      "sig_recon_4120",
    signalType:    "reconciliation_exception",
    reasoning:     "La cuenta 4120 presenta diferencia contable superior al umbral de alerta.",
    relatedEntity: { type: "account", id: "4120" },
  },
  metadata: {},
};

export const diegoFinanceTaskProposedAction: ProposedAction = {
  id:                     "pa_diego_finance_task_01",
  type:                   "CREATE_TASK_DRAFT",
  label:                  "Revisar cobros vencidos — cliente Maletas Premium",
  description:            "Seguimiento requerido: $215k vencidos a 75 días. Acción directa del agente.",
  targetDomain:           "FINANCE",
  targetModule:           "cobros",
  requiresApproval:       false,
  sourceRecommendationId: "rec_collections_overdue_01",
  confidence:             "VERY_HIGH",
  score:                  75,
  navigationTarget:       "/castillitos/finanzas/torre-control/cobros-hoy",
  payload: {
    signalId:      "sig_collections_overdue_01",
    signalType:    "overdue_receivable",
    reasoning:     "Cartera vencida crítica. Acción de seguimiento directa.",
    relatedEntity: { type: "customer", id: "maletas-premium" },
  },
  metadata: {},
};

export const lucaMarketingApprovalProposedAction: ProposedAction = {
  id:                     "pa_luca_marketing_approval_01",
  type:                   "CREATE_APPROVAL_DRAFT",
  label:                  "Aprobar campaña Verano 2026",
  description:            "Campaña de temporada con presupuesto de $8.5M requiere aprobación antes de publicar.",
  targetDomain:           "MARKETING",
  targetModule:           "campaigns",
  requiresApproval:       true,
  sourceRecommendationId: "rec_marketing_campaign_01",
  confidence:             "MEDIUM",
  score:                  55,
  navigationTarget:       "/castillitos/agentik/marketing-studio/campaigns",
  payload: {
    signalId:      "sig_marketing_campaign_01",
    signalType:    "campaign_review_pending",
    reasoning:     "Campaña lista para publicar — requiere aprobación de gerencia.",
    relatedEntity: { type: "campaign", id: "verano-2026" },
  },
  metadata: {},
};

export const milaCommercialTaskProposedAction: ProposedAction = {
  id:                     "pa_mila_commercial_task_01",
  type:                   "CREATE_TASK_DRAFT",
  label:                  "Revisar margen de producto — Maletas de Viaje",
  description:            "Margen detectado en -8.3%. Tarea de análisis requerida antes de decisión comercial.",
  targetDomain:           "COMMERCIAL",
  targetModule:           "inteligencia",
  requiresApproval:       false,
  sourceRecommendationId: "rec_commercial_margin_01",
  confidence:             "HIGH",
  score:                  60,
  navigationTarget:       "/castillitos/comercial/inteligencia",
  payload: {
    signalId:      "sig_margin_alert_01",
    signalType:    "margin_alert",
    reasoning:     "Margen negativo detectado en línea de producto. Requiere investigación.",
    relatedEntity: { type: "product_line", id: "maletas-viaje" },
  },
  metadata: {},
};

export const criticalBlockedProposedAction: ProposedAction = {
  id:                     "pa_critical_workflow_01",
  type:                   "START_WORKFLOW_DRAFT",
  label:                  "Iniciar workflow de transferencia de inventario",
  description:            "Reasignación de inventario entre bodegas — requiere proceso completo.",
  targetDomain:           "OPERATIONS",
  targetModule:           "inventario",
  requiresApproval:       true,
  sourceRecommendationId: "rec_inventory_transfer_01",
  confidence:             "MEDIUM",
  score:                  60,
  navigationTarget:       "/castillitos/operaciones/inventario",
  payload: {
    signalId:   "sig_inventory_transfer_01",
    signalType: "inventory_transfer",
    workflowId: "wf_inventory_reallocation",
    reasoning:  "Capacidad de bodega principal al 94%. Redistribución necesaria.",
  },
  metadata: {},
};

export const previewModeProposedAction: ProposedAction = {
  id:                     "pa_preview_task_01",
  type:                   "CREATE_TASK_DRAFT",
  label:                  "Tarea de prueba (modo preview)",
  description:            "Esta acción solo se visualiza — no produce ningún efecto real.",
  targetDomain:           "FINANCE",
  targetModule:           "conciliacion",
  requiresApproval:       false,
  sourceRecommendationId: "rec_preview_01",
  confidence:             "HIGH",
  score:                  65,
  payload: { signalId: "sig_preview_01" },
  metadata: {},
};

// ── Operation Input fixtures ───────────────────────────────────────────────────

export const diegoFinanceApprovalInput: AutonomousOperationInput = {
  orgSlug:        "castillitos",
  agentId:        "diego",
  agentName:      "Diego",
  agentDomain:    "FINANCE",
  runtimeMode:    "APPROVAL_REQUIRED",
  proposedAction: diegoFinanceApprovalProposedAction,
  metadata:       { sourceRunId: "run_diego_finance_01" },
};

export const diegoFinanceTaskInput: AutonomousOperationInput = {
  orgSlug:        "castillitos",
  agentId:        "diego",
  agentName:      "Diego",
  agentDomain:    "FINANCE",
  runtimeMode:    "APPROVAL_REQUIRED",
  proposedAction: diegoFinanceTaskProposedAction,
  metadata:       { sourceRunId: "run_diego_finance_01" },
};

export const lucaMarketingInput: AutonomousOperationInput = {
  orgSlug:        "castillitos",
  agentId:        "luca",
  agentName:      "Luca",
  agentDomain:    "MARKETING",
  runtimeMode:    "ASSISTED",
  proposedAction: lucaMarketingApprovalProposedAction,
  metadata:       { sourceRunId: "run_luca_01" },
};

export const milaCommercialInput: AutonomousOperationInput = {
  orgSlug:        "castillitos",
  agentId:        "mila",
  agentName:      "Mila",
  agentDomain:    "COMMERCIAL",
  runtimeMode:    "ASSISTED",
  proposedAction: milaCommercialTaskProposedAction,
  metadata:       { sourceRunId: "run_mila_01" },
};

export const criticalBlockedInput: AutonomousOperationInput = {
  orgSlug:        "castillitos",
  agentId:        "diego",
  agentName:      "Diego",
  agentDomain:    "OPERATIONS",
  runtimeMode:    "ASSISTED",
  proposedAction: criticalBlockedProposedAction,
  metadata:       { sourceRunId: "run_workflow_01" },
};

export const previewModeInput: AutonomousOperationInput = {
  orgSlug:        "castillitos",
  agentId:        "diego",
  agentName:      "Diego",
  agentDomain:    "FINANCE",
  runtimeMode:    "PREVIEW",
  proposedAction: previewModeProposedAction,
  metadata:       { sourceRunId: "run_preview_01" },
};
