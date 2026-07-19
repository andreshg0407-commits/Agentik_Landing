"use client";

/**
 * lib/copilot/navigation/copilot-navigation.ts
 *
 * Agentik Copilot — Central Navigation Layer
 * Sprint: AGENTIK-COPILOT-NAVIGATION-REAL-01
 *
 * Single source of truth for all Copilot navigation.
 * ALL clicks from Copilot drawers, cards, and module links pass through here.
 *
 * Pattern:
 *   CopilotNavigationTarget (semantic)
 *   → resolveCopilotTarget(target, orgSlug)
 *   → href
 *   → router.push(href)
 *
 * Future: replace router.push() with executeCopilotAction(action) here,
 * without touching any component. The interface is already prepared.
 *
 * Architecture boundary: no Prisma, no runtime, no UI — pure routing logic + hook.
 */

import { useRouter, useParams } from "next/navigation";

// ── Semantic navigation targets ───────────────────────────────────────────────

/**
 * Semantic navigation targets for Copilot.
 * SCREAMING_SNAKE_CASE — intentionally not kebab-case strings.
 * This decouples the component layer from URL implementation details.
 */
export type CopilotNavigationTarget =
  | "CONCILIATION"
  | "TREASURY"
  | "PORTFOLIO"
  | "COLLECTIONS"
  | "CLOSING"
  | "PLANNING"
  | "COMMERCIAL"
  | "TASKS"
  | "ALERTS"
  | "APPROVALS"
  | "CALENDAR"
  | "REPORTS"
  | "MARKETING_STUDIO"
  | "PHOTO_STUDIO"
  | "CUSTOMERS"
  | "ORDERS"
  | "DOCUMENTS"
  | "CONTROL_TOWER"
  | "AGENTIK";

// ── Navigation metadata ───────────────────────────────────────────────────────

export interface NavigationMeta {
  /** Full CTA label: "Ir a Conciliación" */
  label:   string;
  /** Short module name: "Conciliación" */
  module:  string;
  /** Route path resolver — receives orgSlug, returns full path */
  path:    (orgSlug: string) => string;
}

export const NAVIGATION_META: Record<CopilotNavigationTarget, NavigationMeta> = {
  CONCILIATION: {
    label:  "Ir a Conciliación",
    module: "Conciliación",
    path:   o => `/${o}/finanzas/conciliacion`,
  },
  TREASURY: {
    label:  "Ir a Tesorería",
    module: "Tesorería",
    path:   o => `/${o}/finanzas/tesoreria`,
  },
  PORTFOLIO: {
    label:  "Ir a Cartera",
    module: "Cartera",
    path:   o => `/${o}/finanzas/cartera`,
  },
  COLLECTIONS: {
    label:  "Ir a Cobranza",
    module: "Cobranza",
    path:   o => `/${o}/cobranza`,
  },
  CLOSING: {
    label:  "Ir a Cierre",
    module: "Cierre",
    path:   o => `/${o}/finanzas/cierre`,
  },
  PLANNING: {
    label:  "Ir a Planeación",
    module: "Planeación",
    path:   o => `/${o}/finanzas/planeacion`,
  },
  COMMERCIAL: {
    label:  "Ir a Comercial",
    module: "Comercial",
    path:   o => `/${o}/comercial`,
  },
  TASKS: {
    label:  "Ver tareas",
    module: "Tareas",
    path:   o => `/${o}/tareas`,
  },
  ALERTS: {
    label:  "Ver alertas",
    module: "Alertas",
    path:   o => `/${o}/agentik`,
  },
  APPROVALS: {
    label:  "Ir a Aprobaciones",
    module: "Aprobaciones",
    path:   o => `/${o}/agentik`,
  },
  CALENDAR: {
    label:  "Ver agenda",
    module: "Agenda",
    path:   o => `/${o}/agentik`,
  },
  REPORTS: {
    label:  "Ver reportes",
    module: "Reportes",
    path:   o => `/${o}/reportes`,
  },
  MARKETING_STUDIO: {
    label:  "Ir a Marketing",
    module: "Marketing",
    path:   o => `/${o}/agentik/marketing-studio`,
  },
  PHOTO_STUDIO: {
    label:  "Ir a Foto Estudio",
    module: "Foto Estudio",
    path:   o => `/${o}/agentik/marketing-studio/foto-estudio`,
  },
  CUSTOMERS: {
    label:  "Ver clientes",
    module: "Clientes",
    path:   o => `/${o}/comercial`,
  },
  ORDERS: {
    label:  "Ver pedidos",
    module: "Pedidos",
    path:   o => `/${o}/comercial`,
  },
  DOCUMENTS: {
    label:  "Ver documentos",
    module: "Documentos",
    path:   o => `/${o}/finanzas/documentos`,
  },
  CONTROL_TOWER: {
    label:  "Ir a Torre de Control",
    module: "Torre de Control",
    path:   o => `/${o}/agentik`,
  },
  AGENTIK: {
    label:  "Ir a Agentik",
    module: "Agentik",
    path:   o => `/${o}/agentik`,
  },
};

// ── Pure resolver ─────────────────────────────────────────────────────────────

/**
 * Resolves a semantic navigation target to a full route href.
 * Pure function — usable outside React.
 */
export function resolveCopilotTarget(
  target:  CopilotNavigationTarget,
  orgSlug: string,
): string {
  return NAVIGATION_META[target].path(orgSlug);
}

// ── CopilotAction interface ───────────────────────────────────────────────────

/**
 * A Copilot-driven navigation action.
 * Future: executeCopilotAction(action) will wrap router.push()
 * and optionally trigger agent events before navigating.
 */
export interface CopilotAction {
  id:           string;
  label:        string;
  description:  string;
  target:       CopilotNavigationTarget;
  variant?:     "primary" | "secondary" | "ghost";
  priority?:    "high" | "normal" | "low";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * React hook that provides Copilot navigation capabilities.
 *
 * Usage:
 *   const { navigate, execute, resolve } = useCopilotNavigation();
 *   navigate("CONCILIATION")           // → router.push(...)
 *   execute(action)                    // → router.push(resolveCopilotTarget(action.target))
 *   resolve("TREASURY")                // → "/castillitos/finanzas/tesoreria"
 *
 * Future: execute() will call the agent runtime before navigating.
 */
export function useCopilotNavigation() {
  const router  = useRouter();
  const params  = useParams();
  const orgSlug = ((params?.orgSlug) ?? "castillitos") as string;

  return {
    /** Navigate to a semantic target. Resolves href internally. */
    navigate(target: CopilotNavigationTarget): void {
      router.push(resolveCopilotTarget(target, orgSlug));
    },

    /** Execute a CopilotAction. Prepared for agent event hooks in future sprints. */
    execute(action: CopilotAction): void {
      // Future: await agentRuntime.onActionExecuted(action);
      router.push(resolveCopilotTarget(action.target, orgSlug));
    },

    /** Resolve a target to its full href without navigating. */
    resolve(target: CopilotNavigationTarget): string {
      return resolveCopilotTarget(target, orgSlug);
    },

    orgSlug,
  };
}
