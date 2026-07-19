/**
 * lib/copilot/actions/approval-action-adapter.ts
 *
 * Agentik Copilot — CREATE_APPROVAL Action → ApprovalRequest Adapter
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Converts a Copilot action execution context into a structured ApprovalRequest.
 * The request is transient — callers decide whether to persist it.
 *
 * No React. No Prisma. No router.
 */

import type { CopilotActionContext }   from "./action-types";
import type {
  ApprovalCategory,
  ApprovalContext,
  ApprovalPriority,
  ApprovalRequest,
  ApprovalSource,
} from "@/lib/approvals/approval-types";
import {
  createApprovalRequest,
  createApprovalRelationship,
  DIEGO_APPROVER,
  LUCA_APPROVER,
  MILA_APPROVER,
  SYSTEM_APPROVER,
  createApprovalActor,
} from "@/lib/approvals/approval-factory";
import type { DrawerCategoryKey } from "@/lib/copilot/navigation/copilot-action-map";

// ── Category mapping ──────────────────────────────────────────────────────────

const DRAWER_TO_APPROVAL_CATEGORY: Partial<Record<DrawerCategoryKey, ApprovalCategory>> = {
  attention:        "FINANCIAL",
  activeWork:       "OPERATIONS",
  pendingApprovals: "FINANCIAL",
  suggestions:      "COMPLIANCE",
  opportunities:    "COMMERCIAL",
  followups:        "COLLECTIONS",
  recentActivity:   "OPERATIONS",
  insights:         "COMPLIANCE",
};

// ── Priority mapping ──────────────────────────────────────────────────────────

const DRAWER_TO_APPROVAL_PRIORITY: Partial<Record<DrawerCategoryKey, ApprovalPriority>> = {
  attention:        "HIGH",
  pendingApprovals: "CRITICAL",
  opportunities:    "MEDIUM",
  followups:        "MEDIUM",
  activeWork:       "MEDIUM",
  suggestions:      "LOW",
  recentActivity:   "LOW",
  insights:         "MEDIUM",
};

// ── Impact fixtures ───────────────────────────────────────────────────────────

const DRAWER_IMPACT: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "$4.250.000 pendientes de validación",
  activeWork:       "Proceso activo requiere autorización",
  pendingApprovals: "14 movimientos esperando decisión",
  suggestions:      "Oportunidad de mejora detectada",
  opportunities:    "Margen afectado en 3.5%",
  followups:        "$1.900.000 con mora superior a 180 días",
  recentActivity:   "Actividad reciente requiere confirmación",
  insights:         "Hallazgo requiere validación de cumplimiento",
};

// ── Recommendation fixtures ───────────────────────────────────────────────────

const DRAWER_RECOMMENDATION: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "Aprobar conciliación sugerida",
  activeWork:       "Autorizar continuación del proceso",
  pendingApprovals: "Aprobar o rechazar movimientos pendientes",
  suggestions:      "Validar y aplicar recomendación",
  opportunities:    "Autorizar descuento especial",
  followups:        "Castigar saldo vencido",
  recentActivity:   "Revisar y confirmar actividad reciente",
  insights:         "Aprobar validación de cumplimiento",
};

// ── Entity type fixtures ──────────────────────────────────────────────────────

const DRAWER_ENTITY_TYPE: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "bank_movement",
  activeWork:       "operational_process",
  pendingApprovals: "approval_item",
  suggestions:      "agent_suggestion",
  opportunities:    "commercial_discount",
  followups:        "portfolio_balance",
  recentActivity:   "activity_event",
  insights:         "compliance_item",
};

// ── Title builders ────────────────────────────────────────────────────────────

const DRAWER_APPROVAL_TITLES: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "Marcar 14 movimientos como conciliados",
  activeWork:       "Autorizar continuación de proceso activo",
  pendingApprovals: "Autorizar pago extraordinario",
  suggestions:      "Aprobar recomendación del agente",
  opportunities:    "Autorizar descuento especial",
  followups:        "Castigar saldo vencido",
  recentActivity:   "Confirmar actividad reciente",
  insights:         "Validar hallazgo de análisis",
};

// ── Navigation resolver ───────────────────────────────────────────────────────

function resolveApprovalNavigationTarget(orgSlug: string, moduleSlug?: string): string {
  const mod = moduleSlug ?? "";
  if (mod.includes("conciliacion"))  return `/${orgSlug}/finanzas/conciliacion`;
  if (mod.includes("tesoreria"))     return `/${orgSlug}/finanzas/tesoreria`;
  if (mod.includes("cierre"))        return `/${orgSlug}/finanzas/cierre`;
  if (mod.includes("planeacion"))    return `/${orgSlug}/finanzas/planeacion`;
  if (mod.includes("documentos"))    return `/${orgSlug}/finanzas/documentos`;
  if (mod.includes("cartera"))       return `/${orgSlug}/finanzas/cartera`;
  if (mod.includes("cobranza"))      return `/${orgSlug}/cobranza`;
  if (mod.includes("comercial"))     return `/${orgSlug}/comercial`;
  if (mod.includes("marketing"))     return `/${orgSlug}/agentik/marketing-studio`;
  return `/${orgSlug}/agentik`;
}

// ── Requestor resolver ────────────────────────────────────────────────────────

function resolveRequestorActor(agentId: string, agentName: string) {
  if (agentId === "diego") return DIEGO_APPROVER;
  if (agentId === "luca")  return LUCA_APPROVER;
  if (agentId === "mila")  return MILA_APPROVER;
  if (agentId === "system") return SYSTEM_APPROVER;
  return createApprovalActor(agentId, "AGENT", agentName);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Build an ApprovalRequest from a Copilot action context.
 * The approver defaults to the human manager role (USER).
 * The requestor is the originating agent.
 */
export function buildApprovalRequestFromCopilotAction(
  context: CopilotActionContext,
): ApprovalRequest {
  const agentName = context.agentId.charAt(0).toUpperCase() + context.agentId.slice(1);
  const cat       = (context.drawerCategory ?? "activeWork") as DrawerCategoryKey;

  const category   = DRAWER_TO_APPROVAL_CATEGORY[cat]   ?? "CUSTOM";
  const priority   = DRAWER_TO_APPROVAL_PRIORITY[cat]   ?? "MEDIUM";
  const entityType = DRAWER_ENTITY_TYPE[cat]             ?? "task_item";
  const title      = DRAWER_APPROVAL_TITLES[cat]
    ?? `Solicitud de aprobación · ${agentName}`;

  const requestor = resolveRequestorActor(context.agentId, agentName);
  const approver  = createApprovalActor(
    "manager",
    "USER",
    "Gerencia Financiera",
  );

  const approvalContext: ApprovalContext = {
    orgSlug:          context.orgSlug,
    module:           context.moduleSlug,
    sourceAgentId:    context.agentId,
    sourceAgentName:  agentName,
    entityType,
    entityId:         `fixture_${cat}_001`,
    navigationTarget: resolveApprovalNavigationTarget(context.orgSlug, context.moduleSlug),
    impactSummary:    DRAWER_IMPACT[cat],
    recommendation:   DRAWER_RECOMMENDATION[cat],
  };

  const source: ApprovalSource = "COPILOT";

  const relationships = [
    createApprovalRelationship(
      "created_from_copilot",
      "copilot_action",
      `copilot_approval_${Date.now()}`,
      `Acción Copilot · ${context.drawerCategory ?? "general"}`,
    ),
  ];

  if (context.moduleSlug) {
    relationships.push(
      createApprovalRelationship(
        "related_to_module",
        "module",
        context.moduleSlug,
        context.moduleSlug,
      ),
    );
  }

  return createApprovalRequest({
    title,
    description: `Solicitud generada por ${agentName} desde Copilot en ${context.moduleSlug || "la aplicación"}.`,
    priority,
    source,
    category,
    requestor,
    approver,
    context: approvalContext,
    relationships,
    metadata: {
      generatedByAgent:  context.agentId,
      drawerCategory:    context.drawerCategory,
      moduleSlug:        context.moduleSlug,
    },
  });
}

// ── Module-specific fixture builders — Phase 12 ───────────────────────────────

/**
 * Fixture: Conciliación — marcar movimientos conciliados.
 */
export function buildConciliacionApprovalFixture(orgSlug: string): ApprovalRequest {
  return createApprovalRequest({
    title:       "Marcar 14 movimientos como conciliados",
    description: "Diego detectó 14 movimientos bancarios que coinciden con registros internos y recomienda conciliarlos.",
    priority:    "HIGH",
    source:      "COPILOT",
    category:    "FINANCIAL",
    requestor:   DIEGO_APPROVER,
    approver:    createApprovalActor("manager_finanzas", "USER", "Gerencia Financiera"),
    context: {
      orgSlug,
      module:           "conciliacion",
      sourceAgentId:    "diego",
      sourceAgentName:  "Diego",
      entityType:       "bank_movement_batch",
      entityId:         "fixture_batch_conciliacion_001",
      navigationTarget: `/${orgSlug}/finanzas/conciliacion`,
      impactSummary:    "$4.250.000 pendientes de validación",
      recommendation:   "Aprobar conciliación sugerida",
      metadata:         { actionType: "RECONCILIATION" },
    },
    relationships: [
      createApprovalRelationship("related_to_module", "module", "conciliacion", "Conciliación"),
    ],
  });
}

/**
 * Fixture: Tesorería — autorizar pago extraordinario.
 */
export function buildTesoreriaApprovalFixture(orgSlug: string): ApprovalRequest {
  return createApprovalRequest({
    title:       "Autorizar pago extraordinario",
    description: "Luca identificó un pago urgente que requiere autorización fuera del ciclo ordinario.",
    priority:    "CRITICAL",
    source:      "AGENT",
    category:    "FINANCIAL",
    requestor:   LUCA_APPROVER,
    approver:    createApprovalActor("manager_tesoreria", "USER", "Gerencia Tesorería"),
    context: {
      orgSlug,
      module:           "tesoreria",
      sourceAgentId:    "luca",
      sourceAgentName:  "Luca",
      entityType:       "extraordinary_payment",
      entityId:         "fixture_payment_tesoreria_001",
      navigationTarget: `/${orgSlug}/finanzas/tesoreria`,
      impactSummary:    "$12.500.000 por desembolsar",
      recommendation:   "Validar posición bancaria antes de autorizar",
      metadata:         { actionType: "TREASURY_TRANSFER" },
    },
    relationships: [
      createApprovalRelationship("related_to_module", "module", "tesoreria", "Tesorería"),
    ],
  });
}

/**
 * Fixture: Cartera — castigar saldo vencido.
 */
export function buildCarteraApprovalFixture(orgSlug: string): ApprovalRequest {
  return createApprovalRequest({
    title:       "Castigar saldo vencido",
    description: "Diego detectó saldo con mora superior a 180 días que cumple criterios para castigo de cartera.",
    priority:    "HIGH",
    source:      "AGENT",
    category:    "COLLECTIONS",
    requestor:   DIEGO_APPROVER,
    approver:    createApprovalActor("manager_cobranza", "USER", "Gerencia Cobranza"),
    context: {
      orgSlug,
      module:           "cobranza",
      sourceAgentId:    "diego",
      sourceAgentName:  "Diego",
      entityType:       "portfolio_balance",
      entityId:         "fixture_portfolio_001",
      navigationTarget: `/${orgSlug}/finanzas/cartera`,
      impactSummary:    "$1.900.000 con mora superior a 180 días",
      recommendation:   "Castigar saldo según política interna",
      metadata:         { actionType: "FOLLOW_UP" },
    },
    relationships: [
      createApprovalRelationship("related_to_module", "module", "cobranza", "Cobranza"),
    ],
  });
}

/**
 * Fixture: Comercial — autorizar descuento especial.
 */
export function buildComercialApprovalFixture(orgSlug: string): ApprovalRequest {
  return createApprovalRequest({
    title:       "Autorizar descuento especial",
    description: "Luca identificó una oportunidad comercial que requiere autorización de descuento fuera de política.",
    priority:    "MEDIUM",
    source:      "AGENT",
    category:    "COMMERCIAL",
    requestor:   LUCA_APPROVER,
    approver:    createApprovalActor("manager_comercial", "USER", "Gerencia Comercial"),
    context: {
      orgSlug,
      module:           "comercial",
      sourceAgentId:    "luca",
      sourceAgentName:  "Luca",
      entityType:       "commercial_discount",
      entityId:         "fixture_discount_001",
      navigationTarget: `/${orgSlug}/comercial`,
      impactSummary:    "Margen afectado en 3.5%",
      recommendation:   "Evaluar rentabilidad antes de autorizar",
      metadata:         { actionType: "ORDER_RELEASE" },
    },
    relationships: [
      createApprovalRelationship("related_to_module", "module", "comercial", "Comercial"),
    ],
  });
}
/**
 * Fixture: Marketing — aprobar campaña o publicación.
 */
export function buildMarketingApprovalFixture(orgSlug: string): ApprovalRequest {
  return createApprovalRequest({
    title:       "Aprobar publicación de campaña",
    description: "Mila preparó el contenido de campaña y requiere aprobación antes de publicar en canales activos.",
    priority:    "MEDIUM",
    source:      "AGENT",
    category:    "MARKETING",
    requestor:   MILA_APPROVER,
    approver:    createApprovalActor("manager_marketing", "USER", "Gerencia Marketing"),
    context: {
      orgSlug,
      module:           "marketing",
      sourceAgentId:    "mila",
      sourceAgentName:  "Mila",
      entityType:       "marketing_campaign",
      entityId:         "fixture_campaign_001",
      navigationTarget: `/${orgSlug}/agentik/marketing-studio`,
      impactSummary:    "3 canales listos para publicar",
      recommendation:   "Revisar contenido y aprobar distribución",
      metadata:         { actionType: "PUBLISH_CONTENT" },
    },
    relationships: [
      createApprovalRelationship("related_to_module", "module", "marketing", "Marketing Studio"),
    ],
  });
}

/**
 * Fixture: Finanzas general — validar cierre de período.
 */
export function buildFinanzasApprovalFixture(orgSlug: string): ApprovalRequest {
  return createApprovalRequest({
    title:       "Validar cierre financiero del período",
    description: "Diego detectó que todos los saldos están conciliados y solicita validación formal para cerrar el período contable.",
    priority:    "HIGH",
    source:      "AGENT",
    category:    "FINANCIAL",
    requestor:   DIEGO_APPROVER,
    approver:    createApprovalActor("manager_finanzas", "USER", "Gerencia Financiera"),
    context: {
      orgSlug,
      module:           "cierre",
      sourceAgentId:    "diego",
      sourceAgentName:  "Diego",
      entityType:       "financial_period",
      entityId:         "fixture_period_jun_2026",
      navigationTarget: `/${orgSlug}/finanzas/cierre`,
      impactSummary:    "Período Junio 2026 listo para cierre",
      recommendation:   "Confirmar y ejecutar cierre contable",
      metadata:         { actionType: "RECONCILIATION" },
    },
    relationships: [
      createApprovalRelationship("related_to_module", "module", "cierre", "Cierre Financiero"),
    ],
  });
}
