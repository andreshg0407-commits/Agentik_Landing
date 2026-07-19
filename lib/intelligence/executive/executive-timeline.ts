/**
 * executive-timeline.ts
 *
 * Timeline Engine — produces timeline events from engine outputs.
 * Currently returns events based on available data.
 * Prepared for future modules (payments, collections, etc).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { TimelineEvent } from "./executive-types";
import { nextTimelineId } from "./executive-utils";

const db = prisma as any;

export async function runTimelineEngine(orgId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const since = new Date();
  since.setDate(since.getDate() - 7);

  // Recent quotes (pedidos)
  try {
    const recentQuotes = await prisma.cRMQuote.findMany({
      where: { organizationId: orgId, issuedAt: { gte: since } },
      select: { quoteNumber: true, issuedAt: true, sellerName: true, amount: true },
      orderBy: { issuedAt: "desc" },
      take: 10,
    });

    for (const q of recentQuotes) {
      events.push({
        id: nextTimelineId(),
        type: "pedido_creado",
        title: `Pedido ${q.quoteNumber ?? ""}`,
        description: `Pedido por ${q.sellerName ?? "vendedor"}. Valor: $${Number(q.amount) || 0}`,
        source: "commercial-engine",
        reference: q.quoteNumber ?? null,
        occurredAt: q.issuedAt?.toISOString() ?? new Date().toISOString(),
      });
    }
  } catch { /* quotes may not exist */ }

  // Recent production orders
  try {
    const recentOps = await db.productionOrder.findMany({
      where: { organizationId: orgId, documentDate: { gte: since } },
      select: { documentNumber: true, documentDate: true, status: true },
      orderBy: { documentDate: "desc" },
      take: 10,
    });

    for (const op of recentOps) {
      events.push({
        id: nextTimelineId(),
        type: "nueva_op",
        title: `OP #${op.documentNumber}`,
        description: `Orden de produccion ${op.status === "closed" ? "cerrada" : "abierta"}.`,
        source: "production-engine",
        reference: op.documentNumber,
        occurredAt: op.documentDate?.toISOString() ?? new Date().toISOString(),
      });
    }
  } catch { /* production tables may not exist */ }

  // Sort by date desc
  events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return events.slice(0, 30);
}
