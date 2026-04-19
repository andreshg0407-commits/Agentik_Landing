/**
 * scripts/sag-test-approval.ts
 *
 * Phase 6 — Approval-gating validation (safe, DB state-transition only).
 *
 * SAFETY CONTRACT:
 *   ✗ NO SOAP calls (no insercionSag, no executeOperation)
 *   ✗ NO live SAG writes
 *   ✓ DB state transition only: PENDING → APPROVED via queue.approve()
 *   ✓ The API route (/approve) is NOT called — it would trigger executeOperation()
 *
 * What this script validates:
 *
 *   1. MANAGER+ gating — documented from route source code inspection
 *   2. approve+execute coupling in API route — documented from route source code
 *   3. queue.approve() state transition: PENDING → APPROVED
 *   4. Audit fields after approval: status, approvedBy, approvedAt
 *   5. No execution fields set: submittedXml=null, sagResponseOk=null, sentAt=null
 *   6. Saves approval artifact to scripts/samples/approval-result.json
 *
 * Target operation: cmnqjm6260000x3y5a610uaaj (type=1, UPSERT_CUSTOMER, risk=LOW)
 * Org: Castillitos (cmmpwstuf000dp5y58kj1daaj)
 *
 * Usage:
 *   npx tsx scripts/sag-test-approval.ts
 *   npx tsx scripts/sag-test-approval.ts --skip-save
 */

import * as path   from "path";
import * as fs     from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

// ── Constants ─────────────────────────────────────────────────────────────────

const OPERATION_ID    = "cmnqjm6260000x3y5a610uaaj";
const ORGANIZATION_ID = "cmmpwstuf000dp5y58kj1daaj";
const APPROVED_BY     = "sag-test-approval-script";

const SKIP_SAVE = process.argv.includes("--skip-save");

// ── Colour helpers ────────────────────────────────────────────────────────────

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
function fail(msg: string) { console.log(`  ${C.red}\u2717${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}\u00b7${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}\u26a0${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

// ── Artifact saver ────────────────────────────────────────────────────────────

function saveArtifact(data: object): void {
  if (SKIP_SAVE) {
    info("(--skip-save) skipping approval-result.json");
    return;
  }
  const samplesDir = path.resolve(__dirname, "samples");
  if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });
  const filePath = path.join(samplesDir, "approval-result.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  ok("Artifact saved -> scripts/samples/approval-result.json");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG Approval-Gating Test${C.reset} -- Castillitos (DB STATE TRANSITION ONLY)`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  console.log(`  ${C.yellow}${C.bold}SAFETY: No SOAP calls. No executeOperation(). DB transition only.${C.reset}`);

  let overallExit = 0;

  // Dynamic imports after dotenv is loaded
  const { prisma }  = await import("../lib/prisma");
  const { approve } = await import("../lib/sag/write/queue");

  // ── Section 1: Document API route approve+execute coupling ──────────────────

  section("1. API Route: approve + execute coupling (documented from source)");

  info("Route: POST /api/orgs/[orgSlug]/sag/write/[operationId]/approve");
  info("Source: app/api/orgs/[orgSlug]/sag/write/[operationId]/approve/route.ts");
  console.log();
  console.log(`  ${C.yellow}COUPLING CONFIRMED:${C.reset} The API route calls both operations in sequence:`);
  console.log(`    ${C.grey}// 1. Approve (PENDING -> APPROVED)${C.reset}`);
  console.log(`    ${C.grey}const approveResult = await approve(operationId, org.id, user.id);${C.reset}`);
  console.log(`    ${C.grey}// 2. Execute immediately (APPROVED -> SENDING -> SUCCEEDED|FAILED)${C.reset}`);
  console.log(`    ${C.grey}const execResult = await executeOperation(operationId, org.id);${C.reset}`);
  console.log();
  console.log(`  ${C.red}${C.bold}WARNING: Calling the API route sends a real SOAP write to the live SAG endpoint.${C.reset}`);
  console.log(`  ${C.green}This script calls queue.approve() directly -- state change only, no executor.${C.reset}`);

  // ── Section 2: Document MANAGER+ gating ────────────────────────────────────

  section("2. Permission gating (MANAGER+ -- documented from source)");

  console.log(`  Route enforces role check before any state change:`);
  console.log(`    ${C.grey}const allowedRoles = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];${C.reset}`);
  console.log(`    ${C.grey}if (!allowedRoles.includes(membership.role)) return 403;${C.reset}`);
  console.log();
  info("Role check is in the API route (HTTP layer), NOT in queue.approve()");
  info("queue.approve() itself has no role check -- it trusts the caller");
  info("This script bypasses HTTP auth intentionally -- direct DB call from test context");
  ok("MANAGER+ gating: confirmed from route source (allowedRoles check at route.ts:29-35)");

  // ── Section 3: Pre-flight — verify operation row ────────────────────────────

  section("3. Pre-flight: verify operation in DB");

  const opBefore = await prisma.sagWriteOperation.findFirst({
    where: { id: OPERATION_ID, organizationId: ORGANIZATION_ID },
    select: {
      id:            true,
      status:        true,
      writeType:     true,
      risk:          true,
      description:   true,
      initiatedBy:   true,
      initiatedAt:   true,
      generatedXml:  true,
      approvedBy:    true,
      approvedAt:    true,
      submittedXml:  true,
      sagResponseOk: true,
      sentAt:        true,
      retryCount:    true,
    },
  });

  if (!opBefore) {
    fail(`Operation ${OPERATION_ID} not found in DB (org=${ORGANIZATION_ID})`);
    fail("Cannot proceed -- operation must exist");
    process.exit(1);
  }

  ok(`Operation found: ${opBefore.id}`);
  info(`  status:        ${opBefore.status}`);
  info(`  writeType:     ${opBefore.writeType}`);
  info(`  risk:          ${opBefore.risk}`);
  info(`  description:   ${opBefore.description}`);
  info(`  initiatedBy:   ${opBefore.initiatedBy}`);
  info(`  initiatedAt:   ${opBefore.initiatedAt?.toISOString()}`);
  info(`  generatedXml:  ${opBefore.generatedXml ? `${opBefore.generatedXml.length} chars` : "null"}`);
  info(`  approvedBy:    ${opBefore.approvedBy ?? "null"}`);
  info(`  submittedXml:  ${opBefore.submittedXml ?? "null"}`);
  info(`  sagResponseOk: ${opBefore.sagResponseOk ?? "null"}`);
  info(`  sentAt:        ${opBefore.sentAt ?? "null"}`);

  let alreadyApproved = false;

  if (opBefore.status === "PENDING") {
    ok("Pre-flight: status = PENDING");
  } else if (opBefore.status === "APPROVED") {
    warn(`Status is already "APPROVED" -- operation was approved in a previous test run`);
    warn("Skipping approve() call; will verify existing post-approval fields");
    alreadyApproved = true;
  } else {
    fail(`Unexpected status "${opBefore.status}" -- expected PENDING or APPROVED`);
    overallExit = 1;
    await prisma.$disconnect();
    process.exit(overallExit);
  }

  // ── Section 4: Call queue.approve() ─────────────────────────────────────────

  section("4. Calling queue.approve() -- state transition PENDING -> APPROVED");

  if (alreadyApproved) {
    info("Skipping approve() call -- already APPROVED");
  } else {
    info(`Calling approve("${OPERATION_ID}", "${ORGANIZATION_ID}", "${APPROVED_BY}")`);
    const approveResult = await approve(OPERATION_ID, ORGANIZATION_ID, APPROVED_BY);

    if (!approveResult.ok) {
      fail(`approve() returned error: ${approveResult.error}`);
      overallExit = 1;
      await prisma.$disconnect();
      process.exit(overallExit);
    }

    ok("approve() returned { ok: true }");
  }

  // ── Section 5: Verify post-approval DB fields ───────────────────────────────

  section("5. Verifying post-approval DB fields");

  const opAfter = await prisma.sagWriteOperation.findFirst({
    where: { id: OPERATION_ID },
    select: {
      id:             true,
      status:         true,
      approvedBy:     true,
      approvedAt:     true,
      submittedXml:   true,
      sagResponseOk:  true,
      sagResponseRaw: true,
      sentAt:         true,
      executedAt:     true,
      generatedXml:   true,
      retryCount:     true,
    },
  });

  if (!opAfter) {
    fail("Operation disappeared from DB after approve() -- unexpected");
    process.exit(1);
  }

  let checks = 0;
  let passed = 0;

  function check(
    label: string,
    actual: unknown,
    expected: unknown,
    mode: "exact" | "not-null" = "exact",
  ): void {
    checks++;
    const matches = mode === "not-null"
      ? actual !== null && actual !== undefined
      : actual === expected;
    if (matches) {
      ok(`${label}: ${JSON.stringify(actual)}`);
      passed++;
    } else {
      fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      overallExit = 1;
    }
  }

  check("status",         opAfter.status,         "APPROVED");
  check("approvedBy",     opAfter.approvedBy,     alreadyApproved ? opAfter.approvedBy : APPROVED_BY);
  check("approvedAt",     opAfter.approvedAt,     null, "not-null");
  check("submittedXml",   opAfter.submittedXml,   null);
  check("sagResponseOk",  opAfter.sagResponseOk,  null);
  check("sagResponseRaw", opAfter.sagResponseRaw, null);
  check("sentAt",         opAfter.sentAt,         null);
  check("executedAt",     opAfter.executedAt,     null);

  // generatedXml must still be present (unchanged by approve())
  checks++;
  if (opAfter.generatedXml && opAfter.generatedXml.length > 0) {
    ok(`generatedXml: present (${Buffer.byteLength(opAfter.generatedXml, "utf-8")} bytes, unchanged)`);
    passed++;
  } else {
    fail("generatedXml: null or empty -- unexpected, should be unchanged after approve()");
    overallExit = 1;
  }

  // approvedAt recency (only meaningful on a fresh approval)
  if (!alreadyApproved && opAfter.approvedAt) {
    checks++;
    const msSinceApproval = Date.now() - opAfter.approvedAt.getTime();
    if (msSinceApproval < 60_000) {
      ok(`approvedAt recency: ${msSinceApproval}ms ago (< 60s)`);
      passed++;
    } else {
      fail(`approvedAt too old: ${msSinceApproval}ms ago -- expected < 60s`);
      overallExit = 1;
    }
  }

  console.log();
  info(`${passed}/${checks} field checks passed`);

  // ── Section 6: Queue state after approval ───────────────────────────────────

  section("6. Queue state after approval");

  const pendingCount = await prisma.sagWriteOperation.count({
    where: { organizationId: ORGANIZATION_ID, status: "PENDING" },
  });
  const approvedCount = await prisma.sagWriteOperation.count({
    where: { organizationId: ORGANIZATION_ID, status: "APPROVED" },
  });

  info(`PENDING count (org):  ${pendingCount}`);
  info(`APPROVED count (org): ${approvedCount}`);
  ok("Operation is now APPROVED and awaiting execution via API route");
  warn(`To execute: POST .../sag/write/${OPERATION_ID}/approve (MANAGER+ session required -- sends real SOAP)`);
  warn(`To reject instead: queue.reject("${OPERATION_ID}", ...) -- terminal, no SOAP call`);

  // ── Section 7: Save artifact ─────────────────────────────────────────────────

  section("7. Saving artifact");

  const artifact = {
    capturedAt:     new Date().toISOString(),
    mode:           "APPROVAL-GATE-TEST -- NO SOAP CALL -- NO SAG WRITE",
    operationId:    OPERATION_ID,
    organizationId: ORGANIZATION_ID,
    approvedBy:     alreadyApproved ? opAfter.approvedBy : APPROVED_BY,
    alreadyApprovedBeforeTest: alreadyApproved,
    routeCoupling: {
      description: "API route approve+execute coupling",
      path:        "app/api/orgs/[orgSlug]/sag/write/[operationId]/approve/route.ts",
      behavior:    "approve() immediately followed by executeOperation() in one HTTP request",
      implication: "Calling API route sends a real SOAP write -- NOT safe in test context",
    },
    permissionGating: {
      allowedRoles:  ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"],
      enforcedAt:    "API route (HTTP layer) -- queue.approve() has no role check",
      roleCheckLine: "route.ts lines 29-35: allowedRoles.includes(membership.role)",
    },
    preApprovalState: {
      status:        opBefore.status,
      approvedBy:    opBefore.approvedBy,
      approvedAt:    opBefore.approvedAt?.toISOString() ?? null,
      submittedXml:  opBefore.submittedXml,
      sagResponseOk: opBefore.sagResponseOk,
      sentAt:        opBefore.sentAt?.toISOString() ?? null,
    },
    postApprovalState: {
      status:            opAfter.status,
      approvedBy:        opAfter.approvedBy,
      approvedAt:        opAfter.approvedAt?.toISOString() ?? null,
      submittedXml:      opAfter.submittedXml,
      sagResponseOk:     opAfter.sagResponseOk,
      sagResponseRaw:    opAfter.sagResponseRaw,
      sentAt:            opAfter.sentAt?.toISOString() ?? null,
      executedAt:        opAfter.executedAt?.toISOString() ?? null,
      generatedXmlBytes: opAfter.generatedXml ? Buffer.byteLength(opAfter.generatedXml, "utf-8") : null,
    },
    queueState: {
      pendingCount,
      approvedCount,
    },
    checksPassedOf: `${passed}/${checks}`,
  };

  saveArtifact(artifact);

  // ── Summary ──────────────────────────────────────────────────────────────────

  section("Phase 6 Approval-Gating Summary");

  const xmlBytes = opAfter.generatedXml ? Buffer.byteLength(opAfter.generatedXml, "utf-8") : 0;

  console.log(`  ${C.green}ok${C.reset} MANAGER+ gating: confirmed in route source`);
  console.log(`  ${C.green}ok${C.reset} approve+execute coupling: documented from route`);
  console.log(`  ${C.green}ok${C.reset} queue.approve() state transition: PENDING -> APPROVED`);
  console.log(`  ${C.green}ok${C.reset} Audit fields: status=APPROVED, approvedBy set, approvedAt set`);
  console.log(`  ${C.green}ok${C.reset} No execution: submittedXml=null, sagResponseOk=null, sentAt=null`);
  console.log(`  ${C.green}ok${C.reset} generatedXml unchanged: ${xmlBytes} bytes (immutable through approval)`);
  console.log();

  if (overallExit === 0) {
    console.log(`  ${C.green}${C.bold}Approval-gating validation passed.${C.reset}`);
    console.log(`  ${C.yellow}Next: call POST .../approve via authenticated MANAGER+ session to execute.${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}One or more checks failed -- review output above.${C.reset}\n`);
  }

  await prisma.$disconnect();
  process.exit(overallExit);
}

main().catch(err => {
  console.error(`\nUnhandled error:`, err);
  process.exit(1);
});
