/**
 * _movement-range-audit.ts
 *
 * Sprint S2.2 — Phase B (part 2)
 * Audits the MOVIMIENTO numeric range gap between CollectionRecord (Documento_pagado)
 * and CustomerReceivable (erpId). Uses numeric extraction to avoid lexicographic
 * sort issues with "MOV-" prefix strings.
 *
 * Reports:
 *   - Exact numeric range of Documento_pagado in CollectionRecord
 *   - Exact numeric range of erpId in CustomerReceivable (via raw SQL)
 *   - Balance value at stake in the uncovered range
 *   - Distribution of CustomerReceivable by MOV range bucket
 *   - Partial payment invoices (multiple cobros) in coverage zone
 *
 * READ-ONLY. No mutations.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_movement-range-audit.ts
 */

import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

function fmtCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return parseFloat(String(v)) || 0;
}

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  SPRINT S2.2 PHASE B — MOVEMENT RANGE AUDIT                   "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  const org = await (prisma as any).organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org: ${B(org.name)} (${orgId})\n`);

  // ── 1. Documento_pagado numeric range from CollectionRecord ───────────────
  console.log(B("── SECTION 1: Documento_pagado Numeric Range (CollectionRecord) ─"));

  // Extract Documento_pagado from all rawJson rows using raw SQL
  // rawJson->>'raw'->>'Documento_pagado' (PostgreSQL JSONB path)
  type DpRow = { dp_min: number; dp_max: number; dp_count: bigint };
  const dpRange = await (prisma as any).$queryRaw`
    SELECT
      MIN(CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER)) AS dp_min,
      MAX(CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER)) AS dp_max,
      COUNT(*) FILTER (WHERE ("rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','') AND "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL) AS dp_count
    FROM "CollectionRecord"
    WHERE "organizationId" = ${orgId}
      AND "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL
      AND ("rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
  ` as DpRow[];

  const dp = dpRange[0];
  console.log(`\nDocumento_pagado range (numeric):`);
  console.log(`  Min : ${G(String(dp?.dp_min ?? "(null)"))}`);
  console.log(`  Max : ${G(String(dp?.dp_max ?? "(null)"))}`);
  console.log(`  Rows with valid Documento_pagado: ${String(dp?.dp_count ?? 0)}`);

  // Distribution by range bucket
  type BucketRow = { bucket: string; cnt: bigint };
  const dpBuckets = await (prisma as any).$queryRaw`
    SELECT
      CASE
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) BETWEEN 1 AND 1000       THEN '0001-1000'
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) BETWEEN 1001 AND 5000    THEN '1001-5000'
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) BETWEEN 5001 AND 10000   THEN '5001-10000'
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) BETWEEN 10001 AND 20000  THEN '10001-20000'
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) BETWEEN 20001 AND 50000  THEN '20001-50000'
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) BETWEEN 50001 AND 100000 THEN '50001-100000'
        WHEN CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) > 100000                 THEN '100001+'
        ELSE 'zero/null'
      END AS bucket,
      COUNT(*) AS cnt
    FROM "CollectionRecord"
    WHERE "organizationId" = ${orgId}
      AND "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket
  ` as BucketRow[];

  console.log(`\nDocumento_pagado distribution by bucket:`);
  for (const b of dpBuckets) {
    const bar = "█".repeat(Math.min(40, Math.round(Number(b.cnt) / 100)));
    console.log(`  ${b.bucket.padEnd(14)} : ${String(b.cnt).padStart(7)}  ${C(bar)}`);
  }

  // ── 2. CustomerReceivable erpId numeric range ─────────────────────────────
  console.log(B("\n── SECTION 2: CustomerReceivable erpId Numeric Range ───────────"));

  type ErpRow = { erp_min: number; erp_max: number; erp_count: bigint };
  const erpRange = await (prisma as any).$queryRaw`
    SELECT
      MIN(CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER)) AS erp_min,
      MAX(CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER)) AS erp_max,
      COUNT(*) AS erp_count
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${orgId}
      AND "erpId" LIKE 'MOV-%'
      AND "erpId" != 'MOV-'
  ` as ErpRow[];

  const erp = erpRange[0];
  console.log(`\nerpId numeric range:`);
  console.log(`  Min MOV : ${G(String(erp?.erp_min ?? "(null)"))}`);
  console.log(`  Max MOV : ${G(String(erp?.erp_max ?? "(null)"))}`);
  console.log(`  Total rows with MOV erpId: ${String(erp?.erp_count ?? 0)}`);

  // Distribution by range bucket
  type ErpBucketRow = { bucket: string; cnt: bigint; orig_sum: string; bal_sum: string };
  const erpBuckets = await (prisma as any).$queryRaw`
    SELECT
      CASE
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 1 AND 1000         THEN '0001-1000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 1001 AND 5000      THEN '1001-5000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 5001 AND 10000     THEN '5001-10000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 10001 AND 20000    THEN '10001-20000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 20001 AND 50000    THEN '20001-50000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 50001 AND 100000   THEN '50001-100000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) BETWEEN 100001 AND 200000  THEN '100001-200000'
        WHEN CAST(REPLACE("erpId", 'MOV-', '') AS INTEGER) > 200000                   THEN '200001+'
        ELSE 'other'
      END AS bucket,
      COUNT(*) AS cnt,
      SUM("originalAmount")::text AS orig_sum,
      SUM("balanceDue")::text AS bal_sum
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${orgId}
      AND "erpId" LIKE 'MOV-%'
      AND "erpId" != 'MOV-'
    GROUP BY bucket
    ORDER BY bucket
  ` as ErpBucketRow[];

  console.log(`\nCustomerReceivable distribution by MOV range bucket:`);
  console.log(`  ${"Bucket".padEnd(18)} ${"Count".padStart(8)} ${"Original Amt".padStart(22)} ${"Balance Due".padStart(22)}`);
  console.log(`  ${"-".repeat(76)}`);

  // Cobro coverage zone = MOV 1–10800 (approx)
  let coveredCount = 0n;
  let uncoveredCount = 0n;
  let coveredBal = 0;
  let uncoveredBal = 0;

  for (const b of erpBuckets) {
    const isCovered = ["0001-1000","1001-5000","5001-10000"].includes(b.bucket);
    const indicator = isCovered ? G("(cobro data available)") : R("(NO cobro data)");
    const cnt  = BigInt(b.cnt);
    const orig = parseFloat(b.orig_sum) || 0;
    const bal  = parseFloat(b.bal_sum) || 0;
    if (isCovered) { coveredCount += cnt; coveredBal += bal; }
    else { uncoveredCount += cnt; uncoveredBal += bal; }
    console.log(`  ${b.bucket.padEnd(18)} ${String(b.cnt).padStart(8)} ${fmtCOP(orig).padStart(22)} ${fmtCOP(bal).padStart(22)}  ${indicator}`);
  }

  console.log(`\nSummary:`);
  console.log(`  In cobro coverage (MOV 1-10800)  : ${G(String(coveredCount))} rows  ${G(fmtCOP(coveredBal))} balance`);
  console.log(`  Outside cobro coverage           : ${R(String(uncoveredCount))} rows  ${R(fmtCOP(uncoveredBal))} balance`);
  console.log(`  Coverage rate (by receivable count): ${(Number(coveredCount) / (Number(coveredCount) + Number(uncoveredCount)) * 100).toFixed(1)}%`);
  console.log(`  Coverage rate (by balance)         : ${(coveredBal / (coveredBal + uncoveredBal) * 100).toFixed(1)}%`);

  // ── 3. Gap size in concrete terms ─────────────────────────────────────────
  console.log(B("\n── SECTION 3: The Coverage Gap ─────────────────────────────────"));

  const dpMax = dp?.dp_max ?? 10800;
  const erpMax = erp?.erp_max ?? 264351;
  const gap = erpMax - dpMax;

  console.log(`\nCollectionRecord Documento_pagado max : ${G(String(dpMax))}`);
  console.log(`CustomerReceivable erpId max          : ${G(String(erpMax))}`);
  console.log(`Gap (MOV IDs not covered)             : ${R(String(gap))} (MOV-${dpMax + 1} to MOV-${erpMax})`);
  console.log(`Gap as % of total MOV range           : ${R((gap / erpMax * 100).toFixed(1) + "%")}`);

  // ── 4. Partial payments in coverage zone ─────────────────────────────────
  console.log(B("\n── SECTION 4: Partial Payments in Coverage Zone ────────────────"));

  type PartialRow = { doc_pagado: string; cobro_count: bigint; total_paid: string };
  const partialPayments = await (prisma as any).$queryRaw`
    SELECT
      ("rawJson"->'raw'->>'Documento_pagado') AS doc_pagado,
      COUNT(*) AS cobro_count,
      SUM(amount)::text AS total_paid
    FROM "CollectionRecord"
    WHERE "organizationId" = ${orgId}
      AND "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL
      AND ("rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
    GROUP BY doc_pagado
    HAVING COUNT(*) > 1
    ORDER BY cobro_count DESC
    LIMIT 20
  ` as PartialRow[];

  console.log(`\nTop 20 invoices with multiple cobros (partial payments):`);
  console.log(`  ${"Documento_pagado".padEnd(20)} ${"# Cobros".padStart(10)} ${"Total Paid (COP)".padStart(22)}`);
  console.log(`  ${"-".repeat(56)}`);

  for (const p of partialPayments) {
    const erpId = `MOV-${p.doc_pagado}`;
    const paid = parseFloat(p.total_paid) || 0;
    console.log(`  ${erpId.padEnd(20)} ${String(p.cobro_count).padStart(10)} ${fmtCOP(paid).padStart(22)}`);
  }

  // Count total partial-payment invoices
  type PartialCountRow = { multi_invoice_count: bigint; total_cobros_on_partials: bigint };
  const partialStats = await (prisma as any).$queryRaw`
    SELECT
      COUNT(*) AS multi_invoice_count,
      SUM(cobro_count) AS total_cobros_on_partials
    FROM (
      SELECT
        ("rawJson"->'raw'->>'Documento_pagado') AS doc_pagado,
        COUNT(*) AS cobro_count
      FROM "CollectionRecord"
      WHERE "organizationId" = ${orgId}
        AND "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL
        AND ("rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
      GROUP BY doc_pagado
      HAVING COUNT(*) > 1
    ) t
  ` as PartialCountRow[];

  const ps = partialStats[0];
  console.log(`\nTotal invoices with multiple cobros : ${G(String(ps?.multi_invoice_count ?? 0))}`);
  console.log(`Total cobros on those invoices      : ${G(String(ps?.total_cobros_on_partials ?? 0))}`);

  // ── 5. Receivables that CAN be reconciled today ───────────────────────────
  console.log(B("\n── SECTION 5: Immediately Reconcilable Receivables ─────────────"));

  // Join CollectionRecord Documento_pagado to CustomerReceivable erpId
  type JoinRow = { matched_rx: bigint; total_cobros: bigint; total_cobro_amt: string };
  const joinStats = await (prisma as any).$queryRaw`
    SELECT
      COUNT(DISTINCT cr.id) AS matched_rx,
      COUNT(col.id) AS total_cobros,
      SUM(col.amount)::text AS total_cobro_amt
    FROM "CustomerReceivable" cr
    INNER JOIN "CollectionRecord" col
      ON col."organizationId" = ${orgId}
      AND cr."organizationId" = ${orgId}
      AND cr."erpId" = 'MOV-' || (col."rawJson"->'raw'->>'Documento_pagado')
      AND (col."rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
  ` as JoinRow[];

  const js = joinStats[0];
  const matchedRx = Number(js?.matched_rx ?? 0);
  const totalCobros = Number(js?.total_cobros ?? 0);
  const totalAmt = parseFloat(js?.total_cobro_amt ?? "0") || 0;
  const rxTotal = await (prisma as any).customerReceivable.count({ where: { organizationId: orgId } });

  console.log(`\nCustomerReceivable rows with at least one matching cobro: ${G(String(matchedRx))}`);
  console.log(`Total cobros matched                                    : ${G(String(totalCobros))}`);
  console.log(`Total cobro amount (matched)                            : ${G(fmtCOP(totalAmt))}`);
  console.log(`Match rate (% of all receivables)                       : ${G((matchedRx / rxTotal * 100).toFixed(1) + "%")}`);
  console.log(`\n${Y("These " + matchedRx + " receivables are ready for Sprint S3 write engine TODAY.")}`);

  console.log("\n" + B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  MOVEMENT RANGE AUDIT COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
