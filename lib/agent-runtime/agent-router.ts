/**
 * lib/agent-runtime/agent-router.ts
 *
 * Agentik Agent Runtime — Agent Router
 *
 * Resolves which AgentRuntimeId is active for a given pathname + module config.
 * This is the canonical routing table. The Copilot resolver delegates here.
 *
 * Design principle: routing is DETERMINISTIC (not LLM-driven).
 * Pathname patterns define the active agent. No reasoning required.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

import type { AgentRuntimeId, AgentDomain } from "./agent-types";

// ── Route definition ──────────────────────────────────────────────────────────

export interface AgentRoute {
  /** Regex pattern matched against the full pathname */
  pattern:     RegExp;
  agentId:     AgentRuntimeId;
  domain:      AgentDomain;
  /** Display label for this route group */
  label:       string;
  /**
   * Module key for this route group.
   * Used by the context engine to load the correct snapshot.
   */
  moduleKey:   string;
}

// ── Routing table ─────────────────────────────────────────────────────────────
//
// Order matters — first match wins.
// More specific patterns must appear before broader ones.

export const AGENT_ROUTES: AgentRoute[] = [
  // ── Finance ───────────────────────────────────────────────────────────────
  {
    pattern:   /\/finanzas\//,
    agentId:   "diego_finance",
    domain:    "finance",
    label:     "Finanzas",
    moduleKey: "finance",
  },
  // ── Marketing Studio ──────────────────────────────────────────────────────
  {
    pattern:   /\/agentik\/marketing-studio/,
    agentId:   "luca_marketing",
    domain:    "marketing",
    label:     "Marketing Studio",
    moduleKey: "marketing_studio",
  },
  // ── Commercial ────────────────────────────────────────────────────────────
  {
    pattern:   /\/comercial\//,
    agentId:   "david_commercial",
    domain:    "commercial",
    label:     "Comercial",
    moduleKey: "commercial",
  },
  // ── Collections / Pipeline ────────────────────────────────────────────────
  {
    pattern:   /\/pipeline\//,
    agentId:   "mila_collections",
    domain:    "collections",
    label:     "Cobranza",
    moduleKey: "collections",
  },
  // ── Executive fallback (torre de control, dashboard, any unmatched) ────────
  {
    pattern:   /.*/,
    agentId:   "agentik_copilot",
    domain:    "executive",
    label:     "Copilot Ejecutivo",
    moduleKey: "executive",
  },
];

// ── Router function ───────────────────────────────────────────────────────────

export interface AgentRouteResult {
  agentId:    AgentRuntimeId;
  domain:     AgentDomain;
  moduleKey:  string;
  label:      string;
  /** true if a specific domain agent was matched (not the executive fallback) */
  hasSpecificAgent: boolean;
}

/**
 * Resolve the active agent for a given pathname.
 *
 * @param pathname - Full pathname e.g. "/castillitos/comercial/maletas"
 * @param enabledModuleKeys - Module keys enabled for this tenant (optional filter)
 */
export function routeToAgent(
  pathname: string,
  enabledModuleKeys?: string[],
): AgentRouteResult {
  for (const route of AGENT_ROUTES) {
    if (!route.pattern.test(pathname)) continue;

    // If tenant has module restrictions, skip to fallback when module not enabled
    if (
      enabledModuleKeys &&
      route.domain !== "executive" &&
      !enabledModuleKeys.includes(route.moduleKey)
    ) {
      continue;
    }

    return {
      agentId:          route.agentId,
      domain:           route.domain,
      moduleKey:        route.moduleKey,
      label:            route.label,
      hasSpecificAgent: route.domain !== "executive",
    };
  }

  // Should never reach here — the .* fallback always matches
  return {
    agentId:          "agentik_copilot",
    domain:           "executive",
    moduleKey:        "executive",
    label:            "Copilot Ejecutivo",
    hasSpecificAgent: false,
  };
}
