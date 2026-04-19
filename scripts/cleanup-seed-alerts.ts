/**
 * scripts/cleanup-seed-alerts.ts
 *
 * One-shot cleanup: removes prototype/seed demo alert and event rows from the
 * Castillitos org that pollute the dashboard with fake signals.
 *
 * TARGET ROWS (all created by prisma/seed.ts demo-activity block):
 *
 *   Alert (Castillitos org):
 *     - "Inventario bajo en Castillitos"  (type: inventory.low,  severity: WARNING)
 *     - "Sync fallido en Pets"            (type: sync.failed,    severity: CRITICAL)
 *
 *   Event (Castillitos org — dashboard prototype demo events):
 *     - type: inventory.updated  (sourceType: api,      payloadJson: {sku:"SKU-001",...})
 *     - type: catalog.synced     (sourceType: workflow,  payloadJson: {items:12})
 *
 * SAFE CONTRACTS:
 *   ✓ Deletes ONLY by exact title (alerts) or exact type (events) for castillitos org
 *   ✓ Does NOT touch arketops org data
 *   ✓ Does NOT touch any real alert pipeline tables (BusinessAlert, etc.)
 *   ✓ Does NOT touch ConnectorRun, CustomerProfile, CRM, SagWriteOperation
 *   ✓ Idempotent — safe to run multiple times (deleteMany on empty set = 0 rows)
 *
 * Usage:
 *   npx tsx scripts/cleanup-seed-alerts.ts
 *   npx tsx scripts/cleanup-seed-alerts.ts --dry-run
 */

import * as path   from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const DRY_RUN = process.argv.includes("--dry-run");

const CASTILLITOS_SLUG = "castillitos";

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
};

function ok(msg: string)   { console.log(`  ${C.green}\u2713${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}\u00b7${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}\u26a0${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

// Target titles / types — all seeded in prisma/seed.ts demo-activity block
const NOISE_ALERT_TITLES = [
  "Inventario bajo en Castillitos",
  "Sync fallido en Pets",
];

const NOISE_EVENT_TYPES = [
  "inventory.updated",
  "catalog.synced",
];

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG/Dashboard Alert Noise Cleanup${C.reset}`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  if (DRY_RUN) {
    console.log(`  ${C.yellow}${C.bold}DRY RUN — no deletes will execute.${C.reset}`);
  }

  const { prisma } = await import("../lib/prisma");

  // ── Resolve org ──────────────────────────────────────────────────────────────

  section("Resolving Castillitos org");

  const org = await prisma.organization.findUnique({
    where: { slug: CASTILLITOS_SLUG },
    select: { id: true, slug: true, status: true },
  });

  if (!org) {
    console.error(`  Organization "${CASTILLITOS_SLUG}" not found — aborting.`);
    process.exit(1);
  }

  ok(`Found: ${org.slug} (${org.id}) — status: ${org.status}`);

  // ── Preview: count noise rows before delete ──────────────────────────────────

  section("Counting noise rows before cleanup");

  const alertsBefore = await prisma.alert.findMany({
    where: {
      organizationId: org.id,
      title: { in: NOISE_ALERT_TITLES },
    },
    select: { id: true, title: true, type: true, severity: true, status: true, createdAt: true },
  });

  const eventsBefore = await prisma.event.findMany({
    where: {
      organizationId: org.id,
      type: { in: NOISE_EVENT_TYPES },
    },
    select: { id: true, type: true, sourceType: true, status: true, createdAt: true },
  });

  if (alertsBefore.length === 0 && eventsBefore.length === 0) {
    ok("No noise rows found — already clean, nothing to delete.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\n  Alerts to delete (${alertsBefore.length}):`);
  for (const a of alertsBefore) {
    info(`  id=${a.id}  title="${a.title}"  type=${a.type}  severity=${a.severity}  status=${a.status}  createdAt=${a.createdAt.toISOString()}`);
  }

  console.log(`\n  Events to delete (${eventsBefore.length}):`);
  for (const e of eventsBefore) {
    info(`  id=${e.id}  type=${e.type}  sourceType=${e.sourceType}  status=${e.status}  createdAt=${e.createdAt.toISOString()}`);
  }

  if (DRY_RUN) {
    warn("DRY RUN: would delete the rows listed above. Re-run without --dry-run to apply.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // ── Delete noise alerts ──────────────────────────────────────────────────────

  section("Deleting noise alerts");

  const alertResult = await prisma.alert.deleteMany({
    where: {
      organizationId: org.id,
      title: { in: NOISE_ALERT_TITLES },
    },
  });

  ok(`Deleted ${alertResult.count} alert row(s)`);

  // ── Delete noise events ──────────────────────────────────────────────────────

  section("Deleting noise events");

  const eventResult = await prisma.event.deleteMany({
    where: {
      organizationId: org.id,
      type: { in: NOISE_EVENT_TYPES },
    },
  });

  ok(`Deleted ${eventResult.count} event row(s)`);

  // ── Verify ───────────────────────────────────────────────────────────────────

  section("Verifying cleanup");

  const alertsAfter = await prisma.alert.count({
    where: {
      organizationId: org.id,
      title: { in: NOISE_ALERT_TITLES },
    },
  });

  const eventsAfter = await prisma.event.count({
    where: {
      organizationId: org.id,
      type: { in: NOISE_EVENT_TYPES },
    },
  });

  if (alertsAfter === 0 && eventsAfter === 0) {
    ok("Verified: 0 noise alerts, 0 noise events remain for Castillitos org.");
  } else {
    console.log(`  ${C.red}Unexpected: ${alertsAfter} alert(s) and ${eventsAfter} event(s) still present.${C.reset}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── Remaining real alerts summary ────────────────────────────────────────────

  section("Remaining alerts for Castillitos (real signals only)");

  const remaining = await prisma.alert.findMany({
    where: { organizationId: org.id },
    select: { id: true, title: true, type: true, severity: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (remaining.length === 0) {
    info("No alerts remaining for Castillitos — clean slate.");
  } else {
    for (const a of remaining) {
      info(`  ${a.severity.padEnd(8)} [${a.status}] "${a.title}" (${a.type})`);
    }
  }

  console.log(`\n  ${C.green}${C.bold}Cleanup complete.${C.reset}`);
  console.log(`  ${C.grey}Deleted: ${alertResult.count} alert(s), ${eventResult.count} event(s)${C.reset}\n`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
