/**
 * scripts/cleanup-seed-runs.ts
 *
 * One-shot cleanup: removes the prototype/seed FAILED run that causes the
 * Castillitos dashboard briefing to emit:
 *   "Hoy necesitamos tu atención en Castillitos, Andres."
 *   "1 run(s) failed."
 *
 * ROOT CAUSE:
 *   prisma/seed.ts line 366 seeded one Run with:
 *     type="inventory.sync", status=FAILED
 *   for the Castillitos org (created 2026-03-14 during dashboard prototyping).
 *
 *   The briefing pipeline:
 *     org-activity-engine.ts  → prisma.run.findMany({ organizationId })
 *     activity-summary.ts     → runs.filter(r => r.status === "FAILED").length → 1
 *     business-status.ts      → status="attention", reason="1 run(s) failed."
 *     daily-briefing.ts       → headline="Hoy necesitamos tu atención en Castillitos, Andres."
 *
 * TARGET ROW:
 *   organizationId = cmmpwstuf000dp5y58kj1daaj (castillitos)
 *   type           = "inventory.sync"
 *   status         = "FAILED"
 *
 * SAFE CONTRACTS:
 *   ✓ Deletes ONLY by exact type + status + organizationId for Castillitos
 *   ✓ Does NOT touch SUCCEEDED or RUNNING runs
 *   ✓ Does NOT touch ConnectorRun (separate table — real SAG execution history)
 *   ✓ Does NOT touch arketops data
 *   ✓ Idempotent — deleteMany on empty set = 0 rows, no error
 *
 * Usage:
 *   npx tsx scripts/cleanup-seed-runs.ts
 *   npx tsx scripts/cleanup-seed-runs.ts --dry-run
 */

import * as path   from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const DRY_RUN = process.argv.includes("--dry-run");
const CASTILLITOS_SLUG = "castillitos";

// Target: only this specific seed-generated demo run
const NOISE_RUN_TYPE   = "inventory.sync";
const NOISE_RUN_STATUS = "FAILED";

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

async function main(): Promise<void> {
  console.log(`\n${C.bold}Dashboard Run Noise Cleanup${C.reset}`);
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

  // ── Preview noise rows ───────────────────────────────────────────────────────

  section("Identifying noise run(s)");

  const targetRuns = await prisma.run.findMany({
    where: {
      organizationId: org.id,
      type:           NOISE_RUN_TYPE,
      status:         NOISE_RUN_STATUS,
    },
    select: { id: true, type: true, status: true, startedAt: true, endedAt: true },
  });

  if (targetRuns.length === 0) {
    ok("No noise runs found — already clean, nothing to delete.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\n  Runs to delete (${targetRuns.length}):`);
  for (const r of targetRuns) {
    info(`  id=${r.id}  type=${r.type}  status=${r.status}  startedAt=${r.startedAt?.toISOString() ?? "null"}`);
  }

  if (DRY_RUN) {
    warn("DRY RUN: would delete the rows listed above. Re-run without --dry-run to apply.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // ── Delete noise run ─────────────────────────────────────────────────────────

  section(`Deleting ${NOISE_RUN_STATUS} seed run (type=${NOISE_RUN_TYPE})`);

  const result = await prisma.run.deleteMany({
    where: {
      organizationId: org.id,
      type:           NOISE_RUN_TYPE,
      status:         NOISE_RUN_STATUS,
    },
  });

  ok(`Deleted ${result.count} run row(s)`);

  // ── Verify ───────────────────────────────────────────────────────────────────

  section("Verifying cleanup");

  const remaining = await prisma.run.count({
    where: {
      organizationId: org.id,
      type:           NOISE_RUN_TYPE,
      status:         NOISE_RUN_STATUS,
    },
  });

  if (remaining === 0) {
    ok(`Verified: 0 noise runs (type=${NOISE_RUN_TYPE}, status=${NOISE_RUN_STATUS}) remain.`);
  } else {
    console.log(`  ${C.red}Unexpected: ${remaining} run(s) still present.${C.reset}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── Remaining FAILED runs for org ────────────────────────────────────────────

  section("Remaining FAILED runs for Castillitos (real signals only)");

  const failedRuns = await prisma.run.findMany({
    where: { organizationId: org.id, status: "FAILED" },
    select: { id: true, type: true, status: true, startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  if (failedRuns.length === 0) {
    info("No FAILED runs remaining for Castillitos — briefing will show healthy status.");
  } else {
    warn(`${failedRuns.length} FAILED run(s) remain — these are real failures:`);
    for (const r of failedRuns) {
      info(`  id=${r.id}  type=${r.type}  startedAt=${r.startedAt?.toISOString() ?? "null"}`);
    }
  }

  // ── ConnectorRun sanity check ─────────────────────────────────────────────────

  section("ConnectorRun table (untouched — real SAG history)");

  const connectorRuns = await prisma.connectorRun.count({
    where: { connector: { organizationId: org.id } },
  });

  ok(`ConnectorRun rows preserved: ${connectorRuns} (not touched by this script)`);

  console.log(`\n  ${C.green}${C.bold}Cleanup complete.${C.reset}`);
  console.log(`  ${C.grey}Deleted: ${result.count} run(s)${C.reset}\n`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
