/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas/guides
 *
 * Actions: load, generate, get, approve, cancel, execute
 *
 * Sprint: TIENDAS-WAREHOUSE-GUIDE-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  loadGuides,
  loadGuide,
  generateGuides,
  approveGuide,
  cancelGuide,
  markGuideExecuted,
} from "@/lib/comercial/tiendas/store-guide-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization, user } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;
  const userId = user.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "load": {
      const guides = await loadGuides(orgId);
      return NextResponse.json({ guides });
    }

    case "generate": {
      const guides = await generateGuides(orgId, userId);
      return NextResponse.json({ guides, count: guides.length });
    }

    case "get": {
      const guideId = body.guideId as string;
      if (!guideId) return NextResponse.json({ error: "Missing guideId" }, { status: 400 });
      const guide = await loadGuide(orgId, guideId);
      if (!guide) return NextResponse.json({ error: "Guide not found" }, { status: 404 });
      return NextResponse.json({ guide });
    }

    case "approve": {
      const guideId = body.guideId as string;
      if (!guideId) return NextResponse.json({ error: "Missing guideId" }, { status: 400 });
      try {
        const guide = await approveGuide(orgId, guideId, userId, body.note);
        return NextResponse.json({ guide });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    case "cancel": {
      const guideId = body.guideId as string;
      if (!guideId) return NextResponse.json({ error: "Missing guideId" }, { status: 400 });
      try {
        const guide = await cancelGuide(orgId, guideId, userId, body.note);
        return NextResponse.json({ guide });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    case "execute": {
      const guideId = body.guideId as string;
      if (!guideId) return NextResponse.json({ error: "Missing guideId" }, { status: 400 });
      try {
        const guide = await markGuideExecuted(orgId, guideId, userId, body.note);
        return NextResponse.json({ guide });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
