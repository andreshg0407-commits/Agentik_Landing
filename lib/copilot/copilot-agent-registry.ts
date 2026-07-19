/**
 * lib/copilot/copilot-agent-registry.ts
 *
 * Agentik Copilot Core V2 — Agent Registry
 * Sprint: AGENTIK-COPILOT-CORE-02
 *
 * 7 domain agents with full metadata, module mappings,
 * quick actions, accent colors, and avatar paths.
 */

import type { AgentId, CopilotAgentDef, CopilotModuleDomain } from "@/types/copilot/copilot-types";

// ── Registry ───────────────────────────────────────────────────────────────────

const AGENT_REGISTRY: Record<AgentId, CopilotAgentDef> = {
  luca: {
    id:          "luca",
    name:        "Luca",
    displayName: "Luca · Marketing",
    department:  "Marketing",
    role:        "Director Creativo IA",
    specialty:   "Marketing · Contenido · Campañas · Pauta · Analítica",
    avatar:      "/agents/luca.png",
    accentColor: "#004AAD",
    domains:     ["marketing_studio"],
    watchedSignals: [
      "shopify.sync_required",
      "social.posts_pending",
      "catalog.stale",
      "campaign.budget_at_risk",
    ],
    quickActions: [
      { id: "ms-hub",         label: "Marketing Studio",    href: "/{orgSlug}/agentik/marketing-studio" },
      { id: "ms-connections", label: "Conexiones",          href: "/{orgSlug}/agentik/marketing-studio/connections" },
      { id: "ms-analytics",   label: "Analítica",           href: "/{orgSlug}/agentik/marketing-studio/analytics" },
      { id: "ms-pauta",       label: "Crear Pauta",         href: "/{orgSlug}/agentik/marketing-studio/pauta" },
    ],
  },

  diego: {
    id:          "diego",
    name:        "Diego",
    displayName: "Diego · Finanzas",
    department:  "Finanzas",
    role:        "Inteligencia Financiera",
    specialty:   "Finanzas · Tesorería · Conciliación · Cierre · Planeación",
    avatar:      "/agents/Diego.png",
    accentColor: "#0f172a",
    domains:     ["finance"],
    watchedSignals: [
      "treasury.low_coverage",
      "financial_close.blocked",
      "reconciliation.pending_critical",
      "budget.velocity_exceeded",
    ],
    quickActions: [
      { id: "finance-recon",    label: "Conciliación",    href: "/{orgSlug}/finanzas/conciliacion" },
      { id: "finance-treasury", label: "Tesorería",       href: "/{orgSlug}/finanzas/tesoreria" },
      { id: "finance-close",    label: "Cierre",          href: "/{orgSlug}/finanzas/cierre" },
      { id: "finance-plan",     label: "Planeación",      href: "/{orgSlug}/finanzas/planeacion" },
    ],
  },

  laura: {
    id:          "laura",
    name:        "Laura",
    displayName: "Laura · WhatsApp",
    department:  "WhatsApp Comercial",
    role:        "Asesora Comercial IA",
    specialty:   "WhatsApp comercial · Ventas · Clientes · Catálogos",
    avatar:      "/agents/Laura.PNG",
    accentColor: "#0369a1",
    domains:     ["collections"],
    watchedSignals: [
      "collections.overdue_critical",
      "collections.queue_blocked",
      "collections.aging_threshold",
    ],
    quickActions: [
      { id: "collections-hub",  label: "Cobranzas",          href: "/{orgSlug}/pipeline" },
      { id: "collections-queue",label: "Cola de Gestión",    href: "/{orgSlug}/pipeline?view=queue" },
    ],
  },

  david: {
    id:          "david",
    name:        "David",
    displayName: "David · Comercial",
    department:  "Comercial",
    role:        "Operaciones Comerciales IA",
    specialty:   "Comercial · Pedidos · Clientes · Vendedores · Canales",
    avatar:      "/agents/enzo.png",
    accentColor: "#7c3aed",
    domains:     ["reports", "dashboard"],
    watchedSignals: [
      "reports.scheduled_overdue",
      "kpi.threshold_breach",
    ],
    quickActions: [
      { id: "reports-hub",      label: "Reportes",           href: "/{orgSlug}/reports" },
      { id: "reports-scheduled",label: "Reportes Programados",href: "/{orgSlug}/reports/scheduled" },
    ],
  },

  sofia: {
    id:          "sofia",
    name:        "Sofía",
    displayName: "Sofía · Shopify",
    department:  "Shopify / Ecommerce",
    role:        "Ecommerce Growth AI",
    specialty:   "Shopify · Ecommerce · Productos · Sync · Remarketing",
    avatar:      "/agents/sofi.png",
    accentColor: "#059669",
    domains:     ["integrations"],
    watchedSignals: [
      "integration.sync_failed",
      "connector.auth_expired",
      "shopify.webhook_lag",
    ],
    quickActions: [
      { id: "integrations-hub",    label: "Integraciones",    href: "/{orgSlug}/integrations" },
      { id: "integrations-connect",label: "Conectores",       href: "/{orgSlug}/integrations/connectors" },
    ],
  },

  mila: {
    id:          "mila",
    name:        "Mila",
    displayName: "Mila · Cobranza",
    department:  "Cobranza",
    role:        "Gestión de cartera IA",
    specialty:   "Cobranza · Cartera · Recordatorios · Clientes críticos",
    avatar:      "/agents/mila.png",
    accentColor: "#d97706",
    domains:     ["marketing_studio"],
    watchedSignals: [
      "biblioteca.assets_pending",
      "foto_estudio.session_ready",
      "content.quality_alert",
    ],
    quickActions: [
      { id: "ms-biblioteca",   label: "Biblioteca",       href: "/{orgSlug}/agentik/marketing-studio/biblioteca" },
      { id: "ms-foto-estudio", label: "Foto Estudio",     href: "/{orgSlug}/agentik/marketing-studio/foto-estudio" },
    ],
  },

  pablo: {
    id:          "pablo",
    name:        "Pablo",
    displayName: "Pablo · Gerencia",
    department:  "Gerencia",
    role:        "Gestión Ejecutiva IA",
    specialty:   "Gerencia · Informes · Alertas · Tareas · Prioridades",
    avatar:      "/agents/Pablo.PNG",
    accentColor: "#475569",
    domains:     ["pipeline", "agentik", "control_center"],
    watchedSignals: [
      "pipeline.job_failed",
      "agent.run_blocked",
      "execution.timeout",
    ],
    quickActions: [
      { id: "pipeline-hub",     label: "Pipeline",          href: "/{orgSlug}/pipeline" },
      { id: "agentik-hub",      label: "Agentik",           href: "/{orgSlug}/agentik" },
      { id: "control-center",   label: "Control Center",    href: "/{orgSlug}/agentik/control-center" },
    ],
  },
};

// ── Default agent ──────────────────────────────────────────────────────────────

const DEFAULT_AGENT_ID: AgentId = "diego";

// ── Domain → primary agent mapping ────────────────────────────────────────────

const DOMAIN_AGENT_MAP: Record<CopilotModuleDomain, AgentId> = {
  marketing_studio: "luca",
  finance:          "diego",
  collections:      "laura",
  reports:          "david",
  dashboard:        "david",
  integrations:     "sofia",
  pipeline:         "pablo",
  agentik:          "pablo",
  control_center:   "pablo",
  settings:         "pablo",
  default:          "diego",
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function getAgentById(id: AgentId): CopilotAgentDef {
  return AGENT_REGISTRY[id];
}

export function getAgentForDomain(domain: CopilotModuleDomain): CopilotAgentDef {
  const agentId = DOMAIN_AGENT_MAP[domain] ?? DEFAULT_AGENT_ID;
  return AGENT_REGISTRY[agentId];
}

export function getAllAgents(): CopilotAgentDef[] {
  return Object.values(AGENT_REGISTRY);
}

export function resolveAgentQuickActions(
  agent:   CopilotAgentDef,
  orgSlug: string,
): CopilotAgentDef["quickActions"] {
  return agent.quickActions.map((a) => ({
    ...a,
    href: a.href.replace("{orgSlug}", orgSlug),
  }));
}
