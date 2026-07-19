/**
 * GET  /api/orgs/[orgSlug]/operational-inventory/reservations
 * POST /api/orgs/[orgSlug]/operational-inventory/reservations
 *
 * GET  — list active (and optionally all) operational reservations for the org
 * POST — create one or more operational reservations
 *
 * ─── ARCHITECTURAL POSITION ─────────────────────────────────────────────────
 * This is Agentik's operational reservation layer.
 * Reservations exist BEFORE SAG legalizes the order.
 * They deduct from operationalAvailableQty while status = "active".
 *
 * Sprint: AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01
 */

import { NextResponse }           from "next/server";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { prisma }                 from "@/lib/prisma";
import { createReservations }     from "@/lib/operational-inventory/operational-reservation-engine";
import { mapSagInventoryToOperational } from "@/lib/operational-inventory/sag-to-operational-mapper";
import type { CreateReservationInput }  from "@/lib/operational-inventory/operational-reservation-engine";
import type { OperationalReservation }  from "@/lib/operational-inventory/operational-reservation-types";

export const runtime = "nodejs";

// ─── GET — list reservations ──────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") ?? "active";
    const reference    = searchParams.get("reference") ?? undefined;

    const where: Record<string, unknown> = {
      organizationId: organization.id,
    };
    if (statusFilter !== "all") where.status = statusFilter;
    if (reference) where.reference = reference.toUpperCase();

    const rows = await prisma.operationalReservation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    200,
    });

    return NextResponse.json({ ok: true, reservations: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// ─── POST — create reservation ────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as CreateReservationInput;

    if (!body.sourceType || !body.sourceId || !body.lines?.length) {
      return NextResponse.json(
        { ok: false, error: "sourceType, sourceId y al menos una línea son requeridos" },
        { status: 400 },
      );
    }

    // Load current active reservations for this org (needed for availability check)
    const existingRows = await prisma.operationalReservation.findMany({
      where: { organizationId: organization.id, status: "active" },
    });

    const existingReservations: OperationalReservation[] = existingRows.map(r => ({
      id:             r.id,
      organizationId: r.organizationId,
      sourceType:     r.sourceType as OperationalReservation["sourceType"],
      sourceId:       r.sourceId,
      salesRepId:     r.salesRepId ?? undefined,
      customerId:     r.customerId ?? undefined,
      reference:      r.reference,
      description:    r.description,
      qtyReserved:    r.qtyReserved,
      qtyReleased:    r.qtyReleased,
      qtyConsumed:    r.qtyConsumed,
      status:         r.status as OperationalReservation["status"],
      reason:         r.reason,
      expiresAt:      r.expiresAt?.toISOString(),
      createdAt:      r.createdAt.toISOString(),
      updatedAt:      r.updatedAt.toISOString(),
    }));

    // Load SAG inventory snapshot for this org (V1: from InventorySnapshot model)
    // If no snapshot exists, engine will reject all lines with "no encontrada"
    const snapshot = await _loadInventorySnapshot(organization.id);

    // Run engine (pure, no DB side effects)
    const result = createReservations(
      { ...body, organizationId: organization.id },
      snapshot,
      existingReservations,
    );

    if (result.reservations.length === 0) {
      return NextResponse.json({
        ok:     false,
        error:  "Ninguna línea pudo reservarse",
        errors: result.errors,
      }, { status: 422 });
    }

    // Persist accepted reservations + events in a transaction
    const now = new Date();
    const persisted = await prisma.$transaction(
      result.reservations.map((r, idx) =>
        prisma.operationalReservation.create({
          data: {
            id:             r.id,
            organizationId: organization.id,
            sourceType:     r.sourceType,
            sourceId:       r.sourceId,
            salesRepId:     r.salesRepId ?? null,
            customerId:     r.customerId ?? null,
            reference:      r.reference,
            description:    r.description,
            qtyReserved:    r.qtyReserved,
            qtyReleased:    0,
            qtyConsumed:    0,
            status:         "active",
            reason:         r.reason,
            expiresAt:      r.expiresAt ? new Date(r.expiresAt) : null,
            createdAt:      now,
            updatedAt:      now,
            events: {
              create: {
                organizationId: organization.id,
                type:           "reservation.created",
                payloadJson:    result.impacts[idx] as object,
              },
            },
          },
        }),
      ),
    );

    return NextResponse.json({
      ok:              true,
      reservations:    persisted,
      impacts:         result.impacts,
      pressureSignals: result.pressureSignals,
      errors:          result.errors,
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// ─── Inventory snapshot loader ────────────────────────────────────────────────

/**
 * V1: loads the most recent CommercialCoverageSnapshot rows (one per reference)
 * and maps to OperationalInventoryItem[]. Returns empty array if none found.
 *
 * V2: will query SAG ODBC directly via dedicated InventorySnapshot model.
 */
async function _loadInventorySnapshot(organizationId: string) {
  try {
    // Find latest snapshotAt date
    const latest = await prisma.commercialCoverageSnapshot.findFirst({
      where:   { organizationId },
      orderBy: { snapshotAt: "desc" },
      select:  { snapshotAt: true },
    });
    if (!latest) return [];

    // Load all refs from that snapshot
    const rows = await prisma.commercialCoverageSnapshot.findMany({
      where: { organizationId, snapshotAt: latest.snapshotAt },
    });

    const snapshotAt = latest.snapshotAt.toISOString();

    return mapSagInventoryToOperational(
      rows.map(r => ({
        reference:            r.refCode.toUpperCase(),
        description:          r.description,
        line:                 r.line as "LT" | "CS",
        category:             "",   // V1: not stored in coverage snapshot
        productType:          "",   // V1: not stored
        // V1 derivation: disponible = availableForCases (SAG disponible proxy)
        // physicalQty = disponible + pendingPD (best V1 approximation)
        initialWarehouseQty:  r.disponible + (r.pendingOrdersQty ?? 0),
        reservedQty:          r.pendingOrdersQty ?? 0,
        availableForCases:    r.disponible,
        pendingPDQty:         r.pendingOrdersQty ?? 0,
        apCleanupQty:         0,
      })),
      "sag_excel_import",
      snapshotAt,
    );
  } catch {
    return [];
  }
}
