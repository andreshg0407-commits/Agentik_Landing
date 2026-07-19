/**
 * lib/agent-runtime/execution-store-provider.ts
 *
 * Agentik Runtime — Execution Store Provider
 *
 * Resolves which execution session store backend to use.
 * The kernel NEVER knows which store is active.
 *
 * Mode     | Env var value         | Backing store
 * -------- | --------------------- | ----------------------------------
 * memory   | (default / "memory")  | InMemoryExecutionSessionStore
 * prisma   | "prisma"              | PrismaExecutionStore
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-DURABILITY-01
 */

import { setExecutionSessionAdapter } from "./execution-session-store";

// ── Store mode ────────────────────────────────────────────────────────────────

export type StoreMode = "memory" | "prisma";

let _initialized = false;
let _storeMode:   StoreMode = "memory";

export function getStoreMode(): StoreMode {
  return _storeMode;
}

// ── Initializer ───────────────────────────────────────────────────────────────

/**
 * Reads AGENTIK_RUNTIME_STORE, installs the matching adapter.
 * Idempotent — safe to call multiple times.
 */
export function initializeExecutionStore(): void {
  if (_initialized) return;
  _initialized = true;

  const raw  = process.env.AGENTIK_RUNTIME_STORE ?? "memory";
  _storeMode = raw.toLowerCase() === "prisma" ? "prisma" : "memory";

  if (_storeMode === "prisma") {
    // Lazy require so Prisma is never bundled when running in memory mode
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaExecutionStore } = require("./prisma-execution-store") as {
      PrismaExecutionStore: new () => import("./execution-session-store").ExecutionSessionAdapter;
    };
    setExecutionSessionAdapter(new PrismaExecutionStore());

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[AgentRuntime] ExecutionStore: prisma mode activated");
    }
  } else {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[AgentRuntime] ExecutionStore: memory mode (default)");
    }
  }
}

/**
 * Resets the provider state. FOR TESTS ONLY — never call in production.
 */
export function _resetStoreProviderForTests(): void {
  _initialized = false;
  _storeMode   = "memory";
}
