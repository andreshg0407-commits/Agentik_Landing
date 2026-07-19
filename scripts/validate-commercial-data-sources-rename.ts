/**
 * validate-commercial-data-sources-rename.ts
 *
 * COMMERCIAL-DATA-SOURCES-RENAME-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-commercial-data-sources-rename.ts
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

console.log("\n=== COMMERCIAL-DATA-SOURCES-RENAME-01 Validation ===\n");

const service = readFile("lib/comercial/importaciones/import-service.ts");
const queryCatalog = readFile("lib/connectors/adapters/sag-pya-soap/query-catalog.ts");

// ── 1. Old ImportacionesDataSource does not exist
check(
  "1. No ImportacionesDataSource in codebase",
  !fileExists("lib/comercial/importaciones/import-data-source.ts") &&
  !service.includes("ImportacionesDataSource"),
  "Old interface file and references must be removed",
);

// ── 2. Old SagDirectImportacionesDataSource does not exist
check(
  "2. No SagDirectImportacionesDataSource in codebase",
  !fileExists("lib/comercial/importaciones/sag-direct-data-source.ts") &&
  !service.includes("SagDirectImportacionesDataSource"),
  "Old direct implementation must be removed",
);

// ── 3. CommercialProductDataSource exists
check(
  "3. CommercialProductDataSource exists",
  fileExists("lib/comercial/data-sources/commercial-product-data-source.ts") &&
  (() => {
    const f = readFile("lib/comercial/data-sources/commercial-product-data-source.ts");
    return f.includes("CommercialProductDataSource") &&
           f.includes("fetchPrices") &&
           f.includes("fetchReceipts") &&
           f.includes("fetchEnrichment") &&
           f.includes("ProductEnrichment");
  })(),
  "New interface must exist with all methods",
);

// ── 4. SagDirectCommercialProductDataSource exists
check(
  "4. SagDirectCommercialProductDataSource exists",
  fileExists("lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts") &&
  (() => {
    const f = readFile("lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts");
    return f.includes("SagDirectCommercialProductDataSource") &&
           f.includes("implements CommercialProductDataSource") &&
           f.includes("consultaSagJson") &&
           f.includes("v_articulos");
  })(),
  "New direct implementation must exist",
);

// ── 5. SagWarehouseCommercialProductDataSource exists
check(
  "5. SagWarehouseCommercialProductDataSource exists",
  fileExists("lib/comercial/data-sources/sag-warehouse-commercial-product-data-source.ts") &&
  (() => {
    const f = readFile("lib/comercial/data-sources/sag-warehouse-commercial-product-data-source.ts");
    return f.includes("SagWarehouseCommercialProductDataSource") &&
           f.includes("implements CommercialProductDataSource");
  })(),
  "New warehouse stub must exist",
);

// ── 6. Query catalog uses commercialProducts, not importaciones
check(
  "6. Query catalog uses commercialProducts",
  queryCatalog.includes("commercialProducts:") &&
  queryCatalog.includes("COMMERCIAL_PRODUCTS") &&
  queryCatalog.includes("commercialProducts.prices") &&
  queryCatalog.includes("commercialProducts.entryReceipts") &&
  !queryCatalog.includes("importaciones:") &&
  !queryCatalog.includes("importaciones.prices"),
  "Must use commercialProducts domain, not importaciones",
);

// ── 7. import-service consumes CommercialProductDataSource
check(
  "7. import-service consumes CommercialProductDataSource",
  service.includes("CommercialProductDataSource") &&
  service.includes("ProductEnrichment") &&
  service.includes("@/lib/comercial/data-sources/commercial-product-data-source") &&
  service.includes("@/lib/comercial/data-sources/sag-direct-commercial-product-data-source") &&
  service.includes("enrichment?.firstEntryDate") &&
  service.includes("enrichment?.prices.pricePV3"),
  "Service must import from new location with same enrichment logic",
);

// ── 8. Does not modify Maletas
check(
  "8. Does not modify Maletas",
  (() => {
    const maletas = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
    return !maletas.includes("CommercialProductDataSource") &&
           !maletas.includes("data-sources");
  })(),
  "Maletas must not reference new data sources yet",
);

// ── 9. Does not modify Inventario
check(
  "9. Does not modify Inventario",
  (() => {
    const inv = readFile("lib/comercial/inventory/inventory-types.ts");
    return !inv.includes("CommercialProductDataSource") &&
           !inv.includes("data-sources");
  })(),
  "Inventory types must not reference new data sources yet",
);

// ── 10. Architecture doc exists
check(
  "10. Architecture doc exists",
  fileExists("docs/architecture/COMMERCIAL_DATA_SOURCES_01.md") &&
  (() => {
    const doc = readFile("docs/architecture/COMMERCIAL_DATA_SOURCES_01.md");
    return doc.includes("CommercialProductDataSource") &&
           doc.includes("Maletas") &&
           doc.includes("Importaciones") &&
           doc.includes("Inventario") &&
           doc.includes("Commercial Data Sources") &&
           doc.includes("SAG");
  })(),
  "Doc must explain the architecture with the official map",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
