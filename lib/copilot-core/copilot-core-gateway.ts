/**
 * lib/copilot-core/copilot-core-gateway.ts
 *
 * Copilot Core — Capability Gateway
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Single entry point for copilot capability execution.
 *
 * The gateway owns a CLOSED adapter registry via an exhaustive switch.
 * No injectable handlers — the caller cannot pass functions.
 * Capability A cannot execute adapter B (confused-deputy prevention).
 *
 * Pipeline:
 *   1. Resolve adapter from private switch (unknown = fail closed)
 *   2. Authorize via copilot-core-authz
 *   3. Validate arguments
 *   4. Apply scope server-side
 *   5. Execute adapter
 *   6. Redact output
 *   7. Attach FactRef[]
 *   8. Sanitized audit log
 *   9. Return result
 */

import "server-only";

import { authorizeCopilotCapability } from "./copilot-core-authz";
import { getCapability } from "./copilot-core-capability-registry";
import type {
  CopilotEnvelope,
  CopilotCapability,
  AuthorizationResult,
  DenialReason,
  CopilotAnswer,
  TruthState,
  FactRef,
} from "./copilot-core-types";

// ── Adapter Contract ─────────────────────────────────────────────────────────

/**
 * Context passed to each adapter. All fields are server-derived.
 * The adapter MUST use ctx.envelope for scope decisions — never
 * accept scope from its arguments.
 */
export interface CopilotAdapterContext {
  readonly envelope: CopilotEnvelope;
  readonly capability: CopilotCapability;
  readonly authResult: AuthorizationResult;
  readonly validatedArguments: Record<string, unknown>;
}

/**
 * Result returned by each adapter.
 * data is a redacted aggregated DTO — never raw Prisma models.
 */
export interface CopilotAdapterResult {
  readonly data: unknown;
  readonly facts: readonly FactRef[];
  readonly truthState: TruthState;
  readonly redactedFields: readonly string[];
}

/**
 * Adapter interface. Each adapter is statically imported and
 * bound to exactly one capabilityId.
 */
export interface CopilotAdapter {
  readonly capabilityId: string;
  execute(ctx: CopilotAdapterContext): Promise<CopilotAdapterResult>;
}

/**
 * Result of executeCopilotCapability().
 */
export interface CopilotCapabilityResult {
  readonly allowed: boolean;
  readonly denialReason: DenialReason | null;
  readonly answer: CopilotAnswer | null;
  readonly data: unknown;
  readonly durationMs: number;
}

// ── Adapter Imports (statically bound) ────────────────────────────────────────

import { customersAdapter } from "./adapters/customers-adapter";
import { ordersAdapter } from "./adapters/orders-adapter";
import { salesAdapter } from "./adapters/sales-adapter";

// ── Private Adapter Registry ─────────────────────────────────────────────────

/**
 * Private adapter resolver. NOT exported.
 *
 * Uses exhaustive switch — no Map, no add/set/delete mutation API.
 * Unknown capability returns null → fail closed.
 *
 * 01C: 3 capabilities. seller.portfolio.read is DEFERRED (semantically
 * seller-scoped, inappropriate for manager-only MVP).
 */
function resolveCopilotAdapter(capabilityId: string): CopilotAdapter | null {
  switch (capabilityId) {
    case "commercial.customers.summary.read":
      return customersAdapter;
    case "commercial.orders.summary.read":
      return ordersAdapter;
    case "commercial.sales.performance.read":
      return salesAdapter;
    default:
      return null; // fail closed
  }
}

// ── Gateway ──────────────────────────────────────────────────────────────────

/**
 * Execute a copilot capability through the full authorization pipeline.
 *
 * The caller cannot inject a handler function — the gateway resolves
 * the adapter from its private registry.
 *
 * @param params.envelope - Server-built CopilotEnvelope
 * @param params.capabilityId - Capability to execute
 * @param params.validatedArguments - Schema-validated arguments (no functions)
 */
export async function executeCopilotCapability(params: {
  envelope: CopilotEnvelope;
  capabilityId: string;
  validatedArguments: Record<string, unknown>;
}): Promise<CopilotCapabilityResult> {
  const start = Date.now();
  const { envelope, capabilityId, validatedArguments } = params;

  // Reject function values in arguments (confused-deputy prevention)
  for (const [key, value] of Object.entries(validatedArguments)) {
    if (typeof value === "function") {
      return makeDenial("UNKNOWN_CAPABILITY", capabilityId, start);
    }
  }

  // Step 1: Resolve adapter from private registry
  const adapter = resolveCopilotAdapter(capabilityId);
  if (!adapter) {
    auditLog(envelope, capabilityId, "DENIED", "UNKNOWN_CAPABILITY", start);
    return makeDenial("UNKNOWN_CAPABILITY", capabilityId, start);
  }

  // Verify adapter matches requested capability (confused-deputy check)
  if (adapter.capabilityId !== capabilityId) {
    auditLog(envelope, capabilityId, "DENIED", "UNKNOWN_CAPABILITY", start);
    return makeDenial("UNKNOWN_CAPABILITY", capabilityId, start);
  }

  // Step 2: Resolve capability definition
  const capability = getCapability(capabilityId);
  if (!capability) {
    auditLog(envelope, capabilityId, "DENIED", "UNKNOWN_CAPABILITY", start);
    return makeDenial("UNKNOWN_CAPABILITY", capabilityId, start);
  }

  // Step 3: Authorize (authz reads scope from envelope.requestedResourceScope)
  const authResult = authorizeCopilotCapability(envelope, capabilityId);

  if (!authResult.allowed) {
    auditLog(envelope, capabilityId, "DENIED", authResult.denialReason, start);
    return {
      allowed: false,
      denialReason: authResult.denialReason,
      answer: null,
      data: null,
      durationMs: Date.now() - start,
    };
  }

  // Step 4: Execute adapter
  try {
    const ctx: CopilotAdapterContext = {
      envelope,
      capability,
      authResult,
      validatedArguments,
    };

    const result = await adapter.execute(ctx);

    // Step 5: Build answer
    const answer: CopilotAnswer = {
      answerId: crypto.randomUUID(),
      text: "", // filled by mock responder or LLM in later phases
      truthState: result.truthState,
      asOf: new Date().toISOString(),
      facts: [...result.facts],
      warnings: [],
      capabilityId,
      organizationId: envelope.organizationId,
      requestId: envelope.requestId,
    };

    auditLog(envelope, capabilityId, "ALLOWED", null, start);

    return {
      allowed: true,
      denialReason: null,
      answer,
      data: result.data,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    // Wrap exceptions — never leak stack traces
    auditLog(envelope, capabilityId, "ERROR", null, start);
    return {
      allowed: true,
      denialReason: null,
      answer: {
        answerId: crypto.randomUUID(),
        text: "Error processing request",
        truthState: "DATA_UNVERIFIED",
        asOf: new Date().toISOString(),
        facts: [],
        warnings: [{ code: "TRUTH_DEGRADED", message: "Internal error" }],
        capabilityId,
        organizationId: envelope.organizationId,
        requestId: envelope.requestId,
      },
      data: null,
      durationMs: Date.now() - start,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDenial(
  reason: DenialReason,
  capabilityId: string,
  start: number,
): CopilotCapabilityResult {
  return {
    allowed: false,
    denialReason: reason,
    answer: null,
    data: null,
    durationMs: Date.now() - start,
  };
}

/**
 * Sanitized audit log. Only technical metadata — never message, prompt,
 * DTO, response, or PII. Zero Prisma writes.
 */
function auditLog(
  envelope: CopilotEnvelope,
  capabilityId: string,
  result: "ALLOWED" | "DENIED" | "ERROR",
  denialReason: DenialReason | null,
  start: number,
): void {
  const level = result === "ALLOWED" ? "info" : "warn";
  console[level]("[copilot-gateway]", {
    requestId: envelope.requestId,
    organizationId: envelope.organizationId,
    capabilityId,
    result,
    denialReason,
    durationMs: Date.now() - start,
  });
}
