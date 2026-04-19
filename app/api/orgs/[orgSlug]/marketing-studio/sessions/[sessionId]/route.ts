/**
 * app/api/orgs/[orgSlug]/marketing-studio/sessions/[sessionId]/route.ts
 *
 * GET   — fetch session with assets.
 * PATCH — advance session state from the wizard.
 *
 * PATCH body (varies by action):
 *
 *   action: "set_product"        { sku, imageUrl }
 *   action: "set_objective"      { objective }
 *   action: "set_inputs"         { inputs: Partial<MinimumInputFields> }
 *   action: "submit_for_review"  { reviewItems: ReviewItem[] }
 *   action: "approve_items"      { itemIds: string[] }  — updates asset reviewStatus in DB
 *   action: "start_publishing"   {}
 */

import { NextRequest, NextResponse }          from "next/server";
import { requireOrgAccess }                   from "@/lib/auth/org-access";
import {
  getDbSession,
  updateDbSessionProduct,
  updateDbSessionObjective,
  updateDbSessionInputs,
  updateDbSessionReviewItems,
  updateDbSessionState,
} from "@/lib/marketing-studio/session-service";
import { updateAssetReviewStatus }            from "@/lib/marketing-studio/asset-service";
import type { MinimumInputFields, ReviewItem } from "@/lib/marketing-studio/guided-flow";

type RouteContext = { params: Promise<{ orgSlug: string; sessionId: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, sessionId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const session = await getDbSession(sessionId);
    if (!session || session.organizationId !== organization.id) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[marketing-studio/sessions/[sessionId]/GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, sessionId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    // Ownership check
    const existing = await getDbSession(sessionId);
    if (!existing || existing.organizationId !== organization.id) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json() as Record<string, unknown>;

    switch (body.action) {
      case "set_product": {
        const sku      = String(body.sku      ?? "").trim();
        const imageUrl = String(body.imageUrl ?? "").trim();
        if (!sku || !imageUrl) {
          return NextResponse.json({ error: "sku and imageUrl required" }, { status: 400 });
        }
        const session = await updateDbSessionProduct(sessionId, sku, imageUrl);
        return NextResponse.json({ session });
      }

      case "set_objective": {
        const objective = String(body.objective ?? "").trim();
        if (!objective) {
          return NextResponse.json({ error: "objective required" }, { status: 400 });
        }
        const session = await updateDbSessionObjective(sessionId, objective);
        return NextResponse.json({ session });
      }

      case "set_inputs": {
        const inputs = body.inputs as Partial<MinimumInputFields>;
        const session = await updateDbSessionInputs(sessionId, inputs);
        return NextResponse.json({ session });
      }

      case "submit_for_review": {
        const reviewItems = body.reviewItems as ReviewItem[];
        const session     = await updateDbSessionReviewItems(sessionId, reviewItems);
        return NextResponse.json({ session });
      }

      case "approve_items": {
        const itemIds = body.itemIds as string[];
        // Update asset review status in DB for each approved item
        await Promise.all(
          itemIds.map((id) => updateAssetReviewStatus(id, "approved")),
        );
        return NextResponse.json({ ok: true });
      }

      case "start_publishing": {
        const session = await updateDbSessionState(sessionId, {
          step:   "publish_export",
          status: "publishing",
        });
        return NextResponse.json({ session });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[marketing-studio/sessions/[sessionId]/PATCH]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
