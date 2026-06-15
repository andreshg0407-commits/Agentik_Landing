/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/execute/route.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 — Copilot execution endpoint.
 * Wires Intent Resolver → Action Runtime → Shopify Provider end-to-end.
 *
 * POST /api/orgs/:orgSlug/marketing-studio/shopify/execute
 *
 * Body: { utterance: string; bypassApproval?: boolean }
 *
 * Response: ExtendedExecutionReport (JSON)
 *
 * Design:
 *   - Resolves Shopify credentials from environment (Phase 1)
 *   - Phase 2: resolve from Vault via tenantId
 *   - All execution is fully auditable (executionId, correlationId, audit trail)
 *   - Approval gate: auto_block by default (bypassApproval only for dev/test)
 *
 * Architecture boundaries:
 *   - This route is the ONLY place that imports ShopifyActionProvider
 *   - The runtime itself remains domain-agnostic
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";

import { intentResolver }            from "@/lib/copilot/intent-resolver";
import {
  ActionDispatcher,
  executeExecutionPlan,
  planFromIntentPlan,
}                                    from "@/lib/copilot/runtime/execution-runtime";
import type { ExecutionContext }      from "@/lib/copilot/runtime/runtime-types";
import { DEFAULT_APPROVAL_GATE_CONFIG } from "@/lib/copilot/runtime/approval-gate";

import { ShopifyActionProvider }     from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-action-provider";
import { envShopifyContextResolver } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";

// ── Singleton dispatcher (module-level, re-used across requests) ───────────────

let _dispatcher: ActionDispatcher | null = null;

function getDispatcher(): ActionDispatcher {
  if (_dispatcher) return _dispatcher;

  const dispatcher = new ActionDispatcher();
  const provider   = new ShopifyActionProvider(
    envShopifyContextResolver({ warnOnMissing: true }),
  );
  dispatcher.registerProvider(provider as Parameters<typeof dispatcher.registerProvider>[0]);
  _dispatcher = dispatcher;
  return dispatcher;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const { orgSlug } = await params;
  let userId: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    userId = access.user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized or org not found" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { utterance?: string; bypassApproval?: boolean; idempotencyKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { utterance, bypassApproval = false, idempotencyKey } = body;

  if (!utterance || typeof utterance !== "string" || utterance.trim().length === 0) {
    return NextResponse.json(
      { error: "utterance is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  // ── Step 1: Intent resolution ────────────────────────────────────────────────
  const resolution = intentResolver.resolve(utterance);

  if (!resolution.matched || !resolution.resolvedIntent) {
    return NextResponse.json({
      matched:  false,
      utterance,
      warnings: resolution.warnings,
      errors:   resolution.errors,
      hint:     "No intent matched. Try rephrasing or check supported actions.",
    }, { status: 422 });
  }

  // ── Step 2: Build execution plan ─────────────────────────────────────────────
  const intentPlan  = intentResolver.buildExecutionPlan(resolution.resolvedIntent);
  const runtimePlan = planFromIntentPlan(intentPlan, { domain: "shopify" });

  // ── Step 3: Build execution context ─────────────────────────────────────────
  const ctx: ExecutionContext = {
    executionId:    crypto.randomUUID(),
    correlationId:  resolution.resolvedIntent.candidateId,
    tenantId:       orgSlug,
    userId:         userId,
    requestedAt:    new Date(),
    idempotencyKey: idempotencyKey,
    metadata: {
      utterance,
      intentSource:   utterance,
      candidateId:    resolution.resolvedIntent.candidateId,
      confidence:     resolution.resolvedIntent.confidence,
    },
  };

  // ── Step 4: Execute ──────────────────────────────────────────────────────────
  const approvalConfig = bypassApproval
    ? { strategy: "auto_approve" as const, gateAutomationEligible: false }
    : DEFAULT_APPROVAL_GATE_CONFIG;

  const report = await executeExecutionPlan(
    runtimePlan,
    ctx,
    getDispatcher(),
    {
      policy:        { stopOnFirstFailure: true, stopOnFirstBlock: false },
      approvalConfig,
    },
  );

  // ── Step 5: Serialize response ────────────────────────────────────────────────
  // Exclude rollback from the public response to keep payload small
  const { rollback, ...publicReport } = report;

  const status =
    report.overallStatus === "completed"         ? 200 :
    report.overallStatus === "awaiting_approval" ? 202 :
    report.overallStatus === "failed"            ? 500 :
    report.overallStatus === "blocked"           ? 422 :
    200;

  return NextResponse.json({
    matched:         true,
    utterance,
    resolvedIntent:  resolution.resolvedIntent,
    plan: {
      title:   runtimePlan.title,
      steps:   runtimePlan.steps.length,
    },
    report:          publicReport,
    rollbackSummary: rollback.summary,
  }, { status });
}
