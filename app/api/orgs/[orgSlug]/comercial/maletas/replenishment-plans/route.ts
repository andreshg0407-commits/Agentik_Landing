/**
 * /api/orgs/[orgSlug]/comercial/maletas/replenishment-plans
 *
 * MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01
 *
 * GET  — list plans (query: vendorId, status)
 * POST — action-based: create_or_get_draft, add_item, remove_item,
 *         generate_document, update_status
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  listReplenishmentPlans,
  getActiveDraftPlan,
  createOrGetDraftPlan,
  addItemToPlan,
  removeItemFromPlan,
  generatePlanDocument,
  updatePlanStatus,
} from "@/lib/comercial/maletas/replenishment-plan-service";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);
    const vendorId = searchParams.get("vendorId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const plans = await listReplenishmentPlans(organization.id, { vendorId, status });
    return NextResponse.json({ ok: true, plans });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireOrgAccess(params.orgSlug);
    const body = await req.json();
    const action = body.action as string;
    const userId = user.id;

    switch (action) {
      case "create_or_get_draft": {
        const { vendorId, vendorName, warehouseCode } = body;
        if (!vendorId || !vendorName) {
          return NextResponse.json({ ok: false, error: "Missing vendorId/vendorName" }, { status: 400 });
        }
        const plan = await createOrGetDraftPlan(
          organization.id, vendorId, vendorName, warehouseCode ?? "", userId,
        );
        return NextResponse.json({ ok: true, plan });
      }

      case "get_draft": {
        const { vendorId } = body;
        if (!vendorId) {
          return NextResponse.json({ ok: false, error: "Missing vendorId" }, { status: 400 });
        }
        const plan = await getActiveDraftPlan(organization.id, vendorId);
        return NextResponse.json({ ok: true, plan });
      }

      case "add_item": {
        const { planId, item } = body;
        if (!planId || !item) {
          return NextResponse.json({ ok: false, error: "Missing planId/item" }, { status: 400 });
        }
        if (!item.addedReference?.trim()) {
          return NextResponse.json({ ok: false, error: "addedReference is required" }, { status: 400 });
        }
        if (!item.quantity || item.quantity <= 0) {
          return NextResponse.json({ ok: false, error: "quantity must be > 0" }, { status: 400 });
        }
        const created = await addItemToPlan(organization.id, planId, item, userId);
        // Return updated plan
        const { getPlan } = await import("@/lib/comercial/maletas/replenishment-plan-service");
        const plan = await getPlan(organization.id, planId);
        return NextResponse.json({ ok: true, item: created, plan });
      }

      case "remove_item": {
        const { planId, itemId } = body;
        if (!planId || !itemId) {
          return NextResponse.json({ ok: false, error: "Missing planId/itemId" }, { status: 400 });
        }
        await removeItemFromPlan(organization.id, planId, itemId, userId);
        const { getPlan } = await import("@/lib/comercial/maletas/replenishment-plan-service");
        const plan = await getPlan(organization.id, planId);
        return NextResponse.json({ ok: true, plan });
      }

      case "generate_document": {
        const { planId } = body;
        if (!planId) {
          return NextResponse.json({ ok: false, error: "Missing planId" }, { status: 400 });
        }
        const plan = await generatePlanDocument(organization.id, planId, userId);
        return NextResponse.json({ ok: true, plan });
      }

      case "update_status": {
        const { planId, status } = body;
        if (!planId || !status) {
          return NextResponse.json({ ok: false, error: "Missing planId/status" }, { status: 400 });
        }
        const plan = await updatePlanStatus(organization.id, planId, status, userId);
        return NextResponse.json({ ok: true, plan });
      }

      case "history": {
        const { vendorId, status: statusFilter } = body;
        const plans = await listReplenishmentPlans(organization.id, {
          vendorId, status: statusFilter,
        });
        return NextResponse.json({ ok: true, plans });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status =
      msg === "UNAUTHENTICATED" ? 401
      : msg === "ORG_NOT_FOUND" ? 404
      : msg === "PLAN_NOT_FOUND" ? 404
      : msg === "ITEM_NOT_FOUND" ? 404
      : msg === "PLAN_NOT_DRAFT" ? 409
      : msg === "PLAN_EMPTY" ? 409
      : msg.startsWith("INVALID_TRANSITION") ? 409
      : msg === "INVALID_ADDED_REFERENCE" ? 400
      : msg === "INVALID_QUANTITY" ? 400
      : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
