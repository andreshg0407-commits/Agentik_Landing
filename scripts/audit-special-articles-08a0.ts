/**
 * CASTILLITOS-COMMERCIAL-TRUTH-08A0 §F — Special articles audit
 *
 * Scans ProductEntity for CD-* references and other potential special prefixes.
 * Reports: prefix, line, group, keywords, count.
 *
 * Usage: DATABASE_URL="..." npx tsx scripts/audit-special-articles-08a0.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const db = prisma as any;

  // 1. CD-* references (current special collection pattern)
  const cdRefs = await db.productEntity.findMany({
    where: {
      organizationId: ORG_ID,
      sku: { startsWith: "CD" },
    },
    select: { sku: true, name: true, productLine: true, lineaSag: true, grupoSag: true, subgrupoSag: true },
    orderBy: { sku: "asc" },
  });

  console.log("=== SPECIAL ARTICLES AUDIT (08A0 §F) ===\n");
  console.log(`--- CD-* references: ${cdRefs.length} ---`);

  // Group by line
  const byLine = new Map<string, typeof cdRefs>();
  for (const r of cdRefs) {
    const line = r.lineaSag ?? "NULL";
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line)!.push(r);
  }
  for (const [line, refs] of byLine) {
    console.log(`  lineaSag=${line}: ${refs.length} refs`);
    for (const r of refs.slice(0, 5)) {
      console.log(`    ${r.sku} | ${(r.name ?? "").substring(0, 45)} | grp:${r.grupoSag} sub:${r.subgrupoSag}`);
    }
    if (refs.length > 5) console.log(`    ... and ${refs.length - 5} more`);
  }

  // 2. Keyword analysis — look for patterns that might indicate special collections
  const allProducts = await db.productEntity.findMany({
    where: { organizationId: ORG_ID },
    select: { sku: true, name: true, lineaSag: true, grupoSag: true, subgrupoSag: true },
  });

  // Extract unique prefixes (first 2-3 chars)
  const prefixCounts = new Map<string, number>();
  for (const p of allProducts) {
    const sku = (p.sku ?? "").trim();
    if (sku.length < 2) continue;
    const prefix = sku.substring(0, sku.match(/[0-9-]/)?.index ?? 3).toUpperCase();
    if (prefix.length >= 1) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  console.log(`\n--- SKU prefix distribution ---`);
  const sorted = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [prefix, count] of sorted.slice(0, 15)) {
    console.log(`  ${prefix.padEnd(8)} ${count} refs`);
  }

  // 3. Line/group/subgroup unique values
  const groups = new Map<string, number>();
  const subgroups = new Map<string, number>();
  for (const p of allProducts) {
    if (p.grupoSag) groups.set(p.grupoSag, (groups.get(p.grupoSag) ?? 0) + 1);
    if (p.subgrupoSag) subgroups.set(p.subgrupoSag, (subgroups.get(p.subgrupoSag) ?? 0) + 1);
  }

  console.log(`\n--- SAG groups (${groups.size} unique) ---`);
  for (const [g, c] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g.padEnd(25)} ${c} refs`);
  }

  console.log(`\n--- SAG subgroups (${subgroups.size} unique, top 20) ---`);
  for (const [s, c] of [...subgroups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${s.padEnd(25)} ${c} refs`);
  }

  // 4. Keyword search for potential special patterns
  const keywords = ["BASICO", "BASICA", "ESPECIAL", "COLECCION", "EDICION", "LIMITADA", "PREMIUM", "OUTLET"];
  console.log(`\n--- Keyword matches in product names ---`);
  for (const kw of keywords) {
    const matches = allProducts.filter((p: any) => (p.name ?? "").toUpperCase().includes(kw));
    if (matches.length > 0) {
      console.log(`  "${kw}": ${matches.length} refs`);
      for (const m of matches.slice(0, 3)) {
        console.log(`    ${m.sku} | ${(m.name ?? "").substring(0, 45)}`);
      }
    }
  }

  await prisma.$disconnect();
  pool.end();
}
main();
