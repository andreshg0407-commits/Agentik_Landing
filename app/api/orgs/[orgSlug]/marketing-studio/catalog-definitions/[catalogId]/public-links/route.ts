/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/public-links/route.ts
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01
 *
 * GET  → list public links for a catalog (org-scoped)
 * POST → create a new public link for a catalog
 */

import { NextRequest, NextResponse }     from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import {
  listPublicLinksForCatalog,
  createPublicLink,
}                                        from "@/lib/marketing-studio/catalogs/catalog-public-link-repository";
import { getCatalogDefinition }         from "@/lib/marketing-studio/catalogs/catalog-definition-repository";

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const links = await listPublicLinksForCatalog(organization.id, catalogId);

    return NextResponse.json({ links });
  } catch (err) {
    console.error("[public-links GET]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);

    // Verify catalog belongs to this org
    const catalog = await getCatalogDefinition(organization.id, catalogId);
    if (!catalog) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({})) as { expiresAt?: string | null };

    const link = await createPublicLink({
      catalogId:      catalog.id,
      organizationId: organization.id,
      createdBy:      user.email ?? null,
      expiresAt:      body.expiresAt ? new Date(body.expiresAt) : null,
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    console.error("[public-links POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
