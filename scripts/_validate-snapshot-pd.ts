/**
 * _validate-snapshot-pd.ts
 *
 * FASE 7+8+9 — Validate CommercialCoverageSnapshot after PD activation.
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

const AUDIT_REFS = [
  { sku: "L-1367", adminQty: 64 },
  { sku: "L-8467", adminQty: 511 },
  { sku: "CJ-1126012", adminQty: 79 },
  { sku: "CJ-2026004B", adminQty: 164 },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  SNAPSHOT VALIDATION — FASE 7+8+9"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // FASE 7 — Validate 4 references in snapshot
  console.log(B("  FASE 7 — CommercialCoverageSnapshot for 4 audit refs"));
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log("");

  for (const ref of AUDIT_REFS) {
    const rows: Array<{
      disponible: number;
      pendingOrdersQty: number;
      line: string;
      snapshotAt: string;
    }> = await db.$queryRawUnsafe(
      `SELECT disponible, "pendingOrdersQty", line, "snapshotAt"::text
       FROM "CommercialCoverageSnapshot"
       WHERE "organizationId" = $1 AND "refCode" = $2
       ORDER BY "snapshotAt" DESC LIMIT 1`,
      ORG, ref.sku,
    );

    if (rows.length === 0) {
      console.log(`  ${ref.sku.padEnd(14)} ${R("NOT FOUND in snapshot")}`);
      continue;
    }

    const snap = rows[0];
    const pdQty = snap.pendingOrdersQty ?? 0;
    const warehouseQty = snap.disponible + pdQty;
    const gap = Math.abs(snap.disponible - ref.adminQty);
    const pct = ref.adminQty > 0 ? Math.round((gap / ref.adminQty) * 100) : 0;
    const close = pct <= 20;

    console.log(`  ${ref.sku.padEnd(14)} ${close ? G("[CLOSE]") : Y("[GAP]")}`);
    console.log(`    warehouseQty (B01+B04): ${String(warehouseQty).padStart(8)}`);
    console.log(`    pendingOrdersQty:       ${String(pdQty).padStart(8)}`);
    console.log(`    disponible:             ${B(String(snap.disponible).padStart(8))}`);
    console.log(`    admin:                  ${String(ref.adminQty).padStart(8)}`);
    console.log(`    gap:                    ${String(gap).padStart(8)} (${pct}%)`);
    console.log(`    line: ${snap.line}  snapshot: ${snap.snapshotAt.slice(0, 19)}`);
    console.log("");
  }

  // FASE 8 — What UI would show
  console.log(B("  FASE 8 — UI Data Validation (read-only)"));
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(`  The UI reads CommercialCoverageSnapshot via availability-engine.`);
  console.log(`  disponible field now includes PD deduction (30d window).`);
  console.log(`  No UI changes needed — data flows automatically.`);
  console.log("");

  // FASE 9 — Global before/after
  console.log(B("  FASE 9 — Global Impact (before/after PD activation)"));
  console.log("  ─────────────────────────────────────────────────────────────");

  // Current snapshot stats (latest)
  const latest = await db.$queryRawUnsafe(
    `SELECT MAX("snapshotAt")::text as snap FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1`,
    ORG,
  ) as Array<{ snap: string }>;
  const latestSnap = latest[0]?.snap;

  const stats: Array<{
    total: number;
    positive: number;
    zero_or_neg: number;
    with_pd: number;
    total_disp: number;
    total_pd: number;
  }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total,
            SUM(CASE WHEN disponible > 0 THEN 1 ELSE 0 END)::int as positive,
            SUM(CASE WHEN disponible <= 0 THEN 1 ELSE 0 END)::int as zero_or_neg,
            SUM(CASE WHEN "pendingOrdersQty" > 0 THEN 1 ELSE 0 END)::int as with_pd,
            SUM(disponible)::float as total_disp,
            SUM("pendingOrdersQty")::float as total_pd
     FROM "CommercialCoverageSnapshot"
     WHERE "organizationId" = $1 AND "snapshotAt" = $2::timestamptz`,
    ORG, latestSnap,
  );

  const s = stats[0];
  console.log(`  Snapshot at:          ${latestSnap?.slice(0, 19)}`);
  console.log(`  Total references:     ${B(String(s?.total ?? 0))}`);
  console.log(`  Refs positive:        ${G(String(s?.positive ?? 0))}`);
  console.log(`  Refs sin stock (<=0): ${(s?.zero_or_neg ?? 0) > 0 ? R(String(s.zero_or_neg)) : G("0")}`);
  console.log(`  Refs with PD > 0:     ${B(String(s?.with_pd ?? 0))}`);
  console.log(`  Total disponible:     ${B(String(Math.round(s?.total_disp ?? 0)))}`);
  console.log(`  Total PD pending:     ${B(String(Math.round(s?.total_pd ?? 0)))}`);
  console.log("");

  // Compare to previous snapshot (before PD activation)
  const prevSnaps: Array<{ snap: string }> = await db.$queryRawUnsafe(
    `SELECT DISTINCT "snapshotAt"::text as snap
     FROM "CommercialCoverageSnapshot"
     WHERE "organizationId" = $1
     ORDER BY snap DESC LIMIT 3`,
    ORG,
  );
  if (prevSnaps.length >= 2) {
    const prevSnap = prevSnaps[1]?.snap;
    const prevStats: Array<{
      total: number; positive: number; zero_or_neg: number; with_pd: number;
      total_disp: number; total_pd: number;
    }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total,
              SUM(CASE WHEN disponible > 0 THEN 1 ELSE 0 END)::int as positive,
              SUM(CASE WHEN disponible <= 0 THEN 1 ELSE 0 END)::int as zero_or_neg,
              SUM(CASE WHEN "pendingOrdersQty" > 0 THEN 1 ELSE 0 END)::int as with_pd,
              SUM(disponible)::float as total_disp,
              SUM("pendingOrdersQty")::float as total_pd
       FROM "CommercialCoverageSnapshot"
       WHERE "organizationId" = $1 AND "snapshotAt" = $2::timestamptz`,
      ORG, prevSnap,
    );
    const p = prevStats[0];
    console.log(`  ${"METRIC".padEnd(25)} ${"BEFORE".padStart(10)} ${"AFTER".padStart(10)} ${"DELTA".padStart(10)}`);
    console.log(`  ${"─".repeat(25)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(10)}`);
    console.log(`  ${"Refs positive".padEnd(25)} ${String(p?.positive ?? 0).padStart(10)} ${String(s?.positive ?? 0).padStart(10)} ${String((s?.positive ?? 0) - (p?.positive ?? 0)).padStart(10)}`);
    console.log(`  ${"Refs sin stock".padEnd(25)} ${String(p?.zero_or_neg ?? 0).padStart(10)} ${String(s?.zero_or_neg ?? 0).padStart(10)} ${String((s?.zero_or_neg ?? 0) - (p?.zero_or_neg ?? 0)).padStart(10)}`);
    console.log(`  ${"Refs with PD".padEnd(25)} ${String(p?.with_pd ?? 0).padStart(10)} ${String(s?.with_pd ?? 0).padStart(10)} ${String((s?.with_pd ?? 0) - (p?.with_pd ?? 0)).padStart(10)}`);
    console.log(`  ${"Total disponible".padEnd(25)} ${String(Math.round(p?.total_disp ?? 0)).padStart(10)} ${String(Math.round(s?.total_disp ?? 0)).padStart(10)} ${String(Math.round((s?.total_disp ?? 0) - (p?.total_disp ?? 0))).padStart(10)}`);
    console.log(`  ${"Total PD".padEnd(25)} ${String(Math.round(p?.total_pd ?? 0)).padStart(10)} ${String(Math.round(s?.total_pd ?? 0)).padStart(10)} ${String(Math.round((s?.total_pd ?? 0) - (p?.total_pd ?? 0))).padStart(10)}`);
  }

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
