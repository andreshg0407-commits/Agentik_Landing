/**
 * POST /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/items
 *
 * Add a new reference item to an existing bag.
 * Returns the created item.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { NextResponse }         from "next/server";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { addItemToBag }         from "@/lib/comercial/maletas/vendor-bag-repository";
import type { CreateItemInput } from "@/lib/comercial/maletas/vendor-bag-repository";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; bagId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as CreateItemInput;

    if (!body.reference || typeof body.assignedQty !== "number") {
      return NextResponse.json(
        { ok: false, error: "reference and assignedQty are required" },
        { status: 400 },
      );
    }

    const item = await addItemToBag(organization.id, params.bagId, body);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return NextResponse.json(
        { ok: false, error: "This reference already exists in the bag" },
        { status: 409 },
      );
    }
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
