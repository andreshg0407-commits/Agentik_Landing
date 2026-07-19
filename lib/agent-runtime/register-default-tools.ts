/**
 * lib/agent-runtime/register-default-tools.ts
 *
 * Agentik Runtime Tool Execution Kernel — Default Tool Bootstrap
 *
 * Registers all V1 tool handlers into the handler registry.
 * Call this at module initialization before any execution.
 *
 * Pattern: registerToolHandler() for each tool that has a real handler.
 * Tools without a registered handler will be rejected by the guard.
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import { registerToolHandler } from "./tool-handler-registry";
import { createProductionRequestDraftHandler } from "@/lib/comercial/maletas/tools/create-production-request-draft";

let _initialized = false;

export function registerDefaultTools(): void {
  if (_initialized) return; // Idempotent — safe to call multiple times
  _initialized = true;

  // ── Commercial: Create Production Request Draft ──────────────────────────
  // V1: Real handler — creates a safe draft without SAG writes.
  registerToolHandler({
    toolId:        "commercial.createProductionRequestDraft",
    domain:        "commercial",
    description:   "Creates a structured draft production request for David. Safe — no SAG write.",
    executionMode: "supervised",
    policy: {
      requiresApproval:   true,
      requiredPermission: "write",
      allowedAgents:      ["david_commercial"],
      allowedModules:     [],           // any module is fine
      maxRetries:         0,
      timeoutMs:          5_000,
      idempotencyKey:     "action+tool", // prevent duplicate execution
    },
    execute: createProductionRequestDraftHandler,
  });

  // ── Stubs: declared but no real handler yet ──────────────────────────────
  // These will be rejected by the guard (HANDLER_NOT_FOUND) if invoked.
  // Register when real handlers are ready.

  // commercial.markReferenceAsPaused — stub, not registered yet
  // commercial.triggerReplenishmentAlert — stub, not registered yet
  // collections.createFollowupAction — stub, not registered yet
  // finance.reconcilePaymentCandidate — stub, not registered yet
  // marketing.createCreativeTask — stub, not registered yet
}
