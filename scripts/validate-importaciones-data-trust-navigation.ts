/**
 * validate-importaciones-data-trust-navigation.ts
 *
 * GO-LIVE-IMPORTACIONES-DATA-TRUST-AND-NAVIGATION-01 validation script.
 * 19 checks.
 *
 * Run: npx tsx scripts/validate-importaciones-data-trust-navigation.ts
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

console.log("\n=== GO-LIVE-IMPORTACIONES-DATA-TRUST-AND-NAVIGATION-01 Validation ===\n");

const service = readFile("lib/comercial/importaciones/import-service.ts");
const types = readFile("lib/comercial/importaciones/import-types.ts");
const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");

// ── 1. No ESTIMATED dates shown as confirmed
check(
  "1. Entry dates only shown when CONFIRMED",
  service.includes('entryDateQuality: DataQuality = sagFirstEntry ? "CONFIRMED" : "UNAVAILABLE"') &&
  !service.includes('p.createdAt ? "ESTIMATED"'),
  "Must not fall back to createdAt for entry date quality",
);

// ── 2. entryDate is null when no SAG receipt (not createdAt fallback)
check(
  "2. entryDate null when no SAG receipt",
  service.includes("const entryDate = sagFirstEntry ?? null") ||
  service.includes("const entryDate = sagFirstEntry ??  null"),
  "Must not use createdAt as fallback for entryDate",
);

// ── 3. daysSinceLastEntry uses last receipt, not first
check(
  "3. daysSinceLastEntry from last receipt",
  service.includes("daysSinceLastEntry") &&
  service.includes("sagLastEntry") &&
  types.includes("daysSinceLastEntry"),
  "Must compute days from last receipt date, not first",
);

// ── 4. Client shows 'Desde ultimo ingreso' not 'T. venta'
check(
  "4. Column renamed from T. venta",
  client.includes("Desde ultimo ingreso") &&
  !client.includes('"T. venta"'),
  "Must use 'Desde ultimo ingreso' label",
);

// ── 5. percentSold only with CONFIRMED totalImported
check(
  "5. percentSold only with CONFIRMED data",
  service.includes('totalImportedQuality === "CONFIRMED"') &&
  service.includes("totalImported !== null"),
  "Must not compute percentSold with ESTIMATED data",
);

// ── 6. totalImported only from SAG (not soldNet + remaining fallback)
check(
  "6. No soldNet+remaining as totalImported",
  !service.includes("soldNet + remaining") &&
  service.includes("const totalImported = sagTotalImported ?? null"),
  "Must only use CONFIRMED SAG receipts for totalImported",
);

// ── 7. totalStock field added
check(
  "7. totalStock computed from all warehouses",
  service.includes("totalStockMap") &&
  service.includes("totalStock") &&
  types.includes("totalStock"),
  "Must track total positive stock across all warehouses",
);

// ── 8. Import warehouse filter still correct
check(
  "8. Import warehouse filter preserved",
  service.includes("IMPORT_WAREHOUSE_CODES.has(lvl.warehouseId)"),
  "Must filter import warehouses using Set.has",
);

// ── 9. Revenue fields exist
check(
  "9. Revenue tracking added",
  types.includes("revenueAll") &&
  types.includes("revenue6m") &&
  types.includes("revenueDetal6m") &&
  types.includes("revenueMayorista6m") &&
  service.includes("revenueAll") &&
  service.includes("revenue6m"),
  "Must track monetary values",
);

// ── 10. Revenue computed from unitValue * quantity
check(
  "10. Revenue computed correctly",
  service.includes("lineRevenue") &&
  service.includes("absQty") &&
  service.includes("unitValue"),
  "Must multiply quantity by unitValue for revenue",
);

// ── 11. Client shows monetary values
check(
  "11. Client shows monetary values",
  client.includes("fmtCurrency") &&
  client.includes("Valor monetario") &&
  client.includes("Facturado total") &&
  client.includes("Facturado 6M"),
  "Drawer must show revenue fields",
);

// ── 12. Collapsible sections
check(
  "12. Collapsible sections implemented",
  client.includes("CollapsibleSection") &&
  client.includes("defaultOpen"),
  "Must use collapsible sections with open/close toggle",
);

// ── 13. Quick navigation
check(
  "13. Quick navigation implemented",
  client.includes("NavPill") &&
  client.includes("scrollTo") &&
  client.includes("scrollIntoView"),
  "Must have quick navigation pills that scroll to sections",
);

// ── 14. Data quality shown in drawer
check(
  "14. Data quality indicators in drawer",
  client.includes("QUALITY_LABELS") &&
  client.includes("Confirmado") &&
  client.includes("No disponible"),
  "Drawer must show data quality for key fields",
);

// ── 15. Recompra grid shows last entry date (not first)
check(
  "15. Recompra table shows last entry date",
  client.includes("lastEntryDate") &&
  client.includes("Ult. ingreso"),
  "Must show last receipt date in recompra table",
);

// ── 16. Top 6M shows value column
check(
  "16. Top 6M shows monetary value",
  client.includes("Valor 6M") &&
  client.includes("revenueValue"),
  "Must show revenue in top 6M table",
);

// ── 17. Repurchase decision uses totalStock
check(
  "17. Repurchase uses totalStock",
  service.includes("totalStock") &&
  service.includes("totalStock > 50"),
  "Repurchase decision must consider total stock, not just import warehouse",
);

// ── 18. Maletas not modified
check(
  "18. Maletas not modified",
  (() => {
    const maletas = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
    return !maletas.includes("totalStock") &&
           !maletas.includes("daysSinceLastEntry") &&
           !maletas.includes("revenueAll");
  })(),
  "Maletas must not reference data-trust changes",
);

// ── 19. Diagnostic script exists
check(
  "19. Diagnostic script exists",
  fileExists("scripts/diagnose-importaciones-data-trust.ts") &&
  (() => {
    const diag = readFile("scripts/diagnose-importaciones-data-trust.ts");
    return diag.includes("DATA TRUST DIAGNOSTIC") &&
           diag.includes("WAREHOUSE DISTRIBUTION") &&
           diag.includes("CLASSIFICATION AUDIT");
  })(),
  "Diagnostic script must exist and cover key areas",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
