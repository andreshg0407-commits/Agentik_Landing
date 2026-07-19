/**
 * app/api/orgs/[orgSlug]/operational-map/kpi-definitions/route.ts
 *
 * KPI Definition Management API (custom KPIs created from UI).
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET              — list all custom KPI definitions for the org
 * GET ?kpiKey=xxx  — get a single KPI definition
 * POST             — create a new custom KPI definition
 * PATCH (body: { kpiKey, ...updates }) — update a KPI definition
 * DELETE ?kpiKey=xxx — delete a custom KPI definition
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

import { NextResponse }        from "next/server";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { isInternalRole }      from "@/lib/auth/module-access";
import {
  getAllKpiDefinitions,
  getKpiDefinition,
  createKpiDefinition,
  updateKpiDefinition,
  deleteKpiDefinition,
}                              from "@/lib/operational-map/certification/operational-kpi-definition-service";
import type {
  KpiDefinitionCreateInput,
  KpiDefinitionUpdateInput,
}                              from "@/lib/operational-map/certification/operational-kpi-definition-service";
import {
  appendKpiEvent,
}                              from "@/lib/operational-map/certification/operational-kpi-event-service";

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
    const url    = new URL(req.url);
    const kpiKey = url.searchParams.get("kpiKey");

    if (kpiKey) {
      const def = await getKpiDefinition(organization.id, kpiKey);
      if (!def) return NextResponse.json({ ok: false, error: "KPI definition not found" }, { status: 404 });
      return NextResponse.json({ ok: true, definition: def });
    }

    const definitions = await getAllKpiDefinitions(organization.id);
    return NextResponse.json({ ok: true, definitions, count: definitions.length });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — create KPI definition ────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const body = await req.json() as Omit<KpiDefinitionCreateInput, "organizationId" | "createdBy">;

    if (!body.domain || !body.entityLabel || !body.kpiDefinition) {
      return NextResponse.json(
        { ok: false, error: "domain, entityLabel, and kpiDefinition are required" },
        { status: 400 },
      );
    }

    const definition = await createKpiDefinition({
      ...body,
      organizationId: organization.id,
      createdBy:      user.id,
    });

    await appendKpiEvent({
      organizationId: organization.id,
      kpiKey:         definition.kpiKey,
      eventType:      "kpi_created",
      actorId:        user.id,
      description:    `KPI "${body.entityLabel}" creado en dominio ${body.domain}`,
      metadata:       { domain: body.domain, entityLabel: body.entityLabel },
    });

    return NextResponse.json({ ok: true, definition }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ─── PATCH — update KPI definition ───────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const body = await req.json() as { kpiKey: string } & KpiDefinitionUpdateInput;

    if (!body.kpiKey) {
      return NextResponse.json({ ok: false, error: "kpiKey is required" }, { status: 400 });
    }

    const { kpiKey, ...updates } = body;
    const definition = await updateKpiDefinition(organization.id, kpiKey, updates);

    await appendKpiEvent({
      organizationId: organization.id,
      kpiKey,
      eventType:      "kpi_updated",
      actorId:        user.id,
      description:    "KPI actualizado",
      metadata:       { updatedFields: Object.keys(updates) },
    });

    return NextResponse.json({ ok: true, definition });
  } catch (err) {
    return handleError(err);
  }
}

// ─── DELETE — remove KPI definition ──────────────────────────────────────────

export async function DELETE(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const url    = new URL(req.url);
    const kpiKey = url.searchParams.get("kpiKey");

    if (!kpiKey) {
      return NextResponse.json({ ok: false, error: "kpiKey is required" }, { status: 400 });
    }

    await deleteKpiDefinition(organization.id, kpiKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND" ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
