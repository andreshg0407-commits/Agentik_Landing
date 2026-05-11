/**
 * scripts/_verify-customer-identity.ts
 *
 * Sprint S1 — Customer Identity Stabilization — Verification Script
 *
 * Read-only audit of customer identity resolution across all tables.
 * Validates that CustomerProfile, SaleRecord, CustomerReceivable, and
 * CollectionRecord are correctly linked after Sprint S1 fixes.
 *
 * NEVER writes to DB. Use --fix flag only to call linkCustomerSagTerceroIds().
 *
 * Usage:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_verify-customer-identity')"
 *   # With specific org:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_verify-customer-identity')" -- --org castillitos
 *   # To also run the sagTerceroId bridge fix:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_verify-customer-identity')" -- --fix
 *
 * Flags:
 *   --org   org slug (default: castillitos)
 *   --fix   run linkCustomerSagTerceroIds() to populate missing sagTerceroId values
 *   --top   number of sample rows to print per section (default: 10)
 */

import { prisma }                   from "@/lib/prisma";
import { Prisma }                   from "@prisma/client";
import { linkCustomerSagTerceroIds } from "@/lib/customer360/service";
import { resolveCustomerForQuery, getSaleRecordNitKey, getReceivableNitKey } from "@/lib/customer360/resolve-customer";

// ── CLI args ──────────────────────────────────────────────────────────────────

function argAfter(flag: string): string | null {
  const args = process.argv;
  const i    = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const ORG_SLUG = argAfter("--org") ?? "castillitos";
const FIX      = hasFlag("--fix");
const TOP      = parseInt(argAfter("--top") ?? "10", 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(n);
}

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return `${((a / b) * 100).toFixed(1)}%`;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = prisma as any;

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SPRINT S1 — Customer Identity Verification (read-only)     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── 1. Resolve org ──────────────────────────────────────────────────────────
  const org = await db.organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  }) as { id: string; name: true } | null;

  if (!org) { console.error(`Org not found: ${ORG_SLUG}`); process.exit(1); }
  console.log(`Org: ${org.name} (${org.id})\n`);

  // ── 2. CustomerProfile identity gaps ────────────────────────────────────────
  console.log("━━━ § 1. CustomerProfile identity gaps ━━━\n");

  type CountRow = { n: string };

  const [
    totalProfiles,
    noNit,
    noNitNormalized,
    noSagTerceroId,
    noBoth,
    noAny,
  ] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
        AND "identityStatus" != 'CONSUMIDOR_FINAL'
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
        AND "nit" IS NULL
        AND "identityStatus" != 'CONSUMIDOR_FINAL'
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
        AND "nitNormalized" IS NULL
        AND "identityStatus" != 'CONSUMIDOR_FINAL'
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
        AND "sagTerceroId" IS NULL
        AND "identityStatus" != 'CONSUMIDOR_FINAL'
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
        AND "nit" IS NULL
        AND "nitNormalized" IS NULL
        AND "identityStatus" != 'CONSUMIDOR_FINAL'
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
        AND "nit" IS NULL
        AND "nitNormalized" IS NULL
        AND "sagTerceroId" IS NULL
        AND "identityStatus" != 'CONSUMIDOR_FINAL'
    `),
  ]);

  const total = Number(totalProfiles[0]?.n ?? 0);
  console.log(`Total CustomerProfile rows (excl. CONSUMIDOR_FINAL): ${total}`);
  console.log(`  Missing nit:           ${Number(noNit[0]?.n)}  (${pct(Number(noNit[0]?.n), total)})`);
  console.log(`  Missing nitNormalized: ${Number(noNitNormalized[0]?.n)}  (${pct(Number(noNitNormalized[0]?.n), total)})  ← should be 0 after S1`);
  console.log(`  Missing sagTerceroId:  ${Number(noSagTerceroId[0]?.n)}  (${pct(Number(noSagTerceroId[0]?.n), total)})  ← run --fix to populate`);
  console.log(`  Missing nit AND nitNormalized:          ${Number(noBoth[0]?.n)}`);
  console.log(`  Missing all 3 identity fields:          ${Number(noAny[0]?.n)}`);
  console.log("");

  // ── 3. CollectionRecord bridge availability ──────────────────────────────────
  console.log("━━━ § 2. CollectionRecord bridge (sagTerceroId ↔ customerNit) ━━━\n");

  type BridgeRow = { tercero_id: number; nit: string };
  const bridgeMappings = await prisma.$queryRaw<BridgeRow[]>(Prisma.sql`
    SELECT DISTINCT
      "sagTerceroId"  AS tercero_id,
      "customerNit"   AS nit
    FROM  "CollectionRecord"
    WHERE "organizationId" = ${org.id}
      AND "sagTerceroId"   IS NOT NULL
      AND "customerNit"    IS NOT NULL
      AND "customerNit"    != ''
    ORDER BY tercero_id
    LIMIT 5000
  `);

  const [crTotal, crHasBoth, crHasTercero, crHasNit] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CollectionRecord" WHERE "organizationId" = ${org.id}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CollectionRecord"
      WHERE "organizationId" = ${org.id}
        AND "sagTerceroId" IS NOT NULL AND "customerNit" IS NOT NULL AND "customerNit" != ''
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CollectionRecord"
      WHERE "organizationId" = ${org.id} AND "sagTerceroId" IS NOT NULL
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CollectionRecord"
      WHERE "organizationId" = ${org.id} AND "customerNit" IS NOT NULL AND "customerNit" != ''
    `),
  ]);

  console.log(`CollectionRecord total rows:          ${Number(crTotal[0]?.n)}`);
  console.log(`  Has sagTerceroId:                   ${Number(crHasTercero[0]?.n)}`);
  console.log(`  Has customerNit (real NIT):         ${Number(crHasNit[0]?.n)}`);
  console.log(`  Has BOTH (bridge available):        ${Number(crHasBoth[0]?.n)}`);
  console.log(`  Distinct sagTerceroId→NIT mappings: ${bridgeMappings.length}`);
  console.log("");

  if (bridgeMappings.length > 0) {
    console.log(`  Sample bridge mappings (first ${Math.min(TOP, bridgeMappings.length)}):`);
    for (const m of bridgeMappings.slice(0, TOP)) {
      console.log(`    sagTerceroId=${m.tercero_id}  →  NIT=${m.nit}`);
    }
    console.log("");
  }

  // ── 4. SaleRecord linkage ─────────────────────────────────────────────────
  console.log("━━━ § 3. SaleRecord.customerNit distribution ━━━\n");

  type SaleNitRow = { customer_nit: string; cnt: string; amount: string };
  const saleNitSample = await prisma.$queryRaw<SaleNitRow[]>(Prisma.sql`
    SELECT
      "customerNit"           AS customer_nit,
      CAST(COUNT(*) AS TEXT)  AS cnt,
      SUM("amount")::float8::text AS amount
    FROM  "SaleRecord"
    WHERE "organizationId" = ${org.id}
      AND "customerNit" IS NOT NULL
    GROUP BY "customerNit"
    ORDER BY SUM("amount") DESC
    LIMIT ${TOP}
  `);

  const [srTotal, srNullNit] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "SaleRecord" WHERE "organizationId" = ${org.id}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "SaleRecord"
      WHERE "organizationId" = ${org.id} AND "customerNit" IS NULL
    `),
  ]);

  console.log(`SaleRecord total rows:  ${Number(srTotal[0]?.n)}`);
  console.log(`  Null customerNit:     ${Number(srNullNit[0]?.n)}  (${pct(Number(srNullNit[0]?.n), Number(srTotal[0]?.n))})`);
  console.log(`\n  Top ${Math.min(TOP, saleNitSample.length)} customerNit values (by amount):`);
  for (const r of saleNitSample) {
    const isNumericId = /^\d{1,6}$/.test(r.customer_nit);
    const flag = isNumericId ? "← looks like sagTerceroId" : "← looks like real NIT";
    console.log(`    ${r.customer_nit.padEnd(20)} cnt=${r.cnt.padStart(6)}  ${fmtCOP(parseFloat(r.amount))}  ${flag}`);
  }
  console.log("");

  // ── 5. CustomerReceivable linkage ──────────────────────────────────────────
  console.log("━━━ § 4. CustomerReceivable FK linkage ━━━\n");

  const [rxTotal, rxNullCustomerId, rxNullNit] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerReceivable"
      WHERE "organizationId" = ${org.id} AND "status" IN ('OPEN','PARTIAL','OVERDUE')
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerReceivable"
      WHERE "organizationId" = ${org.id}
        AND "status" IN ('OPEN','PARTIAL','OVERDUE')
        AND "customerId" IS NULL
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS n FROM "CustomerReceivable"
      WHERE "organizationId" = ${org.id}
        AND "status" IN ('OPEN','PARTIAL','OVERDUE')
        AND ("customerNit" IS NULL OR "customerNit" = '')
    `),
  ]);

  const rxT = Number(rxTotal[0]?.n);
  const rxNC = Number(rxNullCustomerId[0]?.n);
  console.log(`Open CustomerReceivable rows:    ${rxT}`);
  console.log(`  Missing customerId (FK gap):   ${rxNC}  (${pct(rxNC, rxT)})  ← P3 in roadmap`);
  console.log(`  Missing customerNit:           ${Number(rxNullNit[0]?.n)}`);
  console.log("");

  // ── 6. Round-trip resolver test ────────────────────────────────────────────
  console.log("━━━ § 5. Resolver round-trip test (top customers by LTV) ━━━\n");

  const topProfiles = await db.customerProfile.findMany({
    where:   { organizationId: org.id, identityStatus: { not: "CONSUMIDOR_FINAL" } },
    orderBy: { ltv: "desc" },
    take:    Math.min(TOP, 10),
    select:  { id: true, name: true, nit: true, nitNormalized: true, sagTerceroId: true, slug: true },
  }) as Array<{
    id: string; name: string; nit: string|null; nitNormalized: string|null;
    sagTerceroId: number|null; slug: string;
  }>;

  let resolverOk = 0;
  let resolverFail = 0;

  for (const p of topProfiles) {
    const resolved = await resolveCustomerForQuery(org.id, { customerId: p.id });
    if (!resolved) {
      console.log(`  ✗ MISS  ${p.name}  (id=${p.id})`);
      resolverFail++;
      continue;
    }
    const saleKey = getSaleRecordNitKey(resolved);
    const rxKey   = getReceivableNitKey(resolved);
    const hasSagId = resolved.sagTerceroId != null ? "✓ sagTerceroId" : "✗ sagTerceroId=null";
    const hasNorm  = resolved.nitNormalized  != null ? "✓ nitNormalized" : "✗ nitNormalized=null";
    console.log(`  ${p.name.slice(0, 35).padEnd(35)} ${hasSagId}  ${hasNorm}`);
    console.log(`      saleKey=${saleKey ?? "NULL"!}  rxKey=${rxKey ?? "NULL"}`);

    // Verify saleKey actually returns rows
    if (saleKey) {
      const srRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT CAST(COUNT(*) AS TEXT) AS n FROM "SaleRecord"
        WHERE "organizationId" = ${org.id} AND "customerNit" = ${saleKey}
      `);
      const srCount = Number(srRows[0]?.n ?? 0);
      if (srCount === 0) {
        console.log(`      ⚠ SaleRecord: 0 rows for saleKey="${saleKey}" — sagTerceroId not linked?`);
      } else {
        console.log(`      ✓ SaleRecord: ${srCount} rows found`);
      }
    }
    resolverOk++;
    console.log("");
  }

  console.log(`Resolver: ${resolverOk} OK, ${resolverFail} FAIL\n`);

  // ── 7. Duplicate slug / NIT detection ─────────────────────────────────────
  console.log("━━━ § 6. Duplicate identity detection ━━━\n");

  type DupRow = { val: string; cnt: string };

  const [dupNit, dupNitNorm, dupSlug] = await Promise.all([
    prisma.$queryRaw<DupRow[]>(Prisma.sql`
      SELECT "nit" AS val, CAST(COUNT(*) AS TEXT) AS cnt FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id} AND "nit" IS NOT NULL
      GROUP BY "nit" HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 5
    `),
    prisma.$queryRaw<DupRow[]>(Prisma.sql`
      SELECT "nitNormalized" AS val, CAST(COUNT(*) AS TEXT) AS cnt FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id} AND "nitNormalized" IS NOT NULL
      GROUP BY "nitNormalized" HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 5
    `),
    prisma.$queryRaw<DupRow[]>(Prisma.sql`
      SELECT slug AS val, CAST(COUNT(*) AS TEXT) AS cnt FROM "CustomerProfile"
      WHERE "organizationId" = ${org.id}
      GROUP BY slug HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 5
    `),
  ]);

  const printDups = (label: string, rows: DupRow[]) => {
    if (rows.length === 0) {
      console.log(`  ${label}: ✓ no duplicates`);
    } else {
      console.log(`  ${label}: ⚠ ${rows.length} duplicate(s) found`);
      for (const r of rows) console.log(`    "${r.val}"  (${r.cnt} rows)`);
    }
  };

  printDups("Duplicate nit", dupNit);
  printDups("Duplicate nitNormalized", dupNitNorm);
  printDups("Duplicate slug", dupSlug);
  console.log("");

  // ── 8. Optional: run linkCustomerSagTerceroIds fix ──────────────────────────
  if (FIX) {
    console.log("━━━ § 7. Running linkCustomerSagTerceroIds() ━━━\n");
    console.log("  Building sagTerceroId → NIT bridge from CollectionRecord...");
    const linked = await linkCustomerSagTerceroIds(org.id);
    console.log(`  ✓ CustomerProfile rows updated: ${linked}`);
    console.log("  Re-run without --fix to verify the updated counts.\n");
  } else {
    console.log("━━━ § 7. sagTerceroId bridge fix ━━━\n");
    console.log(`  ${Number(noSagTerceroId[0]?.n)} profiles are missing sagTerceroId.`);
    console.log("  Run with --fix to populate via CollectionRecord bridge.\n");
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("━━━ Summary ━━━");
  console.log(`CustomerProfile rows:            ${total}`);
  console.log(`  Missing nitNormalized:         ${Number(noNitNormalized[0]?.n)}  (target: 0 after S1 TERCEROS sync)`);
  console.log(`  Missing sagTerceroId:          ${Number(noSagTerceroId[0]?.n)}  (target: 0 after --fix + CollectionRecord sync)`);
  console.log(`SaleRecord null customerNit:     ${Number(srNullNit[0]?.n)}`);
  console.log(`CustomerReceivable null FK:      ${rxNC}  (P3 — requires future sprint)`);
  console.log(`CollectionRecord bridge rows:    ${bridgeMappings.length}`);
  console.log(`\nVerification complete — no writes performed (use --fix to link sagTerceroId).\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
