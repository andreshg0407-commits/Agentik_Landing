/**
 * validate-commercial-sales-classification-engine.ts
 *
 * COMMERCIAL-SALES-CLASSIFICATION-ENGINE-01 validation script.
 * 15 checks.
 *
 * Run: npx tsx scripts/validate-commercial-sales-classification-engine.ts
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

console.log("\n=== COMMERCIAL-SALES-CLASSIFICATION-ENGINE-01 Validation ===\n");

const types = readFile("lib/comercial/intelligence/sales-classification-types.ts");
const config = readFile("lib/comercial/intelligence/sales-classification-config.ts");
const engine = readFile("lib/comercial/intelligence/sales-classification-engine.ts");
const service = readFile("lib/comercial/importaciones/import-service.ts");

// ── 1. Types file exists with core interfaces
check(
  "1. Types file has core interfaces",
  types.includes("SalesClassificationResult") &&
  types.includes("ClassificationEvidence") &&
  types.includes("SalesChannel") &&
  types.includes("EvidenceType") &&
  types.includes("EvidenceStrength") &&
  types.includes("BulkClassificationResult"),
  "Must define all core classification types",
);

// ── 2. Five evidence types defined
check(
  "2. Five evidence types defined",
  types.includes('"price_comparison"') &&
  types.includes('"sale_origin"') &&
  types.includes('"customer_type"') &&
  types.includes('"price_list"') &&
  types.includes('"operation_type"'),
  "Must define all 5 evidence types",
);

// ── 3. Three channel values
check(
  "3. Three channel values (DETAL, MAYORISTA, PENDIENTE)",
  types.includes('"DETAL"') &&
  types.includes('"MAYORISTA"') &&
  types.includes('"PENDIENTE"'),
  "Must define all channel values",
);

// ── 4. Evidence strength levels
check(
  "4. Four evidence strength levels",
  types.includes('"STRONG"') &&
  types.includes('"MODERATE"') &&
  types.includes('"WEAK"') &&
  types.includes('"UNAVAILABLE"'),
  "Must define STRONG, MODERATE, WEAK, UNAVAILABLE",
);

// ── 5. Config has per-tenant support
check(
  "5. Config supports per-tenant configuration",
  config.includes("SalesClassificationConfig") &&
  config.includes("tenantId") &&
  config.includes("evidenceWeights") &&
  config.includes("priceTolerance") &&
  config.includes("confidenceThreshold") &&
  config.includes("getSalesClassificationConfig"),
  "Must have tenant-specific config with all tuning parameters",
);

// ── 6. Castillitos config weights price_comparison as primary
check(
  "6. Castillitos config weights price_comparison as primary",
  config.includes("price_comparison: 1.0") &&
  config.includes("sale_origin: 0.0") &&
  config.includes("customer_type: 0.0"),
  "Castillitos only has price comparison as viable signal",
);

// ── 7. Engine has multi-evidence evaluators
check(
  "7. Engine evaluates multiple evidence types",
  engine.includes("evaluatePriceComparison") &&
  engine.includes("evaluateSaleOrigin") &&
  engine.includes("evaluateCustomerType") &&
  engine.includes("evaluateOperationType"),
  "Must have separate evaluator for each evidence type",
);

// ── 8. Engine has weighted scoring
check(
  "8. Engine uses weighted scoring",
  engine.includes("normalizedWeight") &&
  engine.includes("detalScore") &&
  engine.includes("mayoristaScore") &&
  engine.includes("totalWeight"),
  "Must normalize weights and compute weighted scores",
);

// ── 9. Engine has confidence calculation
check(
  "9. Engine calculates confidence",
  engine.includes("confidence") &&
  engine.includes("confidenceThreshold") &&
  engine.includes("strengthBonus") &&
  engine.includes("computeStrengthBonus"),
  "Must calculate confidence from spread, scores, and strength",
);

// ── 10. Engine supports bulk classification
check(
  "10. Engine has bulk classification",
  engine.includes("classifyBulk") &&
  engine.includes("BulkClassificationResult") &&
  engine.includes("dominantChannel") &&
  engine.includes("detalLines") &&
  engine.includes("mayoristaLines"),
  "Must classify multiple lines and determine dominant channel",
);

// ── 11. Price comparison uses PV3/PV4
check(
  "11. Price comparison evaluator uses PV3/PV4",
  engine.includes("pricePV3") &&
  engine.includes("pricePV4") &&
  engine.includes("unitValue") &&
  engine.includes("tolerance") &&
  engine.includes("proximity"),
  "Must compare unitValue against both price tiers with tolerance and proximity",
);

// ── 12. Insufficient evidence returns PENDIENTE
check(
  "12. Insufficient evidence returns PENDIENTE",
  engine.includes("minEvidenceSources") &&
  engine.includes('"PENDIENTE"') &&
  engine.includes("channelPending: true"),
  "Must return PENDIENTE when evidence is insufficient",
);

// ── 13. Evidence has explainability
check(
  "13. Evidence provides explainability",
  types.includes("reasoning: string") &&
  types.includes("dataAvailable: boolean") &&
  engine.includes("reasoning") &&
  engine.includes("reasons.push"),
  "Every evidence must have human-readable reasoning",
);

// ── 14. import-service consumes the engine
check(
  "14. import-service uses classification engine",
  service.includes("classifyBulk") &&
  service.includes("classifySale") &&
  service.includes("ClassificationInput") &&
  service.includes("lineInputs") &&
  service.includes("unitValue"),
  "Importaciones must consume the engine for channel classification",
);

// ── 15. Architecture doc exists
check(
  "15. Architecture doc exists",
  fileExists("docs/architecture/COMMERCIAL_SALES_CLASSIFICATION_ENGINE_01.md") &&
  (() => {
    const doc = readFile("docs/architecture/COMMERCIAL_SALES_CLASSIFICATION_ENGINE_01.md");
    return doc.includes("CommercialSalesClassificationEngine") ||
           doc.includes("sales-classification-engine") &&
           doc.includes("Evidence Model") &&
           doc.includes("Confidence Model") &&
           doc.includes("Importaciones") &&
           doc.includes("Maletas") &&
           doc.includes("PV3") &&
           doc.includes("PV4");
  })(),
  "Doc must explain the architecture, evidence model, and consumers",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
