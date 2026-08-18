/**
 * ORDERS-TEST-DATA-CLEANUP-06A1A
 *
 * One-shot cleanup endpoint — Preview-only, PROBE_SECRET protected.
 * Cancels both test AGK orders using the domain cancelOrder() flow,
 * which sets status="cancelado" and releases all OperationalReservations.
 *
 * Target orders:
 *   #1: cmsku43cf (consecutivo=1, $117,478, 2 units)
 *   #2: cmslanbpp (consecutivo=2, $1,057,140, 20 units, CJ-2026027B)
 *
 * Guards:
 *   - VERCEL_ENV !== "production"
 *   - PROBE_SECRET required
 *   - castillitos only
 *   - Idempotent: re-running after cancellation returns already-cancelled status
 *   - Zero SAG writes
 *
 * Sprint: ORDERS-TEST-DATA-CLEANUP-06A1A
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelOrder } from "@/lib/comercial/pedidos/order-service";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_ORG = "castillitos";

// The two test AGK orders created by Andrés for flow testing
const TEST_ORDER_IDS = ["cmsku43cf", "cmslanbpp"] as const;

export async function POST(req: Request) {
  // ── Guard: Preview-only ──────────────────────────────────────────────
  const vercelEnv = process.env.VERCEL_ENV ?? "development";
  if (vercelEnv === "production") {
    return NextResponse.json(
      { error: "BLOCKED_PRODUCTION", message: "Cleanup is Preview-only." },
      { status: 403 },
    );
  }

  // ── Guard: PROBE_SECRET ──────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const probeSecret = searchParams.get("secret");
  const expectedSecret = process.env.PROBE_SECRET;

  if (!probeSecret || !expectedSecret || probeSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "AUTH_FAILED", message: "PROBE_SECRET required." },
      { status: 401 },
    );
  }

  // ── Resolve org ──────────────────────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where: { slug: ALLOWED_ORG },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 });
  }
  const orgId = org.id;

  // ── Before snapshot ──────────────────────────────────────────────────
  const before = await captureSnapshot(orgId);

  // ── Cancel each test order ───────────────────────────────────────────
  const results: Record<string, unknown> = {};

  for (const orderId of TEST_ORDER_IDS) {
    try {
      // Check current status first
      const row = await (prisma as any).agentExecution.findFirst({
        where: {
          id: orderId,
          tenantId: orgId,
          module: "comercial",
          operation: "COMERCIAL_ORDER_DRAFT",
        },
        select: { id: true, metadataJson: true },
      });

      if (!row) {
        results[orderId] = { status: "NOT_FOUND", message: "Order not found" };
        continue;
      }

      const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
      const currentStatus = meta.status as string;

      if (currentStatus === "cancelado") {
        results[orderId] = {
          status: "ALREADY_CANCELLED",
          message: "Order was already cancelled (idempotent)",
          consecutivo: meta.consecutivo,
        };
        continue;
      }

      // Cancel via domain flow — sets status="cancelado" + releases reservations
      const result = await cancelOrder(orgId, orderId);

      results[orderId] = {
        status: "CANCELLED",
        consecutivo: meta.consecutivo,
        previousStatus: currentStatus,
        newStatus: result.order?.status ?? "unknown",
        reservation: result.reservation
          ? {
              ok: result.reservation.ok,
              status: result.reservation.status,
              sync: (result.reservation as any).sync ?? null,
              message: (result.reservation as any).message ?? null,
            }
          : null,
      };
    } catch (e: unknown) {
      results[orderId] = {
        status: "ERROR",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ── After snapshot ───────────────────────────────────────────────────
  const after = await captureSnapshot(orgId);

  return NextResponse.json({
    action: "ORDERS-TEST-DATA-CLEANUP-06A1A",
    timestamp: new Date().toISOString(),
    testOrderIds: TEST_ORDER_IDS,
    results,
    before,
    after,
    deltas: {
      pendientesEnvioSag: `${before.pendientesEnvioSag} → ${after.pendientesEnvioSag}`,
      activeReservations: `${before.activeReservations} → ${after.activeReservations}`,
      totalReservedQty: `${before.totalReservedQty} → ${after.totalReservedQty}`,
      agkNonCancelled: `${before.agkNonCancelled} → ${after.agkNonCancelled}`,
    },
  });
}

// ── Snapshot helper ────────────────────────────────────────────────────────

async function captureSnapshot(orgId: string) {
  // AGK orders status breakdown
  let agkTotal = 0;
  let agkCancelled = 0;
  let agkNonCancelled = 0;
  let pendientesEnvioSag = 0;

  try {
    const agkRows = await (prisma as any).agentExecution.findMany({
      where: {
        tenantId: orgId,
        module: "comercial",
        operation: "COMERCIAL_ORDER_DRAFT",
      },
      select: { metadataJson: true },
    });

    for (const r of agkRows) {
      agkTotal++;
      const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
      const status = meta.status as string;
      const origin = meta.origin as string;
      const isNative = origin === "AGENTIK_NATIVE" || origin === "agentik";

      if (status === "cancelado") {
        agkCancelled++;
      } else {
        agkNonCancelled++;
        if (isNative && (status === "listo_para_enviar" || status === "pendiente_sag")) {
          pendientesEnvioSag++;
        }
      }
    }
  } catch {
    // AgentExecution not available
  }

  // Reservations
  let activeReservations = 0;
  let totalReservedQty = 0;

  try {
    const reservations = await prisma.operationalReservation.findMany({
      where: { organizationId: orgId, status: "active" },
      select: { qtyReserved: true },
    });
    activeReservations = reservations.length;
    totalReservedQty = reservations.reduce(
      (sum: number, r: any) => sum + (Number(r.qtyReserved) || 0),
      0,
    );
  } catch {
    // OperationalReservation not available
  }

  return {
    agkTotal,
    agkCancelled,
    agkNonCancelled,
    pendientesEnvioSag,
    activeReservations,
    totalReservedQty,
    capturedAt: new Date().toISOString(),
  };
}
