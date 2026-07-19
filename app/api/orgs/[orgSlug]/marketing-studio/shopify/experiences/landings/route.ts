/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/experiences/landings/route.ts
 *
 * SHOPIFY-EXPERIENCIAS-02 — Landing Draft API
 *
 * POST  — Generate a landing draft for a product.
 * GET   — List all landing drafts for the org.
 * PATCH — Update a draft (status transitions).
 *
 * Does NOT publish to Shopify.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { getLandingProducts }        from "@/lib/marketing-studio/commerce/shopify-experiences-service";
import { generateLandingDraft }      from "@/lib/marketing-studio/commerce/shopify-landing-generator";
import {
  createLandingDraft,
  listLandingDrafts,
  updateLandingDraft,
}                                     from "@/lib/marketing-studio/commerce/shopify-landing-draft-service";
import { EXPERIENCE_TEMPLATES }       from "@/lib/marketing-studio/commerce/shopify-experiences-templates";
import type { GenerationRules }       from "@/lib/marketing-studio/commerce/shopify-experiences-types";
import type {
  LandingDraftGenerationInput,
  LandingDraftBlock,
  LandingDraftStatus,
} from "@/lib/marketing-studio/commerce/shopify-landing-draft-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── POST — Generate landing draft ────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }    = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId          = organization.id;

    const body = await req.json() as {
      productId:       string;
      templateId:      string;
      generationRules?: GenerationRules;
      tenantPreset?:   string;
    };

    if (!body.productId || !body.templateId) {
      return NextResponse.json(
        { error: "productId y templateId son requeridos." },
        { status: 400 },
      );
    }

    // Validate template
    const template = EXPERIENCE_TEMPLATES.find(t => t.id === body.templateId);
    if (!template) {
      return NextResponse.json(
        { error: `Plantilla no encontrada: ${body.templateId}` },
        { status: 400 },
      );
    }

    // Load product data
    const products = await getLandingProducts(orgId);
    const product  = products.find(p => p.productId === body.productId);
    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado en el catalogo." },
        { status: 404 },
      );
    }

    // Check minimum readiness
    if (product.biblioteca.fotosAprobadas === 0) {
      return NextResponse.json(
        { error: "El producto no tiene fotografias aprobadas. Agrega recursos en Biblioteca." },
        { status: 412 },
      );
    }

    // Build generation input
    // Photo/video URLs are placeholder references — real URLs resolved at publish time
    const photoUrls = Array.from(
      { length: product.biblioteca.fotosAprobadas },
      (_, i) => `biblioteca://${product.productId}/foto/${i}`,
    );
    const videoUrl = product.biblioteca.videosAprobados > 0
      ? `biblioteca://${product.productId}/video/0`
      : null;

    const input: LandingDraftGenerationInput = {
      productId:       product.productId,
      productName:     product.nombre,
      sku:             product.sku,
      price:           product.precio,
      collection:      product.coleccion,
      shopifyUrl:      product.shopifyUrl,
      templateId:      body.templateId,
      photoUrls,
      videoUrl,
      bannerUrl:       null,
      generationRules: body.generationRules ?? {},
      tenantPreset:    body.tenantPreset ?? null,
      orgId,
      createdBy:       "usuario",
    };

    // Generate draft structure
    const result = generateLandingDraft(input);
    if (!result.ok || !result.draft) {
      return NextResponse.json(
        { error: result.error ?? "Error al generar el borrador." },
        { status: 500 },
      );
    }

    // Persist draft
    const saved = await createLandingDraft(orgId, result.draft);

    return NextResponse.json({ ok: true, draft: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET — List landing drafts ────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }    = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);

    const drafts = await listLandingDrafts(organization.id);

    return NextResponse.json({ ok: true, drafts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH — Update draft (content and/or status) ─────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }    = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId          = organization.id;

    const body = await req.json() as {
      draftId: string;
      title?:  string;
      blocks?: LandingDraftBlock[];
      status?: LandingDraftStatus;
    };

    if (!body.draftId) {
      return NextResponse.json(
        { error: "draftId es requerido." },
        { status: 400 },
      );
    }

    if (!body.status && !body.blocks && !body.title) {
      return NextResponse.json(
        { error: "Se requiere al menos status, blocks o title." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (body.status)  updates.status      = body.status;
    if (body.blocks)  updates.blocks      = body.blocks;
    if (body.title)   updates.productName = body.title;

    const updated = await updateLandingDraft(orgId, body.draftId, updates);

    if (!updated) {
      return NextResponse.json(
        { error: "Borrador no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, draft: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
