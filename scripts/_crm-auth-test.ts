/**
 * Test CRM authentication and then sync all quote lines.
 * Usage: export $(grep -E '^DATABASE_URL=' .env | xargs) && npx tsx scripts/_crm-auth-test.ts
 * Temporary — delete after validation.
 */

const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request: string, ...args: any[]) {
  if (request === "server-only") return request;
  return origResolve.call(this, request, ...args);
};
Module._cache["server-only"] = { id: "server-only", filename: "server-only", loaded: true, exports: {} };

import { prisma } from "../lib/prisma";
import { CastillitosCrmAdapter } from "../lib/connectors/adapters/castillitos-crm/index";
import { upsertQuoteLines } from "../lib/connectors/adapters/castillitos-crm/storage";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  // Step 1: Load connector config
  const connector = await prisma.connector.findFirst({
    where: { organizationId: ORG_ID, source: "castillitos_crm" },
    select: { config: true, status: true },
  });
  if (connector == null) {
    console.error("No CRM connector found");
    process.exit(1);
  }
  const config = connector.config as Record<string, unknown>;
  console.log("Connector status:", connector.status);

  // Step 2: Test authentication
  console.log("\n=== AUTH TEST ===");
  const adapter = new CastillitosCrmAdapter(ORG_ID, config);
  const authResult = await adapter.testConnection();
  console.log("Auth result:", authResult);

  if (!authResult.ok) {
    console.error("AUTH FAILED:", authResult.error);
    await (prisma as any).$disconnect();
    process.exit(1);
  }

  console.log("AUTH OK\n");

  // Step 3: Sync all quote lines
  console.log("=== SYNCING QUOTE LINES (all 285) ===\n");

  const quotes = await prisma.cRMQuote.findMany({
    where: {
      organizationId: ORG_ID,
      crmId: { not: null },
    },
    select: {
      id: true,
      crmId: true,
      quoteNumber: true,
      amount: true,
      _count: { select: { quoteLines: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const toSync = quotes.filter(q => q._count.quoteLines === 0);
  console.log(`Total quotes: ${quotes.length}`);
  console.log(`Already have lines: ${quotes.length - toSync.length}`);
  console.log(`To sync: ${toSync.length}\n`);

  let totalLines = 0;
  let totalErrors = 0;
  let quotesWithData = 0;
  let quotesEmpty = 0;
  let quotesFailed = 0;

  for (let i = 0; i < toSync.length; i++) {
    const quote = toSync[i];
    const crmId = quote.crmId as string;
    const progress = `[${i + 1}/${toSync.length}]`;

    try {
      const lines = await adapter.pullQuoteLines(crmId);

      if (lines.length === 0) {
        quotesEmpty++;
        if (i < 10 || i % 50 === 0) {
          console.log(`${progress} #${quote.quoteNumber}: 0 lines`);
        }
        continue;
      }

      const { upserted, errored } = await upsertQuoteLines(ORG_ID, quote.id, crmId, lines);
      totalLines += upserted;
      totalErrors += errored;

      if (upserted > 0) quotesWithData++;

      console.log(`${progress} #${quote.quoteNumber}: ${lines.length} lines found, ${upserted} synced`);
    } catch (e) {
      quotesFailed++;
      if (quotesFailed <= 5) {
        console.error(`${progress} #${quote.quoteNumber} ERROR:`, (e as Error).message.substring(0, 150));
      }
      // If auth keeps failing, abort early
      if (quotesFailed >= 3 && (e as Error).message.includes("CRM_AUTH_FAILED")) {
        console.error("\nAborting — repeated auth failures");
        break;
      }
    }
  }

  // Final metrics
  console.log("\n=== FINAL METRICS ===");
  console.log(`Quotes processed:  ${toSync.length}`);
  console.log(`Quotes with lines: ${quotesWithData}`);
  console.log(`Quotes empty:      ${quotesEmpty}`);
  console.log(`Quotes failed:     ${quotesFailed}`);
  console.log(`Total lines synced: ${totalLines}`);
  console.log(`Total line errors:  ${totalErrors}`);

  // Verify DB state
  const dbCount = await (prisma as any).cRMQuoteLine.count({
    where: { organizationId: ORG_ID },
  });
  console.log(`\nCRMQuoteLine in DB: ${dbCount}`);

  // Show 10 sample lines
  if (dbCount > 0) {
    const samples = await (prisma as any).cRMQuoteLine.findMany({
      where: { organizationId: ORG_ID },
      take: 10,
      orderBy: { syncedAt: "desc" },
      select: {
        reference: true,
        productName: true,
        qty: true,
        unitPrice: true,
        totalPrice: true,
        size: true,
        color: true,
        quoteId: true,
      },
    });
    console.log("\n=== SAMPLE LINES ===");
    for (const l of samples) {
      console.log(`  ${l.reference} | ${l.productName ?? ""} | qty=${l.qty} | price=${l.unitPrice} | total=${l.totalPrice} | ${l.size ?? "-"} | ${l.color ?? "-"}`);
    }
  }

  await (prisma as any).$disconnect();
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
