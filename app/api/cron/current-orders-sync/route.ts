/**
 * /api/cron/current-orders-sync
 *
 * AGENTIK-CURRENT-SAG-ORDER-INGESTION-01 — cron DEDICADO de pedidos CURRENT.
 *
 * El cron compartido (data-sync) salta los módulos pesados SAG por presupuesto
 * de tiempo (SAG_HEAVY_MODULES + 300s Vercel), por lo que los pedidos CURRENT
 * nunca llegaban a ingerirse. Esta ruta corre EXCLUSIVAMENTE la ingestión
 * dedicada: PD CURRENT → CustomerOrderRecord → MOVIMIENTOS_ITEMS CURRENT →
 * CustomerOrderLine. CURRENT-only, idempotente, reanudable (piso = máximo
 * pedido local >= cutover, clampado al cutover).
 *
 * Protegida por INTERNAL_CRON_SECRET (mismo patrón que data-sync).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  runCurrentOrderIngestion,
  CURRENT_CUTOVER,
} from "@/lib/connectors/adapters/sag-pya-soap/orders/current-order-ingestion";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;
  if (VERCEL_CRON_SECRET && header === VERCEL_CRON_SECRET) return true;
  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  try {
    // Orgs con conector SAG activo — misma selección que data-sync
    const connectors: Array<{ organizationId: string }> = await db.connector.findMany({
      where: { status: { not: "INACTIVE" }, source: "sag_pya_soap" },
      select: { organizationId: true },
    });
    const orgIds = [...new Set(connectors.map(c => c.organizationId))];

    const results = [];
    for (const orgId of orgIds) {
      // Reanudación determinista: piso = último pedido local >= cutover
      // (menos 1 día por seguridad de re-lectura); clampeado al cutover
      // dentro del propio servicio — jamás por debajo.
      const newestCurrent = await db.customerOrderRecord.findFirst({
        where: { organizationId: orgId, orderDate: { gte: CURRENT_CUTOVER } },
        orderBy: { orderDate: "desc" },
        select: { orderDate: true },
      });
      const sinceDate = newestCurrent?.orderDate
        ? new Date(newestCurrent.orderDate.getTime() - 86_400_000)
        : null;

      const r = await runCurrentOrderIngestion({ organizationId: orgId, sinceDate });
      results.push({ orgId, ...r });
      console.log(
        `[cron/current-orders-sync] org=${orgId} floor=${r.floorDate} headers=${r.headersImported}/${r.headersEligible} lines=${r.lines?.linesCreated ?? 0} ok=${r.success}${r.error ? ` error=${r.error}` : ""}`,
      );
    }

    return NextResponse.json({ ok: true, results, ms: Date.now() - t0 });
  } catch (e) {
    console.error("[cron/current-orders-sync] failed:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message, ms: Date.now() - t0 }, { status: 500 });
  }
}
