/**
 * scripts/validate-maletas-production-subgroup-logic.ts
 *
 * Structural validation for MALETAS-PRODUCTION-SUBGROUP-LOGIC-01
 *
 * Usage: npx tsx scripts/validate-maletas-production-subgroup-logic.ts
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

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileNotContains(rel: string, text: string): boolean {
  return !fileContains(rel, text);
}

console.log("=== MALETAS-PRODUCTION-SUBGROUP-LOGIC-01 Validation ===\n");

const types = "lib/comercial/maletas/vendor-sample-types.ts";
const loader = "lib/comercial/maletas/vendor-sample-loader.ts";
const client = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";

// 1. ProductionSuggestion has subgroup fields
console.log("CHECK 1: ProductionSuggestion has subgroup fields");
check("subgrupoSag field", fileContains(types, "subgrupoSag: string"));
check("evidenceRefs field", fileContains(types, "evidenceRefs: Array<"));
check("reasonType field", fileContains(types, "reasonType: ProductionReasonType"));
check("ProductionReasonType defined", fileContains(types, "export type ProductionReasonType"));
check("subgroup_shortage reason", fileContains(types, '"subgroup_shortage"'));
check("no_replacement_available reason", fileContains(types, '"no_replacement_available"'));
check("central_stock_insufficient reason", fileContains(types, '"central_stock_insufficient"'));

// 2. Grouping by line + subgrupoSag
console.log("\nCHECK 2: Grouping by line + subgrupoSag");
check("Loader groups by line|subgrupoSag key", fileContains(loader, '`${ref.line}|${sg}`'));
check("Loader uses subgroupProdMap", fileContains(loader, "subgroupProdMap"));
check("Loader accumulates affectedVendorSet", fileContains(loader, "affectedVendorSet"));
check("Loader collects evidenceRefs", fileContains(loader, "evidenceRefs"));
check("Loader NOT keyed by reference", fileNotContains(loader, "productionMap.get(ref.reference)"));

// 3. Calculation
console.log("\nCHECK 3: Calculation");
check("Shortfall = required - available", fileContains(loader, "d.totalMinRequired - d.totalCentralAvailable"));
check("Only generates if shortfall > 0", fileContains(loader, "if (shortfall <= 0) return null"));
check("suggestedQty = shortfall", fileContains(loader, "suggestedQty: shortfall"));

// 4. Table shows Subgrupo as primary column
console.log("\nCHECK 4: Table uses subgrupo columns");
check("Header has Subgrupo column", fileContains(client, '"Subgrupo"'));
check("Header has Maletas column", fileContains(client, '"Maletas"'));
check("Header has Disp. subgrupo column", fileContains(client, '"Disp. subgrupo"'));
check("Header has Requerido column", fileContains(client, '"Requerido"'));
check("Row shows item.subgrupoSag", fileContains(client, "item.subgrupoSag"));
check("Row shows affectedVendors.length", fileContains(client, "item.affectedVendors.length"));
check("No Referencia as primary column in production header", fileNotContains(client, '["", "Referencia", "Descripcion", "Linea", "Disponible", "Minimo"'));

// 5. Detail explains subgroup logic
console.log("\nCHECK 5: Detail explains subgroup logic");
check("Detail says 'Por que se sugiere producir este subgrupo'", fileContains(client, "Por que se sugiere producir este subgrupo"));
check("Detail says 'no necesariamente la misma referencia'", fileContains(client, "No se recomienda producir necesariamente la misma referencia"));
check("Detail says 'recuperar cobertura comercial'", fileContains(client, "recuperar cobertura comercial"));

// 6. Detail lists evidence references
console.log("\nCHECK 6: Evidence references");
check("Detail shows 'Referencias evidencia'", fileContains(client, "Referencias evidencia"));
check("Detail explains evidence role", fileContains(client, "evidencia del deficit"));
check("Detail maps evidenceRefs", fileContains(client, "evidenceRefs.map"));

// 7. Detail shows subgroup replacement context
console.log("\nCHECK 7: Replacement context");
check("Detail says 'Se produce para reemplazar faltantes del subgrupo'", fileContains(client, "Se produce para reemplazar faltantes del subgrupo"));
check("Detail mentions central stock insufficient", fileContains(client, "inventario central del subgrupo"));

// 8. Urgency by subgroup
console.log("\nCHECK 8: Urgency by subgroup");
check("Urgency alta: shortfall >= 50 or maletas >= 3", fileContains(loader, "shortfall >= 50 || affectedCount >= 3"));
check("Urgency media: shortfall >= 20 or maletas >= 2", fileContains(loader, "shortfall >= 20 || affectedCount >= 2"));

// 9. Fallback for missing subgrupoSag
console.log("\nCHECK 9: SIN_SUBGRUPO_SAG fallback");
check("Loader uses SIN_SUBGRUPO_SAG fallback", fileContains(loader, '"SIN_SUBGRUPO_SAG"'));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
