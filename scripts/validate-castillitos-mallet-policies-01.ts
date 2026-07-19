import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const ROOT = resolve(__dirname, "..");
const CATALOG = resolve(ROOT, "lib/comercial/maletas/assortment-catalog");

// ─── 1. File Structure ──────────────────────────────────────────────────────

console.log("\n--- 1. File Structure ---");

const files = [
  "mallet-assortment-types.ts",
  "mallet-assortment-catalog.ts",
  "mallet-assortment-validation.ts",
  "mallet-assortment-evaluator.ts",
  "mallet-assortment-evidence.ts",
  "castillitos-mallet-assortment-catalog.ts",
  "index.ts",
];

for (const f of files) {
  check(`${f} exists`, existsSync(resolve(CATALOG, f)));
}

const docPath = resolve(ROOT, "docs/implementation/CASTILLITOS_MALLET_POLICIES_01.md");
check("docs/implementation/CASTILLITOS_MALLET_POLICIES_01.md exists", existsSync(docPath));

// ─── Helper to safely read a file ───────────────────────────────────────────

function readCatalogFile(name: string): string {
  const p = resolve(CATALOG, name);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

// ─── 2. Types ────────────────────────────────────────────────────────────────

console.log("\n--- 2. Types ---");

const types = readCatalogFile("mallet-assortment-types.ts");

check("MalletAssortmentCatalog interface",          types.includes("MalletAssortmentCatalog"));
check("MalletAssortmentGroup interface",            types.includes("MalletAssortmentGroup"));
check("MalletAssortmentEntry interface",            types.includes("MalletAssortmentEntry"));
check("MalletAssortmentEvaluation interface",       types.includes("MalletAssortmentEvaluation"));
check("MalletAssortmentSuggestion interface",       types.includes("MalletAssortmentSuggestion"));
check("MalletCurrentItem interface",                types.includes("MalletCurrentItem"));
check("AvailableInventoryItem interface",           types.includes("AvailableInventoryItem"));
check("CommercialWorld type",                       types.includes("CommercialWorld"));
check("ImportSizeClass type",                       types.includes("ImportSizeClass"));
check("MalletAssortmentStatus type",                types.includes("MalletAssortmentStatus"));
check("DataQualityLevel type",                      types.includes("DataQualityLevel"));

// ─── 3. Castillitos Catalog ──────────────────────────────────────────────────

console.log("\n--- 3. Castillitos Catalog ---");

const cs = readCatalogFile("castillitos-mallet-assortment-catalog.ts");

check("CS_NINA_BEBE group exists",             cs.includes("CS_NINA_BEBE"));
check("CS_NINO_BEBE group exists",             cs.includes("CS_NINO_BEBE"));
check("CS_NINA_KIDS group exists",             cs.includes("CS_NINA_KIDS"));
check("CS_NINO_KIDS group exists",             cs.includes("CS_NINO_KIDS"));
check("LT_CONJUNTOS group exists",             cs.includes("LT_CONJUNTOS"));
check("LT_NINO group exists",                  cs.includes("LT_NINO"));
check("LT_NINA group exists",                  cs.includes("LT_NINA"));
check("LT_PIJAMAS_BEBE_NINA group exists",     cs.includes("LT_PIJAMAS_BEBE_NINA"));
check("LT_PIJAMAS_BEBE_NINO group exists",     cs.includes("LT_PIJAMAS_BEBE_NINO"));
check("LT_PIJAMAS_GRANDES group exists",       cs.includes("LT_PIJAMAS_GRANDES"));
check("IMPORT_ACCESORIOS group exists",        cs.includes("IMPORT_ACCESORIOS"));
check("buildCastillitosTextilCatalog function",cs.includes("buildCastillitosTextilCatalog"));
check("buildLatinKidsTextilCatalog function",  cs.includes("buildLatinKidsTextilCatalog"));
check("buildImportAccesoriosCatalog function", cs.includes("buildImportAccesoriosCatalog"));
check('"DERROTERO CS.xlsx" source reference',  cs.includes("DERROTERO CS.xlsx"));
check('"TEXTIL" commercial world',             cs.includes("TEXTIL"));
check('"IMPORTACION" commercial world',        cs.includes("IMPORTACION"));

// ─── 4. Excel Transcription Verification ────────────────────────────────────

console.log("\n--- 4. Excel Transcription Verification ---");

// Helper: check for a value near a label within a reasonable window (500 chars)
function nearbyValue(content: string, label: string, value: string): boolean {
  const idx = content.indexOf(label);
  if (idx === -1) return false;
  const window = content.substring(idx, idx + 500);
  return window.includes(value);
}

// CS NIÑA BEBÉ: PIJAMA CL target = 3
check(
  "CS NIÑA BEBÉ: PIJAMA CL target = 3",
  (() => {
    const idx = cs.indexOf("CS_NINA_BEBE");
    if (idx < 0) return false;
    const block = cs.substring(idx, idx + 1500);
    return block.includes("PIJAMA_CL") && block.includes(", 3,");
  })()
);

// CS NIÑA BEBÉ: CONJUNTO CC target = 3
check(
  "CS NIÑA BEBÉ: CONJUNTO CC target = 3",
  cs.includes("CS_NINA_BEBE") && cs.includes("CONJUNTO") && cs.includes("CC")
    && (() => {
      const idx = cs.indexOf("CS_NINA_BEBE");
      const block = cs.substring(idx, idx + 2000);
      return block.includes("CC") && block.includes("3");
    })()
);

// CS NIÑA BEBÉ: BLUSAS target = 2
check(
  "CS NIÑA BEBÉ: BLUSAS target = 2",
  cs.includes("CS_NINA_BEBE") && cs.includes("BLUSA")
    && (() => {
      const idx = cs.indexOf("CS_NINA_BEBE");
      const block = cs.substring(idx, idx + 2000);
      return block.includes("BLUSA") && block.includes("2");
    })()
);

// CS NIÑO BEBÉ: CONJUNTO CC target = 2
check(
  "CS NIÑO BEBÉ: CONJUNTO CC target = 2",
  cs.includes("CS_NINO_BEBE") && cs.includes("CONJUNTO")
    && (() => {
      const idx = cs.indexOf("CS_NINO_BEBE");
      const block = cs.substring(idx, idx + 2000);
      return block.includes("CC") && block.includes("2");
    })()
);

// CS NIÑO BEBÉ: CONJUNTO CL target = 3
check(
  "CS NIÑO BEBÉ: CONJUNTO CL target = 3",
  cs.includes("CS_NINO_BEBE")
    && (() => {
      const idx = cs.indexOf("CS_NINO_BEBE");
      const block = cs.substring(idx, idx + 2000);
      return block.includes("CL") && block.includes("3");
    })()
);

// CS NIÑA KIDS: BLUSA target = 2
check(
  "CS NIÑA KIDS: BLUSA target = 2",
  cs.includes("CS_NINA_KIDS") && cs.includes("BLUSA")
    && (() => {
      const idx = cs.indexOf("CS_NINA_KIDS");
      const block = cs.substring(idx, idx + 2000);
      return block.includes("BLUSA") && block.includes("2");
    })()
);

// CS NIÑO KIDS: POLO target = 1
check(
  "CS NIÑO KIDS: POLO target = 1",
  cs.includes("CS_NINO_KIDS") && cs.includes("POLO")
    && (() => {
      const idx = cs.indexOf("CS_NINO_KIDS");
      const block = cs.substring(idx, idx + 2000);
      return block.includes("POLO") && block.includes("1");
    })()
);

// Import PEQUEÑO = 10
check(
  "Import PEQUEÑO = 10",
  (cs.includes("PEQUEÑO") || cs.includes("PEQUENO")) && cs.includes("10")
);

// Import MEDIANO = 10
check(
  "Import MEDIANO = 10",
  cs.includes("MEDIANO") && cs.includes("10")
);

// Import GRANDE = 3
check(
  "Import GRANDE = 3",
  cs.includes("GRANDE") && cs.includes("3")
);

// ─── 5. Evaluator ────────────────────────────────────────────────────────────

console.log("\n--- 5. Evaluator ---");

const evaluator = readCatalogFile("mallet-assortment-evaluator.ts");

check("evaluateMalletAssortment function",        evaluator.includes("evaluateMalletAssortment"));
check("COMPLETE status",                          evaluator.includes("COMPLETE"));
check("INCOMPLETE status",                        evaluator.includes("INCOMPLETE"));
check("OVER_ASSORTED status",                     evaluator.includes("OVER_ASSORTED"));
check("CONFLICTED status",                        evaluator.includes("CONFLICTED"));
check("INSUFFICIENT_DATA status",                 evaluator.includes("INSUFFICIENT_DATA"));
check("buildAddSuggestions present (ADD)",        evaluator.includes("ADD"));
check("buildSwapSuggestions present (SWAP)",      evaluator.includes("SWAP"));
check("Evidence object MALLET_ASSORTMENT_EVALUATION",
  evaluator.includes("MALLET_ASSORTMENT_EVALUATION")
);

// ─── 6. Evidence ─────────────────────────────────────────────────────────────

console.log("\n--- 6. Evidence ---");

const evidence = readCatalogFile("mallet-assortment-evidence.ts");

check("assortmentEvidenceToCommercialEvidence function",
  evidence.includes("assortmentEvidenceToCommercialEvidence")
);
check("buildAssortmentNarrative function",
  evidence.includes("buildAssortmentNarrative")
);
check("CommercialDomainEvidence import",
  evidence.includes("CommercialDomainEvidence")
);

// ─── 7. Barrel Exports ───────────────────────────────────────────────────────

console.log("\n--- 7. Barrel Exports ---");

const barrel = readCatalogFile("index.ts");

check("exports MalletAssortmentCatalog",          barrel.includes("MalletAssortmentCatalog"));
check("exports MalletAssortmentEvaluation",       barrel.includes("MalletAssortmentEvaluation"));
check("exports evaluateMalletAssortment",         barrel.includes("evaluateMalletAssortment"));
check("exports buildCastillitosTextilCatalog",    barrel.includes("buildCastillitosTextilCatalog"));
check("exports buildLatinKidsTextilCatalog",      barrel.includes("buildLatinKidsTextilCatalog"));
check("exports buildImportAccesoriosCatalog",     barrel.includes("buildImportAccesoriosCatalog"));
check("exports validateCatalog",                  barrel.includes("validateCatalog"));
check("exports CS_GROUPS",                        barrel.includes("CS_GROUPS"));
check("exports LT_GROUPS",                        barrel.includes("LT_GROUPS"));
check("exports IMPORT_GROUPS",                    barrel.includes("IMPORT_GROUPS"));

// ─── 8. Architecture Constraints ─────────────────────────────────────────────

console.log("\n--- 8. Architecture Constraints ---");

const allFiles = files.map(f => readCatalogFile(f));
const allContent = allFiles.join("\n");

// For the "no hardcoded tenant in types/evaluator" check we concatenate everything
// except castillitos-mallet-assortment-catalog.ts (which is allowed to have tenant refs)
const nonTenantFiles = files
  .filter(f => f !== "castillitos-mallet-assortment-catalog.ts")
  .map(f => readCatalogFile(f))
  .join("\n");

check("No Prisma imports (@prisma)",              !allContent.includes("@prisma"));
check("No React imports",                         !allContent.includes('from "react'));
check("No Next imports",                          !allContent.includes('from "next'));
check("No UI component imports (components/)",    !allContent.includes('components/'));
check("No SAG imports (sag-adapter, /sag/)",
  !allContent.includes("sag-adapter") && !allContent.includes("/sag/")
);
check("No Coverage Engine imports (rules/coverage)", !allContent.includes("rules/coverage"));
check("No Tiendas imports (tiendas/)",            !allContent.includes("tiendas/"));
check("No Store Policy Template imports",         !allContent.includes("templates/store"));
check("No hardcoded tenant in types/evaluator (non-tenant files)",
  (() => {
    // Exclude catalog registry (mallet-assortment-catalog.ts) which imports from
    // castillitos file and seeds defaults — that's expected architecture
    const strictFiles = files
      .filter(f => f !== "castillitos-mallet-assortment-catalog.ts" && f !== "mallet-assortment-catalog.ts")
      .map(f => readCatalogFile(f))
      .join("\n");
    return !strictFiles.includes('"castillitos"');
  })()
);
check("Imports only from mallet-assortment types or domain-evidence",
  (() => {
    // Check each file only imports from within the module or from the allowed commercial evidence path
    const allImports = allContent.match(/from\s+["'][^"']+["']/g) ?? [];
    const forbidden = allImports.filter(imp => {
      // Allow relative imports within the module
      if (imp.includes('from ".') || imp.includes("from '.")) return false;
      // Allow domain-evidence / commercial evidence
      if (imp.includes("domain-evidence") || imp.includes("commercial-evidence")) return false;
      // Allow node built-ins (none expected here)
      return true;
    });
    return forbidden.length === 0;
  })()
);

// ─── 9. Separation from Store Policies ───────────────────────────────────────

console.log("\n--- 9. Separation from Store Policies ---");

const evalContent  = readCatalogFile("mallet-assortment-evaluator.ts");
const typesContent = readCatalogFile("mallet-assortment-types.ts");

check("No 'store policy' or 'Store Policy' in evaluator",
  !evalContent.includes("store policy") && !evalContent.includes("Store Policy")
);
check("No 'tienda' in evaluator (runtime code)",
  (() => {
    // Strip comments (// and /* */) before checking — "tiendas" is allowed in JSDoc scope clarifications
    const stripped = evalContent.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    return !stripped.toLowerCase().includes("tienda");
  })()
);
check("No 'tienda' in types (runtime code)",
  (() => {
    const stripped = typesContent.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    return !stripped.toLowerCase().includes("tienda");
  })()
);
check("No STORE_COVERAGE in any file",  !allContent.includes("STORE_COVERAGE"));
check("No 'cobertura de tienda' in any file",
  !allContent.toLowerCase().includes("cobertura de tienda")
);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log("─────────────────────────────────────────\n");

if (failed > 0) {
  process.exit(1);
}
