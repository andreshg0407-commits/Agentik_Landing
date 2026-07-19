/**
 * scripts/validate-tiendas-policy-ux.ts
 *
 * Validation for TIENDAS-POLICY-UX-AND-STOCK-LOOKUP-01
 *
 * Usage: npx tsx scripts/validate-tiendas-policy-ux.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else    { fail++; console.log(`  FAIL  ${label}`); }
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel: string, text: string): boolean {
  if (!fileExists(rel)) return false;
  return fs.readFileSync(path.join(ROOT, rel), "utf-8").includes(text);
}

console.log("=== TIENDAS-POLICY-UX-AND-STOCK-LOOKUP-01 Validation ===\n");

// FASE 1: Tab unification
console.log("FASE 1 — Tab unification");
const clientFile = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";
check("tiendas-client.tsx exists", fileExists(clientFile));
check("Has 'inventario' tab key", fileContains(clientFile, '"inventario"'));
check("Has 'Reglas de surtido' label", fileContains(clientFile, 'Reglas de surtido'));
check("No duplicate 'politica' tab in tabs array", !fileContains(clientFile, 'key: "politica"'));
check("PolicyTab rendered under reglas key", fileContains(clientFile, 'activeTab === "reglas"') && fileContains(clientFile, '<PolicyTab'));
check("No RulesTab in tab content rendering", !fileContains(clientFile, 'activeTab === "reglas"      && <RulesTab'));

// FASE 2: Inventario tab
console.log("\nFASE 2 — Inventario tab");
check("InventarioTab component exists", fileContains(clientFile, "function InventarioTab"));
check("InventarioTab has search input", fileContains(clientFile, "Buscar referencia, producto, talla o color"));
check("InventarioTab has summary strip", fileContains(clientFile, 'label="Referencias"'));
check("InventarioTab loads via API", fileContains(clientFile, 'action: "store_inventory"'));

// FASE 3: Store inventory API
console.log("\nFASE 3 — Store inventory API");
const apiRoute = "app/api/orgs/[orgSlug]/comercial/tiendas/route.ts";
check("API route exists", fileExists(apiRoute));
check("Has store_inventory action", fileContains(apiRoute, '"store_inventory"'));
check("Imports getStoreInventoryByWarehouse", fileContains(apiRoute, "getStoreInventoryByWarehouse"));

// FASE 5: Rule templates
console.log("\nFASE 5 — Rule templates");
check("RULE_TEMPLATES array exists", fileContains(clientFile, "RULE_TEMPLATES"));
check("Has 'Textil basico' template", fileContains(clientFile, "Textil basico"));
check("Has 'Accesorio' template", fileContains(clientFile, '"Accesorio"'));
check("Has 'Voluminoso' template", fileContains(clientFile, '"Voluminoso"'));
check("Has 'Tienda global' template", fileContains(clientFile, "Tienda global"));

// FASE 7-9: Stock lookup
console.log("\nFASE 7-9 — Stock lookup / availability");
check("Has stock_lookup API action", fileContains(apiRoute, '"stock_lookup"'));
check("Imports getStoreWarehouses", fileContains(apiRoute, "getStoreWarehouses"));
check("Imports getMainWarehouse", fileContains(apiRoute, "getMainWarehouse"));
check("Imports getMainWarehouseAvailability", fileContains(apiRoute, "getMainWarehouseAvailability"));
check("StockLookupPanel component exists", fileContains(clientFile, "function StockLookupPanel"));
check("Shows main warehouse results", fileContains(clientFile, "Bodega principal"));
check("Shows other store results", fileContains(clientFile, "Otras tiendas"));
check("Lookup triggered on row click", fileContains(clientFile, "handleLookup"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
