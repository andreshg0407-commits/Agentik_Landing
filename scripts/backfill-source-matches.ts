/**
 * scripts/backfill-source-matches.ts
 *
 * SAG Source-Aware Layer — SourceMatchRecord Backfill (Sprint 4A)
 *
 * Runs the dedup engine for every historical period found in SaleRecord and
 * persists results into SourceMatchRecord so that all reporting functions
 * can read from indexed rows instead of computing in-memory on every request.
 *
 * Safe to run multiple times — persistDedupResults uses upsert on
 * (organizationId, f2RecordId), so re-running a period simply refreshes data.
 *
 * Usage:
 *   # All orgs, last 12 months (default)
 *   npx tsx scripts/backfill-source-matches.ts
 *
 *   # Single org, single period
 *   npx tsx scripts/backfill-source-matches.ts --org=<orgId> --period=202403
 *
 *   # Single org, date range
 *   npx tsx scripts/backfill-source-matches.ts --org=<orgId> --from=202401 --to=202412
 *
 *   # Dry run — print which periods would be processed without writing
 *   npx tsx scripts/backfill-source-matches.ts --dry-run
 *
 * Recommended rollout (per safe-rollout plan):
 *   1. Run on dev with --period=<current_month> → validate manually in UI
 *   2. Run on dev with full range
 *   3. Run on prod with --period=<current_month> → validate
 *   4. Run on prod with full range (off-peak hours)
 */

import { PrismaClient } from "@prisma/client";

// Dynamic imports so the script can resolve lib/ paths via tsconfig paths
// Resolved at runtime by tsx (which respects tsconfig paths via tsconfig-paths)
import { runSourceDedup, persistDedupResults } from "../lib/sales/source-dedup";

const prisma = new PrismaClient();

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (key: string) => args.find(a => a.startsWith(`--${key}=`))?.split("=")[1];
  return {
    orgId:   get("org"),
    period:  get("period"),
    from:    get("from"),
    to:      get("to"),
    dryRun:  args.includes("--dry-run"),
    months:  Number(get("months") ?? 12),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns YYYYMM string for N months ago. */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Current month as YYYYMM. */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Fetches all distinct (organizationId, periodoAoMes) pairs present in SaleRecord. */
async function getOrgPeriods(
  orgId?:      string,
  fromPeriod?: string,
  toPeriod?:   string,
): Promise<Array<{ organizationId: string; periodoAoMes: string }>> {
  // Pull all distinct org+period combos; filter in JS to keep the query simple
  // and avoid Prisma.raw conditional fragment complexity.
  const rows = await prisma.$queryRawUnsafe<Array<{ org: string; periodo: string }>>(`
    SELECT DISTINCT
      "organizationId"                                           AS org,
      COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM'))   AS periodo
    FROM "SaleRecord"
    ORDER BY 1, 2
  `);

  return rows
    .map(r => ({ organizationId: r.org, periodoAoMes: r.periodo }))
    .filter(r => {
      if (orgId      && r.organizationId !== orgId)      return false;
      if (fromPeriod && r.periodoAoMes < fromPeriod)     return false;
      if (toPeriod   && r.periodoAoMes > toPeriod)       return false;
      return true;
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { orgId, period, from, to, dryRun, months } = parseArgs();

  console.log("[backfill-source-matches] Sprint 4A — SourceMatchRecord backfill");
  if (dryRun) console.log("[backfill-source-matches] DRY RUN — no writes will happen");

  // Determine period range
  const fromPeriod = period ?? from ?? monthsAgo(months);
  const toPeriod   = period ?? to   ?? currentPeriod();

  console.log(`[backfill-source-matches] Period range: ${fromPeriod} → ${toPeriod}`);
  if (orgId) console.log(`[backfill-source-matches] Org filter: ${orgId}`);

  // Discover (org, period) pairs
  let pairs: Array<{ organizationId: string; periodoAoMes: string }>;
  try {
    pairs = await getOrgPeriods(orgId, fromPeriod, toPeriod);
  } catch (err) {
    console.error("[backfill-source-matches] Failed to discover org/period pairs:", err);
    process.exit(1);
  }

  if (pairs.length === 0) {
    console.log("[backfill-source-matches] No SaleRecord rows found for specified range. Exiting.");
    return;
  }

  console.log(`[backfill-source-matches] Found ${pairs.length} (org, period) pairs to process`);

  // Group by org for nicer progress output
  const byOrg = new Map<string, string[]>();
  for (const { organizationId, periodoAoMes } of pairs) {
    const ex = byOrg.get(organizationId) ?? [];
    ex.push(periodoAoMes);
    byOrg.set(organizationId, ex);
  }

  let totalUpserted = 0;
  let totalErrors   = 0;

  for (const [org, periods] of byOrg) {
    console.log(`\n[backfill-source-matches] Org ${org} — ${periods.length} period(s): ${periods.join(", ")}`);

    for (const p of periods.sort()) {
      process.stdout.write(`  ${p} … `);

      if (dryRun) {
        console.log("(skipped — dry run)");
        continue;
      }

      try {
        // 1. Run in-memory dedup engine
        const summary = await runSourceDedup(org, p, p);

        // 2. Persist results into SourceMatchRecord
        await persistDedupResults(org, p, summary);

        const written = summary.matchedCount + summary.orphanCount;
        totalUpserted += written;
        console.log(
          `OK — matched: ${summary.matchedCount}, orphans: ${summary.orphanCount}, ` +
          `rate: ${summary.conversionRate.toFixed(1)}%, rows written: ${written}`
        );
      } catch (err) {
        totalErrors++;
        console.error(`FAILED — ${err}`);
      }
    }
  }

  console.log(`\n[backfill-source-matches] Done.`);
  console.log(`  Total rows written  : ${totalUpserted}`);
  console.log(`  Errors              : ${totalErrors}`);
  if (totalErrors > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("[backfill-source-matches] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
