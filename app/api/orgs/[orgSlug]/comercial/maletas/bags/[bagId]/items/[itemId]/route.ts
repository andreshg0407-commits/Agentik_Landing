/**
 * PATCH  /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/items/[itemId]
 * DELETE /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/items/[itemId]
 *
 * PATCH  — update item:
 *   { action: "update_qty", assignedQty: number }
 *   { action: "pause" }
 *   { action: "resume" }
 *
 * DELETE — remove item from bag permanently
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { NextResponse }                from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import {
  updateItemAssignedQty,
  pauseItem,
  removeItem,
}                                      from "@/lib/comercial/maletas/vendor-bag-repository";
import { prisma }                      from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string; bagId: string; itemId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as { action: string; assignedQty?: number };

    switch (body.action) {
      case "update_qty": {
        if (typeof body.assignedQty !== "number" || body.assignedQty < 0) {
          return NextResponse.json(
            { ok: false, error: "assignedQty must be a non-negative number" },
            { status: 400 },
          );
        }
        const item = await updateItemAssignedQty(organization.id, params.itemId, body.assignedQty);
        if (!item) return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });
        return NextResponse.json({ ok: true, item });
      }

      case "pause": {
        await pauseItem(organization.id, params.itemId);
        const item = await prisma.vendorBagItem.findFirst({ where: { id: params.itemId, organizationId: organization.id } });
        return NextResponse.json({ ok: true, item });
      }

      case "resume": {
        // Resume: recalculate status from current data
        const current = await prisma.vendorBagItem.findFirst({
          where: { id: params.itemId, organizationId: organization.id },
        });
        if (!current) return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });

        const availableToSellQty = Math.max(0, current.assignedQty - current.soldQty);
        const status =
          availableToSellQty <= 0 ? "agotado"
          : current.minQty > 0 && availableToSellQty <= current.minQty ? "bajo_minimo"
          : "ok";

        const item = await prisma.vendorBagItem.update({
          where: { id: params.itemId },
          data:  { status, availableToSellQty },
        });
        return NextResponse.json({ ok: true, item });
      }

      default:
        return NextResponse.json(
          { ok: false, error: "action must be: update_qty | pause | resume" },
          { status: 400 },
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { orgSlug: string; bagId: string; itemId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    await removeItem(organization.id, params.itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
