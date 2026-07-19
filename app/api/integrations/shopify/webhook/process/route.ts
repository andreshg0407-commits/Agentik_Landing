/**
 * app/api/integrations/shopify/webhook/process/route.ts
 *
 * MS-12 — Shopify Webhook Batch Process API
 *
 * POST /api/integrations/shopify/webhook/process
 * Body: { orgSlug: string; limit?: number }
 *
 * Processes pending Shopify webhook events for the organization.
 * Returns a safe summary — no tokens, no secrets.
 */

import { NextRequest, NextResponse }        from "next/server";
import { requireOrgAccess }                  from "@/lib/auth/org-access";
import { processPendingShopifyWebhooks }     from "@/lib/integrations/shopify/shopify-webhook-processor";

export async function POST(req: NextRequest) {
  try {
    const body    = await req.json() as { orgSlug?: string; limit?: number };
    const orgSlug = body.orgSlug ?? req.nextUrl.searchParams.get("orgSlug") ?? "";
    const limit   = typeof body.limit === "number" ? Math.min(body.limit, 100) : 50;

    const { organization } = await requireOrgAccess(orgSlug);

    const result = await processPendingShopifyWebhooks(organization.id, limit);

    return NextResponse.json({
      processed:  result.processed,
      failed:     result.failed,
      skipped:    result.skipped,
      errorCount: result.errors.length,
      // Only expose safe error summaries — no payload data
      errors: result.errors.map(e => ({
        webhookId: e.webhookId,
        error:     e.error.slice(0, 200),
      })),
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
