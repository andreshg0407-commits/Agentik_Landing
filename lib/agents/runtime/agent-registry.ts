/**
 * lib/agents/runtime/agent-registry.ts
 *
 * Agentik — Universal Agent Runtime — Agent Registry
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Source of truth for all native agents.
 * id = semantic domain ID ("finance_agent") — NEVER the display name.
 * displayName = cosmetic label ("Diego") — tenant-overridable.
 *
 * Pure TypeScript. No Prisma. No React. No server-only.
 */

import type { AgentDefinition } from "./agent-types";

// ── Native agent definitions ──────────────────────────────────────────────────

/**
 * Finance agent.
 * id: "finance_agent" — stable forever.
 * displayName: "Diego" — tenant may rename to "Carlos", "Andrea", etc.
 */
export const FINANCE_AGENT: AgentDefinition = {
  id:            "finance_agent",
  displayName:   "Diego",
  role:          "finance",
  description:   "Analiza señales financieras, detecta riesgos de liquidez, excepciones de conciliación y cuentas por cobrar. Recomienda acciones estructuradas al equipo de finanzas.",
  isSystemAgent: true,
  enabled:       true,
  capabilities:  [
    "READ_FINANCE",
    "CREATE_TASK",
    "CREATE_APPROVAL",
    "START_WORKFLOW",
    "EXECUTE_ACTION",
  ],
  tools:         ["finance_signals", "reconciliation_reader", "treasury_reader", "collections_reader"],
  systemPrompt:  "Eres el agente de inteligencia financiera de Agentik. Analiza señales financieras con precisión analítica y recomienda acciones estructuradas. Nunca asumas datos que no tengas. Si no hay señales claras, escala al usuario.",
  metadata: {
    domain:       "finance",
    primaryColor: "#004AAD",
    photoSlot:    "/agents/Diego.png",
    avatarLabel:  "D",
  },
};

/**
 * Marketing agent.
 * id: "marketing_agent" — stable forever.
 * displayName: "Luca" — tenant-overridable.
 */
export const MARKETING_AGENT: AgentDefinition = {
  id:            "marketing_agent",
  displayName:   "Luca",
  role:          "marketing",
  description:   "Coordina producción de contenido, campañas y publicación en redes. Analiza señales de marketing y recomienda aprobaciones editoriales.",
  isSystemAgent: true,
  enabled:       true,
  capabilities:  [
    "READ_MARKETING",
    "CREATE_TASK",
    "CREATE_APPROVAL",
    "CREATE_ALERT",
    "EXECUTE_ACTION",
  ],
  tools:         ["campaign_reader", "content_reader", "social_reader"],
  systemPrompt:  "Eres el agente de operaciones de marketing de Agentik. Coordina contenido, campañas y publicaciones con criterio editorial. Detecta aprobaciones pendientes y propone acciones de seguimiento.",
  metadata: {
    domain:       "marketing",
    primaryColor: "#7c3aed",
    photoSlot:    "/agents/Laura.PNG",
    avatarLabel:  "L",
  },
};

/**
 * Commercial agent.
 * id: "commercial_agent" — stable forever.
 * displayName: "Valentina" — tenant-overridable.
 */
export const COMMERCIAL_AGENT: AgentDefinition = {
  id:            "commercial_agent",
  displayName:   "Valentina",
  role:          "commercial",
  description:   "Monitorea márgenes comerciales, oportunidades de venta y señales de inteligencia comercial. Propone acciones de seguimiento y escalamiento.",
  isSystemAgent: true,
  enabled:       true,
  capabilities:  [
    "READ_COMMERCIAL",
    "CREATE_TASK",
    "CREATE_APPROVAL",
    "CREATE_ALERT",
    "EXECUTE_ACTION",
  ],
  tools:         ["commercial_signals", "margin_reader", "opportunity_reader"],
  systemPrompt:  "Eres el agente de inteligencia comercial de Agentik. Detecta oportunidades de venta y riesgos de margen. Propone acciones concretas y escalamientos al equipo comercial.",
  metadata: {
    domain:       "commercial",
    primaryColor: "#059669",
    photoSlot:    "/agents/Robert.PNG",
    avatarLabel:  "V",
  },
};

/**
 * Collections agent.
 * id: "collections_agent" — stable forever.
 * displayName: "Mila" — tenant-overridable.
 */
export const COLLECTIONS_AGENT: AgentDefinition = {
  id:            "collections_agent",
  displayName:   "Mila",
  role:          "collections",
  description:   "Monitorea cartera vencida, genera planes de cobro y coordina seguimiento a clientes. Ejecuta workflows de cobranza con aprobación del equipo.",
  isSystemAgent: true,
  enabled:       true,
  capabilities:  [
    "READ_COLLECTIONS",
    "READ_COMMERCIAL",
    "CREATE_TASK",
    "CREATE_APPROVAL",
    "START_WORKFLOW",
    "EXECUTE_ACTION",
  ],
  tools:         ["collections_reader", "cartera_reader", "client_reader"],
  systemPrompt:  "Eres el agente de cobranza de Agentik. Analiza cartera vencida y propone planes de cobro estructurados. Sé directa, práctica y siempre propone acciones concretas con deadline claro.",
  metadata: {
    domain:       "collections",
    primaryColor: "#f59e0b",
    photoSlot:    "/agents/Pablo.PNG",
    avatarLabel:  "M",
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Complete list of all native Agentik agents.
 * Order matters for display (preferred presentation order).
 *
 * To add a custom agent, push to this array or use a tenant-aware registry
 * (see agent-tenant-profile.ts for multi-tenant extension points).
 */
export const NATIVE_AGENT_REGISTRY: AgentDefinition[] = [
  FINANCE_AGENT,
  MARKETING_AGENT,
  COMMERCIAL_AGENT,
  COLLECTIONS_AGENT,
];
