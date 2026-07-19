/**
 * scripts/_maletas-audit.ts
 * READ-ONLY audit for MALETAS-PANEL-BASE-METRICAS-OPERATIVAS-01
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org found"); return; }
  console.log("org=" + org.id);

  // Assortment catalogs + entries
  const catalogs = await prisma.assortmentCatalog.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, version: true, commercialWorld: true },
  });
  console.log("\n=== ASSORTMENT CATALOGS ===");
  for (const c of catalogs) {
    const entries = await prisma.assortmentCatalogEntry.findMany({
      where: { catalogId: c.id },
      select: { targetUnits: true, groupCode: true, subgroupCode: true },
    });
    const totalIdeal = entries.reduce((s, e) => s + e.targetUnits, 0);
    const groups = new Set(entries.map(e => e.groupCode));
    console.log(`${c.name} (${c.commercialWorld}): ${entries.length} entries, ${groups.size} groups, SUM(officialIdeal)=${totalIdeal} | id=${c.id}`);
  }

  // Ideal overrides
  const overrides = await prisma.assortmentIdealOverride.findMany({
    where: { organizationId: org.id },
    select: { catalogId: true, groupCode: true, subgroupCode: true, idealUnits: true },
  });
  console.log("\n=== IDEAL OVERRIDES: " + overrides.length + " ===");
  for (const o of overrides) console.log(`  cat=${o.catalogId} ${o.groupCode}/${o.subgroupCode} -> ideal=${o.idealUnits}`);

  // Compute effective ideal per catalog
  console.log("\n=== EFFECTIVE IDEAL COMPUTATION ===");
  for (const c of catalogs) {
    const entries = await prisma.assortmentCatalogEntry.findMany({
      where: { catalogId: c.id },
      select: { targetUnits: true, groupCode: true, subgroupCode: true },
    });
    let officialTotal = 0;
    let effectiveTotal = 0;
    let overriddenCount = 0;
    for (const e of entries) {
      officialTotal += e.targetUnits;
      const override = overrides.find(o => o.catalogId === c.id && o.groupCode === e.groupCode && o.subgroupCode === e.subgroupCode);
      if (override) {
        effectiveTotal += override.idealUnits;
        overriddenCount++;
      } else {
        effectiveTotal += e.targetUnits;
      }
    }
    console.log(`${c.name}: officialIdeal=${officialTotal}, effectiveIdeal=${effectiveTotal}, overrides=${overriddenCount}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
