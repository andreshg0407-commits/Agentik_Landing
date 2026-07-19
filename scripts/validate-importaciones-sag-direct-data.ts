/**
 * validate-importaciones-sag-direct-data.ts
 *
 * COMPRAS-IMPORTACIONES-SAG-DIRECT-DATA-01 validation script.
 * 11 checks.
 *
 * Run: npx tsx scripts/validate-importaciones-sag-direct-data.ts
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

console.log("\n=== COMPRAS-IMPORTACIONES-SAG-DIRECT-DATA-01 Validation ===\n");

const dataSource = readFile("lib/comercial/importaciones/import-data-source.ts");
const sagDirect = readFile("lib/comercial/importaciones/sag-direct-data-source.ts");
const sagWarehouse = readFile("lib/comercial/importaciones/sag-warehouse-data-source.ts");
const service = readFile("lib/comercial/importaciones/import-service.ts");
const queryCatalog = readFile("lib/connectors/adapters/sag-pya-soap/query-catalog.ts");

// ── 1. ImportacionesDataSource interface exists
check(
  "1. ImportacionesDataSource interface exists",
  fileExists("lib/comercial/importaciones/import-data-source.ts") &&
  dataSource.includes("ImportacionesDataSource") &&
  dataSource.includes("fetchPrices") &&
  dataSource.includes("fetchReceipts") &&
  dataSource.includes("fetchEnrichment") &&
  dataSource.includes("SagPricePair") &&
  dataSource.includes("ImportReceipt") &&
  dataSource.includes("ImportEnrichment"),
  "Must define interface with all methods and types",
);

// ── 2. SagDirectImportacionesDataSource implementation
check(
  "2. SagDirectImportacionesDataSource implementation",
  fileExists("lib/comercial/importaciones/sag-direct-data-source.ts") &&
  sagDirect.includes("SagDirectImportacionesDataSource") &&
  sagDirect.includes("implements ImportacionesDataSource") &&
  sagDirect.includes("consultaSagJson") &&
  sagDirect.includes("PyaApiConfig"),
  "Must implement interface using SAG SOAP transport",
);

// ── 3. PV3/PV4 extraction from v_articulos
check(
  "3. PV3/PV4 extraction from v_articulos",
  sagDirect.includes("n_valor_venta_promocion") &&
  sagDirect.includes("nd_valor_venta4") &&
  sagDirect.includes("v_articulos") &&
  sagDirect.includes("pricePV3") &&
  sagDirect.includes("pricePV4"),
  "Must query v_articulos for PV3 (n_valor_venta_promocion) and PV4 (nd_valor_venta4)",
);

// ── 4. Real entry dates from MOVIMIENTOS
check(
  "4. Real entry dates from MOVIMIENTOS",
  sagDirect.includes("MOVIMIENTOS") &&
  sagDirect.includes("d_fecha_documento") &&
  sagDirect.includes("ka_ni_fuente") &&
  sagDirect.includes("firstEntryDate"),
  "Must query MOVIMIENTOS for real import entry dates",
);

// ── 5. Receipt history with quantities
check(
  "5. Receipt history with quantities",
  sagDirect.includes("ImportReceipt") &&
  sagDirect.includes("n_cantidad") &&
  sagDirect.includes("documentNumber") &&
  sagDirect.includes("quantity") &&
  sagDirect.includes("batchCount"),
  "Must extract receipt history with quantity and batch count",
);

// ── 6. Provider info from TERCEROS
check(
  "6. Provider info from TERCEROS",
  sagDirect.includes("TERCEROS") &&
  sagDirect.includes("providerNit") &&
  sagDirect.includes("providerName") &&
  sagDirect.includes("sc_beneficiario"),
  "Must extract provider NIT and name from TERCEROS JOIN",
);

// ── 7. SagWarehouseImportacionesDataSource stub exists
check(
  "7. SagWarehouseImportacionesDataSource stub",
  fileExists("lib/comercial/importaciones/sag-warehouse-data-source.ts") &&
  sagWarehouse.includes("SagWarehouseImportacionesDataSource") &&
  sagWarehouse.includes("implements ImportacionesDataSource") &&
  sagWarehouse.includes("sag-warehouse"),
  "Must have stub implementation for future data warehouse",
);

// ── 8. import-service.ts uses data source enrichment
check(
  "8. import-service uses data source enrichment",
  service.includes("ImportacionesDataSource") &&
  service.includes("ImportEnrichment") &&
  service.includes("fetchEnrichment") &&
  service.includes("enrichmentMap") &&
  service.includes("enrichment?.firstEntryDate") &&
  service.includes("enrichment?.totalImported") &&
  service.includes("enrichment?.batchCount") &&
  service.includes("enrichment?.prices.pricePV3") &&
  service.includes("enrichment?.prices.pricePV4"),
  "Service must integrate SAG enrichment for dates, prices, and batch count",
);

// ── 9. No more hardcoded approximations as primary
check(
  "9. No hardcoded approximations as primary",
  // entryDate uses enrichment first
  service.includes("enrichment?.firstEntryDate") &&
  // totalImported uses enrichment first
  service.includes("enrichment?.totalImported") &&
  // batchCount uses enrichment first
  service.includes("enrichment?.batchCount ?? 1") &&
  // pricePV3 uses enrichment first
  service.includes("enrichment?.prices.pricePV3 ?? p.price"),
  "Enrichment must be primary source, with Prisma fallbacks",
);

// ── 10. Query catalog has importaciones entries
check(
  "10. Query catalog has importaciones entries",
  queryCatalog.includes("IMPORTACIONES") &&
  queryCatalog.includes("importaciones.prices") &&
  queryCatalog.includes("importaciones.entryReceipts") &&
  queryCatalog.includes("n_valor_venta_promocion") &&
  queryCatalog.includes("nd_valor_venta4") &&
  queryCatalog.includes("importaciones:") &&
  queryCatalog.includes("IMPORTACIONES,"),
  "Query catalog must have importaciones domain with prices and entryReceipts queries",
);

// ── 11. SAG_DATA_REQUIREMENTS_01.md updated
check(
  "11. SAG_DATA_REQUIREMENTS_01.md updated",
  (() => {
    const doc = readFile("docs/importaciones/SAG_DATA_REQUIREMENTS_01.md");
    return doc.includes("IMPLEMENTADO") &&
           doc.includes("SagDirectImportacionesDataSource") &&
           doc.includes("import-data-source.ts") &&
           doc.includes("sag-direct-data-source.ts") &&
           doc.includes("sag-warehouse-data-source.ts");
  })(),
  "Doc must reflect implementation status and list new files",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
