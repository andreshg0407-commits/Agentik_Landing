/**
 * app/api/integrations/shopify/sync-check/route.ts
 *
 * MS-12 — Shopify Sync Check API
 *
 * POST /api/integrations/shopify/sync-check
 * Body: { orgSlug: string; productId?: string }
 *
 * If productId: reconcile a single product
 * If no productId: reconcile all Shopify-published products in the org
 *
 * Pipeline:
 *   1. Auth + resolve connection
 *   2. Get access token from vault
 *   3. Load ProductPublicationState records (shopify channel)
 *   4. Fetch external state from Shopify
 *   5. Run reconciliation
 *   6. Update ProductSyncState
 *   7. Record audit events
 *   8. Return safe summary
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Token never in response. All queries scoped to organizationId.
 */

import { NextRequest, NextResponse }         from "next/server";
import { requireOrgAccess }                  from "@/lib/auth/org-access";
import { prisma }                            from "@/lib/prisma";
import { getIntegrationConnection }          from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }           from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }              from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                       from "@/lib/integrations/vault/vault-types";
import { fetchShopifyProductState }          from "@/lib/integrations/shopify/shopify-state-fetcher";
import { reconcileShopifyProduct }           from "@/lib/integrations/shopify/shopify-reconciliation";
import type { AgentikProductSnapshot }       from "@/lib/integrations/shopify/shopify-reconciliation";
import { recordIntegrationEvent }            from "@/lib/integrations/integration-repository";

export async function POST(req: NextRequest) {
  try {
    const body      = await req.json() as { orgSlug?: string; productId?: string };
    const orgSlug   = body.orgSlug ?? req.nextUrl.searchParams.get("orgSlug") ?? "";
    const productId = body.productId ?? null;

    const { organization } = await requireOrgAccess(orgSlug);

    // ── Resolve connection ──────────────────────────────────────────────────
    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection) {
      return NextResponse.json({ error: "Shopify not connected" }, { status: 412 });
    }
    assertIntegrationActive(connection, "shopify", organization.id);

    if (!connection.shopDomain) {
      return NextResponse.json({ error: "Connection missing shopDomain" }, { status: 500 });
    }

    // ── Get access token from vault ─────────────────────────────────────────
    const vaultSecret = await getIntegrationSecret({
      organizationId: organization.id,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
    });

    if (!vaultSecret) {
      return NextResponse.json({ error: "Access token not found — reconnect Shopify" }, { status: 412 });
    }

    // ── Load publication states to check ────────────────────────────────────
    const pubStates = await prisma.productPublicationState.findMany({
      where: {
        organizationId:        organization.id,
        channel:               "shopify",
        externalPublicationId: { not: null },
        ...(productId ? { productId } : {}),
      },
      include: {
        product: {
          select: {
            id:           true,
            name:         true,
            sku:          true,
            category:     true,
            updatedAt:    true,
            price:        true,
            variants:     { where: { status: "active" }, select: { id: true } },
            assetLinks:   { select: { id: true } },
          },
        },
      },
      take: 50,  // safety cap — don't reconcile hundreds in one request
    });

    if (pubStates.length === 0) {
      return NextResponse.json({
        message:    "No published Shopify products found to reconcile",
        reconciled: 0,
        results:    [],
      });
    }

    // ── Record sync check start ────────────────────────────────────────────
    await recordIntegrationEvent({
      organizationId: organization.id,
      connectionId:   connection.id,
      provider:       "shopify",
      eventType:      "SYNC_JOB_CREATED",
      payload:        { action: "sync_check", productCount: pubStates.length },
    }).catch(() => {/* fire-and-forget */});

    // ── Reconcile each product ─────────────────────────────────────────────
    const results: Array<{
      productId:    string;
      productName:  string;
      state:        string;
      stateLabel:   string;
      driftCount:   number;
      staleDays:    number | null;
      action:       string;
      fetchError:   string | null;
    }> = [];

    for (const pubState of pubStates) {
      const product = pubState.product;
      if (!product || !pubState.externalPublicationId) continue;

      // Fetch live state from Shopify
      const fetchResult = await fetchShopifyProductState({
        shopDomain:        connection.shopDomain,
        accessToken:       vaultSecret.plainValue,   // ⚠ server-only
        externalProductId: pubState.externalPublicationId,
      });

      // Build Agentik snapshot for reconciliation
      const agentikSnapshot: AgentikProductSnapshot = {
        productId:          product.id,
        organizationId:     organization.id,
        name:               product.name,
        sku:                product.sku,
        category:           product.category,
        updatedAt:          product.updatedAt,
        externalProductId:  pubState.externalPublicationId,
        shopifyHandle:      pubState.shopifyHandle,
        lastSyncAt:         pubState.lastSyncAt,
        externalVariantIds: (pubState.externalVariantIds as Record<string, number> | null),
        variantCount:       product.variants.length,
        imageCount:         product.assetLinks.length,
        price:              product.price ? Number(product.price) : null,
      };

      const report = reconcileShopifyProduct(agentikSnapshot, fetchResult.state);

      // Update ProductSyncState with reconciliation result
      await prisma.productSyncState.upsert({
        where: { productId_channel: { productId: product.id, channel: "shopify" } },
        create: {
          productId:      product.id,
          organizationId: organization.id,
          channel:        "shopify",
          status:         mapReconStateToSyncStatus(report.state),
          lastSyncAt:     new Date(),
          externalId:     pubState.externalPublicationId,
          errorMessage:   fetchResult.error ?? null,
        },
        update: {
          status:      mapReconStateToSyncStatus(report.state),
          lastSyncAt:  new Date(),
          errorMessage: fetchResult.error ?? null,
        },
      });

      // Record product activity for significant findings
      if (report.externalMissing || report.driftFields.some(d => d.severity === "blocking")) {
        await prisma.productActivity.create({
          data: {
            productId:      product.id,
            organizationId: organization.id,
            eventType:      report.externalMissing ? "SHOPIFY_PRODUCT_MISSING" : "SHOPIFY_DRIFT_DETECTED",
            payload: {
              reconState:    report.state,
              driftCount:    report.driftFields.length,
              blockingCount: report.driftFields.filter(d => d.severity === "blocking").length,
              staleDays:     report.staleDays,
            },
            actorLabel: "Sync Check",
          },
        }).catch(() => {/* never block on audit */});
      }

      results.push({
        productId:    product.id,
        productName:  product.name,
        state:        report.state,
        stateLabel:   report.stateLabel,
        driftCount:   report.driftFields.length,
        staleDays:    report.staleDays,
        action:       report.recommendedAction,
        fetchError:   fetchResult.error,
      });
    }

    // ── Record sync check completed ────────────────────────────────────────
    const driftCount = results.filter(r => r.state !== "in_sync" && r.state !== "unknown").length;
    await recordIntegrationEvent({
      organizationId: organization.id,
      connectionId:   connection.id,
      provider:       "shopify",
      eventType:      "SYNC_JOB_COMPLETED",
      payload:        {
        action:      "sync_check",
        reconciled:  results.length,
        driftCount,
        missingCount: results.filter(r => r.state === "missing_external").length,
      },
    }).catch(() => {/* fire-and-forget */});

    return NextResponse.json({
      reconciled:  results.length,
      driftCount,
      inSync:      results.filter(r => r.state === "in_sync").length,
      results,
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function mapReconStateToSyncStatus(reconState: string): string {
  switch (reconState) {
    case "in_sync":          return "synced";
    case "drift_detected":   return "outdated";
    case "external_newer":   return "outdated";
    case "agentik_newer":    return "outdated";
    case "missing_external": return "failed";
    case "conflict":         return "failed";
    default:                 return "pending";
  }
}
