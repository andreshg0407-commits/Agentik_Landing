/**
 * app/api/orgs/[orgSlug]/operational-map/meeting-agreements/[agreementId]/route.ts
 *
 * PATCH — update existing agreement by ID
 *
 * Sprint: AGENTIK-MEETING-NOTES-PERSISTENCE-01
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { prisma }                     from "@/lib/prisma";
import { Prisma }                     from "@prisma/client";

interface RouteContext {
  params: { orgSlug: string; agreementId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body             = await req.json() as Record<string, unknown>;

    // Verify ownership before update
    const existing = await prisma.meetingAgreement.findFirst({
      where:  { id: params.agreementId, organizationId: organization.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;

    // Build update data only with fields present in body
    const data: Prisma.MeetingAgreementUpdateInput = {};

    if (body.metodoIntegracion        !== undefined) data.metodoIntegracion        = str(body.metodoIntegracion);
    if (body.metodoDescripcion        !== undefined) data.metodoDescripcion        = str(body.metodoDescripcion);
    if (body.metodoRestricciones      !== undefined) data.metodoRestricciones      = str(body.metodoRestricciones);
    if (body.metodoAccesoHistorico    !== undefined) data.metodoAccesoHistorico    = str(body.metodoAccesoHistorico);
    if (body.fuenteVentas             !== undefined) data.fuenteVentas             = str(body.fuenteVentas);
    if (body.fuentePagos              !== undefined) data.fuentePagos              = str(body.fuentePagos);
    if (body.fuenteRecaudos           !== undefined) data.fuenteRecaudos           = str(body.fuenteRecaudos);
    if (body.fuenteCartera            !== undefined) data.fuenteCartera            = str(body.fuenteCartera);
    if (body.fuentesNotas             !== undefined) data.fuentesNotas             = str(body.fuentesNotas);
    if (body.frecuenciaSincronizacion !== undefined) data.frecuenciaSincronizacion = str(body.frecuenciaSincronizacion);
    if (body.horaEjecucion            !== undefined) data.horaEjecucion            = str(body.horaEjecucion);
    if (body.syncNotas                !== undefined) data.syncNotas                = str(body.syncNotas);
    if (body.responsableSag           !== undefined) data.responsableSag           = str(body.responsableSag);
    if (body.rolSag                   !== undefined) data.rolSag                   = str(body.rolSag);
    if (body.responsableAgentik       !== undefined) data.responsableAgentik       = str(body.responsableAgentik);
    if (body.rolAgentik               !== undefined) data.rolAgentik               = str(body.rolAgentik);
    if (body.proximaReunion           !== undefined) data.proximaReunion           = str(body.proximaReunion);
    if (body.observaciones            !== undefined) data.observaciones            = str(body.observaciones);
    if (body.accionesJson             !== undefined) {
      data.accionesJson = body.accionesJson != null
        ? (body.accionesJson as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const updated = await prisma.meetingAgreement.update({
      where: { id: params.agreementId },
      data,
    });

    return NextResponse.json({ ok: true, agreement: updated });
  } catch (err) {
    console.error("[meeting-agreements PATCH]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
