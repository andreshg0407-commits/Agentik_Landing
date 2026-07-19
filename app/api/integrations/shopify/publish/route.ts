/**
 * app/api/integrations/shopify/publish/route.ts
 *
 * MS-11 — Shopify Publish API Route
 *
 * POST /api/integrations/shopify/publish
 * Body: { orgSlug: string; productId: string }
 *
 * Pipeline:
 *   1. Authenticate operator
 *   2. Resolve org + connection
 *   3. Assert connection is active
 *   4. Retrieve access token from vault (server-side only)
 *   5. Create CommerceJob record
 *   6. Execute runSingleShopifyJob() synchronously
 *   7. Return safe result (no token, no secret)
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Access token retrieved from vault — NEVER sent to client.
 *   Response body contains only safe publication metadata.
 *   All DB operations scoped to organizationId.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  getIntegrationConnection,
}                                    from "@/lib/integrations/integration-repository";
import {
  createShopifyPublicationJob,
}                                    from "@/lib/integrations/integration-repository";
import {
  assertIntegrationActive,
}                                    from "@/lib/integrations/integration-runtime";
import {
  getIntegrationSecret,
}                                    from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }               from "@/lib/integrations/vault/vault-types";
import { runSingleShopifyJob }       from "@/lib/integrations/shopify/shopify-job-runner";

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  let orgContext: Awaited<ReturnType<typeof requireOrgAccess>>;
  try {
    const body     = await req.json() as { orgSlug?: string; productId?: string };
    const orgSlug  = body.orgSlug ?? req.nextUrl.searchParams.get("orgSlug") ?? "";
    orgContext      = await requireOrgAccess(orgSlug);

    const { organization } = orgContext;
    const productId = body.productId;

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }

    // ── 2. Resolve Shopify connection ────────────────────────────────────────
    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify is not connected. Connect your store first." },
        { status: 412 },
      );
    }

    // ── 3. Assert active connection ──────────────────────────────────────────
    assertIntegrationActive(connection, "shopify", organization.id);

    if (!connection.shopDomain) {
      return NextResponse.json(
        { error: "Connection is missing shopDomain" },
        { status: 500 },
      );
    }

    // ── 4. Retrieve access token from vault (server-only) ────────────────────
    const vaultSecret = await getIntegrationSecret({
      organizationId: organization.id,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
    });

    if (!vaultSecret) {
      return NextResponse.json(
        { error: "Access token not found — please reconnect your Shopify store." },
        { status: 412 },
      );
    }

    // ── 5. Create CommerceJob record ─────────────────────────────────────────
    const job = await createShopifyPublicationJob({
      organizationId: organization.id,
      productId,
      connectionId:   connection.id,
      payload:        { trigger: "manual", productId },
    });

    // ── 6. Execute synchronously ─────────────────────────────────────────────
    const result = await runSingleShopifyJob({
      jobId:          job.id,
      organizationId: organization.id,
      accessToken:    vaultSecret.plainValue,   // ⚠ server-only — never forwarded
      shopDomain:     connection.shopDomain,
    });

    // ── 7. Return safe result ────────────────────────────────────────────────
    return NextResponse.json({
      success:          result.success,
      jobId:            result.jobId,
      shopifyProductId: result.publishResult?.shopifyProductId ?? null,
      shopifyHandle:    result.publishResult?.shopifyHandle ?? null,
      adminUrl:         result.publishResult?.adminUrl ?? null,
      variantCount:     result.publishResult?.variantCount ?? 0,
      imageCount:       result.publishResult?.imageCount ?? 0,
      warnings:         result.publishResult?.warnings ?? [],
      canRetry:         result.canRetry,
      nextRetryAt:      result.nextRetryAt?.toISOString() ?? null,
      errorMessage:     result.errorMessage,
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;

    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
