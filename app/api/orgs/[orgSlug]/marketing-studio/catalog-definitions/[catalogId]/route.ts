/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/route.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01
 *
 * GET    /…/[catalogId]          → get single definition
 * PATCH  /…/[catalogId]          → update fields
 * DELETE /…/[catalogId]          → delete definition
 */

import { NextRequest, NextResponse }       from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import {
  getCatalogDefinition,
  updateCatalogDefinition,
  deleteCatalogDefinition,
}                                          from "@/lib/marketing-studio/catalogs/catalog-definition-repository";
import type { UpdateCatalogDefinitionInput } from "@/lib/marketing-studio/catalogs/catalog-definition-types";

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const definition = await getCatalogDefinition(organization.id, catalogId);
    if (!definition) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ definition });
  } catch (err) {
    console.error("[catalog-definition GET]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as UpdateCatalogDefinitionInput;

    const definition = await updateCatalogDefinition(
      organization.id,
      catalogId,
      body,
    );
    if (!definition) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ definition });
  } catch (err) {
    console.error("[catalog-definition PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const deleted = await deleteCatalogDefinition(organization.id, catalogId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[catalog-definition DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
