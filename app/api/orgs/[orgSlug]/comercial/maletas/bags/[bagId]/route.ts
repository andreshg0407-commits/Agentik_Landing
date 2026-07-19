/**
 * GET   /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]
 * PATCH /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]
 *
 * GET   — get bag with all items
 * PATCH — update bag status (activate, pause, archive)
 *         body: { status: "activa" | "pausada" | "archivada" | "borrador" }
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { NextResponse }            from "next/server";
import { requireOrgAccess }        from "@/lib/auth/org-access";
import { getBag, updateBagStatus } from "@/lib/comercial/maletas/vendor-bag-repository";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string; bagId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const bag = await getBag(organization.id, params.bagId);
    if (!bag) return NextResponse.json({ ok: false, error: "Bag not found" }, { status: 404 });
    return NextResponse.json({ ok: true, bag });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string; bagId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as { status?: string };

    const validStatuses = ["borrador", "activa", "pausada", "archivada"] as const;
    if (!body.status || !validStatuses.includes(body.status as typeof validStatuses[number])) {
      return NextResponse.json(
        { ok: false, error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    await updateBagStatus(
      organization.id,
      params.bagId,
      body.status as typeof validStatuses[number],
    );

    const updated = await getBag(organization.id, params.bagId);
    return NextResponse.json({ ok: true, bag: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
