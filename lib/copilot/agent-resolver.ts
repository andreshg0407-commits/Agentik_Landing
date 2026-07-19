/**
 * lib/copilot/agent-resolver.ts
 *
 * Backwards-compat re-export.
 * Canonical resolver is now: lib/agentik-agents/agent-resolver.ts
 *
 * Sprint: AGENTIK-AGENTS-COPILOT-ARCHITECTURE-01
 */

export { resolveAgentForRoute as resolveAgentFromPath } from "@/lib/agentik-agents/agent-resolver";
export type { AgentResolverResult as ResolvedAgent }    from "@/lib/agentik-agents/agent-resolver";
