/**
 * GET  /api/orgs/[orgSlug]/connectors  — list configured connectors for an org
 * POST /api/orgs/[orgSlug]/connectors  — create or upsert a connector
 *
 * Body for POST:
 *   { source: string; name: string; modules: string[]; config: Record<string, unknown> }
 *
 * Returns connector records with last run summary for quick status overview.
 */

import { NextResponse }       from "next/server";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { prisma }             from "@/lib/prisma";
import type { Prisma }        from "@prisma/client";

export const runtime = "nodejs";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const connectors = await prisma.connector.findMany({
      where:   { organizationId: organization.id },
      orderBy: { createdAt: "asc" },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: {
            id: true, module: true, status: true,
            startedAt: true, finishedAt: true,
            rowsImported: true, rowsSkipped: true, rowsErrored: true,
            error: true,
          },
        },
      },
    });

    return NextResponse.json({ connectors });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("[connectors/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const body = await req.json() as {
      source:   string;
      name:     string;
      modules:  string[];
      config:   Record<string, unknown>;
    };

    const { source, name, modules, config } = body;
    if (!source || !name || !Array.isArray(modules)) {
      return NextResponse.json(
        { error: "source, name, modules required" },
        { status: 400 },
      );
    }

    const connector = await prisma.connector.upsert({
      where: {
        organizationId_source_name: {
          organizationId: organization.id,
          source,
          name,
        },
      },
      update: { modules, config: (config ?? {}) as Prisma.InputJsonValue, status: "INACTIVE", updatedAt: new Date() },
      create: {
        organizationId: organization.id,
        source,
        name,
        modules,
        config: (config ?? {}) as Prisma.InputJsonValue,
        status: "INACTIVE",
      },
    });

    return NextResponse.json({ connector });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("[connectors/POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
