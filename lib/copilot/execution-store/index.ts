/**
 * lib/copilot/execution-store/index.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Public barrel for the execution store layer.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS THE EXECUTION STORE?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The ExecutionStore is the persistence interface for the Agentik Action Runtime.
 * It converts an ephemeral in-memory execution into a durable, auditable record.
 *
 * Architecture:
 *
 *   Action Runtime
 *     │
 *     ▼ ExecutionStore interface          ← THIS MODULE (types + contract)
 *   ├── NoopExecutionStore               no-op / default (tests, cold starts)
 *   └── PrismaExecutionStore             production (PostgreSQL / Neon)
 *
 * The Runtime accepts an ExecutionStore via ExecuteOptions.executionStore.
 * If none is provided, NoopExecutionStore is used — no behaviour change.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   // Production API route
 *   import { createPrismaExecutionStore } from "@/lib/copilot/execution-store";
 *   const report = await executeExecutionPlan(plan, ctx, dispatcher, {
 *     executionStore: createPrismaExecutionStore(),
 *   });
 *
 *   // Test / in-memory
 *   import { noopExecutionStore } from "@/lib/copilot/execution-store";
 *   const report = await executeExecutionPlan(plan, ctx, dispatcher, {
 *     executionStore: noopExecutionStore,
 *   });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  ExecutionSource,
  ApprovalRequestStatus,
  ExecutionRecord,
  ExecutionStepRecord,
  ExecutionEventRecord,
  ApprovalRequestRecord,
  ExecutionStoreCreateInput,
  ExecutionStoreUpdateInput,
  ExecutionStoreStepInput,
  ExecutionStoreEventInput,
  ApprovalRequestCreateInput,
  ApprovalRequestUpdateInput,
  ExecutionStoreQuery,
  IdempotencyCheckResult,
  ExecutionPersistenceSnapshot,
  ExecutionStore,
} from "./execution-store-types";

// ── Sanitizer ─────────────────────────────────────────────────────────────────

export { sanitizeExecutionPayload, sanitizeSnapshot } from "./execution-store-sanitizer";

// ── Implementations ───────────────────────────────────────────────────────────

export { NoopExecutionStore, noopExecutionStore }           from "./noop-execution-store";
export { PrismaExecutionStore, createPrismaExecutionStore } from "./prisma-execution-store";

// ── Query helpers ─────────────────────────────────────────────────────────────

export {
  getRecentExecutions,
  getPendingExecutionApprovals,
  getExecutionDetail,
  getExecutionTimeline,
} from "./execution-store-queries";

// ── Validation ────────────────────────────────────────────────────────────────

export type { ExecutionStoreValidateResult }   from "./execution-store-validate";
export { runExecutionStoreSmokeCheck }         from "./execution-store-validate";
