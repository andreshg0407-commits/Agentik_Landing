/**
 * PATCH /api/orgs/[orgSlug]/scheduled-reports/[reportId]  — update isActive / recipients
 * DELETE /api/orgs/[orgSlug]/scheduled-reports/[reportId] — delete
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ orgSlug: string; reportId: string }> };

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden"    }, { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found"    }, { status: 404 });
  console.error("[scheduled-reports/[reportId]]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ── PATCH — update isActive + recipients ─────────────────────────────────────

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { orgSlug, reportId } = await params;
    const { organization }      = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      isActive?:   boolean;
      recipients?: string | null;
    };

    const existing = await prisma.scheduledReport.findFirst({
      where: { id: reportId, organizationId: organization.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.scheduledReport.update({
      where: { id: reportId },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.recipients !== undefined ? { recipients: body.recipients ?? null } : {}),
      },
    });

    return NextResponse.json({ report: updated });
  } catch (err) {
    return handleError(err);
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { orgSlug, reportId } = await params;
    const { organization }      = await requireOrgAccess(orgSlug);

    const existing = await prisma.scheduledReport.findFirst({
      where: { id: reportId, organizationId: organization.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.scheduledReport.delete({ where: { id: reportId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
