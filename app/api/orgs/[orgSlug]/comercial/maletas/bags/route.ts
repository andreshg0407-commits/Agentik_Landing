/**
 * GET  /api/orgs/[orgSlug]/comercial/maletas/bags
 * POST /api/orgs/[orgSlug]/comercial/maletas/bags
 *
 * GET  — list all bags for the org (optionally filtered by salesRepId)
 * POST — create a new bag (borrador or activa) with its items
 *
 * Backward compatibility note (AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01):
 *   These endpoints live under /maletas for Castillitos backward compatibility.
 *   Domain concept: Sales Portfolio (Portafolio de venta).
 *   Future migration: may move to /comercial/portafolios or /comercial/sales-portfolios.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { NextResponse }         from "next/server";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { listBags, createBag }  from "@/lib/comercial/maletas/vendor-bag-repository";
import type { CreateBagInput }  from "@/lib/comercial/maletas/vendor-bag-repository";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);
    const salesRepId = searchParams.get("salesRepId") ?? undefined;

    const bags = await listBags(organization.id, salesRepId);
    return NextResponse.json({ ok: true, bags });
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
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as CreateBagInput;

    if (!body.salesRepId || !body.season) {
      return NextResponse.json(
        { ok: false, error: "salesRepId and season are required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "items array is required and must not be empty" },
        { status: 400 },
      );
    }

    // Parse dates if provided as strings
    const input: CreateBagInput = {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate:   body.endDate   ? new Date(body.endDate)   : null,
    };

    const bag = await createBag(organization.id, input);
    return NextResponse.json({ ok: true, bag }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return NextResponse.json(
        { ok: false, error: "A bag already exists for this vendor and season" },
        { status: 409 },
      );
    }
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
