/**
 * sag-cleanup-dupes.ts
 *
 * Removes duplicate CustomerProfile rows created by the mis-normalized slug bug.
 *
 * Root cause: SAG storage used raw 10-digit NIT as slug ("1050956925") while
 * CRM storage normalizes to 9-digit ("105095692"). Each sync created a new row
 * instead of updating the existing CRM row.
 *
 * Strategy:
 *   For each pair of rows with same organizationId + normalizeNit(nit):
 *     - KEEP the row with crmId (or the older row if both have no crmId)
 *     - MERGE erpId/erpSyncedAt/rawErpJson onto the kept row if the other had them
 *     - DELETE the duplicate
 *
 * Dry-run by default. Pass --apply to commit.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const APPLY = process.argv.includes("--apply");

function normalizeNit(raw: string): string {
  let s = raw.trim().replace(/[\.\s]/g, "");
  s = s.replace(/-\d$/, "");
  if (/^\d{10}$/.test(s)) s = s.slice(0, 9);
  return s;
}

async function main() {
  const { prisma } = await import("../lib/prisma");

  const orgId = "cmmpwstuf000dp5y58kj1daaj";

  console.log(`\nSAG Duplicate Slug Cleanup — ${APPLY ? "APPLY mode" : "DRY-RUN mode"}`);
  console.log(`Organization: ${orgId}\n`);

  // Find all rows with a numeric nit (ERP/CRM rows have digit-only nits)
  const allRows = await prisma.customerProfile.findMany({
    where: { organizationId: orgId, nit: { not: null } },
    select: { id: true, slug: true, nit: true, erpId: true, crmId: true, erpSyncedAt: true, rawErpJson: true, name: true },
    orderBy: { id: "asc" },
  });

  console.log(`Total rows with nit: ${allRows.length}`);

  // Group by normalizeNit(nit)
  const byNormNit = new Map<string, typeof allRows>();
  for (const r of allRows) {
    const norm = normalizeNit(r.nit!);
    const group = byNormNit.get(norm) ?? [];
    group.push(r);
    byNormNit.set(norm, group);
  }

  const dupeGroups = [...byNormNit.values()].filter(g => g.length > 1);
  console.log(`NIT groups with duplicates: ${dupeGroups.length}`);

  let toDelete = 0;
  let toMerge  = 0;
  const deleteIds: string[] = [];

  for (const group of dupeGroups) {
    // Prefer the row with crmId (CRM-sourced row with 9-digit slug)
    const withCrm  = group.filter(r => r.crmId);
    const withErp  = group.filter(r => r.erpId);
    const keepRow  = withCrm.length > 0 ? withCrm[0] : group[0];
    const dupRows  = group.filter(r => r.id !== keepRow.id);

    // If the dup has erpId data that the kept row lacks, we need to merge it
    for (const dup of dupRows) {
      const needsMerge = dup.erpId && !keepRow.erpId;
      if (needsMerge) {
        toMerge++;
        if (APPLY) {
          await prisma.customerProfile.update({
            where: { id: keepRow.id },
            data: {
              erpId:       dup.erpId,
              erpSyncedAt: dup.erpSyncedAt,
              rawErpJson:  dup.rawErpJson ?? undefined,
            },
          });
          // Update keepRow in memory too
          keepRow.erpId       = dup.erpId;
          keepRow.erpSyncedAt = dup.erpSyncedAt as any;
        }
      }
      toDelete++;
      deleteIds.push(dup.id);
    }
  }

  console.log(`Duplicate rows to delete: ${toDelete}`);
  console.log(`Rows needing erpId merge: ${toMerge}`);

  // Sample some dupe groups for review
  console.log("\nSample duplicate groups (first 5):");
  for (const group of dupeGroups.slice(0, 5)) {
    console.log(`  normNit=${normalizeNit(group[0].nit!)}`);
    for (const r of group) {
      const isKeep = deleteIds.includes(r.id) ? "  DELETE" : "  KEEP  ";
      console.log(`  ${isKeep} slug=${r.slug?.padEnd(15)} erpId=${r.erpId ?? "(null)".padEnd(14)} crmId=${r.crmId ?? "(null)"}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. Re-run with --apply to commit deletions.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // Delete in batches of 200
  let deleted = 0;
  for (let i = 0; i < deleteIds.length; i += 200) {
    const batch = deleteIds.slice(i, i + 200);
    const { count } = await prisma.customerProfile.deleteMany({ where: { id: { in: batch } } });
    deleted += count;
    if (i % 2000 === 0) console.log(`  Deleted ${deleted}/${deleteIds.length}…`);
  }

  console.log(`\n✓ Deleted ${deleted} duplicate rows`);
  console.log(`✓ Merged erpId data into ${toMerge} kept rows`);

  const finalTotal = await prisma.customerProfile.count({ where: { organizationId: orgId } });
  const finalWithErp = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  console.log(`\nFinal CustomerProfile total      : ${finalTotal}`);
  console.log(`Final CustomerProfile with erpId : ${finalWithErp}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
