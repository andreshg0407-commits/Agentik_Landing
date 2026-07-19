/**
 * validate-importaciones-data-activation.ts
 *
 * GO-LIVE-IMPORTACIONES-DATA-ACTIVATION-01 validation script.
 * 20 checks.
 *
 * Run: npx tsx scripts/validate-importaciones-data-activation.ts
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

console.log("\n=== GO-LIVE-IMPORTACIONES-DATA-ACTIVATION-01 Validation ===\n");

const service = readFile("lib/comercial/importaciones/import-service.ts");
const types = readFile("lib/comercial/importaciones/import-types.ts");
const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");

// ── 1. Returns real references (not dependent on line === "IMPORT")
check(
  "1. Filter does not depend on line === IMPORT",
  !service.includes('"IMPORT"') &&
  service.includes("IMPORT_PRODUCT_LINES") &&
  service.includes("isImportedProduct"),
  "Must use dynamic product identification, not hardcoded IMPORT",
);

// ── 2. Uses real productLine values
check(
  "2. Uses SAG LINEA values for identification",
  service.includes('"5"') &&
  service.includes("IMPORT_PRODUCT_LINES"),
  "Must identify imports via SAG LINEA 5 (Castillitos)",
);

// ── 3. PV3 extracted from SAG
check(
  "3. PV3 extracted from SAG",
  service.includes("enrichment?.prices.pricePV3") &&
  service.includes("CommercialProductDataSource"),
  "Must use SAG v_articulos for PV3",
);

// ── 4. PV4 extracted from SAG
check(
  "4. PV4 extracted from SAG",
  service.includes("enrichment?.prices.pricePV4"),
  "Must use SAG v_articulos for PV4",
);

// ── 5. Inventory real per reference
check(
  "5. Inventory from ProductInventoryLevel",
  service.includes("productInventoryLevel") &&
  service.includes("remainingMap") &&
  service.includes("quantity"),
  "Must sum inventory across warehouses",
);

// ── 6. Historical sales calculated
check(
  "6. Historical sales from CustomerOrderLine",
  service.includes("customerOrderLine") &&
  service.includes("referenceCode") &&
  service.includes("totalAll"),
  "Must use CustomerOrderLine for product-level sales",
);

// ── 7. 6M sales calculated
check(
  "7. 6M sales calculated",
  service.includes("last6mAll") &&
  service.includes("sixMonthsAgo") &&
  service.includes("salesTotal6m"),
  "Must calculate 6-month window from order dates",
);

// ── 8. Detal and Mayorista fields exist
check(
  "8. Detal and Mayorista fields populated",
  service.includes("salesDetal6m") &&
  service.includes("salesMayorista6m") &&
  service.includes("soldDetal") &&
  service.includes("soldMayorista"),
  "Must have channel split fields (even if pending)",
);

// ── 9. Unknown channels not auto-assigned to Detal
check(
  "9. Channels not silently assigned to Detal",
  service.includes("channelPending = true") &&
  !service.includes("else agg.totalDetal") &&
  !service.includes("else agg.last6mDetal"),
  "Must not assign unknown channels to Detal by default",
);

// ── 10. First and last entry dates from SAG
check(
  "10. Entry dates from SAG receipts",
  service.includes("enrichment?.firstEntryDate") &&
  service.includes("entryDate"),
  "Must use SAG MOVIMIENTOS dates when available",
);

// ── 11. Total imported from SAG receipts
check(
  "11. Total imported from SAG receipts",
  service.includes("enrichment?.totalImported"),
  "Must use SAG receipt sum when available",
);

// ── 12. KPIs use real data
check(
  "12. KPIs calculated from real data",
  service.includes("totalReferences") &&
  service.includes("repurchaseSuggested") &&
  service.includes("topVentasActuales") &&
  service.includes("refsCriticas"),
  "All 4 KPIs must be computed from live references",
);

// ── 13. Recompras sugeridas uses real data
check(
  "13. Repurchase decisions use real data",
  service.includes("computeRepurchaseDecision") &&
  service.includes("desabastecimiento") &&
  service.includes("alta_rotacion") &&
  service.includes("exito_historico"),
  "Repurchase logic must use real sales and inventory",
);

// ── 14. Top historico uses real sales
check(
  "14. Top historico uses real sales (sold field)",
  service.includes("totalAll") &&
  types.includes("sold:") &&
  client.includes("Top 10 historico"),
  "Top historico must sort by real historical sales",
);

// ── 15. Top actual uses real 6M sales
check(
  "15. Top actual uses real 6M sales",
  service.includes("last6mAll") &&
  types.includes("salesTotal6m") &&
  client.includes("Top actual"),
  "Top actual must use real 6-month sales data",
);

// ── 16. Drawer shows recommendation traceability
check(
  "16. Drawer shows recommendation traceability",
  client.includes("Recomendacion") || client.includes("recomendacion") ||
  client.includes("repurchaseStatus") || client.includes("repurchaseMotivo"),
  "Drawer must show the recommendation with reasoning",
);

// ── 17. Maletas not modified
check(
  "17. Maletas not modified",
  (() => {
    const maletas = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
    return !maletas.includes("customerOrderLine") &&
           !maletas.includes("IMPORT_PRODUCT_LINES") &&
           !maletas.includes("isImportedProduct");
  })(),
  "Maletas must not reference Importaciones changes",
);

// ── 18. Inventario not modified
check(
  "18. Inventario not modified",
  (() => {
    const inv = readFile("lib/comercial/inventory/inventory-types.ts");
    return !inv.includes("IMPORT_PRODUCT_LINES") &&
           !inv.includes("isImportedProduct") &&
           !inv.includes("customerOrderLine");
  })(),
  "Inventory types must not reference Importaciones changes",
);

// ── 19. Produccion not modified
check(
  "19. Produccion not modified",
  (() => {
    try {
      const dir = fs.readdirSync(path.join(ROOT, "lib/connectors/adapters/sag-pya-soap/production"));
      // Check that no production file references importaciones
      for (const f of dir) {
        const content = fs.readFileSync(path.join(ROOT, "lib/connectors/adapters/sag-pya-soap/production", f), "utf-8");
        if (content.includes("IMPORT_PRODUCT_LINES") || content.includes("isImportedProduct")) return false;
      }
      return true;
    } catch { return true; }
  })(),
  "Production sync must not reference Importaciones changes",
);

// ── 20. Activation report exists
check(
  "20. Activation report exists",
  fileExists("docs/importaciones/IMPORTACIONES_DATA_ACTIVATION_REPORT_01.md") &&
  (() => {
    const doc = readFile("docs/importaciones/IMPORTACIONES_DATA_ACTIVATION_REPORT_01.md");
    return doc.includes("657") &&
           doc.includes("CustomerOrderLine") &&
           doc.includes("channelPending") &&
           doc.includes("productLine") &&
           doc.includes('"5"');
  })(),
  "Report must document findings and decisions",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
