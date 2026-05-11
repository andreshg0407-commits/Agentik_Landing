/**
 * _tenant-cleanup.ts
 * Mark non-operational tenants as SUSPENDED.
 * Non-destructive: data is preserved, status is reversible.
 *
 * Active tenants after cleanup:
 *   - agentik     (internal platform)
 *   - castillitos (sole operational client — all SAG/PYA data)
 *
 * Suspended tenants:
 *   - do-jeans    (no data, no connectors, no active work)
 *   - arketops    (no data, no connectors)
 *   - test-org-e2e (test tenant)
 */
import { prisma } from "@/lib/prisma";

const SUSPEND = ["do-jeans", "arketops", "test-org-e2e"];
const KEEP_ACTIVE = ["agentik", "castillitos"];

async function main() {
  const db = prisma as any;

  process.stdout.write("\n=== Tenant Cleanup ===\n\n");

  // Verify active tenants untouched
  for (const slug of KEEP_ACTIVE) {
    const org = await db.organization.findUnique({ where: { slug }, select: { id: true, status: true, name: true } });
    process.stdout.write(`  KEEP ACTIVE: ${slug.padEnd(16)} id=${org?.id}  status=${org?.status}\n`);
  }

  process.stdout.write("\n");

  // Suspend inactive tenants
  for (const slug of SUSPEND) {
    const org = await db.organization.findUnique({ where: { slug }, select: { id: true, status: true, name: true } });
    if (!org) {
      process.stdout.write(`  SKIP (not found): ${slug}\n`);
      continue;
    }
    if (org.status === "SUSPENDED") {
      process.stdout.write(`  ALREADY SUSPENDED: ${slug}\n`);
      continue;
    }
    await db.organization.update({
      where: { slug },
      data:  { status: "SUSPENDED" },
    });
    process.stdout.write(`  SUSPENDED: ${slug.padEnd(16)} id=${org.id}  was=${org.status}\n`);
  }

  // Final state
  process.stdout.write("\n=== Final state ===\n");
  const all = await db.organization.findMany({
    select:  { slug: true, id: true, status: true },
    orderBy: { slug: "asc" },
  });
  for (const o of all) {
    const tag = o.status === "ACTIVE" ? "✓ ACTIVE   " : "✗ SUSPENDED";
    process.stdout.write(`  ${tag}  slug=${o.slug.padEnd(20)} id=${o.id}\n`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
