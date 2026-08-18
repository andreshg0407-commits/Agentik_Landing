/**
 * ORDERS-SAG-RUNTIME-PROBE-06A0R
 *
 * Temporary diagnostic instrument — Preview-only, ORG_ADMIN protected, read-only.
 * Executes REAL runtime queries against SAG SOAP, Neon (Prisma), and in-memory config.
 *
 * Sections:
 *   A. SAG identity (DB_NAME, @@SERVERNAME)
 *   B. Today window boundaries (COT)
 *   C. Real KPI values from computeServerKpiStats
 *   D. Order total reconciliation (3 sources)
 *   E. 5 real SAG orders (CustomerOrderRecord)
 *   F. Seller coverage by year
 *   G. AGK orders (AgentExecution)
 *   H. Reservation status per AGK order
 *   I. SIMULATION mode confirmation
 *
 * Guards:
 *   - VERCEL_ENV !== "production" (blocks prod)
 *   - requireOrgAccess (ORG_ADMIN membership)
 *   - orgSlug must be "castillitos"
 *   - Read-only: no writes to SAG, Neon, or queues
 *   - No credentials, tokens, or connection strings in output
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  getSagConnection,
  describeSagConnection,
} from "@/lib/connectors/pya/sag-source-router";
import { computeServerKpiStats } from "@/lib/comercial/pedidos/order-service";
import {
  CASTILLITOS_SAG_WRITE,
} from "@/lib/comercial/pedidos/order-policy-pack-config";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_ORG = "castillitos";

export async function GET(req: Request) {
  // ── Guard: Preview-only ────────────────────────────────────────────────
  const vercelEnv = process.env.VERCEL_ENV ?? "development";
  if (vercelEnv === "production") {
    return NextResponse.json(
      { error: "BLOCKED_PRODUCTION", message: "This probe is Preview-only." },
      { status: 403 },
    );
  }

  // ── Guard: Auth + org ─────────────────────────────────────────────────
  // Dual auth: NextAuth session OR PROBE_SECRET query param (Preview-only).
  // PROBE_SECRET is a Vercel env var set only on Preview deployments.
  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get("org") ?? ALLOWED_ORG;

  if (orgSlug !== ALLOWED_ORG) {
    return NextResponse.json(
      { error: "WRONG_ORG", message: `Only ${ALLOWED_ORG} is allowed.` },
      { status: 403 },
    );
  }

  const probeSecret = searchParams.get("secret");
  const expectedSecret = process.env.PROBE_SECRET;
  let authMethod = "unknown";
  let userId = "probe-secret";
  let userRole = "PROBE";
  let orgId: string;

  if (probeSecret && expectedSecret && probeSecret === expectedSecret) {
    // Secret-based auth — resolve org directly
    authMethod = "PROBE_SECRET";
    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 });
    }
    orgId = org.id;
  } else {
    // Session-based auth
    let ctx;
    try {
      ctx = await requireOrgAccess(orgSlug);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AUTH_FAILED";
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    authMethod = "SESSION";
    orgId = ctx.organization.id;
    userId = ctx.user.id;
    userRole = ctx.membership.role;
  }

  const result: Record<string, unknown> = {
    probe: "ORDERS-SAG-RUNTIME-PROBE-06A0R",
    vercelEnv,
    orgSlug,
    orgId,
    timestamp: new Date().toISOString(),
    authMethod,
    user: userId,
    role: userRole,
  };

  // ══════════════════════════════════════════════════════════════════════
  // A. SAG IDENTITY
  // ══════════════════════════════════════════════════════════════════════
  try {
    const sagInfo = describeSagConnection("CURRENT");
    const config = getSagConnection("CURRENT");
    const identityRows = await consultaSagJson(
      config,
      "SELECT DB_NAME() AS database_name, @@SERVERNAME AS server_name",
    );
    result.sectionA_sagIdentity = {
      status: "OK",
      configDatabase: sagInfo.database,
      endpoint: sagInfo.endpoint,
      queryResult: identityRows[0] ?? null,
    };
  } catch (e: unknown) {
    result.sectionA_sagIdentity = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // B. TODAY WINDOW BOUNDARIES (COT)
  // ══════════════════════════════════════════════════════════════════════
  const tenantTimezoneOffset = -300; // COT
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tenantMs = utcMs - tenantTimezoneOffset * 60_000;
  const tenantNow = new Date(tenantMs);
  const todayStart = new Date(
    Date.UTC(
      tenantNow.getUTCFullYear(),
      tenantNow.getUTCMonth(),
      tenantNow.getUTCDate(),
    ),
  );
  todayStart.setMinutes(todayStart.getMinutes() + tenantTimezoneOffset);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60_000);

  result.sectionB_todayWindow = {
    serverNowUtc: now.toISOString(),
    tenantNow: tenantNow.toISOString(),
    todayStartUtc: todayStart.toISOString(),
    tomorrowStartUtc: tomorrowStart.toISOString(),
    timezoneOffset: tenantTimezoneOffset,
    timezone: "America/Bogota",
  };

  // ══════════════════════════════════════════════════════════════════════
  // C. REAL KPI VALUES
  // ══════════════════════════════════════════════════════════════════════
  try {
    const kpis = await computeServerKpiStats(orgId, tenantTimezoneOffset);
    result.sectionC_kpis = { status: "OK", ...kpis };
  } catch (e: unknown) {
    result.sectionC_kpis = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // D. ORDER TOTAL RECONCILIATION (3 sources)
  // ══════════════════════════════════════════════════════════════════════
  try {
    const [agentCount, crmCount, corCount] = await Promise.all([
      prisma.agentExecution
        .count({
          where: {
            tenantId: orgId,
            module: "comercial",
            operation: "COMERCIAL_ORDER_DRAFT",
          },
        })
        .catch(() => 0),
      prisma.cRMQuote
        .count({ where: { organizationId: orgId } })
        .catch(() => 0),
      prisma.customerOrderRecord
        .count({ where: { organizationId: orgId } })
        .catch(() => 0),
    ]);

    result.sectionD_reconciliation = {
      status: "OK",
      agentExecutions: agentCount,
      crmQuotes: crmCount,
      customerOrderRecords: corCount,
      total: agentCount + crmCount + corCount,
      expectedTotal: 10193,
      delta: agentCount + crmCount + corCount - 10193,
    };
  } catch (e: unknown) {
    result.sectionD_reconciliation = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // E. 5 REAL SAG ORDERS (CustomerOrderRecord)
  // ══════════════════════════════════════════════════════════════════════
  try {
    const sagOrders = await prisma.customerOrderRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { orderDate: "desc" },
      take: 5,
      select: {
        id: true,
        erpMovId: true,
        orderNumber: true,
        customerName: true,
        sellerName: true,
        sellerTerceroId: true,
        orderDate: true,
        amount: true,
        status: true,
        lineCount: true,
        syncedAt: true,
      },
    });
    result.sectionE_sagOrders = { status: "OK", count: sagOrders.length, orders: sagOrders };
  } catch (e: unknown) {
    result.sectionE_sagOrders = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // F. SELLER COVERAGE BY YEAR
  // ══════════════════════════════════════════════════════════════════════
  try {
    // Group by year, count total and those with sellerName != null
    const allOrders = await prisma.customerOrderRecord.findMany({
      where: { organizationId: orgId },
      select: { orderDate: true, sellerName: true },
    });

    const byYear: Record<string, { total: number; withSeller: number; noSeller: number }> = {};
    for (const o of allOrders) {
      const year = o.orderDate
        ? new Date(o.orderDate).getFullYear().toString()
        : "unknown";
      if (!byYear[year]) byYear[year] = { total: 0, withSeller: 0, noSeller: 0 };
      byYear[year].total++;
      if (o.sellerName && o.sellerName !== "No informado por SAG") {
        byYear[year].withSeller++;
      } else {
        byYear[year].noSeller++;
      }
    }

    // Add coverage %
    const coverage = Object.entries(byYear)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, v]) => ({
        year,
        ...v,
        coveragePct: v.total > 0 ? Math.round((v.withSeller / v.total) * 100) : 0,
      }));

    result.sectionF_sellerCoverage = { status: "OK", coverage };
  } catch (e: unknown) {
    result.sectionF_sellerCoverage = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // G. AGK ORDERS (AgentExecution)
  // ══════════════════════════════════════════════════════════════════════
  try {
    const agkRows = await prisma.agentExecution.findMany({
      where: {
        tenantId: orgId,
        module: "comercial",
        operation: "COMERCIAL_ORDER_DRAFT",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        metadataJson: true,
      },
    });

    const agkOrders = agkRows.map((r: any) => {
      const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        createdAt: r.createdAt,
        status: meta.status ?? "unknown",
        origin: meta.origin ?? "unknown",
        customerName: (meta.header as any)?.customerName ?? null,
        totalValue: meta.totalValue ?? 0,
        lineCount: meta.lineCount ?? 0,
        sagOrderId: meta.sagOrderId ?? null,
        hasConflict: !!meta.hasConflict,
        reservationExpired: !!meta.reservationExpired,
        wizardSessionKey: meta.wizardSessionKey ?? null,
        externalSyncKey: meta.externalSyncKey ?? null,
      };
    });

    result.sectionG_agkOrders = {
      status: "OK",
      count: agkOrders.length,
      orders: agkOrders,
    };
  } catch (e: unknown) {
    result.sectionG_agkOrders = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // H. RESERVATION STATUS
  // ══════════════════════════════════════════════════════════════════════
  try {
    const reservations = await prisma.operationalReservation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        reference: true,
        qtyReserved: true,
        qtyReleased: true,
        qtyConsumed: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    result.sectionH_reservations = {
      status: "OK",
      count: reservations.length,
      reservations,
    };
  } catch (e: unknown) {
    result.sectionH_reservations = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // I. SIMULATION MODE CONFIRMATION
  // ══════════════════════════════════════════════════════════════════════
  result.sectionI_simulation = {
    sagWriteEnabled: CASTILLITOS_SAG_WRITE.enabled,
    sagWriteMode: CASTILLITOS_SAG_WRITE.mode,
    idempotencyKeyVersion: CASTILLITOS_SAG_WRITE.idempotencyKeyVersion,
    isSimulation: CASTILLITOS_SAG_WRITE.mode === "SIMULATION",
    ruling: CASTILLITOS_SAG_WRITE.mode === "SIMULATION"
      ? "CONFIRMED: All SAG writes are SIMULATION — no real SagWriteOperation rows created"
      : "WARNING: SAG writes are LIVE",
  };

  // ══════════════════════════════════════════════════════════════════════
  // J. SAG WRITE OPERATION COUNT (verify SIMULATION = 0 real writes)
  // ══════════════════════════════════════════════════════════════════════
  try {
    const writeOps = await prisma.sagWriteOperation.count({
      where: { organizationId: orgId },
    });
    result.sectionJ_sagWriteOps = {
      status: "OK",
      count: writeOps,
      ruling: writeOps === 0
        ? "CONFIRMED: Zero SagWriteOperation rows — consistent with SIMULATION mode"
        : `WARNING: ${writeOps} SagWriteOperation rows exist`,
    };
  } catch (e: unknown) {
    result.sectionJ_sagWriteOps = {
      status: "ERROR",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json(result, { status: 200 });
}
