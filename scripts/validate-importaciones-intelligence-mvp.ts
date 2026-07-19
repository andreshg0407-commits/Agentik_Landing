/**
 * validate-importaciones-intelligence-mvp.ts
 *
 * COMPRAS-IMPORTACIONES-INTELLIGENCE-MVP-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-importaciones-intelligence-mvp.ts
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

console.log("\n=== COMPRAS-IMPORTACIONES-INTELLIGENCE-MVP-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
const types = readFile("lib/comercial/importaciones/import-types.ts");
const service = readFile("lib/comercial/importaciones/import-service.ts");

// ── 1. Page exists at /comercial/importaciones
check(
  "1. Page exists at /comercial/importaciones",
  (() => {
    const page = readFile("app/(app)/[orgSlug]/comercial/importaciones/page.tsx");
    return page.includes("ImportacionesClient") && page.includes("listImportedReferences");
  })(),
  "page.tsx must render ImportacionesClient with real data",
);

// ── 2. Recompras sugeridas block exists
check(
  "2. Recompras sugeridas block exists",
  client.includes("Recompras sugeridas") &&
  client.includes("RecompraRow") &&
  client.includes("RECOMPRA_GRID") &&
  client.includes("Motivo"),
  "Must have Recompras sugeridas section with motivo column",
);

// ── 3. Top 10 historico exists
check(
  "3. Top 10 historico exists",
  client.includes("Top 10 historico") &&
  client.includes("TopHistoricoRow") &&
  client.includes("top10Historico"),
  "Must have Top 10 historico section",
);

// ── 4. Top actual ultimos 6 meses exists
check(
  "4. Top actual ultimos 6 meses exists",
  client.includes("Top actual ultimos 6 meses") &&
  client.includes("TopActualRow") &&
  client.includes("topActual"),
  "Must have Top actual section",
);

// ── 5. Detal / Mayorista separation
check(
  "5. Detal / Mayorista separation",
  client.includes("Detal") &&
  client.includes("Mayorista") &&
  client.includes("topTab") &&
  client.includes("salesDetal6m") &&
  client.includes("salesMayorista6m") &&
  types.includes("salesDetal6m") &&
  types.includes("salesMayorista6m") &&
  service.includes("DETAL_CHANNELS") &&
  service.includes("MAYORISTA_CHANNELS"),
  "Must separate Detal (tiendas+web) from Mayorista (maletas+pedidos) in types, service, and UI",
);

// ── 6. Drawer with reference detail
check(
  "6. Drawer with reference detail",
  client.includes("ImportDetailDrawer") &&
  client.includes("PV3") &&
  client.includes("PV4") &&
  client.includes("Inventario y rotacion") &&
  client.includes("Ventas ultimos 6 meses") &&
  client.includes("Distribucion por canal") &&
  client.includes("Recomendacion"),
  "Drawer must show PV3/PV4, inventory, 6m sales, channel distribution, recommendation",
);

// ── 7. Does not replicate Excel
check(
  "7. Does not replicate Excel",
  !client.includes("OCTUBRE DEL") &&
  !client.includes("VLOOKUP") &&
  !client.includes("SUM(D") &&
  !client.includes("Hoja2") &&
  service.includes("saleRecord") &&
  service.includes("productInventoryLevel") &&
  !service.includes("xlsx"),
  "Must not reference Excel formulas or structure — uses SAG data sources",
);

// ── 8. Does not modify Maletas
check(
  "8. Does not modify Maletas",
  !client.includes("maletas-client") &&
  !client.includes("maletas/") &&
  !client.includes("vendor-sample") &&
  !service.includes("maletas"),
  "Must not import from or reference Maletas module",
);

// ── 9. Does not modify Inventario
check(
  "9. Does not modify Inventario",
  (() => {
    const inv = readFile("lib/comercial/inventory/inventory-types.ts");
    return !inv.includes("importaciones") && !inv.includes("ImportedReference");
  })(),
  "Inventory types must not reference Importaciones",
);

// ── 10. Repurchase motivos exist
check(
  "10. Repurchase motivos with reasons",
  types.includes("desabastecimiento") &&
  types.includes("alta_rotacion") &&
  types.includes("exito_historico") &&
  types.includes("recompra_recurrente") &&
  service.includes("desabastecimiento") &&
  service.includes("alta_rotacion") &&
  service.includes("exito_historico"),
  "Must have all 4 repurchase motivos in types and service",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
