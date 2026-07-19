/**
 * app/api/orgs/[orgSlug]/operational-map/meeting-agreements/route.ts
 *
 * GET  — returns the latest agreement for (org, meetingType)
 * POST — creates a new agreement record
 *
 * Sprint: AGENTIK-MEETING-NOTES-PERSISTENCE-01
 */

import { NextRequest, NextResponse }              from "next/server";
import { requireOrgAccess }                       from "@/lib/auth/org-access";
import { prisma }                                 from "@/lib/prisma";
import { Prisma }                                 from "@prisma/client";

interface RouteContext {
  params: { orgSlug: string };
}

// ── GET — fetch latest agreement ──────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const meetingType      = req.nextUrl.searchParams.get("meetingType") ?? "sag_validation";

    const agreement = await prisma.meetingAgreement.findFirst({
      where:   { organizationId: organization.id, meetingType },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ ok: true, agreement });
  } catch (err) {
    console.error("[meeting-agreements GET]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ── POST — create new agreement ───────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body             = await req.json() as Record<string, unknown>;

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;

    const agreement = await prisma.meetingAgreement.create({
      data: {
        organizationId:           organization.id,
        meetingType:              String(body.meetingType  ?? "sag_validation"),
        meetingDate:              String(body.meetingDate  ?? new Date().toISOString().slice(0, 10)),
        metodoIntegracion:        str(body.metodoIntegracion),
        metodoDescripcion:        str(body.metodoDescripcion),
        metodoRestricciones:      str(body.metodoRestricciones),
        metodoAccesoHistorico:    str(body.metodoAccesoHistorico),
        fuenteVentas:             str(body.fuenteVentas),
        fuentePagos:              str(body.fuentePagos),
        fuenteRecaudos:           str(body.fuenteRecaudos),
        fuenteCartera:            str(body.fuenteCartera),
        fuentesNotas:             str(body.fuentesNotas),
        frecuenciaSincronizacion: str(body.frecuenciaSincronizacion),
        horaEjecucion:            str(body.horaEjecucion),
        syncNotas:                str(body.syncNotas),
        responsableSag:           str(body.responsableSag),
        rolSag:                   str(body.rolSag),
        responsableAgentik:       str(body.responsableAgentik),
        rolAgentik:               str(body.rolAgentik),
        proximaReunion:           str(body.proximaReunion),
        accionesJson:             body.accionesJson != null
                                    ? (body.accionesJson as Prisma.InputJsonValue)
                                    : Prisma.JsonNull,
        observaciones:            str(body.observaciones),
      },
    });

    return NextResponse.json({ ok: true, agreement });
  } catch (err) {
    console.error("[meeting-agreements POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
