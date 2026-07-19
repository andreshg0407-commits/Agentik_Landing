// @ts-nocheck
/**
 * scripts/_validate-fulfillment.ts
 *
 * Phase 8 validation: run fulfillment engine against real Castillitos pedidos.
 * Usage: npx tsx scripts/_validate-fulfillment.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

// Import fulfillment engine (pure domain, no server-only)
import {
  evaluateOrderFulfillment,
  sortFulfillmentLines,
  buildFulfillmentDavidMessage,
} from "../lib/comercial/pedidos/order-fulfillment";
import type { OrderDraft, OrderLine } from "../lib/comercial/pedidos/order-types";

function quoteLineToOrderLine(ql: any): OrderLine {
  // CRMQuoteLine uses: reference, qty, unitPrice, size, color
  // availableUnits is NOT in the CRM model — always null (inventory not linked)
  const qty = Number(ql.qty) || 0;
  const price = Number(ql.unitPrice) || 0;
  return {
    id: ql.id,
    referenceCode: ql.reference ?? "",
    productName: ql.productName ?? "",
    size: ql.size ?? "",
    color: ql.color ?? "",
    quantity: qty,
    unitPrice: price,
    lineTotal: qty * price,
    availableUnits: null, // same as order-service.ts — inventory not linked from CRM
    removed: false,
  };
}

async function main() {
  console.log("=== COMERCIAL-PEDIDOS-DAVID-STOCK-03 — Phase 8 Validation ===\n");

  const quotes = await prisma.cRMQuote.findMany({
    where: { organization: { slug: "castillitos" } },
    include: { quoteLines: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  console.log(`Pedidos found: ${quotes.length}\n`);

  for (const q of quotes) {
    const lines: OrderLine[] = (q.quoteLines as any[]).map(quoteLineToOrderLine);
    const draft: OrderDraft = {
      header: {
        customerName: q.customerName ?? "",
        customerCode: q.customerCode ?? "",
        sellerName: "",
      },
      lines,
      origin: "sag",
    };

    const fulfillment = evaluateOrderFulfillment(draft);
    const sorted = sortFulfillmentLines(fulfillment.lines);
    const davidMsg = buildFulfillmentDavidMessage(fulfillment);

    console.log(`--- Pedido: ${q.sagOrderId || q.id}`);
    console.log(`  Lines: ${fulfillment.totalLines} | Grade: ${fulfillment.status} | Coverage: ${fulfillment.completionPercent}%`);
    console.log(`  Available: ${fulfillment.availableLines} | LowStock: ${fulfillment.lowStockLines} | Partial: ${fulfillment.partialLines} | Blocked: ${fulfillment.blockedLines} | Unknown: ${fulfillment.unknownLines}`);
    console.log(`  David: "${davidMsg}"`);

    // Show first 3 sorted lines
    for (const sl of sorted.slice(0, 3)) {
      console.log(`    ${sl.status.padEnd(18)} ${sl.referenceCode.padEnd(12)} ${sl.color.padEnd(16)} ${sl.size.padEnd(6)} req:${sl.requestedQty} avail:${sl.availableQty ?? "—"} deficit:${sl.deficitQty}`);
    }
    if (sorted.length > 3) console.log(`    ... +${sorted.length - 3} more lines`);
    console.log();
  }

  // Summary
  const total = await prisma.cRMQuote.count({ where: { organization: { slug: "castillitos" } } });
  const withLines = await prisma.cRMQuote.count({
    where: { organization: { slug: "castillitos" }, quoteLines: { some: {} } },
  });
  console.log(`=== SUMMARY ===`);
  console.log(`Total pedidos: ${total} | Con lineas: ${withLines}`);

  await prisma.$disconnect();
  pool.end();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
