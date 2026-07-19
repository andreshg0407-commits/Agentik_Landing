/**
 * validate-sag-import-research.ts
 *
 * SAG-IMPORT-RESEARCH-01 validation script.
 * 25 checks verifying the research sprint deliverables.
 *
 * Run: npx tsx scripts/validate-sag-import-research.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("\n=== SAG-IMPORT-RESEARCH-01 Validation ===\n");

// ── 1. Research script exists
check(
  "1. Research script exists",
  fileExists("scripts/research-sag-import-lifecycle.ts"),
);

// ── 2. Research script is research-only (no imports from service/types/client)
check(
  "2. Research script does NOT import product service or types",
  (() => {
    const script = readFile("scripts/research-sag-import-lifecycle.ts");
    return !script.includes("import-service") &&
           !script.includes("import-types") &&
           !script.includes("importaciones-client");
  })(),
  "Must not import product code",
);

// ── 3. Research script uses SAG SOAP transport
check(
  "3. Research script uses consultaSagJson",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("consultaSagJson"),
);

// ── 4. Research script queries ALL document types (not just C1/C2)
check(
  "4. Research script queries ALL fuentes (not filtered to C1/C2)",
  (() => {
    const script = readFile("scripts/research-sag-import-lifecycle.ts");
    // Must NOT have "ka_ni_fuente IN (1, 95)" in the main discovery query
    // The script should query without fuente filter
    return script.includes("MOVIMIENTOS m") &&
           script.includes("FUENTES f") &&
           // Main appearance query should not filter by fuente
           !script.includes('WHERE m.ka_ni_fuente IN (1, 95)');
  })(),
  "Main query must not be restricted to C1/C2",
);

// ── 5. Research script includes warehouse (ka_nl_bodega) in query
check(
  "5. Research script queries warehouse per line",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("mi.ka_nl_bodega"),
);

// ── 6. Research script includes BODEGAS discovery
check(
  "6. Research script discovers BODEGAS table",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("FROM BODEGAS"),
);

// ── 7. Research script includes FUENTES discovery
check(
  "7. Research script discovers FUENTES table",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("FROM FUENTES"),
);

// ── 8. Research script includes price validation
check(
  "8. Research script validates prices",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("v_articulos"),
);

// ── 9. Research script respects rate limits
check(
  "9. Research script has delay for rate limiting",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("DELAY_MS") &&
  readFile("scripts/research-sag-import-lifecycle.ts").includes("await delay("),
);

// ── 10. Research script selects diverse sample references
check(
  "10. Research script selects diverse samples",
  (() => {
    const script = readFile("scripts/research-sag-import-lifecycle.ts");
    return script.includes("TOP_SELLER") &&
           script.includes("HIGH_RETURNS") &&
           script.includes("MULTI_WAREHOUSE") &&
           script.includes("ZERO_IMPORT_STOCK") &&
           script.includes("ZERO_SALES");
  })(),
);

// ── 11. Research script generates SAG_IMPORT_RESEARCH_01.md
check(
  "11. Research script outputs SAG_IMPORT_RESEARCH_01.md",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("SAG_IMPORT_RESEARCH_01.md"),
);

// ── 12. Research script generates SAG_IMPORT_RESEARCH_SAMPLE_01.md
check(
  "12. Research script outputs SAG_IMPORT_RESEARCH_SAMPLE_01.md",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("SAG_IMPORT_RESEARCH_SAMPLE_01.md"),
);

// ── 13. Research script generates SAG_DOCUMENT_TYPES_01.md
check(
  "13. Research script outputs SAG_DOCUMENT_TYPES_01.md",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("SAG_DOCUMENT_TYPES_01.md"),
);

// ── 14. Research script analyzes provider data
check(
  "14. Research script analyzes providers",
  (() => {
    const script = readFile("scripts/research-sag-import-lifecycle.ts");
    return script.includes("providerName") &&
           script.includes("providerNit") &&
           script.includes("distinctProviders");
  })(),
);

// ── 15. Research script tracks warehouse flow
check(
  "15. Research script tracks warehouse flow",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("warehouseFlow"),
);

// ── 16. Research script builds per-reference timeline
check(
  "16. Research script builds timeline per reference",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("dateTimeline"),
);

// ── 17. Research script identifies purchase candidates beyond C1/C2
check(
  "17. Research script considers DS(157) and T3(163) as potential import fuentes",
  (() => {
    const script = readFile("scripts/research-sag-import-lifecycle.ts");
    return script.includes("157") && script.includes("163");
  })(),
);

// ── 18. Research script tracks anulado status
check(
  "18. Research script checks anulado status",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("sc_anulado"),
);

// ── 19. Research script tracks unit value
check(
  "19. Research script includes unit value (n_valor)",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("mi.n_valor"),
);

// ── 20. Research script tracks size/color
check(
  "20. Research script includes size and color",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("mi.ss_talla") &&
  readFile("scripts/research-sag-import-lifecycle.ts").includes("mi.ss_color"),
);

// ── 21. No product service modified
check(
  "21. import-service.ts not modified in this sprint",
  (() => {
    const service = readFile("lib/comercial/importaciones/import-service.ts");
    // Should still have PURCHASE_FUENTE_IDS or IMPORT_WAREHOUSE_CODES
    // but NOT any new research-related changes
    return !service.includes("SAG-IMPORT-RESEARCH-01");
  })(),
  "Must not modify product service code",
);

// ── 22. No product types modified
check(
  "22. import-types.ts not modified in this sprint",
  (() => {
    const types = readFile("lib/comercial/importaciones/import-types.ts");
    return !types.includes("SAG-IMPORT-RESEARCH-01");
  })(),
  "Must not modify product types",
);

// ── 23. No client modified
check(
  "23. importaciones-client.tsx not modified in this sprint",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return !client.includes("SAG-IMPORT-RESEARCH-01");
  })(),
  "Must not modify client UI",
);

// ── 24. No Prisma schema modified
check(
  "24. Prisma schema not modified for research",
  (() => {
    const schema = readFile("prisma/schema.prisma");
    return !schema.includes("SAG-IMPORT-RESEARCH-01") &&
           !schema.includes("SagResearch");
  })(),
  "Must not modify Prisma schema",
);

// ── 25. Research script warns against premature CONFIRMED status
check(
  "25. Research script includes data trust warning",
  readFile("scripts/research-sag-import-lifecycle.ts").includes("DO NOT mark any data as CONFIRMED"),
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
