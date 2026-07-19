/**
 * GET  /api/orgs/[orgSlug]/comercial/maletas/ideal-overrides
 * POST /api/orgs/[orgSlug]/comercial/maletas/ideal-overrides
 * DELETE /api/orgs/[orgSlug]/comercial/maletas/ideal-overrides
 *
 * MALETAS-DERROTERO-IDEALES-EDITABLES-01
 *
 * GET: returns all ideal overrides for the tenant.
 * POST: upsert a single override (catalogId, groupCode, subgroupCode, idealUnits).
 * DELETE: remove a single override (restore official ideal).
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const db = prisma as any;

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const overrides = await db.assortmentIdealOverride.findMany({
      where: { organizationId: organization.id },
      select: {
        id: true,
        catalogId: true,
        groupCode: true,
        subgroupCode: true,
        idealUnits: true,
        updatedBy: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ ok: true, overrides });
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
    const { catalogId, groupCode, subgroupCode, idealUnits } = body;

    if (!catalogId || !groupCode || !subgroupCode || idealUnits == null) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: catalogId, groupCode, subgroupCode, idealUnits" },
        { status: 400 },
      );
    }

    if (typeof idealUnits !== "number" || idealUnits < 0 || !Number.isInteger(idealUnits)) {
      return NextResponse.json(
        { ok: false, error: "idealUnits must be a non-negative integer" },
        { status: 400 },
      );
    }

    const override = await db.assortmentIdealOverride.upsert({
      where: {
        organizationId_catalogId_groupCode_subgroupCode: {
          organizationId: organization.id,
          catalogId,
          groupCode,
          subgroupCode,
        },
      },
      update: {
        idealUnits,
        updatedBy: user?.id ?? null,
      },
      create: {
        organizationId: organization.id,
        catalogId,
        groupCode,
        subgroupCode,
        idealUnits,
        updatedBy: user?.id ?? null,
      },
    });

    return NextResponse.json({ ok: true, override });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json();
    const { catalogId, groupCode, subgroupCode } = body;

    if (!catalogId || !groupCode || !subgroupCode) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: catalogId, groupCode, subgroupCode" },
        { status: 400 },
      );
    }

    await db.assortmentIdealOverride.deleteMany({
      where: {
        organizationId: organization.id,
        catalogId,
        groupCode,
        subgroupCode,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
