/**
 * lib/agents/runtime/agent-capabilities.ts
 *
 * Agentik — Agent Capability Catalog
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Defines the specific capabilities each agent may use.
 * A capability is a named, domain-scoped action with risk metadata.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AgentId,
  AgentCapabilityId,
  AgentRuntimeDomain,
  AgentRuntimeActionType,
  AgentRiskLevel,
} from "./agent-runtime-types";

// ── Capability ────────────────────────────────────────────────────────────────

export interface AgentCapability {
  id:                        AgentCapabilityId;
  agentId:                   AgentId | "*";
  domain:                    AgentRuntimeDomain;
  actionType:                AgentRuntimeActionType;
  label:                     string;
  description:               string;
  requiresApproval:          boolean;
  requiresHumanConfirmation: boolean;
  isEnabled:                 boolean;
  riskLevel:                 AgentRiskLevel;
  metadata?:                 Record<string, unknown>;
}

// ── Capability catalog ────────────────────────────────────────────────────────

export const AGENT_CAPABILITIES: AgentCapability[] = [

  // ── Finance (Diego) ───────────────────────────────────────────────────────

  {
    id:                        "analyze_finance_signals",
    agentId:                   "diego",
    domain:                    "FINANCE",
    actionType:                "ANALYZE_SIGNALS",
    label:                     "Analizar señales financieras",
    description:               "Evalúa señales de conciliación, liquidez y cuentas por cobrar para detectar riesgos operativos.",
    requiresApproval:          false,
    requiresHumanConfirmation: false,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  {
    id:                        "recommend_finance_approval",
    agentId:                   "diego",
    domain:                    "FINANCE",
    actionType:                "CREATE_APPROVAL_DRAFT",
    label:                     "Solicitar aprobación financiera",
    description:               "Crea un borrador de solicitud de aprobación para excepciones financieras o riesgos detectados.",
    requiresApproval:          true,
    requiresHumanConfirmation: true,
    isEnabled:                 true,
    riskLevel:                 "MEDIUM",
    metadata: {
      suggestedWorkflow: "FINANCE_RECONCILIATION_CHAIN",
    },
  },

  {
    id:                        "recommend_task",
    agentId:                   "*",
    domain:                    "FINANCE",
    actionType:                "CREATE_TASK_DRAFT",
    label:                     "Crear tarea de seguimiento",
    description:               "Propone una tarea para seguimiento operativo. El usuario revisa y confirma antes de crearla.",
    requiresApproval:          false,
    requiresHumanConfirmation: true,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  {
    id:                        "recommend_workflow",
    agentId:                   "diego",
    domain:                    "FINANCE",
    actionType:                "START_WORKFLOW_DRAFT",
    label:                     "Iniciar workflow financiero",
    description:               "Propone la ejecución de un workflow de conciliación o cierre. Requiere aprobación explícita.",
    requiresApproval:          true,
    requiresHumanConfirmation: true,
    isEnabled:                 true,
    riskLevel:                 "HIGH",
  },

  // ── Marketing (Luca) ──────────────────────────────────────────────────────

  {
    id:                        "analyze_marketing_campaign",
    agentId:                   "luca",
    domain:                    "MARKETING",
    actionType:                "ANALYZE_SIGNALS",
    label:                     "Analizar señales de campaña",
    description:               "Evalúa el estado de campañas y señales de publicación para detectar aprobaciones pendientes.",
    requiresApproval:          false,
    requiresHumanConfirmation: false,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  {
    id:                        "recommend_marketing_approval",
    agentId:                   "luca",
    domain:                    "MARKETING",
    actionType:                "CREATE_APPROVAL_DRAFT",
    label:                     "Solicitar aprobación editorial",
    description:               "Genera una solicitud de aprobación editorial para una campaña o pieza de contenido.",
    requiresApproval:          true,
    requiresHumanConfirmation: true,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  // ── Commercial (Mila) ─────────────────────────────────────────────────────

  {
    id:                        "analyze_commercial_signal",
    agentId:                   "mila",
    domain:                    "COMMERCIAL",
    actionType:                "ANALYZE_SIGNALS",
    label:                     "Analizar señales comerciales",
    description:               "Detecta caídas de margen, oportunidades de venta y señales de cobranza comercial.",
    requiresApproval:          false,
    requiresHumanConfirmation: false,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  {
    id:                        "recommend_commercial_task",
    agentId:                   "mila",
    domain:                    "COMMERCIAL",
    actionType:                "CREATE_TASK_DRAFT",
    label:                     "Crear tarea comercial",
    description:               "Propone una tarea de seguimiento para señales comerciales detectadas.",
    requiresApproval:          false,
    requiresHumanConfirmation: true,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  // ── Collections (Diego / Mila shared) ────────────────────────────────────

  {
    id:                        "recommend_collections_task",
    agentId:                   "*",
    domain:                    "COLLECTIONS",
    actionType:                "CREATE_TASK_DRAFT",
    label:                     "Crear tarea de cobranza",
    description:               "Propone una tarea de seguimiento para clientes con cartera vencida.",
    requiresApproval:          false,
    requiresHumanConfirmation: true,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

  // ── System ────────────────────────────────────────────────────────────────

  {
    id:                        "escalate_to_user",
    agentId:                   "*",
    domain:                    "SYSTEM",
    actionType:                "ESCALATE_TO_USER",
    label:                     "Escalar al usuario",
    description:               "Escala una señal o situación directamente al usuario para revisión manual.",
    requiresApproval:          false,
    requiresHumanConfirmation: false,
    isEnabled:                 true,
    riskLevel:                 "LOW",
  },

];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCapabilitiesForAgent(agentId: AgentId): AgentCapability[] {
  return AGENT_CAPABILITIES.filter(
    c => c.isEnabled && (c.agentId === agentId || c.agentId === "*"),
  );
}

export function getCapabilitiesForDomain(domain: AgentRuntimeDomain): AgentCapability[] {
  return AGENT_CAPABILITIES.filter(c => c.isEnabled && c.domain === domain);
}

export function getCapabilityById(id: AgentCapabilityId): AgentCapability | undefined {
  return AGENT_CAPABILITIES.find(c => c.id === id);
}
