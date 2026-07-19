/**
 * scripts/sag-test-enqueue.ts
 *
 * Phase 5b — Safe enqueue validation (QUEUE-ONLY, NO APPROVAL, NO EXECUTION).
 *
 * SAFETY CONTRACT:
 *   ✓ Creates ONE SagWriteOperation row with status=PENDING
 *   ✗ NO approval   (status stays PENDING)
 *   ✗ NO execution  (no insertionSag SOAP call)
 *   ✗ NO SAG write  (nothing reaches the live SAG system)
 *   ✗ NO approve()  (that transition is never called here)
 *
 * This script validates the full enqueue path end-to-end:
 *
 *   Step 1 — Env & DB probe
 *     Confirm DATABASE_URL, Castillitos org exists + ACTIVE.
 *     Confirm SagWriteOperation table is migrated.
 *
 *   Step 2 — Enqueue (real DB write)
 *     Call queue.enqueue() directly — same code path as the API route.
 *     Payload: Preview B customer (NIT=860007379, ka_nl_tercero=106).
 *
 *   Step 3 — DB row verification
 *     Fetch the created row. Check every field against expected values.
 *
 *   Step 4 — XML verification
 *     Compare stored generatedXml to the expected Preview B XML.
 *     Byte-exact match required.
 *
 *   Step 5 — Queue state inspection
 *     List PENDING operations for Castillitos. Confirm pendingCount incremented.
 *
 *   Step 6 — Save artifact
 *     Write the full DB row (minus sensitive fields) to scripts/samples/.
 *
 * Usage:
 *   npx tsx scripts/sag-test-enqueue.ts
 *   npx tsx scripts/sag-test-enqueue.ts --skip-save
 *   npx tsx scripts/sag-test-enqueue.ts --dry-run   (no DB write — just prints payload)
 *
 * CAUTION: Without --dry-run this script DOES write to the Neon database (one row).
 * The row remains in PENDING status and can be inspected or deleted manually.
 */

import * as dotenv from "dotenv";
import * as path   from "path";
import * as fs     from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import type { SagCustomerInput, SagWriteInput } from "../lib/sag/write/types";
import { validateSagWriteInput }                from "../lib/sag/write/validators/index";
import { buildCustomerXml }                     from "../lib/sag/write/xml-builders/customer";
import { validateCustomerMasterData }            from "../lib/sag/master-validation";

// ── CLI flags ─────────────────────────────────────────────────────────────────

const SKIP_SAVE = process.argv.includes("--skip-save");
const DRY_RUN   = process.argv.includes("--dry-run");

// ── Colour helpers ─────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
};

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

// ── Artifact saver ────────────────────────────────────────────────────────────

function saveArtifact(name: string, data: unknown): void {
  if (SKIP_SAVE) { info(`(--skip-save) skipping ${name}.json`); return; }
  const dir = path.resolve(__dirname, "samples");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2), "utf-8");
  ok(`Artifact saved → scripts/samples/${name}.json`);
}

// ── Payload (Preview B — real Castillitos row ka_nl_tercero=106) ──────────────

const CASTILLITOS_ORG_ID   = "cmmpwstuf000dp5y58kj1daaj";
const INITIATED_BY_SYSTEM  = "sag-test-enqueue-script"; // not a real user — audit-visible

const CUSTOMER_PAYLOAD: SagCustomerInput = {
  NIT:                 "860007379",
  NOMBRE:              "CAJA DE AUXILIOS Y PRESTACIONES DE LA ASOCIACION COLOMBIANA",
  TIPO_DOC:            "NIT",
  DIGITO_VERIFICACION: "8",
  NATURALEZA:          "J",
  DIRECCION:           "CL 99  10 19 OF 402",
  CODIGO_DANE_CIUDAD:  "11001",
  CIUDAD:              "BOGOTA",
  TELEFONO:            "6180287",
  TIPO_TERCERO:        "O",
  ZONA:                "1",
  RETENEDOR:           "N",
  IVA:                 "S",
  ACTIVO:              "S",
  ACTIVO_FIJO:         "N",
};

const WRITE_INPUT: SagWriteInput = { type: 1, payload: CUSTOMER_PAYLOAD };

// Expected XML from Preview B (495 bytes — byte-exact match required)
const EXPECTED_XML =
  "<CLIENTES><CLIENTE>" +
  "<NIT>860007379</NIT>" +
  "<NOMBRE>CAJA DE AUXILIOS Y PRESTACIONES DE LA ASOCIACION COLOMBIANA</NOMBRE>" +
  "<TIPO_DOC>NIT</TIPO_DOC>" +
  "<DIGITO_VERIFICACION>8</DIGITO_VERIFICACION>" +
  "<NATURALEZA>J</NATURALEZA>" +
  "<DIRECCION>CL 99  10 19 OF 402</DIRECCION>" +
  "<CODIGO_DANE_CIUDAD>11001</CODIGO_DANE_CIUDAD>" +
  "<CIUDAD>BOGOTA</CIUDAD>" +
  "<TELEFONO>6180287</TELEFONO>" +
  "<TIPO_TERCERO>O</TIPO_TERCERO>" +
  "<ZONA>1</ZONA>" +
  "<RETENEDOR>N</RETENEDOR>" +
  "<IVA>S</IVA>" +
  "<ACTIVO>S</ACTIVO>" +
  "<ACTIVO_FIJO>N</ACTIVO_FIJO>" +
  "</CLIENTE></CLIENTES>";

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let exitCode = 0;

  console.log(`\n${C.bold}SAG Enqueue Test${C.reset} — Castillitos Phase 5b`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  if (DRY_RUN) {
    console.log(`  ${C.yellow}${C.bold}--dry-run: NO DB write will be made${C.reset}`);
  } else {
    console.log(`  ${C.yellow}${C.bold}QUEUE-ONLY: enqueue creates 1 PENDING row. No approve. No execute.${C.reset}`);
  }

  // ── Step 1: Pre-flight validation (pure, no DB) ───────────────────────────

  section("Step 1 — Pre-flight: schema + master-data validation");

  const schemaResult = validateSagWriteInput(WRITE_INPUT);
  if (schemaResult.valid) {
    ok("Schema validation: PASSED");
  } else {
    fail(`Schema validation: FAILED — ${schemaResult.errors.map(e => e.field).join(", ")}`);
    for (const e of schemaResult.errors) {
      console.log(`      ${C.red}→ [${e.field}] ${e.message}${C.reset}`);
    }
    exitCode = 1;
  }

  const masterResult = validateCustomerMasterData(CUSTOMER_PAYLOAD);
  if (masterResult.safe) {
    ok("Master-data validation: SAFE");
  } else {
    fail(`Master-data validation: BLOCKED — ${masterResult.errors.map(e => e.field).join(", ")}`);
    for (const e of masterResult.errors) {
      console.log(`      ${C.red}→ [${e.field}] ${e.message}${C.reset}`);
    }
    exitCode = 1;
  }
  for (const w of masterResult.warnings) {
    warn(`Advisory: [${w.field}] ${w.message}`);
  }

  // XML pre-check (pure, no DB)
  const previewXml = buildCustomerXml(CUSTOMER_PAYLOAD);
  if (previewXml === EXPECTED_XML) {
    ok(`XML pre-check: matches expected (${Buffer.byteLength(previewXml, "utf-8")} bytes)`);
  } else {
    fail(`XML pre-check: MISMATCH — expected ${Buffer.byteLength(EXPECTED_XML, "utf-8")} bytes, got ${Buffer.byteLength(previewXml, "utf-8")} bytes`);
    exitCode = 1;
  }

  if (exitCode !== 0) {
    fail("Pre-flight failed — aborting before DB write");
    process.exit(exitCode);
  }

  if (DRY_RUN) {
    info("--dry-run: stopping before DB write");
    info(`Payload: ${JSON.stringify(CUSTOMER_PAYLOAD)}`);
    info(`XML: ${previewXml}`);
    console.log(`\n  ${C.green}${C.bold}Dry-run complete — no DB write.${C.reset}\n`);
    process.exit(0);
  }

  // ── Step 2: DB probe ──────────────────────────────────────────────────────

  section("Step 2 — DB probe: org + table presence");

  const { prisma } = await import("../lib/prisma");

  try {
    const [tableRows, org] = await Promise.all([
      prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_name = 'SagWriteOperation'
          AND table_schema = 'public'
      `,
      prisma.organization.findFirst({
        where:  { slug: "castillitos" },
        select: { id: true, name: true, status: true },
      }),
    ]);

    const tableExists = Number(tableRows[0]?.cnt ?? 0) > 0;
    if (tableExists) {
      ok("SagWriteOperation table: exists in Neon DB");
    } else {
      fail("SagWriteOperation table: NOT FOUND — run prisma migrate deploy");
      await prisma.$disconnect();
      process.exit(1);
    }

    if (!org) {
      fail(`Organization 'castillitos' not found in DB`);
      await prisma.$disconnect();
      process.exit(1);
    }

    if (org.status !== "ACTIVE") {
      warn(`Organization status is '${org.status}' — expected ACTIVE`);
    } else {
      ok(`Organization: ${org.name} (${org.id}) — status=${org.status}`);
    }

    // Confirm org ID matches our constant
    if (org.id !== CASTILLITOS_ORG_ID) {
      warn(`Org ID changed: expected ${CASTILLITOS_ORG_ID}, got ${org.id}`);
      warn(`Using actual org.id = ${org.id} for enqueue`);
    } else {
      ok(`Org ID confirmed: ${org.id}`);
    }

    // ── Step 3: Enqueue ───────────────────────────────────────────────────────

    section("Step 3 — Enqueue: creating PENDING operation");

    // pendingCount before
    const pendingBefore = await prisma.sagWriteOperation.count({
      where: { organizationId: org.id, status: "PENDING" },
    });
    info(`Pending count before enqueue: ${pendingBefore}`);

    // Import and call enqueue
    const { enqueue } = await import("../lib/sag/write/queue");

    const result = await enqueue(
      org.id,
      INITIATED_BY_SYSTEM,
      WRITE_INPUT,
      {
        description: "[TEST] Castillitos customer upsert preview — PENDING, do not approve",
        sourceRef:   "terceros:ka_nl_tercero=106",
      },
    );

    if (!result.ok) {
      fail(`enqueue() returned ok=false: ${result.error ?? "unknown"}`);
      if (result.validation) {
        for (const e of result.validation.errors) {
          console.log(`      ${C.red}→ [${e.field}] ${e.message}${C.reset}`);
        }
      }
      await prisma.$disconnect();
      process.exit(1);
    }

    ok(`enqueue() succeeded — operationId: ${result.operationId}`);

    // ── Step 4: DB row verification ───────────────────────────────────────────

    section("Step 4 — DB row verification");

    const op = await prisma.sagWriteOperation.findFirst({
      where: { id: result.operationId!, organizationId: org.id },
    });

    if (!op) {
      fail("Row not found in DB after enqueue — unexpected");
      await prisma.$disconnect();
      process.exit(1);
    }

    // Field-by-field checks
    const checks: Array<{ label: string; got: unknown; expected: unknown; required: boolean }> = [
      { label: "status",         got: op.status,         expected: "PENDING",          required: true },
      { label: "writeType",      got: op.writeType,       expected: 1,                  required: true },
      { label: "risk",           got: op.risk,            expected: "LOW",              required: true },
      { label: "organizationId", got: op.organizationId,  expected: org.id,             required: true },
      { label: "initiatedBy",    got: op.initiatedBy,     expected: INITIATED_BY_SYSTEM, required: true },
      { label: "retryCount",     got: op.retryCount,      expected: 0,                  required: true },
      { label: "approvedBy",     got: op.approvedBy,      expected: null,               required: true },
      { label: "sentAt",         got: op.sentAt,          expected: null,               required: true },
      { label: "sagResponseOk",  got: op.sagResponseOk,   expected: null,               required: true },
      { label: "submittedXml",   got: op.submittedXml,    expected: null,               required: true },
    ];

    let rowOk = true;
    for (const c of checks) {
      if (c.got === c.expected || (c.expected === null && c.got == null)) {
        ok(`${c.label}: ${JSON.stringify(c.got)}`);
      } else {
        fail(`${c.label}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.got)}`);
        if (c.required) rowOk = false;
      }
    }

    // initiatedAt within last 60 s
    const ageSec = (Date.now() - new Date(op.initiatedAt).getTime()) / 1000;
    if (ageSec < 60) {
      ok(`initiatedAt: ${op.initiatedAt.toISOString()} (${ageSec.toFixed(1)}s ago)`);
    } else {
      warn(`initiatedAt: ${ageSec.toFixed(0)}s ago — unexpectedly old`);
    }

    if (!rowOk) exitCode = 1;

    // ── Step 5: XML verification ──────────────────────────────────────────────

    section("Step 5 — XML verification: stored generatedXml vs expected Preview B");

    const storedXml = op.generatedXml;
    info(`Expected: ${Buffer.byteLength(EXPECTED_XML, "utf-8")} bytes`);
    info(`Stored:   ${Buffer.byteLength(storedXml,   "utf-8")} bytes`);

    if (storedXml === EXPECTED_XML) {
      ok("generatedXml: byte-exact match with Preview B ✓");
    } else {
      fail("generatedXml: MISMATCH with Preview B");
      info(`Expected: ${EXPECTED_XML}`);
      info(`Stored:   ${storedXml}`);
      exitCode = 1;
    }

    // ── Step 6: Queue state ───────────────────────────────────────────────────

    section("Step 6 — Queue state inspection");

    const pendingAfter = await prisma.sagWriteOperation.count({
      where: { organizationId: org.id, status: "PENDING" },
    });

    if (pendingAfter === pendingBefore + 1) {
      ok(`pendingCount: ${pendingBefore} → ${pendingAfter} (+1 as expected)`);
    } else {
      warn(`pendingCount: ${pendingBefore} → ${pendingAfter} (expected +1)`);
    }

    // List recent ops
    const recentOps = await prisma.sagWriteOperation.findMany({
      where:   { organizationId: org.id },
      orderBy: { initiatedAt: "desc" },
      take:    5,
      select:  { id: true, writeType: true, status: true, risk: true, description: true, initiatedAt: true },
    });

    info("Recent operations (latest 5):");
    for (const r of recentOps) {
      const isNew = r.id === result.operationId;
      const marker = isNew ? ` ${C.green}← NEW${C.reset}` : "";
      console.log(`    ${C.grey}${r.id}${C.reset}  type=${r.writeType}  status=${r.status}  risk=${r.risk}${marker}`);
    }

    // Confirm the new op is NOT in APPROVED/SENDING/SUCCEEDED (must stay PENDING)
    const newOp = recentOps.find(r => r.id === result.operationId);
    if (newOp?.status === "PENDING") {
      ok("New operation is in PENDING — not yet approved or executed ✓");
    } else {
      fail(`New operation has unexpected status: ${newOp?.status}`);
      exitCode = 1;
    }

    // ── Step 7: Save artifact ─────────────────────────────────────────────────

    section("Step 7 — Save artifact");

    const artifact = {
      capturedAt:   new Date().toISOString(),
      mode:         "ENQUEUE-ONLY — status=PENDING — not approved — not executed",
      operationId:  result.operationId,
      organizationId: org.id,
      writeType:    op.writeType,
      writeTypeLabel: "UPSERT_CUSTOMER (tipo 1) — LOW risk — idempotent",
      status:       op.status,
      risk:         op.risk,
      description:  op.description,
      sourceRef:    op.sourceRef,
      initiatedBy:  op.initiatedBy,
      initiatedAt:  op.initiatedAt.toISOString(),
      retryCount:   op.retryCount,
      approvedBy:   op.approvedBy,
      sentAt:       op.sentAt,
      generatedXml: op.generatedXml,
      xmlMatchesPreviewB: storedXml === EXPECTED_XML,
      pendingCountBefore: pendingBefore,
      pendingCountAfter:  pendingAfter,
      inputJson:    op.inputJson,
    };

    saveArtifact("enqueue-result", artifact);

    // ── Summary ────────────────────────────────────────────────────────────────

    section("Summary");

    console.log(`  ${C.green}✓${C.reset} Pre-flight:     schema valid, master-data safe, XML matches`);
    console.log(`  ${C.green}✓${C.reset} DB probe:       table exists, org ACTIVE`);
    console.log(`  ${C.green}✓${C.reset} Enqueue:        operationId = ${result.operationId}`);
    console.log(`  ${rowOk ? C.green + "✓" : C.red + "✗"}${C.reset} Row fields:     ${rowOk ? "all correct" : "MISMATCH — see above"}`);
    console.log(`  ${storedXml === EXPECTED_XML ? C.green + "✓" : C.red + "✗"}${C.reset} XML stored:    ${storedXml === EXPECTED_XML ? "byte-exact match" : "MISMATCH"}`);
    console.log(`  ${C.green}✓${C.reset} Queue state:   PENDING (not approved, not executed)`);
    console.log();

    if (exitCode === 0) {
      ok("Phase 5b enqueue validation complete");
      console.log(`\n  ${C.green}${C.bold}Enqueue passed end-to-end.${C.reset}`);
      console.log(`  ${C.yellow}Operation ${result.operationId} is in PENDING — inspect or delete in DB.${C.reset}`);
      console.log(`  ${C.yellow}Next: approval-gating sprint (POST .../approve — MANAGER+ only).${C.reset}\n`);
    } else {
      fail("One or more checks failed — see above");
      console.log(`\n  ${C.red}${C.bold}Fix failures before proceeding to approval-gating.${C.reset}\n`);
    }

  } finally {
    await prisma.$disconnect();
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
