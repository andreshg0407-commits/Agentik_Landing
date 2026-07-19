/**
 * scripts/sag-test-write-preview.ts
 *
 * Phase 5 — Safe write-preview (DRY-RUN ONLY).
 *
 * SAFETY CONTRACT:
 *   ✗ NO database reads or writes (no Prisma)
 *   ✗ NO SOAP calls (no insercionSag, no consultaSagJson)
 *   ✗ NO approval or execution
 *   ✗ NO mutation of live SAG records
 *   ✓ Pure function calls only: validate → XML-build → master-check → save artifact
 *
 * This script tests the full write-preview pipeline in isolation:
 *
 *   Preview A — "minimal" customer (NIT + NOMBRE only):
 *     Validates baseline: required fields, NIT format, XML generation.
 *
 *   Preview B — "full" customer (real Castillitos TERCEROS row ka_nl_tercero=106):
 *     Uses live data from scripts/samples/terceros-top20.json.
 *     Tests: schema validation, master-data checks (ZONA, TIPO_TERCERO, etc.), XML.
 *
 *   Preview C — "bad" customer (intentional failures):
 *     NIT with wrong format, unknown ZONA, unknown TIPO_TERCERO.
 *     Tests that validation correctly blocks bad payloads.
 *
 * Artifacts saved to scripts/samples/:
 *   write-preview-minimal.json
 *   write-preview-full.json
 *   write-preview-bad.json
 *
 * Usage:
 *   npx tsx scripts/sag-test-write-preview.ts
 *   npx tsx scripts/sag-test-write-preview.ts --skip-save
 */

import * as path from "path";
import * as fs   from "fs";

// Pure write-layer imports — no network, no DB
import type { SagCustomerInput, SagWriteInput } from "../lib/sag/write/types";
import { validateSagWriteInput }                from "../lib/sag/write/validators/index";
import { buildCustomerXml }                     from "../lib/sag/write/xml-builders/customer";
import {
  validateCustomerMasterData,
  renderMasterValidationResult,
  type MasterValidationResult,
}                                               from "../lib/sag/master-validation";

// ── CLI flags ─────────────────────────────────────────────────────────────────

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
  blue:   "\x1b[34m",
};

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

// ── Artifact saver ────────────────────────────────────────────────────────────

interface PreviewArtifact {
  capturedAt:         string;
  mode:               "DRY-RUN — NO SAG WRITE — NO DB WRITE";
  previewId:          string;
  writeType:          number;
  writeTypeLabel:     string;
  input:              SagCustomerInput;
  schemaValidation:   { valid: boolean; errors: Array<{ field: string; message: string }> };
  masterValidation:   { safe: boolean; errors: unknown[]; warnings: unknown[] };
  generatedXml:       string | null;
  xmlByteLength:      number | null;
  readyToEnqueue:     boolean;
  blockers:           string[];
  advisories:         string[];
}

function saveArtifact(name: string, artifact: PreviewArtifact): void {
  if (SKIP_SAVE) {
    info(`(--skip-save) skipping ${name}.json`);
    return;
  }
  const samplesDir = path.resolve(__dirname, "samples");
  if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });
  const filePath = path.join(samplesDir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), "utf-8");
  ok(`Artifact saved → scripts/samples/${name}.json`);
}

// ── Preview runner ────────────────────────────────────────────────────────────

function runPreview(
  previewId: string,
  label:     string,
  input:     SagCustomerInput,
): PreviewArtifact {
  const writeInput: SagWriteInput = { type: 1, payload: input };

  // 1. Schema validation (field types, required fields, NIT format)
  const schemaResult = validateSagWriteInput(writeInput);

  // 2. Master-data validation (value sets, homologation layer)
  const masterResult: MasterValidationResult = validateCustomerMasterData(input);

  // 3. XML generation — only when schema is valid
  let generatedXml: string | null = null;
  let xmlByteLength: number | null = null;
  if (schemaResult.valid) {
    generatedXml  = buildCustomerXml(input);
    xmlByteLength = Buffer.byteLength(generatedXml, "utf-8");
  }

  // Aggregate blockers and advisories
  const blockers: string[] = [];
  const advisories: string[] = [];

  if (!schemaResult.valid) {
    for (const e of schemaResult.errors) {
      blockers.push(`[SCHEMA] ${e.field}: ${e.message}`);
    }
  }
  if (!masterResult.safe) {
    for (const e of masterResult.errors) {
      blockers.push(`[MASTER] ${e.field}: ${e.message}`);
    }
  }
  for (const w of masterResult.warnings) {
    advisories.push(`[WARN] ${w.field}: ${w.message}`);
  }

  const readyToEnqueue = schemaResult.valid && masterResult.safe;

  return {
    capturedAt:       new Date().toISOString(),
    mode:             "DRY-RUN — NO SAG WRITE — NO DB WRITE",
    previewId,
    writeType:        1,
    writeTypeLabel:   "UPSERT_CUSTOMER (tipo 1) — LOW risk — idempotent",
    input,
    schemaValidation: schemaResult,
    masterValidation: {
      safe:     masterResult.safe,
      errors:   masterResult.errors,
      warnings: masterResult.warnings,
    },
    generatedXml,
    xmlByteLength,
    readyToEnqueue,
    blockers,
    advisories,
  };
}

function printPreviewResult(label: string, artifact: PreviewArtifact): void {
  console.log(`\n  ${C.bold}${C.blue}${label}${C.reset}`);

  // Schema
  if (artifact.schemaValidation.valid) {
    ok(`Schema validation: PASSED`);
  } else {
    fail(`Schema validation: FAILED (${artifact.schemaValidation.errors.length} error(s))`);
    for (const e of artifact.schemaValidation.errors) {
      console.log(`      ${C.red}→ [${e.field}] ${e.message}${C.reset}`);
    }
  }

  // Master-data
  if (artifact.masterValidation.safe) {
    ok(`Master-data validation: SAFE`);
  } else {
    fail(`Master-data validation: BLOCKED (${artifact.masterValidation.errors.length} error(s))`);
    for (const e of artifact.masterValidation.errors as Array<{ field: string; message: string }>) {
      console.log(`      ${C.red}→ [${e.field}] ${e.message}${C.reset}`);
    }
  }

  // Warnings
  if (artifact.masterValidation.warnings.length > 0) {
    warn(`Master-data advisories: ${artifact.masterValidation.warnings.length} warning(s)`);
    for (const w of artifact.masterValidation.warnings as Array<{ field: string; message: string }>) {
      console.log(`      ${C.yellow}→ [${w.field}] ${w.message}${C.reset}`);
    }
  } else {
    ok(`No master-data warnings`);
  }

  // XML
  if (artifact.generatedXml) {
    ok(`XML generated: ${artifact.xmlByteLength} bytes`);
    console.log(`\n      ${C.grey}${artifact.generatedXml}${C.reset}\n`);
  } else {
    fail(`XML NOT generated (schema validation failed — correct errors first)`);
  }

  // Summary
  if (artifact.readyToEnqueue) {
    console.log(`\n  ${C.green}${C.bold}→ READY TO ENQUEUE${C.reset} (after human review and approval)`);
  } else {
    console.log(`\n  ${C.red}${C.bold}→ NOT READY — ${artifact.blockers.length} blocker(s)${C.reset}`);
  }
}

// ── Preview definitions ───────────────────────────────────────────────────────

/**
 * Preview A — Minimal customer (NIT + NOMBRE only).
 * Purpose: baseline test for required-field validation and XML generation.
 */
const PREVIEW_A_MINIMAL: SagCustomerInput = {
  NIT:        "860007379",   // Real NIT from TERCEROS ka_nl_tercero=106
  NOMBRE:     "CAJA DE AUXILIOS Y PRESTACIONES DE LA ASOCIACION COLOMBIANA",
};

/**
 * Preview B — Full customer (real Castillitos TERCEROS row ka_nl_tercero=106).
 * Source: scripts/samples/terceros-top20.json
 * Confirmed fields: n_nit=860007379, sc_nombre, sc_naturaleza=J, sc_tipo_tercero=O,
 *   sc_digito=8, sc_telefono_ppal=6180287, sc_direccion="CL 99  10 19 OF 402",
 *   ss_zip_code=11001 (→ DANE code for Bogotá matches 11001).
 *
 * Fields NOT included (require joins):
 *   - ZONA: no ka_ni_zona on this TERCEROS row (null)
 *   - CODIGO_DANE_CIUDAD: inferred from ss_zip_code=11001 (Bogotá DANE)
 */
const PREVIEW_B_FULL: SagCustomerInput = {
  // Required
  NIT:                  "860007379",
  NOMBRE:               "CAJA DE AUXILIOS Y PRESTACIONES DE LA ASOCIACION COLOMBIANA",

  // Identity (from SAG row)
  TIPO_DOC:             "NIT",
  DIGITO_VERIFICACION:  "8",
  NATURALEZA:           "J",

  // Contact
  DIRECCION:            "CL 99  10 19 OF 402",
  CODIGO_DANE_CIUDAD:   "11001",   // Bogotá (matches ss_zip_code)
  CIUDAD:               "BOGOTA",
  TELEFONO:             "6180287",

  // Commercial — use confirmed master-data values
  TIPO_TERCERO:         "O",   // confirmed in CASTILLITOS_TIPOS_TERCERO
  ZONA:                 "1",   // confirmed in CASTILLITOS_ZONAS

  // Status
  ACTIVO:               "S",
  ACTIVO_FIJO:          "N",

  // Tax defaults (safe for juridical entities)
  RETENEDOR:            "N",
  IVA:                  "S",
};

/**
 * Preview C — Intentional failures (bad customer).
 * Purpose: confirm that validation correctly BLOCKS bad payloads before enqueue.
 * Expected: schema errors (NIT format), master-data errors (unknown ZONA, TIPO_TERCERO).
 */
const PREVIEW_C_BAD: SagCustomerInput = {
  NIT:          "900.123.456-7",   // WRONG: contains dots and DV — must fail NIT check
  NOMBRE:       "CLIENTE INVALIDO TEST",

  ZONA:         "ZONA_INEXISTENTE_99",   // WRONG: not in CASTILLITOS_ZONAS (confirmed)
  TIPO_TERCERO: "X",                     // WRONG: not in CASTILLITOS_TIPOS_TERCERO (confirmed)
  NATURALEZA:   "Z" as "J" | "N",       // WRONG: not J or N
  EMAIL:        "not-an-email",          // WRONG: invalid email format
  DIGITO_VERIFICACION: "ab",             // WRONG: not a single digit
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG Write Preview${C.reset} — Castillitos (DRY-RUN ONLY)`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  console.log(`  ${C.yellow}${C.bold}SAFETY: No DB writes. No SOAP calls. No approvals.${C.reset}`);

  let overallExit = 0;

  // ── Preview A: Minimal ─────────────────────────────────────────────────────

  section("Preview A — Minimal customer (NIT + NOMBRE)");

  const artifactA = runPreview("preview-a-minimal", "Minimal", PREVIEW_A_MINIMAL);
  printPreviewResult("Preview A: Minimal (NIT + NOMBRE only)", artifactA);
  saveArtifact("write-preview-minimal", artifactA);

  if (!artifactA.readyToEnqueue) overallExit = 1;

  // ── Preview B: Full (real Castillitos row) ─────────────────────────────────

  section("Preview B — Full customer (TERCEROS ka_nl_tercero=106, real live data)");

  const artifactB = runPreview("preview-b-full", "Full", PREVIEW_B_FULL);
  printPreviewResult("Preview B: Full (real row + confirmed master values)", artifactB);
  saveArtifact("write-preview-full", artifactB);

  if (!artifactB.readyToEnqueue) overallExit = 1;

  // ── Preview C: Bad payload (should fail) ───────────────────────────────────

  section("Preview C — Bad payload (intentional failures — expected to BLOCK)");

  const artifactC = runPreview("preview-c-bad", "Bad", PREVIEW_C_BAD);
  printPreviewResult("Preview C: Bad payload (must fail — NIT format, unknown values)", artifactC);
  saveArtifact("write-preview-bad", artifactC);

  // Preview C must FAIL for the test to pass — if it passes, validation is broken
  const cCorrectlyBlocked = !artifactC.readyToEnqueue && artifactC.blockers.length > 0;
  if (cCorrectlyBlocked) {
    ok(`Preview C correctly BLOCKED — ${artifactC.blockers.length} blocker(s) surfaced`);
  } else {
    fail(`Preview C should have been blocked but was NOT — validation logic may be broken`);
    overallExit = 1;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  section("Phase 5 Write-Preview Summary");

  const rows = [
    { id: "A (minimal)", ready: artifactA.readyToEnqueue, blockers: artifactA.blockers.length, warns: artifactA.advisories.length },
    { id: "B (full)",    ready: artifactB.readyToEnqueue, blockers: artifactB.blockers.length, warns: artifactB.advisories.length },
    { id: "C (bad)",     ready: !artifactC.readyToEnqueue, blockers: artifactC.blockers.length, warns: artifactC.advisories.length,
      note: "expected: blocked" },
  ];

  for (const r of rows) {
    const icon = r.ready ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    const note = (r as { note?: string }).note ?? (r.warns > 0 ? `${r.warns} warning(s)` : "clean");
    console.log(`  ${icon} Preview ${r.id.padEnd(14)} blockers=${r.blockers}  advisories=${r.warns}  ${C.grey}${note}${C.reset}`);
  }

  console.log();

  if (overallExit === 0) {
    ok("Phase 5 write-preview complete");
    if (!SKIP_SAVE) info("Artifacts saved to scripts/samples/");
    console.log(`\n  ${C.green}${C.bold}Write-preview passed.${C.reset}`);
    console.log(`  ${C.yellow}Next step: human review of artifacts, then proceed to enqueue + approval testing.${C.reset}\n`);
  } else {
    fail("One or more previews had unexpected results");
    console.log(`\n  ${C.red}${C.bold}Review failures above before proceeding to Phase 5 approval.${C.reset}\n`);
  }

  process.exit(overallExit);
}

main().catch(err => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
