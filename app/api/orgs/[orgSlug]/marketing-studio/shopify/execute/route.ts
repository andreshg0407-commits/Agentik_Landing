/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/execute/route.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 + SHOPIFY-COPILOT-INTEGRATION-POLISH-01
 * Copilot execution endpoint — multi-tenant, single Vault resolution, fully persisted.
 *
 * POST /api/orgs/:orgSlug/marketing-studio/shopify/execute
 *
 * Body: { utterance: string; bypassApproval?: boolean; idempotencyKey?: string }
 *
 * Vault resolution strategy (POLISH-01):
 *   - ShopifyContext is resolved ONCE per request via vaultShopifyContextResolver()
 *   - If null → 409 shopify_not_configured (never proceeds)
 *   - A per-request ShopifyActionProvider is created with staticShopifyContextResolver(shopifyCtx)
 *   - executeExecutionPlan never hits the Vault again for this request
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
import {
  vaultShopifyContextResolver,
  staticShopifyContextResolver,
}                                       from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";

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

  // ── Guard: bypassApproval blocked in production ──────────────────────────
  if (bypassApproval && process.env.NODE_ENV === "production") {
    console.warn(
      `[shopify/execute] bypassApproval requested by "${userId}" in production — DENIED.`,
    );
    return NextResponse.json(
      { error: "bypassApproval is not permitted in production environments." },
      { status: 403 },
    );
  }

  // ── Single Vault resolution (POLISH-01) ───────────────────────────────────
  // Resolve ShopifyContext once. If successful, the per-request provider uses
  // staticShopifyContextResolver(shopifyCtx) — Vault is never called again.
  const probeCtx = { tenantId, executionId: "", correlationId: "", userId, requestedAt: new Date() };
  const shopifyCtx = await vaultShopifyContextResolver()(probeCtx);

  if (!shopifyCtx) {
    return NextResponse.json({
      status:   "shopify_not_configured",
      tenantId,
      error:    "No active Shopify connection found for this organization. " +
                "Configure the Shopify integration before executing Copilot actions.",
      hint:     "GET  /api/orgs/:orgSlug/marketing-studio/shopify/connection for status.\n" +
                "POST /api/orgs/:orgSlug/marketing-studio/shopify/connection to register credentials.",
    }, { status: 409 });
  }

  // ── Intent resolution ─────────────────────────────────────────────────────
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

  // ── Build execution plan ──────────────────────────────────────────────────
  const intentPlan  = intentResolver.buildExecutionPlan(resolution.resolvedIntent);
  const runtimePlan = planFromIntentPlan(intentPlan, { domain: "shopify" });

  // ── Build execution context ───────────────────────────────────────────────
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

  // ── Per-request dispatcher (pre-resolved context, no second Vault call) ───
  const provider   = new ShopifyActionProvider(staticShopifyContextResolver(shopifyCtx));
  const dispatcher = new ActionDispatcher();
  dispatcher.registerProvider(provider as Parameters<typeof dispatcher.registerProvider>[0]);

  // ── Execute ───────────────────────────────────────────────────────────────
  const approvalConfig = bypassApproval
    ? { strategy: "auto_approve" as const, gateAutomationEligible: false }
    : DEFAULT_APPROVAL_GATE_CONFIG;

  const report = await executeExecutionPlan(
    runtimePlan,
    ctx,
    dispatcher,
    {
      policy:          { stopOnFirstFailure: true, stopOnFirstBlock: false },
      approvalConfig,
      executionStore:  createPrismaExecutionStore(),
      executionSource: "api",
      executionMode:   "copilot",
    },
  );

  // ── Serialize response ────────────────────────────────────────────────────
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
