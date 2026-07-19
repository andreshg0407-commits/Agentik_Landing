/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/route.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01
 *
 * GET  /api/orgs/{orgSlug}/marketing-studio/catalog-definitions
 *   → list all catalog definitions for org (optionally filtered by ?status=)
 *
 * POST /api/orgs/{orgSlug}/marketing-studio/catalog-definitions
 *   → create a new catalog definition
 */

import { NextRequest, NextResponse }       from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import {
  listCatalogDefinitions,
  createCatalogDefinition,
}                                          from "@/lib/marketing-studio/catalogs/catalog-definition-repository";
import type {
  CatalogDefinitionStatus,
  CatalogFilterRule,
  CatalogGroupBy,
  CatalogLayout,
  CatalogSortField,
  CatalogTemplateKey,
  CategorySortMode,
  CtaMode,
  PricingMode,
  SortDirection,
}                                          from "@/lib/marketing-studio/catalogs/catalog-definition-types";

interface RouteParams {
  params: Promise<{ orgSlug: string }>;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const url          = new URL(req.url);
    const statusFilter = url.searchParams.get("status") as CatalogDefinitionStatus | null;

    const definitions = await listCatalogDefinitions(
      organization.id,
      statusFilter ?? undefined,
    );

    return NextResponse.json({ definitions });
  } catch (err) {
    console.error("[catalog-definitions GET]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      name:            string;
      description?:    string | null;
      status?:         CatalogDefinitionStatus;
      filters?:        CatalogFilterRule[];
      sortField?:      CatalogSortField;
      sortDirection?:  SortDirection;
      groupBy?:        CatalogGroupBy;
      pricingMode?:    PricingMode;
      ctaMode?:        CtaMode;
      whatsAppPhone?:  string | null;
      layout?:         CatalogLayout;
      groupByCategory?: boolean;
      categorySort?:   CategorySortMode;
      categoryOrder?:  string[];
      templateKey?:    CatalogTemplateKey;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const definition = await createCatalogDefinition({
      organizationId:  organization.id,
      name:            body.name.trim(),
      description:     body.description    ?? null,
      status:          body.status         ?? "draft",
      filters:         body.filters        ?? [],
      sortField:       body.sortField      ?? "sortOrder",
      sortDirection:   body.sortDirection  ?? "asc",
      groupBy:         body.groupBy        ?? null,
      pricingMode:     body.pricingMode    ?? "with_prices",
      ctaMode:         body.ctaMode        ?? "none",
      whatsAppPhone:   body.whatsAppPhone  ?? null,
      layout:          body.layout         ?? "GRID_STANDARD",
      groupByCategory: body.groupByCategory ?? true,
      categorySort:    body.categorySort   ?? "alphabetical",
      categoryOrder:   body.categoryOrder  ?? [],
      templateKey:     body.templateKey    ?? "retail",
      createdBy:       user.email ?? null,
    });

    return NextResponse.json({ definition }, { status: 201 });
  } catch (err) {
    console.error("[catalog-definitions POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
