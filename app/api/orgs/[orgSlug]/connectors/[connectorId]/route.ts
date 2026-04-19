/**
 * GET   /api/orgs/[orgSlug]/connectors/[connectorId]  — connector detail
 * PATCH /api/orgs/[orgSlug]/connectors/[connectorId]  — partial update
 *
 * PATCH body (all fields optional):
 *   {
 *     modules?: string[]            — replace the enabled-modules array
 *     config?:  Record<string, unknown>  — deep-merge into existing config
 *     status?:  "ACTIVE" | "INACTIVE"
 *   }
 *
 * PATCH rules:
 *   - modules: fully replaces the existing array (not a merge).
 *   - config:  shallow-merged — existing keys are preserved unless explicitly
 *              overridden, so callers can patch a single key without supplying
 *              the full config object.
 *   - status:  only "ACTIVE" and "INACTIVE" are accepted (cannot set SYNCING,
 *              ERROR via this endpoint — those are set by the sync engine).
 *
 * Returns the updated connector record.
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";
import type { Prisma }      from "@prisma/client";

export const runtime = "nodejs";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string; connectorId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const connector = await prisma.connector.findFirst({
      where:   { id: params.connectorId, organizationId: organization.id },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take:    5,
          select: {
            id: true, module: true, status: true,
            startedAt: true, finishedAt: true,
            rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true,
            cursorBefore: true, cursorAfter: true, error: true,
          },
        },
        cursors: {
          select: { module: true, cursor: true, updatedAt: true },
        },
      },
    });

    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    return NextResponse.json({ connector });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },     { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },     { status: 404 });
    console.error("[connectors/[id]/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string; connectorId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    // Verify connector belongs to this org before reading the body
    const existing = await prisma.connector.findFirst({
      where: { id: params.connectorId, organizationId: organization.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const body = await req.json() as {
      modules?: string[];
      config?:  Record<string, unknown>;
      status?:  string;
    };

    // Validate status if provided
    if (body.status !== undefined && !["ACTIVE", "INACTIVE"].includes(body.status)) {
      return NextResponse.json(
        { error: "status must be ACTIVE or INACTIVE" },
        { status: 400 },
      );
    }

    // Build update payload — only include fields that were supplied
    const data: Prisma.ConnectorUpdateInput = { updatedAt: new Date() };

    if (Array.isArray(body.modules)) {
      data.modules = body.modules;
    }

    if (body.config !== null && typeof body.config === "object") {
      // Shallow-merge: existing keys survive unless explicitly overridden
      const merged = {
        ...(existing.config as Record<string, unknown>),
        ...body.config,
      };
      data.config = merged as Prisma.InputJsonValue;
    }

    if (body.status === "ACTIVE" || body.status === "INACTIVE") {
      data.status = body.status;
    }

    const connector = await prisma.connector.update({
      where: { id: params.connectorId },
      data,
    });

    return NextResponse.json({ connector });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },     { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },     { status: 404 });
    console.error("[connectors/[id]/PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
