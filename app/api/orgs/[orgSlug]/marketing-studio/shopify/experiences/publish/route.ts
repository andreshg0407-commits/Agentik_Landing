/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/experiences/publish/route.ts
 *
 * SHOPIFY-EXPERIENCIAS-04 — Publish & History API
 *
 * POST  — Publish an approved landing draft to Shopify.
 * GET   — Get publication history for the org.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  publishLanding,
  checkExistingLanding,
  getPublicationHistory,
} from "@/lib/marketing-studio/commerce/shopify-publish-service";
import { getLandingDraft } from "@/lib/marketing-studio/commerce/shopify-landing-draft-service";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── POST — Publish landing ───────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }    = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId          = organization.id;

    const body = await req.json() as {
      draftId: string;
      mode?:   "update" | "new";
    };

    if (!body.draftId) {
      return NextResponse.json(
        { error: "draftId es requerido." },
        { status: 400 },
      );
    }

    // Validate draft exists and is approved
    const draft = await getLandingDraft(orgId, body.draftId);
    if (!draft) {
      return NextResponse.json(
        { error: "Borrador no encontrado." },
        { status: 404 },
      );
    }

    if (draft.status !== "aprobado") {
      return NextResponse.json(
        { error: "Solo borradores aprobados pueden publicarse." },
        { status: 412 },
      );
    }

    // Check existing
    const existing = await checkExistingLanding(orgId, draft.productId);

    // If existing and no mode specified, return conflict for UI to ask
    if (existing.exists && !body.mode) {
      return NextResponse.json({
        ok:       false,
        conflict: true,
        existing: existing.publication,
        message:  "Ya existe una landing publicada para este producto.",
      }, { status: 409 });
    }

    const result = await publishLanding(
      orgId,
      body.draftId,
      "usuario",
      body.mode ?? "new",
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, durationMs: result.durationMs },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok:          true,
      publication: result.publication,
      durationMs:  result.durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET — Publication history ────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }    = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);

    const history = await getPublicationHistory(organization.id);

    return NextResponse.json({ ok: true, history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
