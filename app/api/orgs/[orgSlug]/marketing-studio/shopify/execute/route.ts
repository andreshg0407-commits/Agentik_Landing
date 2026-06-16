/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/execute/route.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 + SHOPIFY-COPILOT-INTEGRATION-01
 * Copilot execution endpoint — multi-tenant, Vault-backed, fully persisted.
 *
 * POST /api/orgs/:orgSlug/marketing-studio/shopify/execute
 *
 * Body: { utterance: string; bypassApproval?: boolean; idempotencyKey?: string }
 *
 * Response: ExtendedExecutionReport (JSON)
 *
 * Architecture:
 *   - tenantId = organization.id (NOT orgSlug) — stable DB identifier
 *   - Shopify credentials resolved from Vault per tenant
 *   - Returns 409 shopify_not_configured if no active Shopify connection
 *   - bypassApproval guarded — 403 in NODE_ENV=production
 *   - executeExecutionPlan receives PrismaExecutionStore for full audit trail
 */
import "server-only";

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import { createPrismaExecutionStore }   from "@/lib/copilot/execution-store";

import { intentResolver }               from "@/lib/copilot/intent-resolver";
import {
  ActionDispatcher,
  executeExecutionPlan,
  planFromIntentPlan,
}                                       from "@/lib/copilot/runtime/execution-runtime";
import type { ExecutionContext }         from "@/lib/copilot/runtime/runtime-types";
import { DEFAULT_APPROVAL_GATE_CONFIG } from "@/lib/copilot/runtime/approval-gate";

import { ShopifyActionProvider }        from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-action-provider";
import { vaultShopifyContextResolver }  from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";

// ── Dispatcher factory ─────────────────────────────────────────────────────────
// The vault resolver reads credentials per-request via ctx.tenantId,
// so the singleton dispatcher is safe to reuse across requests.

let _dispatcher: ActionDispatcher | null = null;

function getDispatcher(): ActionDispatcher {
  if (_dispatcher) return _dispatcher;
  const dispatcher = new ActionDispatcher();
  const provider   = new ShopifyActionProvider(vaultShopifyContextResolver());
  dispatcher.registerProvider(provider as Parameters<typeof dispatcher.registerProvider>[0]);
  _dispatcher = dispatcher;
  return dispatcher;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { orgSlug } = await params;
  let tenantId: string;
  let userId: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    tenantId = access.organization.id;
    userId   = access.user.email ?? access.user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized or org not found" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
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

  // ── Phase 4: Guard bypassApproval in production ──────────────────────────
  if (bypassApproval && process.env.NODE_ENV === "production") {
    console.warn(
      `[shopify/execute] bypassApproval requested by "${userId}" in production — DENIED.`,
    );
    return NextResponse.json(
      { error: "bypassApproval is not permitted in production environments." },
      { status: 403 },
    );
  }

  // ── Step 1: Intent resolution ────────────────────────────────────────────
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

  // ── Step 2: Build execution plan ─────────────────────────────────────────
  const intentPlan  = intentResolver.buildExecutionPlan(resolution.resolvedIntent);
  const runtimePlan = planFromIntentPlan(intentPlan, { domain: "shopify" });

  // ── Step 3: Build execution context ──────────────────────────────────────
  const ctx: ExecutionContext = {
    executionId:    crypto.randomUUID(),
    correlationId:  resolution.resolvedIntent.candidateId,
    tenantId,
    userId,
    requestedAt:    new Date(),
    idempotencyKey: idempotencyKey,
    metadata: {
      utterance,
      intentSource: utterance,
      candidateId:  resolution.resolvedIntent.candidateId,
      confidence:   resolution.resolvedIntent.confidence,
    },
  };

  // ── Step 4: Validate Shopify connection ───────────────────────────────────
  // Eagerly check vault credentials before spinning up execution.
  // The vault resolver is called again inside executeExecutionPlan, but
  // an upfront check lets us return a clean 409 with a structured error.
  const shopifyCtx = await vaultShopifyContextResolver()(ctx);
  if (!shopifyCtx) {
    return NextResponse.json({
      status:    "shopify_not_configured",
      tenantId,
      error:     "No active Shopify connection found for this organization. " +
                 "Configure the Shopify integration before executing Copilot actions.",
      hint:      "POST /api/orgs/:orgSlug/marketing-studio/shopify/connection to register credentials.",
    }, { status: 409 });
  }

  // ── Step 5: Execute ───────────────────────────────────────────────────────
  const approvalConfig = bypassApproval
    ? { strategy: "auto_approve" as const, gateAutomationEligible: false }
    : DEFAULT_APPROVAL_GATE_CONFIG;

  const report = await executeExecutionPlan(
    runtimePlan,
    ctx,
    getDispatcher(),
    {
      policy:         { stopOnFirstFailure: true, stopOnFirstBlock: false },
      approvalConfig,
      executionStore: createPrismaExecutionStore(),
      executionSource: "api",
      executionMode:   "copilot",
    },
  );

  // ── Step 6: Serialize response ────────────────────────────────────────────
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
