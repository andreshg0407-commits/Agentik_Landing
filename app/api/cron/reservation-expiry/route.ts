/**
 * GET /api/cron/reservation-expiry
 *
 * Vercel Cron endpoint — expires stale operational reservations.
 *
 * Pipeline:
 *   1. Find all active reservations with expiresAt <= now
 *   2. Update status to "expired", set qtyReleased
 *   3. Process in batches of 100, tenant-isolated
 *
 * Protected by INTERNAL_CRON_SECRET.
 * Recommended schedule: every 30 minutes (0,30 * * * *)
 *
 * Idempotent: running multiple times is safe — already expired reservations
 * are skipped by the WHERE clause.
 *
 * Sprint: AGENTIK-ORDERS-RESERVATION-ADAPTER-01
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

const BATCH_SIZE = 100;

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;

  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (CRON_SECRET && token === CRON_SECRET) return true;
    if (VERCEL_CRON_SECRET && token === VERCEL_CRON_SECRET) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const now = new Date();
  let totalExpired = 0;
  const orgCounts: Record<string, number> = {};

  try {
    // Process in batches to avoid locking too many rows at once
    let hasMore = true;

    while (hasMore) {
      // Find next batch of expired active reservations
      const batch = await prisma.operationalReservation.findMany({
        where: {
          status:    "active",
          expiresAt: { lte: now },
        },
        select: {
          id:             true,
          organizationId: true,
          qtyReserved:    true,
          qtyConsumed:    true,
        },
        take: BATCH_SIZE,
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Update each reservation to expired
      // Uses individual updates to maintain tenant isolation in audit trail
      for (const row of batch) {
        await prisma.operationalReservation.update({
          where: { id: row.id },
          data: {
            status:      "expired",
            qtyReleased: row.qtyReserved - row.qtyConsumed,
            updatedAt:   now,
          },
        });

        totalExpired++;
        orgCounts[row.organizationId] = (orgCounts[row.organizationId] ?? 0) + 1;
      }

      // If batch was smaller than BATCH_SIZE, no more to process
      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    return NextResponse.json({
      ok: true,
      expired: totalExpired,
      orgs: orgCounts,
      ms: Date.now() - t0,
    });
  } catch (err) {
    console.error("[cron/reservation-expiry] Error:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message, ms: Date.now() - t0 },
      { status: 500 },
    );
  }
}
