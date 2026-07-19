/**
 * lib/agents/runtime/server.ts
 *
 * Agentik — Agent Runtime Server Barrel
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * SERVER-ONLY barrel for the agent runtime server layer.
 * Exports ONLY server-side services — nothing from this file
 * may be imported in client components or the client-safe index.ts.
 */

export { agentExecutionService } from "./server/agent-execution-service";

// AGENTIK-AGENT-RUNTIME-01 — Universal Agent Runtime engine
// Call executeGoal from API routes and Server Actions only.
export { executeGoal } from "./agent-runtime";
export type { AgentRuntimeResult, AgentRuntimeOptions } from "./agent-runtime";
