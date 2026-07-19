/**
 * lib/agentik-agents/agent-registry.ts
 *
 * Agentik OS — Official Agent Registry
 * Sprint: AGENTIK-AGENTS-COPILOT-ARCHITECTURE-01
 *
 * Single source of truth for all Agentik agents.
 * Agents live in Agentik OS → Agentik Agentes.
 * They deploy contextually into the global Copilot rail — never locally.
 *
 * Agents: luca · diego · laura · david · sofia · mila · pablo
 */

// ── Agent type ─────────────────────────────────────────────────────────────────

export type AgentId =
  | "luca"
  | "diego"
  | "laura"
  | "david"
  | "sofia"
  | "mila"
  | "pablo";

export interface AgentQuickAction {
  id:    string;
  label: string;
  href:  string;  // may contain {orgSlug} placeholder
}

export interface AgentDef {
  id:             AgentId;
  name:           string;
  displayName:    string;         // "Luca · Marketing" — rail header line 1
  department:     string;         // "Marketing" | "Finanzas" | etc.
  domain:         string;         // "marketing" | "finance" | "sales" | …
  title:          string;         // operational title — rail header line 2
  description:    string;         // one-sentence capability summary
  modules:        string[];       // route segments this agent owns
  submodules:     string[];       // more specific route segments
  accentColor:    string;         // brand color for borders, chips, active states
  avatarKey:      string;         // /agents/{avatarKey}.png
  capabilities:   string[];       // 3–4 displayed capability strings
  defaultTone:    string;         // "directivo" | "analítico" | "comercial" | etc.
  quickActions:   AgentQuickAction[];
  defaultSignals: string[];       // signal ids this agent monitors
}

// ── Registry ───────────────────────────────────────────────────────────────────

const REGISTRY: Record<AgentId, AgentDef> = {

  // ── LUCA — Marketing ──────────────────────────────────────────────────────
  luca: {
    id:          "luca",
    name:        "Luca",
    displayName: "Luca · Marketing",
    department:  "Marketing",
    domain:      "marketing",
    title:       "Director Creativo IA",
    description: "Marketing, pauta IA, publicaciones, catálogos, analítica, foto estudio y biblioteca creativa.",
    modules:     ["agentik/marketing-studio"],
    submodules:  [
      "marketing-studio/foto-estudio",
      "marketing-studio/biblioteca",
      "marketing-studio/campanas",
      "marketing-studio/pauta",
      "marketing-studio/analitica",
      "marketing-studio/catalogos",
      "marketing-studio/conexiones",
      "marketing-studio/publicaciones",
    ],
    accentColor:    "#004AAD",
    avatarKey:      "luca",
    capabilities:   [
      "Generación de contenido IA",
      "Campañas · canales · publicidad",
      "Foto estudio · biblioteca creativa",
      "Performance y distribución",
    ],
    defaultTone:    "creativo",
    quickActions:   [
      { id: "nueva-sesion",   label: "Nueva sesión",   href: "/{orgSlug}/agentik/marketing-studio/foto-estudio/new" },
      { id: "ver-biblioteca", label: "Ver biblioteca", href: "/{orgSlug}/agentik/marketing-studio/biblioteca" },
      { id: "ver-campanas",   label: "Campañas",       href: "/{orgSlug}/agentik/marketing-studio/campanas" },
    ],
    defaultSignals: ["social.posts_pending", "shopify.sync_required", "assets.pending_review"],
  },

  // ── DIEGO — Finanzas ──────────────────────────────────────────────────────
  diego: {
    id:          "diego",
    name:        "Diego",
    displayName: "Diego · Finanzas",
    department:  "Finanzas",
    domain:      "finance",
    title:       "Inteligencia Financiera",
    description: "Torre de control, tesorería, conciliación, documentos financieros, cierre y planeación.",
    modules:     ["finanzas", "torre-control", "finance"],
    submodules:  [
      "finanzas/tesoreria",
      "finanzas/conciliacion",
      "finanzas/cierre",
      "finanzas/planeacion",
      "finanzas/documentos",
    ],
    accentColor:    "#1e293b",
    avatarKey:      "Diego",
    capabilities:   [
      "Conciliación bancaria",
      "Tesorería · liquidez",
      "Cierre contable",
      "Planeación financiera",
    ],
    defaultTone:    "analítico",
    quickActions:   [
      { id: "conciliacion",  label: "Conciliación",  href: "/{orgSlug}/finanzas/conciliacion" },
      { id: "tesoreria",     label: "Tesorería",     href: "/{orgSlug}/finanzas/tesoreria" },
      { id: "cierre",        label: "Cierre",        href: "/{orgSlug}/finanzas/cierre" },
    ],
    defaultSignals: ["finance.reconciliation_gap", "finance.treasury_alert", "finance.close_pending"],
  },

  // ── LAURA — WhatsApp Comercial ────────────────────────────────────────────
  laura: {
    id:          "laura",
    name:        "Laura",
    displayName: "Laura · WhatsApp",
    department:  "WhatsApp Comercial",
    domain:      "whatsapp",
    title:       "Asesora Comercial IA",
    description: "WhatsApp comercial: responder, vender, catálogos, fotos y mensajes institucionales.",
    modules:     ["whatsapp-sales", "whatsapp"],
    submodules:  [],
    accentColor:    "#0891b2",
    avatarKey:      "laura",
    capabilities:   [
      "Automatización conversacional",
      "Catálogos de WhatsApp",
      "Seguimiento de clientes",
    ],
    defaultTone:    "comercial",
    quickActions:   [
      { id: "nuevo-mensaje", label: "Nuevo mensaje", href: "/{orgSlug}/whatsapp" },
    ],
    defaultSignals: ["whatsapp.messages_pending", "whatsapp.catalog_stale"],
  },

  // ── DAVID — Comercial ─────────────────────────────────────────────────────
  david: {
    id:          "david",
    name:        "David",
    displayName: "David · Comercial",
    department:  "Comercial",
    domain:      "sales",
    title:       "Operaciones Comerciales IA",
    description: "Comercial, cliente 360, gestión de pedidos, vendedores, canales, sucursales y líneas.",
    modules:     ["sales", "ventas", "customers", "clientes", "orders", "pedidos"],
    submodules:  [],
    accentColor:    "#ea580c",
    avatarKey:      "david",
    capabilities:   [
      "Reportes de gestión",
      "KPIs comerciales",
      "Cliente 360",
      "Análisis de rendimiento",
    ],
    defaultTone:    "comercial",
    quickActions:   [
      { id: "ver-clientes", label: "Clientes",  href: "/{orgSlug}/clientes" },
      { id: "ver-pedidos",  label: "Pedidos",   href: "/{orgSlug}/pedidos" },
    ],
    defaultSignals: ["sales.order_alert", "sales.customer_inactive"],
  },

  // ── SOFIA — eCommerce / Shopify ───────────────────────────────────────────
  sofia: {
    id:          "sofia",
    name:        "Sofía",
    displayName: "Sofía · Shopify",
    department:  "Shopify / Ecommerce",
    domain:      "ecommerce",
    title:       "Ecommerce Growth AI",
    description: "Shopify, ecommerce, optimización, publicaciones, seguimiento y remarketing.",
    modules:     ["integrations", "shopify"],
    submodules:  ["marketing-studio/shopify"],
    accentColor:    "#059669",
    avatarKey:      "sofia",
    capabilities:   [
      "Shopify · conectores",
      "Sincronización de inventario",
      "Diagnóstico de integraciones",
    ],
    defaultTone:    "técnico",
    quickActions:   [
      { id: "shopify",      label: "Shopify",      href: "/{orgSlug}/agentik/marketing-studio/shopify" },
      { id: "integraciones",label: "Integraciones",href: "/{orgSlug}/integrations" },
    ],
    defaultSignals: ["shopify.sync_error", "integrations.connector_down"],
  },

  // ── MILA — Cobranza ───────────────────────────────────────────────────────
  mila: {
    id:          "mila",
    name:        "Mila",
    displayName: "Mila · Cobranza",
    department:  "Cobranza",
    domain:      "collections",
    title:       "Gestión de cartera IA",
    description: "Cobranza, WhatsApp institucional, cobros, recordatorios y clientes críticos.",
    modules:     ["collections", "colecciones", "cobranza", "pipeline"],
    submodules:  [],
    accentColor:    "#7c3aed",
    avatarKey:      "mila",
    capabilities:   [
      "Seguimiento de cartera",
      "Pipeline comercial",
      "Recuperación de cuentas",
    ],
    defaultTone:    "directivo",
    quickActions:   [
      { id: "pipeline",  label: "Pipeline",  href: "/{orgSlug}/pipeline" },
    ],
    defaultSignals: ["collections.overdue_account", "collections.reminder_pending"],
  },

  // ── PABLO — Gestión / Agentik OS ──────────────────────────────────────────
  pablo: {
    id:          "pablo",
    name:        "Pablo",
    displayName: "Pablo · Gerencia",
    department:  "Gerencia",
    domain:      "operations",
    title:       "Gestión Ejecutiva IA",
    description: "Gestión, gerencia, informes inteligentes, alertas, tareas pendientes y supervisión de agentes.",
    modules:     ["agentik", "dashboard", "alerts", "tasks", "reports", "settings", "ajustes"],
    submodules:  [
      "agentik/control-center",
      "agentik/agentes",
      "agentik/configuracion",
    ],
    accentColor:    "#475569",
    avatarKey:      "pablo",
    capabilities:   [
      "Supervisión de agentes",
      "Gestión operativa",
      "Alertas y tareas",
      "Control de plataforma",
    ],
    defaultTone:    "ejecutivo",
    quickActions:   [
      { id: "agentes",  label: "Agentes",  href: "/{orgSlug}/agentik/agentes" },
      { id: "alertas",  label: "Alertas",  href: "/{orgSlug}/agentik/alertas" },
    ],
    defaultSignals: ["system.agent_degraded", "system.task_overdue"],
  },
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function getAgent(id: AgentId): AgentDef {
  return REGISTRY[id];
}

export function getAgentOrDefault(id: string): AgentDef {
  return REGISTRY[id as AgentId] ?? REGISTRY.pablo;
}

export function getAllAgents(): AgentDef[] {
  return Object.values(REGISTRY);
}

export function resolveQuickActions(agent: AgentDef, orgSlug: string): AgentQuickAction[] {
  return agent.quickActions.map(action => ({
    ...action,
    href: action.href.replace("{orgSlug}", orgSlug),
  }));
}
