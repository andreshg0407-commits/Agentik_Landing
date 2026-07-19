/**
 * lib/work/executors/resolve-module-executor.ts
 *
 * Agentik — Module Executor Resolver
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * SERVER-ONLY — imports registry which imports server-only executors.
 *
 * Given (module, actionType), returns the correct ModuleExecutor or null
 * if no executor handles that combination.
 */
import "server-only";

import type { ModuleExecutor } from "./module-executor-contract";
import { MODULE_EXECUTOR_REGISTRY } from "./module-executor-registry";

/**
 * Resolve a specialized ModuleExecutor for a given module + actionType pair.
 *
 * Rules:
 *   1. Look up the module key in the registry (case-insensitive).
 *   2. If found, ask the executor whether it handles the actionType.
 *   3. If yes → return executor. If no → return null (fall back to generic executor).
 *   4. If module not in registry → return null.
 *
 * Never throws.
 */
export function resolveModuleExecutor(
  module:     string | null | undefined,
  actionType: string | null | undefined,
): ModuleExecutor | null {
  if (!module || !actionType) return null;

  const key      = module.toLowerCase().trim();
  const executor = MODULE_EXECUTOR_REGISTRY[key];
  if (!executor) return null;

  return executor.canHandle(actionType) ? executor : null;
}
