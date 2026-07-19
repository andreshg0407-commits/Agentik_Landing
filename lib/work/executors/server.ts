/**
 * lib/work/executors/server.ts
 *
 * Agentik — Module Executor Barrel (SERVER-ONLY)
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * Exports registry, resolver, and executor singletons.
 * ONLY import from server components, server actions, API routes,
 * or other server-only files.
 *
 * For pure types (client-safe): import from "lib/work/executors"
 */
import "server-only";

// ── Registry ──────────────────────────────────────────────────────────────────
export {
  MODULE_EXECUTOR_REGISTRY,
  getRegisteredModules,
} from "./module-executor-registry";

// ── Resolver ──────────────────────────────────────────────────────────────────
export { resolveModuleExecutor } from "./resolve-module-executor";

// ── Executor singletons ───────────────────────────────────────────────────────
export { financeExecutor }     from "./finance-executor";
export { collectionsExecutor } from "./collections-executor";
export { commercialExecutor }  from "./commercial-executor";
export { marketingExecutor }   from "./marketing-executor";
