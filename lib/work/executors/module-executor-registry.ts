/**
 * lib/work/executors/module-executor-registry.ts
 *
 * Agentik — Module Executor Registry
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * SERVER-ONLY — imports server-only executor singletons.
 *
 * Maps domain module keys → ModuleExecutor instances.
 * Includes module aliases so "tesoreria", "conciliacion", "cierre"
 * all route to financeExecutor.
 */
import "server-only";

import type { ModuleExecutor } from "./module-executor-contract";
import { financeExecutor }     from "./finance-executor";
import { collectionsExecutor } from "./collections-executor";
import { commercialExecutor }  from "./commercial-executor";
import { marketingExecutor }   from "./marketing-executor";

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Maps every module key (and alias) to its domain executor.
 * Finance has several surface names that all resolve to the same executor.
 */
export const MODULE_EXECUTOR_REGISTRY: Record<string, ModuleExecutor> = {
  // Finance module + aliases
  finanzas:      financeExecutor,
  tesoreria:     financeExecutor,
  conciliacion:  financeExecutor,
  cierre:        financeExecutor,
  planeacion:    financeExecutor,

  // Collections module
  cobranza:      collectionsExecutor,
  collections:   collectionsExecutor,

  // Commercial module
  comercial:     commercialExecutor,
  commercial:    commercialExecutor,

  // Marketing module
  marketing:     marketingExecutor,
};

// ── Helper: list all registered modules (deduped by executor instance) ────────

export function getRegisteredModules(): string[] {
  return Object.keys(MODULE_EXECUTOR_REGISTRY);
}
