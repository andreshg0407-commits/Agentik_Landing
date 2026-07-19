/**
 * lib/agent-runtime/runtime-bootstrap.ts
 *
 * Agentik Runtime Bootstrap
 *
 * Idempotent boot sequence for the agent runtime.
 * Safe to call per-request — no-ops after first successful run.
 *
 * Sequence:
 *   1. initializeExecutionStore()       — picks memory or prisma adapter
 *   2. recoverInterruptedExecutions()   — heal zombie sessions (prisma mode only)
 *   3. emit execution.store_bootstrap   — audit event for observability
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-DURABILITY-01
 */

import { initializeExecutionStore, getStoreMode } from "./execution-store-provider";
import { recoverInterruptedExecutions, getLastRecoveryReport } from "./runtime-recovery";
import { emitAgentRuntimeEvent } from "./runtime-events";
import type { RuntimeEvent }    from "./runtime-events";

let _bootstrapped = false;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Boot the runtime. Idempotent — safe to call from every route handler.
 * Awaiting is optional for most callers; the session store is synchronously
 * ready after initializeExecutionStore() returns.
 */
export async function bootstrapRuntime(): Promise<void> {
  if (_bootstrapped) return;
  _bootstrapped = true;

  // STEP 1 — Store adapter (synchronous, always safe)
  initializeExecutionStore();

  // STEP 2 — Session recovery (async, prisma mode only)
  if (getStoreMode() === "prisma") {
    try {
      await recoverInterruptedExecutions();
    } catch (err) {
      // Recovery failure must never block serving requests
      console.error("[RuntimeBootstrap] Recovery failed:", err);
    }
  }

  // STEP 3 — Emit boot event for observability
  const recovery = getLastRecoveryReport();
  try {
    emitAgentRuntimeEvent<RuntimeEvent>({
      type:           "execution.store_bootstrap",
      organizationId: "system",
      agentId:        "system" as import("./agent-types").AgentRuntimeId,
      domain:         "commercial" as import("./agent-types").AgentDomain,
      moduleKey:      "runtime",
      metadata: {
        storeMode:      getStoreMode(),
        recovered:      recovery?.recovered     ?? 0,
        zombies:        recovery?.zombiesMarked ?? 0,
        leasesExpired:  recovery?.leasesExpired ?? 0,
        bootstrappedAt: new Date().toISOString(),
      },
    });
  } catch { /* best-effort */ }

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log(
      `[AgentRuntime] bootstrapRuntime complete | store=${getStoreMode()}` +
      ` | recovered=${recovery?.recovered ?? 0}` +
      ` | zombies=${recovery?.zombiesMarked ?? 0}`,
    );
  }
}

export function isRuntimeBootstrapped(): boolean {
  return _bootstrapped;
}

/**
 * Resets bootstrap state. FOR TESTS ONLY.
 */
export function _resetBootstrapForTests(): void {
  _bootstrapped = false;
}
