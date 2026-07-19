/**
 * lib/agents/runtime/agent-profile.ts
 *
 * Agentik — Agent Profile Definition
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * An AgentProfile defines who the agent is, what it can do,
 * and what constraints govern its operation.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AgentId,
  AgentRuntimeDomain,
  AgentRuntimeMode,
  AgentRuntimeActionType,
} from "./agent-runtime-types";

// ── Profile ───────────────────────────────────────────────────────────────────

export interface AgentProfile {
  agentId:            AgentId;
  name:               string;
  displayName:        string;
  role:               string;
  domain:             AgentRuntimeDomain;
  description:        string;
  defaultModule:      string;
  avatarLabel:        string;
  /** Communication tone for user-facing output. */
  tone:               "formal" | "direct" | "friendly" | "analytical";
  allowedActionTypes: AgentRuntimeActionType[];
  allowedDomains:     AgentRuntimeDomain[];
  defaultRuntimeMode: AgentRuntimeMode;
  /** Action types that always require human approval. */
  requiresApprovalFor: AgentRuntimeActionType[];
  /** Actions the agent may propose without a prior approval step. */
  canAutoExecute:     AgentRuntimeActionType[];
  isActive:           boolean;
  metadata?:          Record<string, unknown>;
}

// ── Built-in profiles ─────────────────────────────────────────────────────────

export const DIEGO_FINANCE_AGENT: AgentProfile = {
  agentId:      "diego",
  name:         "diego",
  displayName:  "Diego",
  role:         "Financial Intelligence Agent",
  domain:       "FINANCE",
  description:  "Diego analiza señales financieras, detecta riesgos de liquidez, excepciones de conciliación y cuentas por cobrar. Recomienda acciones estructuradas al equipo de finanzas.",
  defaultModule: "finanzas",
  avatarLabel:  "D",
  tone:         "analytical",
  allowedActionTypes: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
    "CREATE_APPROVAL_DRAFT",
    "START_WORKFLOW_DRAFT",
    "ESCALATE_TO_USER",
  ],
  allowedDomains:     ["FINANCE", "COLLECTIONS", "MANAGEMENT"],
  defaultRuntimeMode: "APPROVAL_REQUIRED",
  requiresApprovalFor: [
    "CREATE_APPROVAL_DRAFT",
    "START_WORKFLOW_DRAFT",
  ],
  canAutoExecute: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
  ],
  isActive: true,
  metadata: {
    photoUrl:    "/agents/Diego.png",
    primaryColor: "#004AAD",
  },
};

export const LUCA_MARKETING_AGENT: AgentProfile = {
  agentId:      "luca",
  name:         "luca",
  displayName:  "Luca",
  role:         "Marketing Operations Agent",
  domain:       "MARKETING",
  description:  "Luca coordina la producción de contenido, campañas y publicación en redes. Analiza señales de marketing y recomienda aprobaciones editoriales.",
  defaultModule: "marketing",
  avatarLabel:  "L",
  tone:         "friendly",
  allowedActionTypes: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
    "CREATE_APPROVAL_DRAFT",
    "ESCALATE_TO_USER",
  ],
  allowedDomains:     ["MARKETING", "COMMERCIAL", "MANAGEMENT"],
  defaultRuntimeMode: "ASSISTED",
  requiresApprovalFor: [
    "CREATE_APPROVAL_DRAFT",
  ],
  canAutoExecute: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
  ],
  isActive: true,
  metadata: {
    photoUrl:    "/agents/Laura.PNG",
    primaryColor: "#7c3aed",
  },
};

export const MILA_COMMERCIAL_AGENT: AgentProfile = {
  agentId:      "mila",
  name:         "mila",
  displayName:  "Mila",
  role:         "Commercial Intelligence Agent",
  domain:       "COMMERCIAL",
  description:  "Mila monitorea márgenes comerciales, oportunidades de venta y señales de cobranza. Propone acciones de seguimiento y escalamiento.",
  defaultModule: "comercial",
  avatarLabel:  "M",
  tone:         "direct",
  allowedActionTypes: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
    "CREATE_APPROVAL_DRAFT",
    "ESCALATE_TO_USER",
  ],
  allowedDomains:     ["COMMERCIAL", "COLLECTIONS", "MARKETING", "MANAGEMENT"],
  defaultRuntimeMode: "ASSISTED",
  requiresApprovalFor: [
    "CREATE_APPROVAL_DRAFT",
  ],
  canAutoExecute: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
  ],
  isActive: true,
  metadata: {
    photoUrl:    "/agents/Pablo.PNG",
    primaryColor: "#059669",
  },
};

export const SYSTEM_AGENT: AgentProfile = {
  agentId:      "system",
  name:         "system",
  displayName:  "Sistema",
  role:         "System Orchestration Agent",
  domain:       "SYSTEM",
  description:  "Agente del sistema para operaciones de rutina, auditorías automáticas y señales de infraestructura.",
  defaultModule: "sistema",
  avatarLabel:  "S",
  tone:         "formal",
  allowedActionTypes: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "ESCALATE_TO_USER",
    "NO_ACTION",
  ],
  allowedDomains:     ["SYSTEM", "FINANCE", "COLLECTIONS", "COMMERCIAL", "MARKETING", "OPERATIONS", "MANAGEMENT"],
  defaultRuntimeMode: "PREVIEW",
  requiresApprovalFor: [
    "RECOMMEND_ACTION",
  ],
  canAutoExecute: [
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "NO_ACTION",
  ],
  isActive: true,
  metadata: {
    primaryColor: "#64748b",
  },
};
