/**
 * scripts/_merge-customer-profiles.ts
 *
 * Merges duplicate CustomerProfile records into a single canonical profile.
 *
 * What it does:
 *   1. Validates canonical and duplicate IDs (same org, exist, not already DUPLICATE)
 *   2. Re-points all FK references from duplicates → canonical:
 *        CustomerReceivable.customerId
 *        CollectionRecord.customerId
 *        PaymentRecord.customerId
 *        CRMOpportunity.customerId
 *        CRMActivity.customerId
 *        CRMQuote.customerId
 *   3. Marks each duplicate CustomerProfile as identityStatus = DUPLICATE
 *      with identityNotes = "Merged into <canonicalId> on <date>"
 *   4. Prints a full before/after report.
 *
 * Safe to re-run — re-pointing an already-canonical FK is a no-op.
 * Does NOT delete duplicate profiles (preserves audit trail).
 *
 * Usage (dry-run first — ALWAYS):
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_merge-customer-profiles.ts')" \
 *     -- --org castillitos \
 *        --canonical cmnjaig7h0kdy7yy5x1ig4w4x \
 *        --duplicates <id1>,<id2> \
 *        --dry-run
 *
 * Then live:
 *   (remove --dry-run)
 *
 * Flags:
 *   --org        <slug>          Organization slug (required)
 *   --canonical  <customerId>    The profile ID to keep as canonical (required)
 *   --duplicates <id1,id2,...>   Comma-separated duplicate profile IDs (required)
 *   --dry-run                    Print plan without writing
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ── CLI ───────────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const orgSlugArg     = getArg("--org");
const canonicalIdArg = getArg("--canonical");
const duplicatesArg  = getArg("--duplicates");
const isDryRun       = hasFlag("--dry-run");

if (!orgSlugArg || !canonicalIdArg || !duplicatesArg) {
  console.error("Usage: --org <slug> --canonical <id> --duplicates <id1,id2,...> [--dry-run]");
  process.exit(1);
}

const duplicateIds = duplicatesArg.split(",").map(s => s.trim()).filter(Boolean);
if (duplicateIds.length === 0) {
  console.error("--duplicates must contain at least one ID");
  process.exit(1);
}
if (duplicateIds.includes(canonicalIdArg)) {
  console.error("--canonical ID must not appear in --duplicates");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}
function fmtCop(n: number): string { return `$${fmt(n)}`; }
function hr(c = "─", n = 72) { return c.repeat(n); }

type ProfileSnap = {
  id: string; name: string; nit: string | null; nitNormalized: string | null;
  sagTerceroId: number | null; identityStatus: string; identityNotes: string | null;
};

type LinkCounts = {
  receivable: number; collection: number; payment: number;
  opportunity: number; activity: number; quote: number;
};

async function getLinkCounts(orgId: string, profileId: string): Promise<LinkCounts> {
  const db = prisma as any;
  const [receivable, collection, payment, opportunity, activity, quote] = await Promise.all([
    db.customerReceivable.count({ where: { organizationId: orgId, customerId: profileId } }),
    db.collectionRecord.count({ where: { organizationId: orgId, customerId: profileId } }),
    db.paymentRecord.count({ where: { organizationId: orgId, customerId: profileId } }),
    db.cRMOpportunity.count({ where: { organizationId: orgId, customerId: profileId } }),
    db.cRMActivity.count({ where: { organizationId: orgId, customerId: profileId } }),
    db.cRMQuote.count({ where: { organizationId: orgId, customerId: profileId } }),
  ]);
  return { receivable, collection, payment, opportunity, activity, quote };
}

async function getCarteraBalance(orgId: string, profileId: string) {
  const rows = await prisma.$queryRaw<Array<{ total: string; overdue: string }>>(Prisma.sql`
    SELECT
      COALESCE(SUM("balanceDue"), 0)::float8::text                                              AS total,
      COALESCE(SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END), 0)::float8::text AS overdue
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${orgId}
      AND "customerId"     = ${profileId}
      AND "status" IN ('OPEN','PARTIAL','OVERDUE')
      AND "balanceDue" > 0
  `);
  return { total: parseFloat(rows[0].total), overdue: parseFloat(rows[0].overdue) };
}

function printProfile(label: string, p: ProfileSnap, counts: LinkCounts, bal: { total: number; overdue: number }) {
  console.log(`  [${label}]`);
  console.log(`    id             : ${p.id}`);
  console.log(`    name           : ${p.name}`);
  console.log(`    nit            : ${p.nit ?? "null"}`);
  console.log(`    nitNormalized  : ${p.nitNormalized ?? "null"}`);
  console.log(`    sagTerceroId   : ${p.sagTerceroId ?? "null"}`);
  console.log(`    identityStatus : ${p.identityStatus}`);
  console.log(`    identityNotes  : ${p.identityNotes ?? "—"}`);
  console.log(`    CustomerReceivable  : ${fmt(counts.receivable)}`);
  console.log(`    CollectionRecord    : ${fmt(counts.collection)}`);
  console.log(`    PaymentRecord       : ${fmt(counts.payment)}`);
  console.log(`    CRMOpportunity      : ${fmt(counts.opportunity)}`);
  console.log(`    CRMActivity         : ${fmt(counts.activity)}`);
  console.log(`    CRMQuote            : ${fmt(counts.quote)}`);
  console.log(`    cartera total       : ${fmtCop(bal.total)}  (vencido: ${fmtCop(bal.overdue)})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const db = prisma as any;

  // Resolve org
  const org = await db.organization.findFirst({
    where:  { slug: orgSlugArg },
    select: { id: true, slug: true },
  });
  if (!org) { console.error(`org not found: ${orgSlugArg}`); process.exit(1); }
  const orgId = org.id as string;

  console.log(`\n${hr("═")}`);
  console.log(`  Customer Profile Merge`);
  console.log(`  mode       : ${isDryRun ? "DRY-RUN (no writes)" : "LIVE"}`);
  console.log(`  org        : ${org.slug} (${orgId})`);
  console.log(`  canonical  : ${canonicalIdArg}`);
  console.log(`  duplicates : ${duplicateIds.join(", ")}`);
  console.log(hr("═"));

  // ── Validate canonical ────────────────────────────────────────────────────

  const canonical: ProfileSnap | null = await db.customerProfile.findFirst({
    where:  { id: canonicalIdArg, organizationId: orgId },
    select: { id: true, name: true, nit: true, nitNormalized: true, sagTerceroId: true, identityStatus: true, identityNotes: true },
  });
  if (!canonical) {
    console.error(`  ERROR: canonical profile not found: ${canonicalIdArg}`);
    process.exit(1);
  }
  if (canonical.identityStatus === "DUPLICATE") {
    console.error(`  ERROR: canonical profile is already marked DUPLICATE — pick the correct canonical.`);
    process.exit(1);
  }

  // ── Validate duplicates ───────────────────────────────────────────────────

  const duplicateProfiles: ProfileSnap[] = [];
  for (const dupId of duplicateIds) {
    const dup: ProfileSnap | null = await db.customerProfile.findFirst({
      where:  { id: dupId, organizationId: orgId },
      select: { id: true, name: true, nit: true, nitNormalized: true, sagTerceroId: true, identityStatus: true, identityNotes: true },
    });
    if (!dup) {
      console.error(`  ERROR: duplicate profile not found: ${dupId}`);
      process.exit(1);
    }
    duplicateProfiles.push(dup);
  }

  // ── Before state ─────────────────────────────────────────────────────────

  console.log(`\n${hr()}`);
  console.log(`  BEFORE`);
  console.log(hr());

  const canonicalCountsBefore = await getLinkCounts(orgId, canonical.id);
  const canonicalBalBefore    = await getCarteraBalance(orgId, canonical.id);
  printProfile("CANONICAL", canonical, canonicalCountsBefore, canonicalBalBefore);

  for (const dup of duplicateProfiles) {
    console.log();
    const dupCounts = await getLinkCounts(orgId, dup.id);
    const dupBal    = await getCarteraBalance(orgId, dup.id);
    printProfile(`DUPLICATE ${dup.id}`, dup, dupCounts, dupBal);
  }

  // ── Merge plan ────────────────────────────────────────────────────────────

  console.log(`\n${hr()}`);
  console.log(`  PLAN`);
  console.log(hr());

  // Compute totals to be moved
  let totalRec = 0, totalCol = 0, totalPay = 0, totalOpp = 0, totalAct = 0, totalQuo = 0;
  for (const dup of duplicateProfiles) {
    const c = await getLinkCounts(orgId, dup.id);
    totalRec += c.receivable; totalCol += c.collection; totalPay += c.payment;
    totalOpp += c.opportunity; totalAct += c.activity; totalQuo += c.quote;
  }

  console.log(`  Re-point to canonical ${canonical.id}:`);
  console.log(`    CustomerReceivable  : ${fmt(totalRec)} records`);
  console.log(`    CollectionRecord    : ${fmt(totalCol)} records`);
  console.log(`    PaymentRecord       : ${fmt(totalPay)} records`);
  console.log(`    CRMOpportunity      : ${fmt(totalOpp)} records`);
  console.log(`    CRMActivity         : ${fmt(totalAct)} records`);
  console.log(`    CRMQuote            : ${fmt(totalQuo)} records`);
  console.log(`  Mark ${duplicateProfiles.length} profile(s) as DUPLICATE.`);

  if (isDryRun) {
    console.log(`\n  DRY-RUN complete — no changes written.`);
    console.log(`  Remove --dry-run to execute.\n`);
    await prisma.$disconnect();
    return;
  }

  // ── Execute merge ─────────────────────────────────────────────────────────

  console.log(`\n${hr()}`);
  console.log(`  EXECUTING`);
  console.log(hr());

  const mergeNote = `Merged into ${canonical.id} on ${new Date().toISOString().slice(0, 10)}`;

  for (const dup of duplicateProfiles) {
    console.log(`\n  Merging ${dup.id} (${dup.name}) → ${canonical.id} ...`);

    // Re-point FKs in one transaction per duplicate
    await prisma.$transaction(async (tx: any) => {
      // CustomerReceivable
      const r1 = await tx.customerReceivable.updateMany({
        where: { organizationId: orgId, customerId: dup.id },
        data:  { customerId: canonical.id },
      });
      console.log(`    CustomerReceivable  : moved ${r1.count}`);

      // CollectionRecord
      const r2 = await tx.collectionRecord.updateMany({
        where: { organizationId: orgId, customerId: dup.id },
        data:  { customerId: canonical.id },
      });
      console.log(`    CollectionRecord    : moved ${r2.count}`);

      // PaymentRecord
      const r3 = await tx.paymentRecord.updateMany({
        where: { organizationId: orgId, customerId: dup.id },
        data:  { customerId: canonical.id },
      });
      console.log(`    PaymentRecord       : moved ${r3.count}`);

      // CRMOpportunity
      const r4 = await tx.cRMOpportunity.updateMany({
        where: { organizationId: orgId, customerId: dup.id },
        data:  { customerId: canonical.id },
      });
      console.log(`    CRMOpportunity      : moved ${r4.count}`);

      // CRMActivity
      const r5 = await tx.cRMActivity.updateMany({
        where: { organizationId: orgId, customerId: dup.id },
        data:  { customerId: canonical.id },
      });
      console.log(`    CRMActivity         : moved ${r5.count}`);

      // CRMQuote
      const r6 = await tx.cRMQuote.updateMany({
        where: { organizationId: orgId, customerId: dup.id },
        data:  { customerId: canonical.id },
      });
      console.log(`    CRMQuote            : moved ${r6.count}`);

      // Mark duplicate
      await tx.customerProfile.update({
        where: { id: dup.id },
        data:  {
          identityStatus: "DUPLICATE",
          identityNotes:  mergeNote,
        },
      });
      console.log(`    identityStatus      : → DUPLICATE`);
    });
  }

  // ── After state ───────────────────────────────────────────────────────────

  console.log(`\n${hr()}`);
  console.log(`  AFTER`);
  console.log(hr());

  const canonicalCountsAfter = await getLinkCounts(orgId, canonical.id);
  const canonicalBalAfter    = await getCarteraBalance(orgId, canonical.id);
  printProfile("CANONICAL", canonical, canonicalCountsAfter, canonicalBalAfter);

  // Verify duplicates are now empty
  for (const dup of duplicateProfiles) {
    const dupCountsAfter = await getLinkCounts(orgId, dup.id);
    const sum = Object.values(dupCountsAfter).reduce((a, b) => a + b, 0);
    const updatedDup: ProfileSnap | null = await db.customerProfile.findFirst({
      where:  { id: dup.id },
      select: { id: true, name: true, nit: true, nitNormalized: true, sagTerceroId: true, identityStatus: true, identityNotes: true },
    });
    console.log();
    printProfile(`DUPLICATE ${dup.id} (post-merge)`, updatedDup!, dupCountsAfter, { total: 0, overdue: 0 });
    if (sum > 0) {
      console.log(`  WARNING: ${sum} linked records still point to duplicate ${dup.id} — investigate.`);
    } else {
      console.log(`  OK: no linked records remain on duplicate.`);
    }
  }

  console.log(`\n${hr("═")}`);
  console.log(`  Merge complete.`);
  console.log(`  Canonical href : /${orgSlugArg}/customer-360?customerId=${canonical.id}`);
  console.log(hr("═"));
  console.log();

  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
