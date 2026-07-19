/**
 * lib/copilot/navigation/copilot-destinations.ts
 *
 * Agentik Copilot — Destination Registry
 * Sprint: AGENTIK-COPILOT-NAVIGABLE-ACTIONS-01
 *
 * Single source of truth for all navigable destinations the Copilot
 * can send the user to. Each destination maps to a real app route.
 *
 * Routes are relative to the org root: `/${orgSlug}${path}`
 * The caller is responsible for injecting the orgSlug.
 *
 * Architecture boundary: no React, no UI, no router — pure data.
 */

// ── Destination identifiers ───────────────────────────────────────────────────

export type DestinationId =
  | "conciliacion"
  | "tesoreria"
  | "cartera"
  | "cobranza"
  | "cierre"
  | "planeacion"
  | "comercial"
  | "tareas"
  | "alertas"
  | "aprobaciones"
  | "calendario"
  | "reportes"
  | "marketing"
  | "agentik"
  | "documentos";

// ── Destination shape ─────────────────────────────────────────────────────────

export interface CopilotDestination {
  /** Unique identifier used in action maps and routing. */
  id:      DestinationId;
  /** Display label for CTA buttons — "Ir a X" format. */
  label:   string;
  /** Path relative to org root. Prepend `/${orgSlug}` to build final URL. */
  path:    string;
  /** Short module name for breadcrumbs / context labels. */
  module:  string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const COPILOT_DESTINATIONS: Record<DestinationId, CopilotDestination> = {
  conciliacion: {
    id:     "conciliacion",
    label:  "Ir a Conciliación",
    path:   "/finanzas/conciliacion",
    module: "Conciliación",
  },
  tesoreria: {
    id:     "tesoreria",
    label:  "Ir a Tesorería",
    path:   "/finanzas/tesoreria",
    module: "Tesorería",
  },
  cartera: {
    id:     "cartera",
    label:  "Ir a Cartera",
    path:   "/finanzas/cartera",
    module: "Cartera",
  },
  cobranza: {
    id:     "cobranza",
    label:  "Ir a Cobranza",
    path:   "/cobranza",
    module: "Cobranza",
  },
  cierre: {
    id:     "cierre",
    label:  "Ir a Cierre",
    path:   "/finanzas/cierre",
    module: "Cierre",
  },
  planeacion: {
    id:     "planeacion",
    label:  "Ir a Planeación",
    path:   "/finanzas/planeacion",
    module: "Planeación",
  },
  comercial: {
    id:     "comercial",
    label:  "Ir a Comercial",
    path:   "/comercial",
    module: "Comercial",
  },
  tareas: {
    id:     "tareas",
    label:  "Ver tareas",
    path:   "/agentik",
    module: "Tareas",
  },
  alertas: {
    id:     "alertas",
    label:  "Ver alertas",
    path:   "/agentik",
    module: "Alertas",
  },
  aprobaciones: {
    id:     "aprobaciones",
    label:  "Ir a Aprobaciones",
    path:   "/agentik",
    module: "Aprobaciones",
  },
  calendario: {
    id:     "calendario",
    label:  "Ver agenda",
    path:   "/agentik",
    module: "Agenda",
  },
  reportes: {
    id:     "reportes",
    label:  "Ver reportes",
    path:   "/reportes",
    module: "Reportes",
  },
  marketing: {
    id:     "marketing",
    label:  "Ir a Marketing",
    path:   "/agentik/marketing-studio",
    module: "Marketing",
  },
  agentik: {
    id:     "agentik",
    label:  "Ir a Agentik",
    path:   "/agentik",
    module: "Agentik",
  },
  documentos: {
    id:     "documentos",
    label:  "Ver documentos",
    path:   "/finanzas/documentos",
    module: "Documentos",
  },
};

// ── Utility ───────────────────────────────────────────────────────────────────

/** Build the full route for a destination given the current org slug. */
export function buildDestinationUrl(
  id:      DestinationId,
  orgSlug: string,
): string {
  const dest = COPILOT_DESTINATIONS[id];
  return `/${orgSlug}${dest.path}`;
}
