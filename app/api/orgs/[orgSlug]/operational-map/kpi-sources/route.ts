/**
 * app/api/orgs/[orgSlug]/operational-map/kpi-sources/route.ts
 *
 * KPI Source Management API.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET  ?kpiKey=xxx  — list sources for a KPI (or all org sources)
 * POST             — upsert a source
 * DELETE ?id=xxx   — delete a source by id
 * PATCH  (body: { id, ...confirmSagData }) — confirm SAG validation
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

import { NextResponse }        from "next/server";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { isInternalRole }      from "@/lib/auth/module-access";
import {
  getKpiSources,
  upsertKpiSource,
  updateKpiSource,
  deleteKpiSource,
}                              from "@/lib/operational-map/certification/operational-kpi-source-service";
import type { KpiSourceUpsertInput, KpiSourceAction, KpiSourceUpdateInput } from "@/lib/operational-map/certification/operational-kpi-source-service";
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
    const kpiKey = url.searchParams.get("kpiKey") ?? undefined;

    const sources = await getKpiSources(organization.id, kpiKey);
    return NextResponse.json({ ok: true, sources, count: sources.length });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — upsert source ─────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const body = await req.json() as Omit<KpiSourceUpsertInput, "actorId" | "organizationId">;

    if (!body.kpiKey || !body.sourceName || !body.sourceType || !body.sourceRole || !body.provider) {
      return NextResponse.json(
        { ok: false, error: "kpiKey, sourceName, sourceType, sourceRole, provider are required" },
        { status: 400 },
      );
    }

    const source = await upsertKpiSource({
      ...body,
      organizationId: organization.id,
      actorId:        user.id,
    });

    await appendKpiEvent({
      organizationId: organization.id,
      kpiKey:         body.kpiKey,
      eventType:      "source_added",
      actorId:        user.id,
      description:    `Fuente "${body.sourceName}" agregada (${body.sourceRole}) — ${source.validationStatus}`,
      metadata:       { sourceId: source.id, sourceName: body.sourceName, sourceRole: body.sourceRole, validationStatus: source.validationStatus },
    });

    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return handleError(err);
  }
}

// ─── PATCH — update source / apply action ─────────────────────────────────────

const ACTION_TO_EVENT: Record<KpiSourceAction, import("@/lib/operational-map/certification/operational-kpi-event-service").KpiEventType> = {
  confirm_sag:        "source_confirmed",
  confirm_crm:        "source_confirmed",
  confirm_business:   "source_confirmed",
  confirm_exists:     "source_confirmed_exists",
  mark_sot:           "source_marked_sot",
  mark_ready:         "source_ready_for_integration",
  reject:             "source_rejected",
  mark_pending:       "source_pending_validation",
  confirm_dba:        "source_confirmed_dba",
  certify_production: "source_production_certified",
  replace_with:       "source_replaced",
};

const ACTION_DESCRIPTIONS: Record<KpiSourceAction, string> = {
  confirm_sag:        "Fuente confirmada por SAG DBA",
  confirm_crm:        "Fuente confirmada por CRM",
  confirm_business:   "Fuente confirmada por negocio",
  confirm_exists:     "Existencia de fuente confirmada",
  mark_sot:           "Fuente marcada como Source of Truth",
  mark_ready:         "Fuente marcada lista para integración",
  reject:             "Fuente rechazada",
  mark_pending:       "Fuente marcada pendiente de validar existencia",
  confirm_dba:        "Fuente confirmada con DBA SAG (tabla/query)",
  certify_production: "Fuente certificada para producción",
  replace_with:       "Hipótesis CSV reemplazada por fuente confirmada",
};

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const body = await req.json() as { id: string; kpiKey: string } & KpiSourceUpdateInput;

    if (!body.id || !body.kpiKey) {
      return NextResponse.json({ ok: false, error: "id and kpiKey are required" }, { status: 400 });
    }

    const { id, kpiKey, ...updateInput } = body;
    const source = await updateKpiSource(id, user.id, updateInput);

    const action    = updateInput.action;
    const eventType = action ? ACTION_TO_EVENT[action] : "source_updated";
    const desc      = action ? ACTION_DESCRIPTIONS[action] : `Fuente actualizada${updateInput.tableName ? `: ${updateInput.tableName}` : ""}`;

    await appendKpiEvent({
      organizationId: organization.id,
      kpiKey,
      eventType,
      actorId:   user.id,
      description: desc,
      metadata:  { sourceId: id, action, validationStatus: source.validationStatus },
    });

    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return handleError(err);
  }
}

// ─── DELETE — remove source ───────────────────────────────────────────────────

export async function DELETE(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const url    = new URL(req.url);
    const id     = url.searchParams.get("id");
    const kpiKey = url.searchParams.get("kpiKey") ?? "unknown";

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    await deleteKpiSource(id);

    await appendKpiEvent({
      organizationId: organization.id,
      kpiKey,
      eventType:      "source_deleted",
      actorId:        user.id,
      description:    "Fuente de datos eliminada",
      metadata:       { deletedId: id },
    });

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
