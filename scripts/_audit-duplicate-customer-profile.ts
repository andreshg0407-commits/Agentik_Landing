/**
 * scripts/_audit-duplicate-customer-profile.ts
 *
 * READ-ONLY audit: find CustomerProfile duplicates similar to a given name.
 * Shows linked record counts per duplicate so the operator can confirm the
 * canonical profile and identify safe merge candidates.
 *
 * Usage:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_audit-duplicate-customer-profile.ts')" \
 *     -- --org castillitos --name "INDUSTRIAS DIANA ALZATE"
 *
 * Flags:
 *   --org  <slug>   Organization slug (default: castillitos)
 *   --name <text>   Substring to search in CustomerProfile.name (case-insensitive)
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ── CLI ───────────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const orgSlugArg  = getArg("--org")  ?? "castillitos";
const nameArg     = getArg("--name") ?? "INDUSTRIAS DIANA ALZATE";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function fmtCop(n: number): string {
  return `$${fmt(n)}`;
}

function hr(c = "─", n = 72) { return c.repeat(n); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const db = prisma as any;

  const org = await db.organization.findFirst({
    where:  { slug: orgSlugArg },
    select: { id: true, slug: true },
  });
  if (!org) { console.error(`org not found: ${orgSlugArg}`); process.exit(1); }
  const orgId = org.id as string;

  console.log(`\n${hr("═")}`);
  console.log(`  Duplicate CustomerProfile Audit`);
  console.log(`  org    : ${org.slug}`);
  console.log(`  search : "${nameArg}"`);
  console.log(hr("═"));

  // ── Find matching profiles ────────────────────────────────────────────────

  const profiles: Array<{
    id: string; name: string; slug: string | null;
    nit: string | null; nitNormalized: string | null;
    sagTerceroId: number | null; identityStatus: string; identityNotes: string | null;
    createdAt: Date;
  }> = await db.customerProfile.findMany({
    where:   { organizationId: orgId, name: { contains: nameArg, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select:  {
      id: true, name: true, slug: true,
      nit: true, nitNormalized: true,
      sagTerceroId: true, identityStatus: true, identityNotes: true,
      createdAt: true,
    },
  });

  if (profiles.length === 0) {
    console.log(`\n  No profiles found matching "${nameArg}".`);
    await prisma.$disconnect(); return;
  }

  console.log(`\n  Found ${profiles.length} profile(s):\n`);

  for (const p of profiles) {
    console.log(`  ${hr("-")}`);
    console.log(`  id             : ${p.id}`);
    console.log(`  name           : ${p.name}`);
    console.log(`  slug           : ${p.slug ?? "null"}`);
    console.log(`  nit            : ${p.nit ?? "null"}`);
    console.log(`  nitNormalized  : ${p.nitNormalized ?? "null"}`);
    console.log(`  sagTerceroId   : ${p.sagTerceroId ?? "null"}`);
    console.log(`  identityStatus : ${p.identityStatus}`);
    console.log(`  identityNotes  : ${p.identityNotes ?? "—"}`);
    console.log(`  createdAt      : ${p.createdAt.toISOString()}`);

    // Linked record counts
    const [recCount, colCount, payCount, oppCount, actCount, quoteCount] = await Promise.all([
      db.customerReceivable.count({ where: { organizationId: orgId, customerId: p.id } }),
      db.collectionRecord.count({ where: { organizationId: orgId, customerId: p.id } }),
      db.paymentRecord.count({ where: { organizationId: orgId, customerId: p.id } }),
      db.cRMOpportunity.count({ where: { organizationId: orgId, customerId: p.id } }),
      db.cRMActivity.count({ where: { organizationId: orgId, customerId: p.id } }),
      db.cRMQuote.count({ where: { organizationId: orgId, customerId: p.id } }),
    ]);

    console.log(`  linked records:`);
    console.log(`    CustomerReceivable : ${fmt(recCount)}`);
    console.log(`    CollectionRecord   : ${fmt(colCount)}`);
    console.log(`    PaymentRecord      : ${fmt(payCount)}`);
    console.log(`    CRMOpportunity     : ${fmt(oppCount)}`);
    console.log(`    CRMActivity        : ${fmt(actCount)}`);
    console.log(`    CRMQuote           : ${fmt(quoteCount)}`);

    // Cartera balance for this profile
    const balRows = await prisma.$queryRaw<Array<{ total: string; overdue: string }>>(Prisma.sql`
      SELECT
        COALESCE(SUM("balanceDue"), 0)::float8::text                                              AS total,
        COALESCE(SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END), 0)::float8::text AS overdue
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${orgId}
        AND "customerId" = ${p.id}
        AND "status" IN ('OPEN','PARTIAL','OVERDUE')
        AND "balanceDue" > 0
    `);
    const bal = balRows[0];
    console.log(`  cartera open   : ${fmtCop(parseFloat(bal.total))}  (vencido: ${fmtCop(parseFloat(bal.overdue))})`);
  }

  console.log(`\n${hr()}`);
  console.log(`  Summary`);
  console.log(hr());

  if (profiles.length > 1) {
    console.log(`  DUPLICATES DETECTED: ${profiles.length} profiles for "${nameArg}"`);
    console.log(`  Recommended action: run _merge-customer-profiles.ts`);
    console.log(`  --canonical <id>  (profile with NIT + sagTerceroId + most cartera)`);
    console.log(`  --duplicates <id>,<id>,...`);
  } else {
    console.log(`  Single profile — no duplicates.`);
  }

  console.log(`\n  Audit complete — no writes performed.\n`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
