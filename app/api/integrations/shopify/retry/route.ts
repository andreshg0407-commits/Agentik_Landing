/**
 * app/api/integrations/shopify/retry/route.ts
 *
 * MS-11 — Shopify Retry API Route
 *
 * POST /api/integrations/shopify/retry
 * Body: { orgSlug: string; jobId: string }
 *
 * Re-executes a failed CommerceJob, incrementing retryCount.
 * Enforces MAX_PUBLICATION_RETRIES cap before executing.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Same vault token retrieval pattern as publish route.
 *   Response body contains only safe metadata.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { prisma }                     from "@/lib/prisma";
import { getIntegrationConnectionById } from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }    from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }       from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                from "@/lib/integrations/vault/vault-types";
import { runSingleShopifyJob }        from "@/lib/integrations/shopify/shopify-job-runner";
import { MAX_PUBLICATION_RETRIES }    from "@/lib/marketing-studio/commerce/publication-state";

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json() as { orgSlug?: string; jobId?: string };
    const orgSlug = body.orgSlug ?? req.nextUrl.searchParams.get("orgSlug") ?? "";
    const { organization } = await requireOrgAccess(orgSlug);

    const jobId = body.jobId;
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    // ── Load job ─────────────────────────────────────────────────────────────
    const job = await prisma.commerceJob.findFirst({
      where: { id: jobId, organizationId: organization.id },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // ── Enforce retry cap ─────────────────────────────────────────────────────
    if (job.retryCount >= MAX_PUBLICATION_RETRIES) {
      return NextResponse.json(
        { error: `Maximum retries reached (${MAX_PUBLICATION_RETRIES}). Publication failed permanently.` },
        { status: 422 },
      );
    }

    // ── Assert still in a retryable state ─────────────────────────────────────
    if (job.status !== "failed" && job.status !== "pending") {
      return NextResponse.json(
        { error: `Job cannot be retried in state: ${job.status}` },
        { status: 409 },
      );
    }

    // ── Resolve connection ────────────────────────────────────────────────────
    if (!job.connectionId) {
      return NextResponse.json({ error: "Job has no integration connection" }, { status: 412 });
    }
    const connection = await getIntegrationConnectionById(job.connectionId, organization.id);
    if (!connection) {
      return NextResponse.json({ error: "Integration connection not found" }, { status: 412 });
    }

    assertIntegrationActive(connection, "shopify", organization.id);

    if (!connection.shopDomain) {
      return NextResponse.json({ error: "Connection is missing shopDomain" }, { status: 500 });
    }

    // ── Retrieve access token (server-only) ───────────────────────────────────
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

    // ── Reset job to pending for re-execution ─────────────────────────────────
    await prisma.commerceJob.updateMany({
      where: { id: jobId, organizationId: organization.id },
      data:  {
        status:     "pending",
        lastError:  null,
        startedAt:  null,
        completedAt: null,
      },
    });

    // ── Execute ───────────────────────────────────────────────────────────────
    const result = await runSingleShopifyJob({
      jobId,
      organizationId: organization.id,
      accessToken:    vaultSecret.plainValue,   // ⚠ server-only
      shopDomain:     connection.shopDomain,
    });

    return NextResponse.json({
      success:          result.success,
      jobId:            result.jobId,
      retryCount:       result.retryCount,
      shopifyProductId: result.publishResult?.shopifyProductId ?? null,
      shopifyHandle:    result.publishResult?.shopifyHandle ?? null,
      adminUrl:         result.publishResult?.adminUrl ?? null,
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
