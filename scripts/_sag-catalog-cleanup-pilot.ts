/**
 * _sag-catalog-cleanup-pilot.ts
 *
 * SAG-CATALOG-FULL-SYNC-03 Phase 1 — Clean up pilot products.
 *
 * Modes:
 *   MODE=inspect  (default) — list pilot products, do not delete
 *   MODE=cleanup  — delete pilot contaminated products (price=0/null)
 *   MODE=purge    — delete ALL SAG pilot products for clean slate
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-cleanup-pilot.ts
 *   MODE=cleanup npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-cleanup-pilot.ts
 *   MODE=purge npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-cleanup-pilot.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

const CASTILLITOS_ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const mode = (process.env.MODE ?? "inspect").toLowerCase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const orgId = CASTILLITOS_ORG_ID;

  console.log("");
  console.log(B("  SAG-CATALOG-FULL-SYNC-03 — FASE 1: LIMPIEZA PILOTO"));
  console.log(`  Mode: ${C(mode)}`);
  console.log("");

  const all = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, externalSource: "sag" },
    select: {
      id: true, sku: true, name: true, price: true,
      externalId: true, createdAt: true, commercialStatus: true,
      category: true, productLine: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`  Total SAG products in DB: ${B(String(all.length))}`);

  const contables = all.filter((p: any) => p.price === null || p.price === 0);
  const comerciales = all.filter((p: any) => p.price !== null && p.price > 0);

  console.log(`  Contables (price=0/null): ${R(String(contables.length))}`);
  console.log(`  Comerciales (price>0):    ${G(String(comerciales.length))}`);
  console.log("");

  if (contables.length > 0) {
    console.log(B("  Contables (to delete):"));
    for (const p of contables.slice(0, 20) as any[]) {
      console.log(`    ${p.sku?.padEnd(18) ?? "—"} ${(p.name ?? "").slice(0, 40).padEnd(42)} $${p.price ?? 0}`);
    }
    if (contables.length > 20) console.log(`    ... and ${contables.length - 20} more`);
    console.log("");
  }

  if (comerciales.length > 0) {
    console.log(B("  Comerciales (to keep):"));
    for (const p of comerciales.slice(0, 10) as any[]) {
      console.log(`    ${p.sku?.padEnd(18) ?? "—"} ${(p.name ?? "").slice(0, 40).padEnd(42)} $${p.price}`);
    }
    console.log("");
  }

  if (mode === "cleanup") {
    // Delete only contables (price=0/null)
    const ids = contables.map((p: any) => p.id);
    if (ids.length > 0) {
      const result = await (prisma as any).productEntity.deleteMany({
        where: { id: { in: ids } },
      });
      console.log(G(`  Deleted ${result.count} contable products.`));
    } else {
      console.log(G("  No contable products to delete."));
    }
    console.log(`  Conserved: ${comerciales.length} commercial products.`);
  } else if (mode === "purge") {
    // Delete ALL SAG products for clean slate
    const result = await (prisma as any).productEntity.deleteMany({
      where: { organizationId: orgId, externalSource: "sag" },
    });
    console.log(R(`  Purged ALL ${result.count} SAG products. Clean slate.`));
  } else {
    console.log(Y("  Inspect only — no changes made."));
    console.log(`  Run MODE=purge to delete all ${all.length} pilot products for a clean sync.`);
  }

  console.log("");
  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
