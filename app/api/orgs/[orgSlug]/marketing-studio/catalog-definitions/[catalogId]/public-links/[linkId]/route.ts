/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/public-links/[linkId]/route.ts
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01
 *
 * PATCH  → update link (isActive, expiresAt, regenerate slug)
 * DELETE → permanently delete link
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import {
  updatePublicLink,
  deletePublicLink,
}                                      from "@/lib/marketing-studio/catalogs/catalog-public-link-repository";

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string; linkId: string }>;
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, linkId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      isActive?:   boolean;
      expiresAt?:  string | null;
      regenerate?: boolean;
    };

    const expiresAt: Date | null | undefined =
      body.expiresAt === undefined ? undefined :
      body.expiresAt === null      ? null :
      new Date(body.expiresAt);

    const link = await updatePublicLink(organization.id, linkId, {
      isActive:   body.isActive,
      expiresAt,
      regenerate: body.regenerate ?? false,
    });

    if (!link) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ link });
  } catch (err) {
    console.error("[public-links PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, linkId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const deleted = await deletePublicLink(organization.id, linkId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[public-links DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
