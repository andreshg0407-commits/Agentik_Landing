/**
 * lib/copilot/cross-module-reasoning/server.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Server-only barrel — includes Prisma repository and health checks.
 *
 * NEVER import this file from client components or shared domain code.
 * Import from ./index.ts for client-safe exports.
 */

import "server-only";

// ── All client-safe exports (re-exported for server convenience) ──────────────
export * from "./index";

// ── Server-only: Health check ─────────────────────────────────────────────────
export {
  runCrossModuleHealthCheck,
  isHealthy,
} from "./cross-module-health";
export type {
  CrossModuleHealthReport,
  CrossModuleHealthStatus,
  CrossModuleHealthCheck,
} from "./cross-module-health";

// ── Server-only: Narrative builder (uses AI-capable patterns) ────────────────
export {
  buildExecutiveNarrative,
  buildEmptyNarrative,
  buildConclusion,
} from "./executive-narrative-builder";
export type { ExecutiveNarrative } from "./executive-narrative-builder";

// ── Server-only: Chain builder ────────────────────────────────────────────────
export {
  buildReasoningChain,
  buildReasoningPath,
  summarizeChain,
  validateChain,
} from "./reasoning-chain-builder";

// ── Server-only: Causality engine ─────────────────────────────────────────────
export {
  buildCausalReasoningResult,
  identifyCausalCandidates,
} from "./causality-engine";
