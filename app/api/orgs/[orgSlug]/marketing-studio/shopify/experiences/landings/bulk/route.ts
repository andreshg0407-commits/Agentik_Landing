/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/experiences/landings/bulk/route.ts
 *
 * SHOPIFY-EXPERIENCIAS-05 — Bulk Landing Draft Generation API
 *
 * POST — Generate landing drafts for multiple products.
 *
 * Does NOT publish to Shopify.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { getLandingProducts }        from "@/lib/marketing-studio/commerce/shopify-experiences-service";
import { evaluateProductReadiness }  from "@/lib/marketing-studio/commerce/shopify-experiences-service";
import { EXPERIENCE_TEMPLATES }      from "@/lib/marketing-studio/commerce/shopify-experiences-templates";
import {
  createBulkLandingDrafts,
  selectDefaultTemplateForBulk,
} from "@/lib/marketing-studio/commerce/shopify-bulk-landing-generator";
import type { BulkLandingCandidate } from "@/lib/marketing-studio/commerce/shopify-bulk-landing-generator";
import type { GenerationRules }      from "@/lib/marketing-studio/commerce/shopify-experiences-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }    = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId          = organization.id;

    const body = await req.json() as {
      productIds:       string[];
      templateId?:      string;
      generationRules?: GenerationRules;
      tenantPreset?:    string;
    };

    if (!body.productIds || !Array.isArray(body.productIds) || body.productIds.length === 0) {
      return NextResponse.json(
        { error: "productIds es requerido y debe tener al menos un producto." },
        { status: 400 },
      );
    }

    if (body.productIds.length > 50) {
      return NextResponse.json(
        { error: "Maximo 50 productos por lote." },
        { status: 400 },
      );
    }

    // Resolve template
    const templateId = body.templateId
      ?? selectDefaultTemplateForBulk(body.tenantPreset)
      ?? EXPERIENCE_TEMPLATES.find(t => t.activa)?.id;

    if (!templateId) {
      return NextResponse.json(
        { error: "No hay plantillas disponibles." },
        { status: 400 },
      );
    }

    const template = EXPERIENCE_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json(
        { error: `Plantilla no encontrada: ${templateId}` },
        { status: 400 },
      );
    }

    // Load product data
    const allProducts = await getLandingProducts(orgId);
    const selectedProducts = allProducts.filter(p => body.productIds.includes(p.productId));

    if (selectedProducts.length === 0) {
      return NextResponse.json(
        { error: "Ninguno de los productos seleccionados fue encontrado en el catalogo." },
        { status: 404 },
      );
    }

    // Build candidates with readiness
    const candidates: BulkLandingCandidate[] = selectedProducts.map(p => {
      const readinessResult = evaluateProductReadiness(p);
      return {
        productId:   p.productId,
        productName: p.nombre,
        sku:         p.sku,
        precio:      p.precio,
        coleccion:   p.coleccion,
        shopifyUrl:  p.shopifyUrl,
        readiness:   readinessResult.readiness,
        photoCount:  p.biblioteca.fotosAprobadas,
        videoCount:  p.biblioteca.videosAprobados,
      };
    });

    // Generate
    const result = await createBulkLandingDrafts(
      orgId,
      candidates,
      templateId,
      body.generationRules ?? {},
      body.tenantPreset ?? null,
    );

    return NextResponse.json({
      ok:            true,
      summary:       result.summary,
      createdDrafts: result.createdDrafts,
      skippedItems:  result.skippedItems,
      failedItems:   result.failedItems,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
