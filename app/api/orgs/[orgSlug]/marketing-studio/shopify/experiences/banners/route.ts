/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/experiences/banners/route.ts
 *
 * SHOPIFY-BANNERS-PRODUCTION-01 — Banners API
 *
 * GET   — List banner slots with active/draft banners.
 * POST  — Create/update/transition banner drafts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  listBannerSlots,
  createBannerDraft,
  updateBannerDraft,
  submitForReview,
  approveBannerDraft,
  rejectBannerDraft,
  publishBanner,
  scheduleBanner,
  pauseBanner,
  archiveBanner,
  getBannerHistory,
  getBannerDraft,
  getBannerSofiaHints,
  validateCtaUrl,
  getBannerUsageMetrics,
} from "@/lib/marketing-studio/commerce/shopify-banner-service";
import { getShopifyBannerStatus } from "@/lib/marketing-studio/commerce/shopify-banner-publish-service";
import type {
  CreateBannerDraftInput,
  UpdateBannerDraftInput,
} from "@/lib/marketing-studio/commerce/shopify-banner-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }      = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId            = organization.id;

    const slots = await listBannerSlots(orgId);

    return NextResponse.json({ ok: true, slots });
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
      action:   string;
      draftId?: string;
      input?:   CreateBannerDraftInput | UpdateBannerDraftInput;
      inicioAt?: string;
      finAt?:    string | null;
      bannerId?: string;
      limit?:    number;
    };

    const userId = "usuario";

    switch (body.action) {
      case "create": {
        const input = body.input as CreateBannerDraftInput;
        if (!input) return NextResponse.json({ error: "input es requerido." }, { status: 400 });
        const result = await createBannerDraft(orgId, input, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "update": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const input = body.input as UpdateBannerDraftInput;
        if (!input) return NextResponse.json({ error: "input es requerido." }, { status: 400 });
        const result = await updateBannerDraft(orgId, body.draftId, input, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "submit_review": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const result = await submitForReview(orgId, body.draftId, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "approve": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const result = await approveBannerDraft(orgId, body.draftId, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "reject": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const result = await rejectBannerDraft(orgId, body.draftId, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "publish": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const result = await publishBanner(orgId, body.draftId, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "schedule": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        if (!body.inicioAt) return NextResponse.json({ error: "inicioAt es requerido." }, { status: 400 });
        const result = await scheduleBanner(orgId, body.draftId, body.inicioAt, body.finAt ?? null, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "pause": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const result = await pauseBanner(orgId, body.draftId, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "archive": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const result = await archiveBanner(orgId, body.draftId, userId);
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }

      case "history": {
        const history = await getBannerHistory(orgId, body.bannerId, body.limit ?? 50);
        return NextResponse.json({ ok: true, history });
      }

      case "get_draft": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const draft = await getBannerDraft(orgId, body.draftId);
        if (!draft) return NextResponse.json({ error: "Borrador no encontrado." }, { status: 404 });
        const slots = await listBannerSlots(orgId);
        const slot = slots.find(s => s.placement === draft.placement);
        const hints = slot ? getBannerSofiaHints(draft, slot) : [];
        const metrics = await getBannerUsageMetrics(orgId, body.draftId);
        const syncStatus = await getShopifyBannerStatus(body.draftId, draft.placement);
        return NextResponse.json({ ok: true, draft, hints, metrics, syncStatus });
      }

      case "validate_cta": {
        const ctaUrl = (body as Record<string, unknown>).ctaUrl as string | undefined;
        if (!ctaUrl) return NextResponse.json({ ok: true, valid: true });
        const result = validateCtaUrl(ctaUrl);
        return NextResponse.json({ ok: true, ...result });
      }

      case "usage_metrics": {
        if (!body.draftId) return NextResponse.json({ error: "draftId es requerido." }, { status: 400 });
        const metrics = await getBannerUsageMetrics(orgId, body.draftId);
        if (!metrics) return NextResponse.json({ error: "Banner no encontrado." }, { status: 404 });
        return NextResponse.json({ ok: true, metrics });
      }

      default:
        return NextResponse.json(
          { error: "action invalida." },
          { status: 400 },
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
