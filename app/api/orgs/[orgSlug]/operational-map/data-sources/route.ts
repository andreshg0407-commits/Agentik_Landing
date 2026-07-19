/**
 * app/api/orgs/[orgSlug]/operational-map/data-sources/route.ts
 *
 * Operational Data Source Catalog API.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET  ?provider=sag  — list catalog sources (optional provider filter)
 * POST              — create/upsert a catalog source
 * PATCH (body: {id,...}) — update a catalog source
 * DELETE ?id=xxx    — delete a catalog source
 * POST ?action=seed — seed org catalog from static presets
 *
 * Sprint: AGENTIK-MEETING-SOURCE-MAPPING-01
 */

import { NextResponse }        from "next/server";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { isInternalRole }      from "@/lib/auth/module-access";
import {
  getAllDataSources,
  upsertDataSource,
  updateDataSource,
  deleteDataSource,
  seedFromPresets,
}                              from "@/lib/operational-map/source-catalog/source-catalog-service";
import type { DataSourceUpdateInput } from "@/lib/operational-map/source-catalog/source-catalog-service";
import { ALL_SOURCE_PRESETS }  from "@/lib/operational-map/source-catalog/source-catalog-presets";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const url      = new URL(req.url);
    const provider = url.searchParams.get("provider") ?? undefined;

    const sources = await getAllDataSources(organization.id, provider);
    return NextResponse.json({ ok: true, sources, count: sources.length });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const url    = new URL(req.url);
    const action = url.searchParams.get("action");

    // Seed from presets
    if (action === "seed") {
      const count = await seedFromPresets(organization.id, ALL_SOURCE_PRESETS);
      return NextResponse.json({ ok: true, seeded: count });
    }

    const body = await req.json();

    if (!body.provider || !body.sourceType || !body.name || !body.label) {
      return NextResponse.json(
        { ok: false, error: "provider, sourceType, name, label are required" },
        { status: 400 },
      );
    }

    const source = await upsertDataSource({ ...body, organizationId: organization.id });
    return NextResponse.json({ ok: true, source }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    await requireInternalAccess(params.orgSlug);
    const body = await req.json() as { id: string } & DataSourceUpdateInput;

    if (!body.id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const { id, ...updates } = body;
    const source = await updateDataSource(id, updates);
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return handleError(err);
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    await requireInternalAccess(params.orgSlug);
    const url = new URL(req.url);
    const id  = url.searchParams.get("id");

    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

    await deleteDataSource(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND" ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
