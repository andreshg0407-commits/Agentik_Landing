/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/experiences/sync/route.ts
 *
 * SHOPIFY-EXPERIENCIAS-06 — Biblioteca Sync API
 *
 * POST — Trigger sync for a product or reference.
 * GET  — Get sync summary (last sync time, readiness counts, recent changes).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  syncProductAssets,
  syncReferenceAssets,
  syncCatalog,
  handleBibliotecaSyncEvent,
  buildSyncSummary,
  getAssetUsage,
  buildSyncCopilotSignals,
} from "@/lib/marketing-studio/commerce/shopify-biblioteca-sync";
import type { BibliotecaSyncEvent } from "@/lib/marketing-studio/commerce/shopify-biblioteca-sync-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }      = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId            = organization.id;

    const summary = await buildSyncSummary(orgId);

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }      = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId            = organization.id;

    const body = await req.json() as {
      action:       "sync_product" | "sync_reference" | "sync_catalog" | "sync_event" | "asset_usage";
      productId?:   string;
      referenceId?: string | null;
      sku?:         string | null;
      assetId?:     string;
      event?:       BibliotecaSyncEvent;
    };

    switch (body.action) {
      case "sync_catalog": {
        const result = await syncCatalog(orgId);
        const signals = buildSyncCopilotSignals(result.stateChanges);
        return NextResponse.json({ ok: true, result, signals });
      }

      case "sync_product": {
        if (!body.productId) {
          return NextResponse.json(
            { error: "productId es requerido para sync_product." },
            { status: 400 },
          );
        }
        const result = await syncProductAssets(orgId, body.productId);
        const signals = buildSyncCopilotSignals(result.stateChanges);
        return NextResponse.json({ ok: true, result, signals });
      }

      case "sync_reference": {
        if (!body.referenceId && !body.sku) {
          return NextResponse.json(
            { error: "referenceId o sku es requerido para sync_reference." },
            { status: 400 },
          );
        }
        const result = await syncReferenceAssets(
          orgId,
          body.referenceId ?? null,
          body.sku ?? null,
        );
        const signals = buildSyncCopilotSignals(result.stateChanges);
        return NextResponse.json({ ok: true, result, signals });
      }

      case "sync_event": {
        if (!body.event) {
          return NextResponse.json(
            { error: "event es requerido para sync_event." },
            { status: 400 },
          );
        }
        const result = await handleBibliotecaSyncEvent({
          ...body.event,
          tenantId: orgId,
        });
        const signals = buildSyncCopilotSignals(result.stateChanges);
        return NextResponse.json({ ok: true, result, signals });
      }

      case "asset_usage": {
        if (!body.assetId) {
          return NextResponse.json(
            { error: "assetId es requerido para asset_usage." },
            { status: 400 },
          );
        }
        const usage = await getAssetUsage(orgId, body.assetId);
        return NextResponse.json({ ok: true, usage });
      }

      default:
        return NextResponse.json(
          { error: "action invalida. Usa: sync_catalog, sync_product, sync_reference, sync_event, asset_usage." },
          { status: 400 },
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
