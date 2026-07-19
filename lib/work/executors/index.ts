/**
 * lib/work/executors/index.ts
 *
 * Agentik — Module Executor Barrel (PURE — client-safe)
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * Exports ONLY pure types and the action mapper.
 * Safe to import from client components and shared code.
 *
 * For server-only exports (registry, resolver, executor instances):
 *   import from "lib/work/executors/server"
 */

// ── Contract types (pure — safe to import anywhere) ──────────────────────────
export type {
  ModuleExecutor,
  ModuleExecutorContext,
  ModuleExecutorResult,
  ModuleExecutorHealth,
  ModuleActionType,
  FinanceActionType,
  CollectionsActionType,
  CommercialActionType,
  MarketingActionType,
} from "./module-executor-contract";

export { MODULE_ACTION_LABELS } from "./module-executor-contract";

// ── Mapper (pure — safe to import anywhere) ───────────────────────────────────
export type { ModuleActionMapping } from "./module-action-mapper";
export { mapApprovalToModuleAction } from "./module-action-mapper";
