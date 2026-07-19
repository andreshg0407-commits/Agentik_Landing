/**
 * lib/autonomous-operations/server/server.ts
 *
 * Agentik — Autonomous Operations Server Barrel
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * SERVER-ONLY barrel. Import this from Server Actions, API routes,
 * and server components only.
 *
 * Client-safe types/helpers: import from lib/autonomous-operations/index.ts
 */
import "server-only";

export { autonomousOperationService }           from "./autonomous-operation-service";
export { dispatchAutonomousOperationPlan }       from "./autonomous-operation-dispatcher";
export {
  buildAutonomousInputsFromRuntimeResult,
  executeProposedActionAsOperation,
  executeAgentRuntimeOperations,
}                                               from "./autonomous-operation-action-bridge";
