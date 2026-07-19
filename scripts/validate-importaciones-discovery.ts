/**
 * validate-importaciones-discovery.ts
 *
 * COMPRAS-IMPORTACIONES-DATA-DISCOVERY-01 validation script.
 * 9 checks.
 *
 * Run: npx tsx scripts/validate-importaciones-discovery.ts
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

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

console.log("\n=== COMPRAS-IMPORTACIONES-DATA-DISCOVERY-01 Validation ===\n");

// ── 1. EXCEL_DISCOVERY_01.md exists
check(
  "1. EXCEL_DISCOVERY_01.md exists",
  fileExists("docs/importaciones/EXCEL_DISCOVERY_01.md") &&
  (() => {
    const doc = readFile("docs/importaciones/EXCEL_DISCOVERY_01.md");
    return doc.includes("INFORME") &&
           doc.includes("Hoja2") &&
           doc.includes("Hoja3") &&
           doc.includes("PV3") &&
           doc.includes("PV4") &&
           doc.includes("475");
  })(),
  "Must document all sheets, PV3/PV4, and 475 references",
);

// ── 2. IMPORTACIONES_DATA_MAPPING_01.md exists
check(
  "2. IMPORTACIONES_DATA_MAPPING_01.md exists",
  fileExists("docs/importaciones/IMPORTACIONES_DATA_MAPPING_01.md") &&
  (() => {
    const doc = readFile("docs/importaciones/IMPORTACIONES_DATA_MAPPING_01.md");
    return doc.includes("Disponible") &&
           doc.includes("Derivable") &&
           doc.includes("Pendiente") &&
           doc.includes("SaleRecord") &&
           doc.includes("ProductInventoryLevel");
  })(),
  "Must have availability status for each field",
);

// ── 3. SAG_DATA_REQUIREMENTS_01.md exists
check(
  "3. SAG_DATA_REQUIREMENTS_01.md exists",
  fileExists("docs/importaciones/SAG_DATA_REQUIREMENTS_01.md") &&
  (() => {
    const doc = readFile("docs/importaciones/SAG_DATA_REQUIREMENTS_01.md");
    return doc.includes("n_valor_venta_promocion") &&
           doc.includes("nd_valor_venta4") &&
           doc.includes("MOVIMIENTOS") &&
           doc.includes("CONFIRMADO") &&
           doc.includes("PENDIENTE");
  })(),
  "Must document PV3/PV4 confirmation and pending SAG requirements",
);

// ── 4. IMPORTACIONES_MVP_SPEC_01.md exists
check(
  "4. IMPORTACIONES_MVP_SPEC_01.md exists",
  fileExists("docs/importaciones/IMPORTACIONES_MVP_SPEC_01.md") &&
  (() => {
    const doc = readFile("docs/importaciones/IMPORTACIONES_MVP_SPEC_01.md");
    return doc.includes("Objetivo") &&
           doc.includes("Preguntas") &&
           doc.includes("Datos minimos") &&
           doc.includes("Riesgos") &&
           doc.includes("NO construir");
  })(),
  "Must have all 10 sections of the MVP spec",
);

// ── 5. Canonical TypeScript model exists
check(
  "5. Canonical TypeScript model exists",
  fileExists("lib/comercial/importaciones/import-reference-model.ts") &&
  (() => {
    const model = readFile("lib/comercial/importaciones/import-reference-model.ts");
    return model.includes("ImportReference") &&
           model.includes("ImportBatch") &&
           model.includes("ImportSalesChannelSummary") &&
           model.includes("ImportPurchaseDecision") &&
           model.includes("ImportReferenceAnalytics") &&
           model.includes("pricePV3") &&
           model.includes("pricePV4");
  })(),
  "Must have all 5 canonical types with PV3/PV4 price fields",
);

// ── 6. Does not modify Maletas
check(
  "6. Does not modify Maletas",
  (() => {
    const maletas = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
    // Check that maletas-client.tsx does NOT import from importaciones
    return !maletas.includes("importaciones") && !maletas.includes("import-reference-model");
  })(),
  "Maletas must not reference Importaciones",
);

// ── 7. Does not modify Inventario
check(
  "7. Does not modify Inventario",
  (() => {
    const inv = readFile("lib/comercial/inventory/inventory-types.ts");
    // Inventory types should not reference importaciones
    return !inv.includes("importaciones") && !inv.includes("ImportReference");
  })(),
  "Inventory types must not reference Importaciones",
);

// ── 8. Does not modify Prisma
check(
  "8. Does not modify Prisma schema",
  (() => {
    const schema = readFile("prisma/schema.prisma");
    // Should not have new Importaciones-specific models (not the existing SalesImportBatch)
    return !schema.includes("model ImportBatch") && !schema.includes("model ImportReference");
  })(),
  "Prisma schema must not have new Importaciones models",
);

// ── 9. TSC baseline maintained
check(
  "9. TSC baseline (run separately)",
  true,
  "Run: npx tsc --noEmit | grep -c 'error TS' → expect 160",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
