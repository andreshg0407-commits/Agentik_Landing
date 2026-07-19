/**
 * lib/copilot/copilot-context-resolver.ts
 *
 * Agentik Copilot Core V2 — Context Resolver
 * Sprint: AGENTIK-AGENTS-COPILOT-ARCHITECTURE-01 (corrective rewrite)
 *
 * Delegates to lib/agentik-agents/agent-resolver for canonical
 * pathname → agent resolution. Wraps result in CopilotContext shape.
 *
 * Routing rules live exclusively in:
 *   lib/agentik-agents/agent-resolver.ts
 */

import type { CopilotContext, CopilotModuleDomain } from "@/types/copilot/copilot-types";
import { getAgentById }                             from "@/lib/copilot/copilot-agent-registry";
import type { AgentId }                             from "@/types/copilot/copilot-types";
import { resolveAgentForRoute }                     from "@/lib/agentik-agents/agent-resolver";

// ── Domain derivation (kept for CopilotContext.module field) ───────────────────

const DOMAIN_MAP: Array<{ pattern: RegExp; domain: CopilotModuleDomain }> = [
  { pattern: /\/agentik\/marketing-studio/, domain: "marketing_studio" },
  { pattern: /\/finanzas|\/agentik\/finance/, domain: "finance" },
  { pattern: /\/pipeline|\/collections|\/colecciones/, domain: "collections" },
  { pattern: /\/reports|\/informes/,         domain: "reports" },
  { pattern: /\/integrations|\/shopify/,     domain: "integrations" },
  { pattern: /\/agentik\/control-center/,    domain: "control_center" },
  { pattern: /\/agentik/,                    domain: "agentik" },
  { pattern: /\/ajustes|\/settings/,         domain: "settings" },
  { pattern: /\/dashboard/,                  domain: "dashboard" },
];

export function resolveModuleDomain(pathname: string): CopilotModuleDomain {
  for (const { pattern, domain } of DOMAIN_MAP) {
    if (pattern.test(pathname)) return domain;
  }
  return "default";
}

// ── Main resolver ──────────────────────────────────────────────────────────────

export function resolveCopilotContext(opts: {
  pathname:   string;
  orgSlug:    string;
  isInternal: boolean;
}): CopilotContext {
  const { pathname, orgSlug, isInternal } = opts;

  // Canonical agent resolution — delegates to lib/agentik-agents
  const resolved = resolveAgentForRoute({ pathname, orgSlug });

  // Map to V2 CopilotAgentDef (used by CopilotShell components)
  const agent = getAgentById(resolved.agent.id as AgentId);

  return {
    module:      resolveModuleDomain(pathname),
    activeAgent: agent,
    pathname,
    orgSlug,
    isInternal,
  };
}
