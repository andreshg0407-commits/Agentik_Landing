/**
 * GET /api/cron/inventory-refresh
 *
 * Vercel Cron endpoint — runs the full inventory refresh pipeline:
 *   1. PIL SYNC  — SAG SOAP → ProductVariant + ProductInventoryLevel
 *   2. PD RECON  — Transition fulfilled PENDIENTE orders → FACTURADO
 *   3. SNAPSHOT  — PIL + PD → CommercialCoverageSnapshot
 *
 * Protected by INTERNAL_CRON_SECRET.
 * Schedule: daily at 5:00 AM UTC (vercel.json)
 *
 * Can also be triggered on-demand via:
 *   POST /api/orgs/[orgSlug]/integrations/sag/refresh-inventory
 *
 * Sprint: INVENTORY-SYNC-FRESHNESS-01
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshInventoryPipeline } from "@/lib/integrations/sag/inventory-refresh-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  // Custom header (legacy)
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;

  // Query param
  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
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

  try {
    // Find all active SAG connectors to get org IDs
    const connectors = await prisma.connector.findMany({
      where: { status: "ACTIVE", source: "sag_pya_soap" },
      select: { organizationId: true },
    });

    if (connectors.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No active SAG connectors",
        ms: Date.now() - t0,
      });
    }

    // Deduplicate org IDs
    const orgIds = [...new Set(connectors.map(c => c.organizationId))];

    const results = [];

    for (const orgId of orgIds) {
      try {
        const result = await refreshInventoryPipeline(orgId);
        results.push({ orgId, ...result });
      } catch (err) {
        results.push({
          orgId,
          status: "error",
          error: (err as Error).message,
        });
        console.error(`[cron/inventory-refresh] ${orgId} failed:`, (err as Error).message);
      }
    }

    return NextResponse.json({
      ok: true,
      orgs: orgIds.length,
      results,
      ms: Date.now() - t0,
    });
  } catch (err) {
    console.error("[cron/inventory-refresh] Fatal:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message, ms: Date.now() - t0 },
      { status: 500 },
    );
  }
}
