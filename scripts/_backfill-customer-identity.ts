/**
 * scripts/_backfill-customer-identity.ts
 *
 * Backfill customer identity (customerId FK) on CustomerReceivable and
 * CollectionRecord. Processes in cursor-paginated batches to avoid Neon
 * query timeouts on large datasets.
 *
 * Safe to run multiple times — skips records that already have a customerId.
 *
 * Usage:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_backfill-customer-identity.ts')" \
 *     -- --org castillitos --batch-size 250 --limit 1000 --dry-run
 *
 * Flags:
 *   --org <slug>          Only process this org (default: all orgs)
 *   --batch-size <n>      Records per DB fetch (default: 250)
 *   --limit <n>           Max total records to process per table (default: unlimited)
 *   --dry-run             Read + resolve only — no DB writes
 *   --skip-receivables    Skip CustomerReceivable table
 *   --skip-collections    Skip CollectionRecord table
 */

import { prisma }                                      from "@/lib/prisma";
import { resolveCustomerIdentity, normalizeNit }       from "@/lib/customer360/identity";

// ── CLI args ─────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const isDryRun         = hasFlag("--dry-run");
const orgSlugArg       = getArg("--org");
const batchSize        = Math.max(1, parseInt(getArg("--batch-size") ?? "250", 10));
const limitArg         = getArg("--limit");
const globalLimit      = limitArg ? parseInt(limitArg, 10) : Infinity;
const skipReceivables  = hasFlag("--skip-receivables");
const skipCollections  = hasFlag("--skip-collections");

// ── Stats ────────────────────────────────────────────────────────────────────

interface Stats {
  total:             number;
  matchedBySagId:    number;
  matchedByNit:      number;
  matchedByName:     number;
  created:           number;
  consumidorFinal:   number;
  needsReview:       number;
  skippedNoIdentity: number;
  errors:            number;
  batchTimeouts:     number;
}

function emptyStats(): Stats {
  return {
    total: 0, matchedBySagId: 0, matchedByNit: 0, matchedByName: 0,
    created: 0, consumidorFinal: 0, needsReview: 0,
    skippedNoIdentity: 0, errors: 0, batchTimeouts: 0,
  };
}

function mergeStats(a: Stats, b: Stats): Stats {
  const keys = Object.keys(a) as (keyof Stats)[];
  const out = emptyStats();
  for (const k of keys) out[k] = (a[k] as number) + (b[k] as number);
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const db = prisma as any;
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  Backfill Customer Identity Layer`);
  console.log(`  mode       : ${isDryRun ? "DRY-RUN (no writes)" : "LIVE"}`);
  console.log(`  batch-size : ${batchSize}`);
  console.log(`  limit      : ${isFinite(globalLimit) ? globalLimit : "unlimited"}`);
  if (orgSlugArg) console.log(`  org        : ${orgSlugArg}`);
  if (skipReceivables) console.log(`  skip       : CustomerReceivable`);
  if (skipCollections) console.log(`  skip       : CollectionRecord`);
  console.log(`${"─".repeat(64)}\n`);

  const orgs = await db.organization.findMany({
    where:  orgSlugArg ? { slug: orgSlugArg } : undefined,
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  if (orgs.length === 0) {
    console.error("No organizations found.");
    process.exit(1);
  }

  for (const org of orgs) {
    console.log(`\n▶ Organization: ${org.slug} (${org.id})`);
    if (!skipReceivables) await backfillTable(org.id, "receivable");
    if (!skipCollections) await backfillTable(org.id, "collection");
  }

  console.log("\n✅ Backfill complete.\n");
  await prisma.$disconnect();
}

// ── Generic cursor-paginated backfill ─────────────────────────────────────────

type TableName = "receivable" | "collection";

async function backfillTable(orgId: string, table: TableName) {
  const db         = prisma as any;
  const label      = table === "receivable" ? "CustomerReceivable" : "CollectionRecord";
  const modelKey   = table === "receivable" ? "customerReceivable" : "collectionRecord";

  // Quick count of unlinked records (single fast query before starting)
  const totalUnlinked: number = await db[modelKey].count({
    where: { organizationId: orgId, customerId: null },
  });

  if (totalUnlinked === 0) {
    console.log(`  ${label}: nothing to backfill`);
    return;
  }
  console.log(`  ${label}: ${totalUnlinked} records without customerId`);

  const stats  = emptyStats();
  let cursor   = ""; // cursor = last processed id (empty = start from beginning)
  let batchNum = 0;
  let totalProcessed = 0;

  while (true) {
    if (totalProcessed >= globalLimit) {
      console.log(`  ${label}: reached --limit ${globalLimit}, stopping.`);
      break;
    }

    const remaining = Math.min(batchSize, globalLimit - totalProcessed);

    // Fetch next batch: id > cursor, ordered by id ASC (stable cursor pagination)
    let batch: Array<Record<string, unknown>>;
    try {
      batch = await db[modelKey].findMany({
        where: {
          organizationId: orgId,
          customerId:     null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take:    remaining,
        select:  table === "receivable"
          ? { id: true, customerNit: true, customerName: true, rawErpJson: true }
          : { id: true, customerNit: true, customerName: true, sagTerceroId: true, rawJson: true },
      });
    } catch (err) {
      stats.batchTimeouts++;
      console.error(
        `  [TIMEOUT] ${label} batch ${batchNum} (cursor="${cursor}"): ${(err as Error).message}`
      );
      // Can't advance cursor — stop this table to avoid infinite loop
      break;
    }

    if (batch.length === 0) break;

    batchNum++;
    cursor = batch[batch.length - 1].id as string;
    const batchStats = await processBatch(orgId, table, batch, isDryRun);
    const batchTotal = batch.length;
    totalProcessed  += batchTotal;

    // Merge stats
    Object.assign(stats, mergeStats(stats, batchStats));
    stats.total = totalProcessed;

    // Progress line
    const pct = totalUnlinked > 0
      ? Math.round((totalProcessed / Math.min(totalUnlinked, isFinite(globalLimit) ? globalLimit : totalUnlinked)) * 100)
      : 100;
    process.stdout.write(
      `\r  ${label}: batch ${batchNum} — ${totalProcessed}/${isFinite(globalLimit) ? Math.min(globalLimit, totalUnlinked) : totalUnlinked} (${pct}%) ` +
      `ok=${batchTotal - batchStats.errors - batchStats.skippedNoIdentity} ` +
      `err=${batchStats.errors}   `
    );

    if (batch.length < remaining) break; // last page
  }

  process.stdout.write("\n");
  printStats(label, stats);
}

// ── Process one batch ─────────────────────────────────────────────────────────

async function processBatch(
  orgId:   string,
  table:   TableName,
  batch:   Array<Record<string, unknown>>,
  dryRun:  boolean,
): Promise<Stats> {
  const db    = prisma as any;
  const model = table === "receivable" ? "customerReceivable" : "collectionRecord";
  const stats = emptyStats();

  for (const rec of batch) {
    try {
      let sagTerceroId: number | null = null;
      let nitNorm: string | null      = null;
      let customerName: string | null = null;

      if (table === "receivable") {
        const raw        = rec["rawErpJson"] as Record<string, unknown> | null;
        const idRaw      = raw?.["ka_nl_tercero"] ?? raw?.["terceroId"];
        sagTerceroId     = idRaw != null && Number(idRaw) > 0 ? Number(idRaw) : null;
        nitNorm          = normalizeNit(rec["customerNit"] as string | null);
        customerName     = (rec["customerName"] as string | null) ?? null;
      } else {
        const raw        = rec["rawJson"] as Record<string, unknown> | null;
        const idRaw      = rec["sagTerceroId"] ?? raw?.["ka_nl_tercero"] ?? raw?.["terceroId"];
        sagTerceroId     = idRaw != null && Number(idRaw) > 0 ? Number(idRaw) : null;
        nitNorm          = normalizeNit(rec["customerNit"] as string | null);
        customerName     = (rec["customerName"] as string | null) ?? null;
      }

      if (!nitNorm && !customerName && !sagTerceroId) {
        stats.skippedNoIdentity++;
        continue;
      }

      const result = await resolveCustomerIdentity({
        organizationId: orgId,
        sagTerceroId,
        nit:            nitNorm,
        customerName,
      });

      switch (result.resolvedBy) {
        case "sagTerceroId": stats.matchedBySagId++;  break;
        case "nit":          stats.matchedByNit++;    break;
        case "name":         stats.matchedByName++;   break;
        case "created":      stats.created++;         break;
      }
      if (result.status === "CONSUMIDOR_FINAL") stats.consumidorFinal++;
      if (result.status === "NEEDS_REVIEW")     stats.needsReview++;

      if (!dryRun) {
        await db[model].update({
          where: { id: rec["id"] },
          data:  { customerId: result.customerId },
        });
      }
    } catch (err) {
      stats.errors++;
      console.error(`\n  [ERR] ${model} id=${rec["id"]}: ${(err as Error).message}`);
    }
  }

  return stats;
}

// ── Report ────────────────────────────────────────────────────────────────────

function printStats(label: string, s: Stats) {
  console.log(`\n  ${label} summary:`);
  console.log(`    total processed  : ${s.total}`);
  console.log(`    matched sagId    : ${s.matchedBySagId}`);
  console.log(`    matched nit      : ${s.matchedByNit}`);
  console.log(`    matched name     : ${s.matchedByName}`);
  console.log(`    created new      : ${s.created}`);
  console.log(`    consumidorFinal  : ${s.consumidorFinal}`);
  console.log(`    needsReview      : ${s.needsReview}`);
  console.log(`    skipped (no id)  : ${s.skippedNoIdentity}`);
  console.log(`    batch timeouts   : ${s.batchTimeouts}`);
  console.log(`    errors           : ${s.errors}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

run().catch(err => {
  console.error(err);
  process.exit(1);
});
