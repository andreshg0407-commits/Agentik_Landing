/**
 * validate-compras-importaciones-mvp.ts
 *
 * COMPRAS-IMPORTACIONES-MVP-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-compras-importaciones-mvp.ts
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

console.log("\n=== COMPRAS-IMPORTACIONES-MVP-01 Validation ===\n");

// ── 1. Navigation: Comercial > Importaciones exists
check(
  "1. Comercial > Importaciones nav entry",
  (() => {
    const nav = readFile("components/shell/module-nav-config.ts");
    return nav.includes('"Importaciones"') &&
           nav.includes("comercial/importaciones") &&
           nav.includes('"comercial/importaciones"');
  })(),
  "module-nav-config.ts must have Importaciones entry in Comercial domain",
);

// ── 2. Does NOT modify Maletas
check(
  "2. Does not modify Maletas",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    // Must not import from or reference maletas module — "Mayoristas" is allowed
    return !client.includes("maletas-client") &&
           !client.includes("maletas/") &&
           !client.includes("vendor-sample") &&
           !client.includes("CommercialDecisionCenter");
  })(),
  "Importaciones client must not import from or reference Maletas module",
);

// ── 3. Table of imported references exists
check(
  "3. Table of imported references exists",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return client.includes("TABLE_GRID") &&
           client.includes("ImportRow") &&
           client.includes("Referencia") &&
           client.includes("Descripcion");
  })(),
  "Must have a table with reference rows",
);

// ── 4. Entry date column exists
check(
  "4. Entry date column exists",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return client.includes("Fecha ingreso") && client.includes("entryDate");
  })(),
  "Table must have Fecha ingreso column",
);

// ── 5. Total imported column exists
check(
  "5. Total imported column exists",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return client.includes("Importado") && client.includes("totalImported");
  })(),
  "Table must have Importado column with totalImported data",
);

// ── 6. Sold / remaining / % sold exist
check(
  "6. Sold / remaining / % sold columns exist",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return client.includes("Vendido") &&
           client.includes("Restante") &&
           client.includes("% vendido") &&
           client.includes("percentSold");
  })(),
  "Table must have Vendido, Restante, and % vendido columns",
);

// ── 7. Sales last 6 months by channel
check(
  "7. Sales last 6 months by channel",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return client.includes("Ventas ultimos 6 meses") &&
           client.includes("Tiendas") &&
           client.includes("Web") &&
           client.includes("Mayoristas") &&
           client.includes("monthlySales");
  })(),
  "Drawer must show sales last 6 months by channel",
);

// ── 8. Repurchase status exists
check(
  "8. Repurchase status exists",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    return client.includes("RECOMPRAR") &&
           client.includes("VIGILAR") &&
           client.includes("NO_RECOMPRAR") &&
           client.includes("Recomendacion") &&
           client.includes("repurchaseStatus");
  })(),
  "Must have repurchase status with RECOMPRAR/VIGILAR/NO_RECOMPRAR",
);

// ── 9. No invented data if SAG doesn't provide
check(
  "9. No invented data — SAG validation states",
  (() => {
    const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
    const types = readFile("lib/comercial/importaciones/import-types.ts");
    return client.includes("En validacion SAG") &&
           client.includes("Canal pendiente de clasificacion") &&
           types.includes("sagValidated") &&
           types.includes("pendingClassification");
  })(),
  "Must show SAG validation state, never invented data",
);

// ── 10. Domain types and service exist
check(
  "10. Domain types and service exist",
  fileExists("lib/comercial/importaciones/import-types.ts") &&
  fileExists("lib/comercial/importaciones/import-service.ts") &&
  (() => {
    const types = readFile("lib/comercial/importaciones/import-types.ts");
    const service = readFile("lib/comercial/importaciones/import-service.ts");
    return types.includes("ImportedReference") &&
           types.includes("ImportSummary") &&
           types.includes("RepurchaseStatus") &&
           types.includes("ChannelSales") &&
           service.includes("listImportedReferences") &&
           service.includes("getImportSummary") &&
           service.includes("computeRepurchaseStatus");
  })(),
  "import-types.ts and import-service.ts must exist with correct exports",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
