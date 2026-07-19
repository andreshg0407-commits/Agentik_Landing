/**
 * GET  /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route
 * POST /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route
 *
 * GET returns { rules, catalog } where catalog is the full list of
 * SAG subgroups from ProductEntity for select dropdowns.
 *
 * bagId = vendorId (e.g. "ORLANDO") — matches presence engine vendorId.
 *
 * Sprint: GO-LIVE-MALETAS-DERROTERO-HARDENING-01
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  listIdealRouteRules,
  upsertIdealRouteRule,
  loadCatalogSubgroups,
} from "@/lib/comercial/maletas/vendor-bag-ideal-route-service";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string; bagId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const [rules, catalog] = await Promise.all([
      listIdealRouteRules(organization.id, params.bagId),
      loadCatalogSubgroups(organization.id),
    ]);
    return NextResponse.json({ ok: true, rules, catalog });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; bagId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as {
      line?: string;
      subgrupoSag?: string;
      minimumRefs?: number;
      isActive?: boolean;
    };

    if (!body.line || !body.subgrupoSag) {
      return NextResponse.json({ ok: false, error: "line and subgrupoSag are required" }, { status: 400 });
    }
    if (typeof body.minimumRefs !== "number" || body.minimumRefs < 1) {
      return NextResponse.json({ ok: false, error: "minimumRefs must be >= 1" }, { status: 400 });
    }

    const rule = await upsertIdealRouteRule(organization.id, params.bagId, {
      vendorId: params.bagId,
      line: body.line,
      subgrupoSag: body.subgrupoSag,
      minimumRefs: body.minimumRefs,
      isActive: body.isActive,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
