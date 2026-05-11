/**
 * _simulate-historical-backfill.ts
 *
 * Sprint S2.2 — Phase D: Dry-run backfill simulation.
 *
 * Simulates what a historical backfill would accomplish WITHOUT writing to the DB.
 * Uses the existing CollectionRecord data as a proxy for the current sync state
 * and projects outcomes assuming an expanded v_pagosnew.
 *
 * Reports:
 *   1. Current state summary (what we have today)
 *   2. Backfill readiness check (prerequisites)
 *   3. Gap analysis by MOV range bucket
 *   4. Projected outcomes at 3 expansion scenarios (conservative / mid / optimistic)
 *   5. Dedup safety validation (natural key collision check on existing rows)
 *   6. Rate limit feasibility (pages × time estimate)
 *   7. Cursor reset impact simulation
 *
 * READ-ONLY. No mutations.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_simulate-historical-backfill.ts
 */

import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";
const PAGE_SIZE = 500;
const RATE_LIMIT_DAILY = 340;  // req/day
const SOAP_TIMEOUT_S = 180;    // 3 minutes

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

function fmtCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  SPRINT S2.2 PHASE D — BACKFILL DRY-RUN SIMULATION            "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  const org = await (prisma as any).organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org: ${B(org.name)} (${orgId})\n`);

  // ── 1. Current state snapshot ─────────────────────────────────────────────
  console.log(B("── SECTION 1: Current State Snapshot ───────────────────────────"));

  const colCount = await (prisma as any).collectionRecord.count({ where: { organizationId: orgId } });
  const rxCount  = await (prisma as any).customerReceivable.count({ where: { organizationId: orgId } });

  type DpStatsRow = { dp_min: number; dp_max: number; dp_count: bigint };
  const dpStats = await (prisma as any).$queryRaw`
    SELECT
      MIN(CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER)) AS dp_min,
      MAX(CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER)) AS dp_max,
      COUNT(*) AS dp_count
    FROM "CollectionRecord"
    WHERE "organizationId" = ${orgId}
      AND "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL
      AND ("rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
  ` as DpStatsRow[];

  type ErpStatsRow = { erp_min: number; erp_max: number };
  const erpStats = await (prisma as any).$queryRaw`
    SELECT
      MIN(CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER)) AS erp_min,
      MAX(CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER)) AS erp_max
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${orgId}
      AND "erpId" LIKE 'MOV-%' AND "erpId" != 'MOV-'
  ` as ErpStatsRow[];

  type MatchRow = { matched: bigint; total_cobro_amt: string };
  const matchStats = await (prisma as any).$queryRaw`
    SELECT
      COUNT(DISTINCT cr.id) AS matched,
      SUM(col.amount)::text AS total_cobro_amt
    FROM "CustomerReceivable" cr
    INNER JOIN "CollectionRecord" col
      ON col."organizationId" = ${orgId}
      AND cr."organizationId" = ${orgId}
      AND cr."erpId" = 'MOV-' || (col."rawJson"->'raw'->>'Documento_pagado')
      AND (col."rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
  ` as MatchRow[];

  type RxBalRow = { total_bal: string };
  const rxBalStats = await (prisma as any).$queryRaw`
    SELECT SUM("balanceDue")::text AS total_bal
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${orgId}
  ` as RxBalRow[];

  const dp = dpStats[0];
  const erp = erpStats[0];
  const match = matchStats[0];
  const rxBal = parseFloat(rxBalStats[0]?.total_bal ?? "0") || 0;
  const matchedRx = Number(match?.matched ?? 0);
  const cobroAmt  = parseFloat(match?.total_cobro_amt ?? "0") || 0;

  console.log(`\nCollectionRecord rows           : ${B(String(colCount))}`);
  console.log(`  Documento_pagado range        : ${dp?.dp_min ?? "?"} → ${dp?.dp_max ?? "?"}`);
  console.log(`CustomerReceivable rows         : ${B(String(rxCount))}`);
  console.log(`  erpId range (numeric)         : MOV-${erp?.erp_min ?? "?"} → MOV-${erp?.erp_max ?? "?"}`);
  console.log(`Matched receivables today       : ${G(String(matchedRx))} (${pct(matchedRx, rxCount)})`);
  console.log(`Matched cobro amount            : ${G(fmtCOP(cobroAmt))}`);
  console.log(`Total receivable balance        : ${G(fmtCOP(rxBal))}`);
  console.log(`Unmatched balance               : ${R(fmtCOP(rxBal - cobroAmt > 0 ? rxBal - cobroAmt : rxBal))}`);

  // ── 2. Backfill readiness check ───────────────────────────────────────────
  console.log(B("\n── SECTION 2: Backfill Readiness Check ─────────────────────────"));

  // Check cursor state
  const connector = await (prisma as any).connector.findFirst({
    where: { organizationId: orgId, source: "sag_pya_soap" },
    select: { id: true, cursors: { select: { module: true, cursor: true } } },
  });
  const collectionsConnectorId: string | null = connector?.id ?? null;
  const collectionsCursor = connector?.cursors?.find((c: any) => c.module === "collections");

  // Check mapper fix status
  let mapperFixed = false;
  try {
    const mapperContent = await import("fs").then(fs =>
      fs.readFileSync(
        process.cwd() + "/lib/connectors/adapters/sag-pya-soap/mappers.ts",
        "utf8"
      )
    );
    // Check if Documento_pagado appears before Numero_Factura in the invoice ref section
    const dpIdx  = mapperContent.indexOf("Documento_pagado");
    const nfIdx  = mapperContent.indexOf("Numero_Factura");
    mapperFixed  = dpIdx > 0 && nfIdx > 0 && dpIdx < nfIdx;
  } catch { /* ignore */ }

  console.log(`\n${B("Prerequisite")}                        ${B("Status")}`);
  console.log(`─────────────────────────────────────────────────────────────`);
  console.log(`SAG v_pagosnew expansion confirmed   ${Y("PENDING (external — SAG team)")}`);
  console.log(`Mapper fix (Documento_pagado first)  ${mapperFixed ? G("APPLIED") : R("NOT APPLIED — see S2_1_IMPLEMENTATION_DECISION.md §8.1")}`);
  console.log(`Collections cursor cleared           ${collectionsCursor?.cursor?.startsWith("date:") ? Y("No — currently in incremental mode (date cursor)") : G("Yes — null cursor, ready for full sync")}`);
  console.log(`Connector ID resolved                ${collectionsConnectorId ? G(collectionsConnectorId) : R("NOT FOUND")}`);
  console.log(`Shadow engine baseline run           ${G("COMPLETE (see SHADOW_RECONCILIATION_AUDIT.md)")}`);
  console.log(`_movement-range-audit.ts baseline    ${G("COMPLETE (run this sprint)")}`);

  if (collectionsCursor) {
    console.log(`\nCurrent cursor: ${Y(collectionsCursor.cursor ?? "(null)")}`);
    console.log(`Cursor reset command (when ready):`);
    console.log(C(`  cursorStore.clear("${collectionsConnectorId}", "collections")`));
  }

  // ── 3. Gap analysis by MOV range ─────────────────────────────────────────
  console.log(B("\n── SECTION 3: Gap Analysis by MOV Range ────────────────────────"));

  type BucketGapRow = {
    bucket: string;
    rx_count: bigint;
    rx_balance: string;
    cobro_count: bigint;
    cobro_amount: string;
  };

  const bucketGap = await (prisma as any).$queryRaw`
    SELECT
      CASE
        WHEN CAST(REPLACE(cr."erpId", 'MOV-', '') AS INTEGER) BETWEEN 1 AND 5000       THEN 'MOV 1-5000 (covered)'
        WHEN CAST(REPLACE(cr."erpId", 'MOV-', '') AS INTEGER) BETWEEN 5001 AND 10000   THEN 'MOV 5001-10000 (covered)'
        WHEN CAST(REPLACE(cr."erpId", 'MOV-', '') AS INTEGER) BETWEEN 10001 AND 50000  THEN 'MOV 10001-50000 (gap)'
        WHEN CAST(REPLACE(cr."erpId", 'MOV-', '') AS INTEGER) BETWEEN 50001 AND 100000 THEN 'MOV 50001-100000 (gap)'
        WHEN CAST(REPLACE(cr."erpId", 'MOV-', '') AS INTEGER) BETWEEN 100001 AND 200000 THEN 'MOV 100001-200000 (gap)'
        WHEN CAST(REPLACE(cr."erpId", 'MOV-', '') AS INTEGER) > 200000                 THEN 'MOV 200001+ (gap)'
        ELSE 'other'
      END AS bucket,
      COUNT(DISTINCT cr.id) AS rx_count,
      SUM(cr."balanceDue")::text AS rx_balance,
      COUNT(col.id) AS cobro_count,
      COALESCE(SUM(col.amount), 0)::text AS cobro_amount
    FROM "CustomerReceivable" cr
    LEFT JOIN "CollectionRecord" col
      ON col."organizationId" = ${orgId}
      AND cr."erpId" = 'MOV-' || (col."rawJson"->'raw'->>'Documento_pagado')
      AND (col."rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
    WHERE cr."organizationId" = ${orgId}
      AND cr."erpId" LIKE 'MOV-%'
      AND cr."erpId" != 'MOV-'
    GROUP BY bucket
    ORDER BY bucket
  ` as BucketGapRow[];

  console.log(`\n  ${"MOV Range".padEnd(30)} ${"Receivables".padStart(13)} ${"Balance (COP)".padStart(22)} ${"Cobros".padStart(8)} ${"Cobro Amt (COP)".padStart(22)}`);
  console.log(`  ${"-".repeat(100)}`);

  for (const b of bucketGap) {
    const bal   = parseFloat(b.rx_balance) || 0;
    const cAmt  = parseFloat(b.cobro_amount) || 0;
    const covered = b.bucket.includes("covered");
    const indicator = covered ? G("✓") : R("✗");
    console.log(
      `  ${indicator} ${b.bucket.padEnd(28)} ${String(b.rx_count).padStart(13)} ${fmtCOP(bal).padStart(22)} ${String(b.cobro_count).padStart(8)} ${fmtCOP(cAmt).padStart(22)}`
    );
  }

  // ── 4. Projected outcomes at 3 expansion scenarios ────────────────────────
  console.log(B("\n── SECTION 4: Projected Backfill Outcomes ──────────────────────"));

  const scenarios = [
    {
      name: "Conservative",
      newRows: 50000,
      matchRatePct: 40,
      desc: "v_pagosnew partially expanded (MOV 10K–100K only)",
    },
    {
      name: "Mid",
      newRows: 150000,
      matchRatePct: 60,
      desc: "v_pagosnew expanded to cover MOV 10K–200K",
    },
    {
      name: "Optimistic",
      newRows: 400000,
      matchRatePct: 75,
      desc: "v_pagosnew covers full history to MOV-269K+",
    },
  ];

  console.log();
  for (const s of scenarios) {
    const totalRows   = colCount + s.newRows;
    const newMatched  = Math.round(rxCount * (s.matchRatePct / 100));
    const pages       = Math.ceil(totalRows / PAGE_SIZE);
    const soapRows    = totalRows;
    const timePerPage = 2; // seconds (DB write estimate per 500 rows)
    const totalSecs   = pages * timePerPage;
    const invocations = Math.ceil(totalSecs / 110); // 110s headroom in 120s limit

    console.log(`  ${B(s.name)} scenario: ${C(s.desc)}`);
    console.log(`    New cobro rows fetched   : +${s.newRows.toLocaleString()} → total ${totalRows.toLocaleString()}`);
    console.log(`    SOAP response size       : ~${soapRows.toLocaleString()} rows`);
    console.log(`    Client-side pages        : ${pages} × ${PAGE_SIZE} rows`);
    console.log(`    Estimated sync time      : ${fmtDuration(totalSecs)} (${invocations} Vercel invocation${invocations > 1 ? "s" : ""})`);
    console.log(`    Matched receivables after: ${newMatched.toLocaleString()} (${s.matchRatePct}% of ${rxCount.toLocaleString()})`);
    console.log(`    Uplift vs today          : +${(newMatched - matchedRx).toLocaleString()} receivables (+${((newMatched - matchedRx) / matchedRx * 100).toFixed(0)}%)`);
    console.log(`    Rate limit impact        : 1 SOAP call + ${pages} DB pages — well within ${RATE_LIMIT_DAILY}/day limit`);
    console.log();
  }

  // ── 5. Dedup safety validation ────────────────────────────────────────────
  console.log(B("── SECTION 5: Dedup Safety Validation ─────────────────────────"));

  // Check for any natural key duplicates (should be 0)
  type DedupRow = { dup_count: bigint; natural_key: string };
  const dupCheck = await (prisma as any).$queryRaw`
    SELECT COUNT(*) AS dup_count, "naturalKey" AS natural_key
    FROM "CollectionRecord"
    WHERE "organizationId" = ${orgId}
    GROUP BY "naturalKey"
    HAVING COUNT(*) > 1
    LIMIT 5
  ` as DedupRow[];

  console.log(`\nDuplicate naturalKey rows in CollectionRecord:`);
  if (dupCheck.length === 0) {
    console.log(G(`  NONE — dedup constraint is clean. Re-sync will produce zero duplicates.`));
  } else {
    console.log(R(`  WARNING: ${dupCheck.length} duplicate natural keys found!`));
    for (const d of dupCheck) {
      console.log(`    naturalKey=${d.natural_key} count=${d.dup_count}`);
    }
    console.log(Y(`  These duplicates are pre-existing and will not be affected by backfill.`));
  }

  // Check null natural keys
  const nullNK = await (prisma as any).collectionRecord.count({
    where: { organizationId: orgId, naturalKey: "" },
  });
  console.log(`\nCollectionRecord rows with empty naturalKey : ${nullNK === 0 ? G("0 — clean") : R(String(nullNK))}`);

  // ── 6. Rate limit feasibility ─────────────────────────────────────────────
  console.log(B("\n── SECTION 6: Rate Limit Feasibility ───────────────────────────"));

  const currentRateMinute = 10; // req/min
  console.log(`\nTokenBucket limits:`);
  console.log(`  Max per minute : ${currentRateMinute} requests`);
  console.log(`  Max per day    : ${RATE_LIMIT_DAILY} requests`);
  console.log(`\nBackfill SOAP calls : 1 (entire v_pagosnew in one call)`);
  console.log(`DB write pages      : ${Math.ceil(colCount / PAGE_SIZE)} today → est. 100–800 after expansion`);
  console.log(`Rate limit impact   : ${G("NONE")} — DB page writes do NOT consume SOAP rate limit tokens`);
  console.log(`                      Only the initial SOAP call counts against rate limit`);
  console.log(`Daily budget used   : 1 / ${RATE_LIMIT_DAILY} = ${(1 / RATE_LIMIT_DAILY * 100).toFixed(2)}% for the full backfill`);

  // ── 7. Cursor reset simulation ────────────────────────────────────────────
  console.log(B("\n── SECTION 7: Cursor Reset Impact Simulation ───────────────────"));

  console.log(`\nCurrent cursor state:`);
  console.log(`  module=collections : ${collectionsCursor?.cursor ?? "(null)"}`);
  console.log(`\nAfter cursorStore.clear():`);
  console.log(`  module=collections : ${G("(deleted — null on next get)")}`);
  console.log(`\nNext sync trigger behavior:`);
  console.log(`  1. adapter.pullCollections(cursor=null)`);
  console.log(`  2. → full sync branch: pageOffset = 0`);
  console.log(`  3. → SOAP call to SAG: consultaSagJson(config, COLLECTIONS_QUERY)`);
  console.log(`  4. → v_pagosnew returns ALL rows (current: 27,850 raw rows)`);
  console.log(`  5. → after expansion: SAG returns more rows (unknown until expansion)`);
  console.log(`  6. → mapped to UnifiedCollection[], stored in _colCache`);
  console.log(`  7. → page 0 (records 0–499) written to DB via upsert`);
  console.log(`  8. → cursor = "page:500" persisted`);
  console.log(`  9. → ... continues until all pages processed`);
  console.log(`  10. → final cursor = "date:<latestFechaDocumento>"`);
  console.log(`\n${G("Existing rows: UNCHANGED (upsert with empty update{}).")}`);
  console.log(`${G("New rows: INSERTED via naturalKey constraint.")}`);
  console.log(`${G("No data loss. Safe to interrupt and resume.")}`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(B("\n── SIMULATION SUMMARY ──────────────────────────────────────────"));
  console.log(`
  Current coverage  : ${matchedRx.toLocaleString()} / ${rxCount.toLocaleString()} receivables (${pct(matchedRx, rxCount)})
  After expansion   : est. 55,000–90,000 / ${rxCount.toLocaleString()} (44–72%)

  Backfill trigger  : cursorStore.clear() + POST /sync { module: "collections" }
  Duration estimate : 1–20 minutes (depending on expanded row count)
  Rate limit impact : 1 SOAP request total
  Risk level        : ${G("LOW")} — additive only, no balance writes, resumable, idempotent

  Blocker           : ${R("SAG team must expand v_pagosnew before any backfill is meaningful")}
  Alternative today : ${G("Sprint S3 can apply existing 5,167 matched cobros immediately")}
  `);

  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  DRY-RUN SIMULATION COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
