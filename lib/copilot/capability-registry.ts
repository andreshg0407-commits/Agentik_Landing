/**
 * lib/copilot/capability-registry.ts
 *
 * Agentik Copilot — Agent Capability Registry V1
 *
 * Phases B1 + B2 of Sprint AGENTIK-STRATEGIC-MEMORY-AND-CAPABILITIES-01
 *
 * Defines the formal capabilities of each agent and their operational
 * constraints. This is the authoritative source for what each agent
 * can do, under what conditions, and at what risk level.
 *
 * V1: static registry — no DB, no dynamic loading.
 * V2: Prisma.AgentCapability with tenant-level overrides.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type CapabilityType =
  | "operational"    // Core operational actions (review, monitor, track)
  | "analytical"     // Intelligence and analysis (read-only + report)
  | "execution"      // Active execution steps (create, submit, close)
  | "communication"  // External communication (WhatsApp, email, CRM)
  | "integration"    // Connector and data source management
  | "strategic";     // Long-horizon planning and creative direction

export type CapabilityRisk = "low" | "medium" | "high" | "critical";

export type CapabilityExecutionMode =
  | "read_only"    // Never modifies data
  | "draft_only"   // Creates drafts, no submission
  | "supervised"   // Human confirms before execution
  | "assisted";    // AI acts partially, human approves key steps

export interface AgentCapability {
  id:                   string;
  agentId:              string;
  name:                 string;           // Short display name
  type:                 CapabilityType;
  description:          string;           // 1-sentence operational description
  supportedModules:     string[];         // Module paths where capability is relevant
  requiredPermissions:  string[];         // Role requirements (e.g. "ORG_ADMIN")
  executionModes:       CapabilityExecutionMode[];
  riskLevel:            CapabilityRisk;
  dependencies:         string[];         // Other capability IDs this depends on
  enabled:              boolean;          // V1: always true unless runtime blocks
}

// ── Registry ───────────────────────────────────────────────────────────────────

export const CAPABILITY_REGISTRY: AgentCapability[] = [

  // ── Diego — Financial Specialist ──────────────────────────────────────────

  {
    id:                  "diego-análisis-financiero",
    agentId:             "diego",
    name:                "análisis financiero",
    type:                "analytical",
    description:         "Analiza estados financieros, presupuestos y proyecciones de tesorería",
    supportedModules:    ["finanzas", "finanzas/tesoreria", "finanzas/planeacion", "executive"],
    requiredPermissions: [],
    executionModes:      ["read_only"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "diego-conciliación",
    agentId:             "diego",
    name:                "conciliación",
    type:                "operational",
    description:         "Revisa y gestiona excepciones de conciliación bancaria y documental",
    supportedModules:    ["finanzas/conciliacion", "reconciliation"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised"],
    riskLevel:           "medium",
    dependencies:        ["diego-análisis-financiero"],
    enabled:             true,
  },
  {
    id:                  "diego-seguimiento-cartera",
    agentId:             "diego",
    name:                "seguimiento cartera",
    type:                "operational",
    description:         "Monitorea la cartera activa de cobros y cuentas por cobrar",
    supportedModules:    ["collections", "finanzas/tesoreria"],
    requiredPermissions: [],
    executionModes:      ["read_only", "draft_only"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "diego-validación-tesorería",
    agentId:             "diego",
    name:                "validación tesorería",
    type:                "execution",
    description:         "Valida proyecciones de tesorería y flujos de caja operativos",
    supportedModules:    ["finanzas/tesoreria"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised"],
    riskLevel:           "medium",
    dependencies:        ["diego-análisis-financiero"],
    enabled:             true,
  },
  {
    id:                  "diego-preparación-cierre",
    agentId:             "diego",
    name:                "preparación cierre",
    type:                "execution",
    description:         "Prepara y coordina el cierre contable del período financiero",
    supportedModules:    ["finanzas/cierre"],
    requiredPermissions: ["ORG_ADMIN"],
    executionModes:      ["supervised"],
    riskLevel:           "high",
    dependencies:        ["diego-conciliación", "diego-validación-tesorería"],
    enabled:             true,
  },

  // ── Luca — Commercial & Creative ─────────────────────────────────────────

  {
    id:                  "luca-campañas",
    agentId:             "luca",
    name:                "campañas",
    type:                "communication",
    description:         "Diseña, activa y monitorea campañas de marketing multicanal",
    supportedModules:    ["agentik/marketing-studio"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised", "assisted"],
    riskLevel:           "medium",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "luca-contenido-ia",
    agentId:             "luca",
    name:                "contenido IA",
    type:                "strategic",
    description:         "Genera contenido visual, textual y creativo asistido por IA",
    supportedModules:    ["agentik/marketing-studio"],
    requiredPermissions: [],
    executionModes:      ["assisted"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "luca-marketing-intelligence",
    agentId:             "luca",
    name:                "marketing intelligence",
    type:                "analytical",
    description:         "Analiza rendimiento de campañas, conversión y métricas de demanda",
    supportedModules:    ["agentik/marketing-studio", "sales"],
    requiredPermissions: [],
    executionModes:      ["read_only"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "luca-performance-review",
    agentId:             "luca",
    name:                "performance review",
    type:                "analytical",
    description:         "Revisa el ROI, CAC y rendimiento de iniciativas comerciales",
    supportedModules:    ["agentik/marketing-studio", "executive"],
    requiredPermissions: [],
    executionModes:      ["read_only"],
    riskLevel:           "low",
    dependencies:        ["luca-marketing-intelligence"],
    enabled:             true,
  },
  {
    id:                  "luca-creative-orchestration",
    agentId:             "luca",
    name:                "creative orchestration",
    type:                "strategic",
    description:         "Coordina la producción creativa cross-channel y la estrategia de marca",
    supportedModules:    ["agentik/marketing-studio"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised"],
    riskLevel:           "medium",
    dependencies:        ["luca-contenido-ia", "luca-campañas"],
    enabled:             true,
  },

  // ── Sofi — Technical & Integration ────────────────────────────────────────

  {
    id:                  "sofi-runtime-review",
    agentId:             "sofi",
    name:                "revisión runtime",
    type:                "integration",
    description:         "Monitorea y diagnostica el estado del motor de señales y runtime SAG",
    supportedModules:    ["integrations"],
    requiredPermissions: [],
    executionModes:      ["read_only"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "sofi-integrations",
    agentId:             "sofi",
    name:                "integraciones",
    type:                "integration",
    description:         "Gestiona conectores de datos y fuentes externas del sistema",
    supportedModules:    ["integrations"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised"],
    riskLevel:           "medium",
    dependencies:        ["sofi-runtime-review"],
    enabled:             true,
  },
  {
    id:                  "sofi-connector-validation",
    agentId:             "sofi",
    name:                "validación conectores",
    type:                "integration",
    description:         "Valida la salud y disponibilidad de conectores SAG y externos",
    supportedModules:    ["integrations"],
    requiredPermissions: [],
    executionModes:      ["read_only", "supervised"],
    riskLevel:           "low",
    dependencies:        ["sofi-runtime-review"],
    enabled:             true,
  },
  {
    id:                  "sofi-sync-operations",
    agentId:             "sofi",
    name:                "sincronización SAG",
    type:                "integration",
    description:         "Ejecuta y monitorea operaciones de sincronización de datos SAG",
    supportedModules:    ["integrations"],
    requiredPermissions: ["ORG_ADMIN"],
    executionModes:      ["supervised"],
    riskLevel:           "high",
    dependencies:        ["sofi-integrations", "sofi-connector-validation"],
    enabled:             true,
  },
  {
    id:                  "sofi-ecommerce-systems",
    agentId:             "sofi",
    name:                "sistemas ecommerce",
    type:                "integration",
    description:         "Gestiona integraciones con plataformas de ecommerce (Shopify, etc.)",
    supportedModules:    ["agentik/marketing-studio", "integrations"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised"],
    riskLevel:           "medium",
    dependencies:        ["sofi-integrations"],
    enabled:             true,
  },

  // ── Mila — Commercial Follow-up ──────────────────────────────────────────

  {
    id:                  "mila-seguimiento-comercial",
    agentId:             "mila",
    name:                "seguimiento comercial",
    type:                "operational",
    description:         "Monitorea y activa el seguimiento de oportunidades comerciales activas",
    supportedModules:    ["sales", "pipeline", "customer-360"],
    requiredPermissions: [],
    executionModes:      ["read_only", "draft_only"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "mila-whatsapp-workflows",
    agentId:             "mila",
    name:                "WhatsApp workflows",
    type:                "communication",
    description:         "Prepara y coordina flujos de comunicación comercial vía WhatsApp",
    supportedModules:    ["sales", "collections"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised"],
    riskLevel:           "medium",
    dependencies:        ["mila-seguimiento-comercial"],
    enabled:             true,
  },
  {
    id:                  "mila-recuperacion-leads",
    agentId:             "mila",
    name:                "recuperación leads",
    type:                "operational",
    description:         "Identifica y reactiva conversaciones y leads sin seguimiento activo",
    supportedModules:    ["pipeline", "sales"],
    requiredPermissions: [],
    executionModes:      ["draft_only", "supervised"],
    riskLevel:           "low",
    dependencies:        [],
    enabled:             true,
  },
  {
    id:                  "mila-atención-comercial",
    agentId:             "mila",
    name:                "atención comercial",
    type:                "communication",
    description:         "Gestiona la atención y respuesta a clientes en canal comercial",
    supportedModules:    ["sales", "customer-360"],
    requiredPermissions: ["ORG_MEMBER"],
    executionModes:      ["supervised", "assisted"],
    riskLevel:           "medium",
    dependencies:        ["mila-seguimiento-comercial"],
    enabled:             true,
  },
  {
    id:                  "mila-pipeline-continuity",
    agentId:             "mila",
    name:                "pipeline continuity",
    type:                "operational",
    description:         "Mantiene la continuidad y avance del pipeline de ventas activo",
    supportedModules:    ["pipeline"],
    requiredPermissions: [],
    executionModes:      ["read_only", "draft_only"],
    riskLevel:           "low",
    dependencies:        ["mila-seguimiento-comercial", "mila-recuperacion-leads"],
    enabled:             true,
  },
];

// ── Registry accessors ────────────────────────────────────────────────────────

/**
 * Returns all capabilities for a given agent.
 */
export function getCapabilitiesForAgent(agentId: string): AgentCapability[] {
  return CAPABILITY_REGISTRY.filter(c => c.agentId === agentId);
}

/**
 * Returns all capabilities relevant to a given module.
 */
export function getCapabilitiesForModule(module: string): AgentCapability[] {
  const prefix = module.split("/")[0] ?? module;
  return CAPABILITY_REGISTRY.filter(c =>
    c.supportedModules.some(m => m === module || m === prefix || m.startsWith(prefix + "/"))
  );
}
