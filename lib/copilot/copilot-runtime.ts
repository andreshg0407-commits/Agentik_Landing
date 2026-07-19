/**
 * lib/copilot/copilot-runtime.ts
 *
 * Agentik Copilot Core V2 — Runtime State Builder
 * Sprint: AGENTIK-COPILOT-CORE-02
 *
 * Builds a CopilotCoreRuntime from resolved context.
 * Returns static structural state — no async, no Prisma.
 * Future: hydrate tasks/alerts from real DB queries.
 */

import type {
  CopilotCoreRuntime,
  CopilotContext,
  CopilotTask,
  CopilotAlert,
  CopilotSuggestion,
  CopilotContextCard,
} from "@/types/copilot/copilot-types";

// ── Domain-scoped placeholder tasks ───────────────────────────────────────────
// PLACEHOLDER — replace before ship with real DB queries per domain

const DOMAIN_TASKS: Record<string, CopilotTask[]> = {
  marketing_studio: [
    {
      id:       "ms-sync-shopify",
      label:    "Sincronizar catálogo con Shopify",
      href:     "marketing-studio/connections",
      priority: "elevated",
      agent:    "luca",
    },
    {
      id:       "ms-posts-pending",
      label:    "Publicaciones pendientes de aprobación",
      href:     "marketing-studio/redes",
      priority: "normal",
      agent:    "luca",
    },
  ],
  finance: [
    {
      id:       "fin-recon-open",
      label:    "Diferencias de conciliación abiertas",
      href:     "finanzas/conciliacion",
      priority: "critical",
      agent:    "diego",
    },
    {
      id:       "fin-treasury-review",
      label:    "Revisar cobertura de tesorería",
      href:     "finanzas/tesoreria",
      priority: "elevated",
      agent:    "diego",
    },
  ],
  collections: [
    {
      id:       "col-overdue",
      label:    "Cartera vencida crítica pendiente",
      href:     "pipeline?view=queue",
      priority: "critical",
      agent:    "laura",
    },
  ],
  integrations: [
    {
      id:       "int-sync-check",
      label:    "Verificar estado de conectores",
      href:     "integrations/connectors",
      priority: "elevated",
      agent:    "sofia",
    },
  ],
};

// ── Domain-scoped placeholder alerts ──────────────────────────────────────────
// PLACEHOLDER — replace before ship

const DOMAIN_ALERTS: Record<string, CopilotAlert[]> = {
  finance: [
    {
      id:    "alert-recon-critical",
      title: "Diferencias sin resolver en conciliación",
      level: "critical",
      meta:  "3 items · última revisión hace 2 días",
      agent: "diego",
    },
  ],
  marketing_studio: [
    {
      id:    "alert-catalog-stale",
      title: "Catálogo desactualizado en canal Shopify",
      level: "warning",
      meta:  "Última sincronización hace 48h",
      agent: "luca",
    },
  ],
};

// ── Domain-scoped placeholder suggestions ─────────────────────────────────────
// PLACEHOLDER — replace before ship

const DOMAIN_SUGGESTIONS: Record<string, CopilotSuggestion[]> = {
  marketing_studio: [
    {
      id:      "sug-ms-pauta",
      text:    "Crear una pauta para el catálogo actual",
      href:    "marketing-studio/pauta",
      agentId: "luca",
    },
    {
      id:      "sug-ms-analytics",
      text:    "Revisar analítica de la semana",
      href:    "marketing-studio/analytics",
      agentId: "luca",
    },
  ],
  finance: [
    {
      id:      "sug-fin-close",
      text:    "Iniciar proceso de cierre mensual",
      href:    "finanzas/cierre",
      agentId: "diego",
    },
  ],
};

// ── Domain-scoped placeholder cards ───────────────────────────────────────────
// PLACEHOLDER — replace before ship

const DOMAIN_CARDS: Record<string, CopilotContextCard[]> = {
  marketing_studio: [
    {
      id:     "card-ms-shopify",
      type:   "status",
      titulo: "Canal Shopify",
      valor:  "Activo",
      meta:   "Sincronizado hace 2h",
    },
    {
      id:     "card-ms-posts",
      type:   "metric",
      titulo: "Publicaciones esta semana",
      valor:  "12",
      meta:   "+3 vs semana anterior",
    },
  ],
  finance: [
    {
      id:     "card-fin-treasury",
      type:   "metric",
      titulo: "Cobertura operativa",
      valor:  "18 días",
      meta:   "Umbral: 15 días",
    },
    {
      id:     "card-fin-recon",
      type:   "alert",
      titulo: "Diferencias abiertas",
      valor:  "3",
      meta:   "Requieren revisión hoy",
      urgent: true,
    },
  ],
};

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildCopilotCoreRuntime(context: CopilotContext): CopilotCoreRuntime {
  const { module } = context;

  const tasks       = DOMAIN_TASKS[module]       ?? [];
  const alerts      = DOMAIN_ALERTS[module]      ?? [];
  const suggestions = DOMAIN_SUGGESTIONS[module] ?? [];
  const cards       = DOMAIN_CARDS[module]       ?? [];

  const state =
    alerts.some((a) => a.level === "critical") ? "degraded" :
    tasks.some((t)  => t.priority === "critical") ? "ready" :
    "ready";

  return { state, context, tasks, alerts, suggestions, cards };
}
