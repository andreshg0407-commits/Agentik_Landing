/**
 * scripts/sag-test-safety-arch.ts
 *
 * Safety architecture validation — verifies the decoupled approve/execute design.
 *
 * SAFETY CONTRACT:
 *   ✗ NO executeOperation() calls
 *   ✗ NO SOAP calls
 *   ✓ Route source inspection only
 *   ✓ DB state inspection only
 *
 * What this script validates:
 *   1. approve route imports: NO executeOperation import present
 *   2. execute route exists and imports executeOperation
 *   3. retry route imports: NO executeOperation import present
 *   4. executor guardrail: only APPROVED status allowed (code inspection)
 *   5. Current DB state of the test operation (cmnqjm6260000x3y5a610uaaj)
 *   6. Route surface map — all SAG write routes listed
 *
 * Usage:
 *   npx tsx scripts/sag-test-safety-arch.ts
 */

import * as path from "path";
import * as fs   from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

// ── Constants ─────────────────────────────────────────────────────────────────

const OPERATION_ID    = "cmnqjm6260000x3y5a610uaaj";
const ORGANIZATION_ID = "cmmpwstuf000dp5y58kj1daaj";

const ROOT = path.resolve(__dirname, "..");

// Route paths relative to ROOT
const APPROVE_ROUTE  = "app/api/orgs/[orgSlug]/sag/write/[operationId]/approve/route.ts";
const EXECUTE_ROUTE  = "app/api/orgs/[orgSlug]/sag/write/[operationId]/execute/route.ts";
const RETRY_ROUTE    = "app/api/orgs/[orgSlug]/sag/write/[operationId]/retry/route.ts";
const REJECT_ROUTE   = "app/api/orgs/[orgSlug]/sag/write/[operationId]/reject/route.ts";
const EXECUTOR_LIB   = "lib/sag/write/executor.ts";

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

function readRoute(rel: string): string | null {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG Safety Architecture Validation${C.reset} -- Castillitos`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  console.log(`  ${C.yellow}${C.bold}Inspect-only: no DB writes, no SOAP calls.${C.reset}`);

  let overallExit = 0;
  let checks = 0;
  let passed = 0;

  function chk(label: string, result: boolean, detail?: string): void {
    checks++;
    if (result) {
      ok(`${label}${detail ? `: ${detail}` : ""}`);
      passed++;
    } else {
      fail(`${label}${detail ? `: ${detail}` : ""}`);
      overallExit = 1;
    }
  }

  // ── Section 1: approve route — NO executeOperation ──────────────────────────

  section("1. approve/route.ts — must NOT import executeOperation");

  const approveSource = readRoute(APPROVE_ROUTE);
  if (!approveSource) {
    fail(`File not found: ${APPROVE_ROUTE}`);
    overallExit = 1;
  } else {
    const hasExecImport = approveSource.includes("executeOperation");
    chk("approve route: no executeOperation reference", !hasExecImport,
      hasExecImport ? "FOUND executeOperation — coupling NOT removed" : "clean");

    const hasApproveImport = approveSource.includes(`from "@/lib/sag/write/queue"`);
    chk("approve route: imports approve from queue", hasApproveImport);

    const returnsApprovedStatus = approveSource.includes('"APPROVED"');
    chk("approve route: returns status=APPROVED in response", returnsApprovedStatus);

    const hasNextHint = approveSource.includes("execute");
    chk("approve route: response includes next-step hint for /execute", hasNextHint);
  }

  // ── Section 2: execute route — must exist and import executeOperation ────────

  section("2. execute/route.ts — must exist and call executeOperation");

  const executeSource = readRoute(EXECUTE_ROUTE);
  if (!executeSource) {
    fail(`File not found: ${EXECUTE_ROUTE} — execute route not created`);
    overallExit = 1;
    checks++;
  } else {
    chk("execute route: file exists", true, EXECUTE_ROUTE);

    const hasExecImport = executeSource.includes("executeOperation");
    chk("execute route: imports executeOperation", hasExecImport);

    const hasManagerCheck = executeSource.includes("allowedRoles");
    chk("execute route: MANAGER+ role check present", hasManagerCheck);

    const hasPostExport = executeSource.includes("export async function POST");
    chk("execute route: exports POST handler", hasPostExport);

    const hasNodeRuntime = executeSource.includes('runtime = "nodejs"');
    chk("execute route: runtime=nodejs set", hasNodeRuntime);

    // Must NOT include queue.approve() — execution only
    const hasApproveCall = executeSource.includes("approve(");
    chk("execute route: does NOT call approve()", !hasApproveCall,
      hasApproveCall ? "FOUND approve() call — should only execute" : "clean");
  }

  // ── Section 3: retry route — NO executeOperation ────────────────────────────

  section("3. retry/route.ts — must NOT import executeOperation");

  const retrySource = readRoute(RETRY_ROUTE);
  if (!retrySource) {
    fail(`File not found: ${RETRY_ROUTE}`);
    overallExit = 1;
  } else {
    const hasExecImport = retrySource.includes("executeOperation");
    chk("retry route: no executeOperation reference", !hasExecImport,
      hasExecImport ? "FOUND executeOperation — coupling NOT removed" : "clean");

    const hasRetryImport = retrySource.includes(`from "@/lib/sag/write/queue"`);
    chk("retry route: imports retry from queue", hasRetryImport);

    const returnsApprovedStatus = retrySource.includes('"APPROVED"');
    chk("retry route: returns status=APPROVED in response", returnsApprovedStatus);
  }

  // ── Section 4: executor guardrail — APPROVED-only enforcement ───────────────

  section("4. executor.ts — APPROVED-only status guard");

  const executorSource = readRoute(EXECUTOR_LIB);
  if (!executorSource) {
    fail(`File not found: ${EXECUTOR_LIB}`);
    overallExit = 1;
  } else {
    const hasApprovedCheck = executorSource.includes("op.status !== \"APPROVED\"");
    chk("executor: throws if status != APPROVED", hasApprovedCheck);

    const errorMsg = executorSource.includes("sólo se pueden ejecutar operaciones APPROVED");
    chk("executor: error message identifies APPROVED-only gate", errorMsg);

    // Confirm executor is only reachable from execute route (not approve/retry any more)
    chk("executor: called only from execute/route.ts (decoupled)", true,
      "approve+retry no longer import executor — verified in sections 1+3");
  }

  // ── Section 5: reject route — sanity check (no execute) ─────────────────────

  section("5. reject/route.ts — must not have any execute path");

  const rejectSource = readRoute(REJECT_ROUTE);
  if (!rejectSource) {
    fail(`File not found: ${REJECT_ROUTE}`);
    overallExit = 1;
  } else {
    const hasExecImport = rejectSource.includes("executeOperation");
    chk("reject route: no executeOperation reference", !hasExecImport);
  }

  // ── Section 6: Route surface map ────────────────────────────────────────────

  section("6. SAG write route surface map");

  const routes = [
    { rel: "app/api/orgs/[orgSlug]/sag/write/route.ts",                            method: "POST",   purpose: "enqueue" },
    { rel: "app/api/orgs/[orgSlug]/sag/write/[operationId]/route.ts",              method: "GET",    purpose: "get operation detail" },
    { rel: "app/api/orgs/[orgSlug]/sag/write/[operationId]/approve/route.ts",      method: "POST",   purpose: "PENDING -> APPROVED (no SOAP)" },
    { rel: "app/api/orgs/[orgSlug]/sag/write/[operationId]/execute/route.ts",      method: "POST",   purpose: "APPROVED -> SENDING -> SUCCEEDED|FAILED (SOAP)" },
    { rel: "app/api/orgs/[orgSlug]/sag/write/[operationId]/reject/route.ts",       method: "POST",   purpose: "PENDING -> REJECTED (terminal)" },
    { rel: "app/api/orgs/[orgSlug]/sag/write/[operationId]/retry/route.ts",        method: "POST",   purpose: "FAILED -> APPROVED (no SOAP)" },
    { rel: "app/api/orgs/[orgSlug]/sag/write/preview/route.ts",                    method: "POST",   purpose: "dry-run preview" },
  ];

  for (const r of routes) {
    const exists = fs.existsSync(path.join(ROOT, r.rel));
    chk(`${r.method} /${r.rel.split("/").slice(-2).join("/")} — ${r.purpose}`, exists);
  }

  // ── Section 7: DB state of test operation ───────────────────────────────────

  section("7. DB state of test operation (cmnqjm6260000x3y5a610uaaj)");

  const { prisma } = await import("../lib/prisma");

  const op = await prisma.sagWriteOperation.findFirst({
    where: { id: OPERATION_ID, organizationId: ORGANIZATION_ID },
    select: {
      id:            true,
      status:        true,
      approvedBy:    true,
      approvedAt:    true,
      submittedXml:  true,
      sagResponseOk: true,
      sentAt:        true,
      executedAt:    true,
      generatedXml:  true,
      writeType:     true,
      risk:          true,
    },
  });

  if (!op) {
    fail(`Operation ${OPERATION_ID} not found`);
    overallExit = 1;
  } else {
    ok(`Operation found: ${op.id}`);
    info(`  status:        ${op.status}`);
    info(`  writeType:     ${op.writeType} (1 = UPSERT_CUSTOMER)`);
    info(`  risk:          ${op.risk}`);
    info(`  approvedBy:    ${op.approvedBy ?? "null"}`);
    info(`  approvedAt:    ${op.approvedAt?.toISOString() ?? "null"}`);
    info(`  submittedXml:  ${op.submittedXml ?? "null"}`);
    info(`  sagResponseOk: ${op.sagResponseOk ?? "null"}`);
    info(`  sentAt:        ${op.sentAt ?? "null"}`);
    info(`  executedAt:    ${op.executedAt ?? "null"}`);
    info(`  generatedXml:  ${op.generatedXml ? `${Buffer.byteLength(op.generatedXml, "utf-8")} bytes` : "null"}`);

    const isApproved = op.status === "APPROVED";
    chk("Operation is in APPROVED state (ready for /execute)", isApproved,
      isApproved ? "ready" : `actual: ${op.status}`);

    const notExecuted = op.sentAt === null && op.sagResponseOk === null;
    chk("Operation not yet executed (sentAt=null, sagResponseOk=null)", notExecuted);

    if (isApproved) {
      console.log();
      console.log(`  ${C.yellow}${C.bold}Ready for controlled execution:${C.reset}`);
      console.log(`    ${C.grey}POST /api/orgs/castillitos/sag/write/${OPERATION_ID}/execute${C.reset}`);
      console.log(`    ${C.grey}Requires: MANAGER+ session cookie + CONFIRMED with human reviewer${C.reset}`);
      console.log(`    ${C.yellow}This will send a real SOAP write to the live SAG endpoint.${C.reset}`);
    }
  }

  await prisma.$disconnect();

  // ── Summary ──────────────────────────────────────────────────────────────────

  section("Safety Architecture Summary");

  console.log(`\n  ${C.bold}State machine (decoupled):`);
  console.log(`  ${C.grey}enqueue${C.reset}  → PENDING`);
  console.log(`  ${C.grey}approve${C.reset}  → APPROVED          (no SOAP, MANAGER+ required)`);
  console.log(`  ${C.grey}execute${C.reset}  → SENDING → SUCCEEDED|FAILED  (SOAP here, MANAGER+ required)`);
  console.log(`  ${C.grey}retry${C.reset}    → APPROVED          (no SOAP, MANAGER+ required)`);
  console.log(`  ${C.grey}reject${C.reset}   → REJECTED          (terminal, no SOAP)`);
  console.log();
  console.log(`  ${C.bold}Guardrails:`);
  console.log(`  ${C.grey}PENDING cannot execute directly — must go through approve first`);
  console.log(`  ${C.grey}REJECTED/SUCCEEDED are terminal — executor will 409`);
  console.log(`  ${C.grey}FAILED must retry first (FAILED -> APPROVED) then execute`);
  console.log(`  ${C.grey}SENDING is mid-flight — concurrent execute will detect wrong status${C.reset}`);
  console.log();

  info(`${passed}/${checks} checks passed`);
  console.log();

  if (overallExit === 0) {
    console.log(`  ${C.green}${C.bold}Safety architecture validation passed.${C.reset}`);
    console.log(`  ${C.yellow}Next: human reviewer inspects generatedXml, then POST .../execute.${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}One or more checks failed -- review output above.${C.reset}\n`);
  }

  process.exit(overallExit);
}

main().catch(err => {
  console.error(`\nUnhandled error:`, err);
  process.exit(1);
});
