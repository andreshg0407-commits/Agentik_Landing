/**
 * GET /api/orgs/[orgSlug]/marketing-studio/video-editor/versions?assetId=xxx
 *
 * MARKETING-VIDEO-EDITOR-ASSET-HUB-03 — Version History
 *
 * Returns the version chain for a given source asset.
 * Scoped to the authenticated tenant.
 *
 * Query params:
 *   assetId — ID of the source (parent) asset whose versions to list.
 *             If omitted, returns all video_editor assets for the org.
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - organizationId always from server session.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { listVideoVersions }             from "@/lib/marketing-studio/video-editor/video-editor-service";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const assetId = req.nextUrl.searchParams.get("assetId") ?? undefined;

    const versions = await listVideoVersions(organization.id, assetId);

    return NextResponse.json({ versions });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
