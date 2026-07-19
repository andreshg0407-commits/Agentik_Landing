/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/preview/route.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01
 *
 * POST /…/[catalogId]/preview
 *   → resolve products for a catalog definition (or ad-hoc rule set)
 *   Body: { rules?, sortField?, sortDirection?, pricingMode?, limit? }
 *   If no body, resolves the persisted catalog definition directly.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { getCatalogDefinition }        from "@/lib/marketing-studio/catalogs/catalog-definition-repository";
import {
  resolveCatalog,
  previewCatalogRules,
}                                       from "@/lib/marketing-studio/catalogs/catalog-query-service";
import type {
  CatalogFilterRule,
  PricingMode,
}                                       from "@/lib/marketing-studio/catalogs/catalog-definition-types";

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json().catch(() => ({})) as {
      rules?:         CatalogFilterRule[];
      sortField?:     string;
      sortDirection?: "asc" | "desc";
      pricingMode?:   PricingMode;
      limit?:         number;
    };

    // Ad-hoc preview (builder UI with unsaved rules)
    if (body.rules !== undefined) {
      const result = await previewCatalogRules(
        organization.id,
        body.rules,
        body.sortField     ?? "name",
        body.sortDirection ?? "asc",
        body.pricingMode   ?? "with_prices",
        Math.min(body.limit ?? 50, 200),
      );
      return NextResponse.json(result);
    }

    // Persisted catalog preview
    const definition = await getCatalogDefinition(organization.id, catalogId);
    if (!definition) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await resolveCatalog(definition, { limit: 200 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[catalog-definition preview]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
