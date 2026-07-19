/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/duplicate/route.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01
 *
 * POST /…/[catalogId]/duplicate
 *   → clones catalog definition as a new draft
 *   Body: { name: string }
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { duplicateCatalogDefinition }  from "@/lib/marketing-studio/catalogs/catalog-definition-repository";

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);

    const body = await req.json() as { name?: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const definition = await duplicateCatalogDefinition(
      organization.id,
      catalogId,
      body.name.trim(),
      user.email ?? undefined,
    );

    if (!definition) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ definition }, { status: 201 });
  } catch (err) {
    console.error("[catalog-definition duplicate]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
