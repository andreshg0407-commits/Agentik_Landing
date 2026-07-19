/**
 * PATCH /api/orgs/[orgSlug]/operational-inventory/reservations/[reservationId]
 *
 * Actions (via body.action):
 *   release  — free units back to operational pool (order cancelled)
 *   consume  — mark as consumed (order confirmed → SAG PD sent)
 *   cancel   — manually void with reason
 *
 * Sprint: AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01
 */

import { NextResponse }              from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { prisma }                    from "@/lib/prisma";
import {
  releaseReservation,
  consumeReservation,
  cancelReservation,
}                                    from "@/lib/operational-inventory/operational-reservation-engine";
import type { OperationalReservation } from "@/lib/operational-inventory/operational-reservation-types";

export const runtime = "nodejs";

interface PatchBody {
  action:  "release" | "consume" | "cancel";
  reason?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string; reservationId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as PatchBody;

    if (!body.action) {
      return NextResponse.json({ ok: false, error: "action requerido" }, { status: 400 });
    }

    const row = await prisma.operationalReservation.findFirst({
      where: { id: params.reservationId, organizationId: organization.id },
    });

    if (!row) {
      return NextResponse.json({ ok: false, error: "Reserva no encontrada" }, { status: 404 });
    }

    const reservation: OperationalReservation = {
      id:             row.id,
      organizationId: row.organizationId,
      sourceType:     row.sourceType as OperationalReservation["sourceType"],
      sourceId:       row.sourceId,
      salesRepId:     row.salesRepId ?? undefined,
      customerId:     row.customerId ?? undefined,
      reference:      row.reference,
      description:    row.description,
      qtyReserved:    row.qtyReserved,
      qtyReleased:    row.qtyReleased,
      qtyConsumed:    row.qtyConsumed,
      status:         row.status as OperationalReservation["status"],
      reason:         row.reason,
      expiresAt:      row.expiresAt?.toISOString(),
      createdAt:      row.createdAt.toISOString(),
      updatedAt:      row.updatedAt.toISOString(),
    };

    let updated: OperationalReservation;
    let eventType: string;

    if (body.action === "release") {
      // releaseReservation needs inventory + existing reservations for impact computation
      // For the PATCH route, we only need the state change — impact is informational
      updated   = releaseReservation(reservation, [], []).reservation;
      eventType = "reservation.released";
    } else if (body.action === "consume") {
      updated   = consumeReservation(reservation);
      eventType = "reservation.consumed";
    } else if (body.action === "cancel") {
      const reason = body.reason ?? "Cancelado manualmente";
      updated   = cancelReservation(reservation, reason);
      eventType = "reservation.cancelled";
    } else {
      return NextResponse.json({ ok: false, error: "Acción no válida" }, { status: 400 });
    }

    const now = new Date();
    const [persisted] = await prisma.$transaction([
      prisma.operationalReservation.update({
        where: { id: row.id },
        data: {
          qtyReleased: updated.qtyReleased,
          qtyConsumed: updated.qtyConsumed,
          status:      updated.status,
          reason:      updated.reason,
          updatedAt:   now,
        },
      }),
      prisma.operationalReservationEvent.create({
        data: {
          organizationId: organization.id,
          reservationId:  row.id,
          type:           eventType,
          payloadJson:    { action: body.action, reason: body.reason ?? null } as object,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, reservation: persisted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
