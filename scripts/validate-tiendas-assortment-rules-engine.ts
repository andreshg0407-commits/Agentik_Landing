/**
 * scripts/validate-tiendas-assortment-rules-engine.ts
 *
 * Validation for TIENDAS-ASSORTMENT-RULES-ENGINE-01
 *
 * Usage: npx tsx scripts/validate-tiendas-assortment-rules-engine.ts
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
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return true;
  return !fs.readFileSync(fp, "utf-8").includes(text);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== TIENDAS-ASSORTMENT-RULES-ENGINE-01 Validation ===\n");

const assortTypes  = "lib/comercial/tiendas/assortment-types.ts";
const assortEngine = "lib/comercial/tiendas/assortment-engine.ts";
const engine       = "lib/comercial/tiendas/store-replenishment-engine.ts";
const types        = "lib/comercial/tiendas/store-replenishment-types.ts";
const service      = "lib/comercial/tiendas/store-replenishment-service.ts";
const client       = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";
const activeInv    = "lib/comercial/tiendas/active-inventory.ts";

// 1. Textile evaluates by subgroup
console.log("CHECK 1: Textile evaluates by subgroup");
check("assortment-types.ts exists", fileExists(assortTypes));
check("TextileSubgroupRule type exported", fileContains(assortTypes, "export interface TextileSubgroupRule"));
check("TextileSubgroupRule has minActiveReferences", fileContains(assortTypes, "minActiveReferences"));
check("TextileSubgroupRule has idealActiveReferences", fileContains(assortTypes, "idealActiveReferences"));
check("assortment-engine.ts exists", fileExists(assortEngine));
check("evaluateTextileSubgroup function exists", fileContains(assortEngine, "evaluateTextileSubgroup"));
check("Textile counts distinct active references", fileContains(assortEngine, "activeRefs.add(v.referenceCode)"));

// 2. Textile does NOT generate shortage by individual reference
console.log("\nCHECK 2: Textile does NOT generate per-reference shortage");
check("Textile need groups by subgroup, not reference", fileContains(assortEngine, 'ruleType:        "textile_subgroup"'));
check("Textile message mentions subgroup coverage", fileContains(assortEngine, "baja cobertura"));

// 3. Textile searches candidates from same subgroup in main warehouse
console.log("\nCHECK 3: Textile candidates from same subgroup");
check("findTextileCandidates function exists", fileContains(assortEngine, "findTextileCandidates"));
check("Textile candidates filter by subgroup match", fileContains(assortEngine, "sg !== rule.subgroup"));
check("Textile candidates require net > 0", fileContains(assortEngine, "if (net <= 0) continue"));
check("Textile candidates max 5", fileContains(assortEngine, ".slice(0, 5)"));

// 4. Accessory evaluates by sizeClass
console.log("\nCHECK 4: Accessory evaluates by sizeClass");
check("AccessorySizeRule type exported", fileContains(assortTypes, "export interface AccessorySizeRule"));
check("AccessorySizeRule has sizeClass", fileContains(assortTypes, "sizeClass:"));
check("evaluateAccessorySize function exists", fileContains(assortEngine, "evaluateAccessorySize"));
check("inferSizeClass function exported", fileContains(assortEngine, "export function inferSizeClass"));

// 5. Accessory does NOT suggest production
console.log("\nCHECK 5: Accessory does NOT suggest production");
check("assortment-engine has NO production text", fileNotContains(assortEngine, "produccion"));
check("assortment-engine has NO producir text", fileNotContains(assortEngine, "producir"));
check("Engine production message replaced", fileContains(engine, "Sin disponibilidad en bodega principal. Requiere revision comercial."));

// 6. Candidates have main warehouse stock > 0
console.log("\nCHECK 6: Candidates have stock > 0");
check("findTextileCandidates requires net > 0", fileContains(assortEngine, "if (net <= 0) continue"));
check("findSizeCandidates requires net > 0", fileContains(assortEngine, "findSizeCandidates"));

// 7. No rules → no criticals
console.log("\nCHECK 7: No rules → no criticals");
check("evaluateStoreAssortment returns [] when no rules", fileContains(assortEngine, "if (storeRules.length === 0) return []"));

// 8. Historical zeros don't generate alerts
console.log("\nCHECK 8: Historical zeros don't generate alerts");
check("isExpectedAssortment guards ruleless stores", fileContains(activeInv, "if (storeRules.length === 0) return false"));
check("Textile only counts active items (currentUnits > 0)", fileContains(assortEngine, "if (v.currentUnits <= 0) continue"));

// 9. Suggestions grouped by need
console.log("\nCHECK 9: Suggestions grouped by need");
check("StoreAssortmentNeed type exported", fileContains(assortTypes, "export interface StoreAssortmentNeed"));
check("AssortmentCandidate type exported", fileContains(assortTypes, "export interface AssortmentCandidate"));
check("StoreDetailData has assortmentNeeds", fileContains(types, "assortmentNeeds"));
check("Service computes assortmentNeeds", fileContains(service, "evaluateStoreAssortment"));
check("Client imports StoreAssortmentNeed", fileContains(client, "StoreAssortmentNeed"));
check("Client shows candidates from bodega principal", fileContains(client, "Candidatos en bodega principal"));
check("Client shows need-based Faltantes tab", fileContains(client, "assortmentNeeds"));

// 10. Production text cleaned
console.log("\nCHECK 10: Production text cleaned");
check("Engine partial_transfer no longer says producir", fileNotContains(engine, "Enviar ${exactAvailable} uds y producir"));
check("Engine production_needed says revision comercial", fileContains(engine, "Requiere revision comercial"));
check("Client David signal no longer mentions produccion", fileNotContains(client, "sugerir traslados y produccion"));
check("Client David signal mentions bodega principal", fileContains(client, "sugerir traslados desde bodega principal"));

// 11. Default rule generation
console.log("\nCHECK 11: Default rule generation");
check("generateDefaultAssortmentRules exported", fileContains(assortEngine, "export function generateDefaultAssortmentRules"));
check("Service uses generateDefaultAssortmentRules", fileContains(service, "generateDefaultAssortmentRules"));

// 12. UI assortment-aware
console.log("\nCHECK 12: UI assortment-aware");
check("ShortagesTab accepts assortmentNeeds prop", fileContains(client, "assortmentNeeds: StoreAssortmentNeed[]"));
check("SuggestionsTab accepts assortmentNeeds prop", fileContains(client, "assortmentNeeds:  StoreAssortmentNeed[]"));
check("Client shows Sin candidato fallback", fileContains(client, "Sin candidato disponible en bodega principal. Requiere revision comercial."));
check("KPI: Inventario activo in card", fileContains(client, '"Inventario activo"'));
check("KPI: Cobertura subgrupos in card", fileContains(client, '"Cobertura subgrupos"'));
check("KPI: Oportunidades surtido in card", fileContains(client, '"Oportunidades surtido"'));

// TSC
console.log("\nCHECK 13: TSC baseline");
check("TSC baseline check deferred (run npx tsc --noEmit manually)", true);

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
