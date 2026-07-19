/**
 * scripts/validate-sales-domain-01.ts
 *
 * Validation for SALES-DOMAIN-01.
 *
 * Usage: npx tsx scripts/validate-sales-domain-01.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const BASE = resolve(__dirname, "../lib/comercial/data-layer/domains/sales");

console.log("\n=== SALES-DOMAIN-01 Validation ===\n");

// ── 1. Structure ─────────────────────────────────────────────────────────────

console.log("--- 1. Domain structure ---");

const expectedFiles = [
  "sales-entities.ts",
  "sales-normalizer.ts",
  "sales-quality-rules.ts",
  "sales-adapter.ts",
  "sales-registration.ts",
  "index.ts",
];

for (const file of expectedFiles) {
  check(`File exists: ${file}`, existsSync(join(BASE, file)));
}

// ── 2. Canonical entities ────────────────────────────────────────────────────

console.log("\n--- 2. Canonical entities ---");

const entities = readFileSync(join(BASE, "sales-entities.ts"), "utf-8");
check("SalesDocument interface", entities.includes("interface SalesDocument"));
check("SaleLine interface", entities.includes("interface SaleLine"));
check("SalesReturn interface", entities.includes("interface SalesReturn"));
check("SalesAttribution interface", entities.includes("interface SalesAttribution"));
check("SalesDocumentType type", entities.includes("SalesDocumentType"));
check("SalesDocumentStatus type", entities.includes("SalesDocumentStatus"));
check("SalesDocumentFinancials interface", entities.includes("interface SalesDocumentFinancials"));
check("deriveSalesDocumentStatus function", entities.includes("deriveSalesDocumentStatus"));

// Verify entities use foundation contracts
check("Uses CommercialIdentity", entities.includes("CommercialIdentity"));
check("Uses CommercialTimestamp", entities.includes("CommercialTimestamp"));
check("Uses ExternalReference", entities.includes("ExternalReference"));
check("Uses DataSourceMetadata", entities.includes("DataSourceMetadata"));

// ── 3. Normalizer ────────────────────────────────────────────────────────────

console.log("\n--- 3. Normalizer ---");

const normalizer = readFileSync(join(BASE, "sales-normalizer.ts"), "utf-8");
check("normalizeSalesDocument function", normalizer.includes("normalizeSalesDocument"));
check("SalesDocumentRawInput interface", normalizer.includes("interface SalesDocumentRawInput"));
check("SaleLineRawInput interface", normalizer.includes("interface SaleLineRawInput"));
check("Uses shared normalizers", normalizer.includes("normalizeReferenceCode"));
check("Uses shared identifiers", normalizer.includes("buildCanonicalId"));
check("Uses buildExternalReference", normalizer.includes("buildExternalReference"));
check("Handles missing doc number gracefully", normalizer.includes("Missing or invalid document number"));
check("Handles missing doc type gracefully", normalizer.includes("Missing or invalid document type"));
check("Handles missing date gracefully", normalizer.includes("Missing or invalid document date"));
check("Handles missing NIT gracefully", normalizer.includes("Missing customer code (NIT)"));

// ── 4. Quality rules ─────────────────────────────────────────────────────────

console.log("\n--- 4. Quality rules ---");

const quality = readFileSync(join(BASE, "sales-quality-rules.ts"), "utf-8");
check("evaluateSalesQuality function", quality.includes("evaluateSalesQuality"));
check("evaluateSalesFreshness function", quality.includes("evaluateSalesFreshness"));
check("isValidSale function", quality.includes("isValidSale"));
check("Uses evaluateCommercialQuality", quality.includes("evaluateCommercialQuality"));
check("Uses evaluateCommercialFreshness", quality.includes("evaluateCommercialFreshness"));
check("30min SLA defined (1800s)", quality.includes("1800"));
check("Required fields defined", quality.includes("documentNumber") && quality.includes("customerCode"));

// ── 5. Adapter ───────────────────────────────────────────────────────────────

console.log("\n--- 5. Adapter ---");

const adapter = readFileSync(join(BASE, "sales-adapter.ts"), "utf-8");
check("createSagSalesAdapter factory", adapter.includes("createSagSalesAdapter"));
check("Implements CommercialAdapter", adapter.includes("CommercialAdapter"));
check("Has discover()", adapter.includes("async discover("));
check("Has validate()", adapter.includes("async validate("));
check("Has normalize()", adapter.includes("async normalize("));
check("Has synchronize()", adapter.includes("async synchronize("));
check("Has health()", adapter.includes("async health("));
check("Has capabilities()", adapter.includes("capabilities()"));
check("Dependency injection (fetchDocuments)", adapter.includes("fetchDocuments"));
check("Does NOT call SAG directly", !adapter.includes("fetch(") && !adapter.includes("axios"));

// ── 6. Registration ──────────────────────────────────────────────────────────

console.log("\n--- 6. Registration ---");

const registration = readFileSync(join(BASE, "sales-registration.ts"), "utf-8");
check("registerSalesAdapter function", registration.includes("registerSalesAdapter"));
check("Uses CommercialAdapterRegistry", registration.includes("CommercialAdapterRegistry"));
check("Registers SALES_SYNC capability", registration.includes("SALES_SYNC"));
check("Registers SALES_DISCOVERY capability", registration.includes("SALES_DISCOVERY"));

// ── 7. Barrel export ─────────────────────────────────────────────────────────

console.log("\n--- 7. Barrel export ---");

const barrel = readFileSync(join(BASE, "index.ts"), "utf-8");
check("Exports SalesDocument", barrel.includes("SalesDocument"));
check("Exports SaleLine", barrel.includes("SaleLine"));
check("Exports SalesReturn", barrel.includes("SalesReturn"));
check("Exports SalesAttribution", barrel.includes("SalesAttribution"));
check("Exports normalizeSalesDocument", barrel.includes("normalizeSalesDocument"));
check("Exports evaluateSalesQuality", barrel.includes("evaluateSalesQuality"));
check("Exports createSagSalesAdapter", barrel.includes("createSagSalesAdapter"));
check("Exports registerSalesAdapter", barrel.includes("registerSalesAdapter"));
check("Exports isValidSale", barrel.includes("isValidSale"));

// ── 8. No prohibited imports ─────────────────────────────────────────────────

console.log("\n--- 8. Prohibited imports ---");

const allContent = expectedFiles.map(f => readFileSync(join(BASE, f), "utf-8")).join("\n");
check("No Prisma imports", !allContent.includes("@prisma") && !allContent.includes("PrismaClient"));
check("No React imports", !allContent.includes("from \"react\"") && !allContent.includes("\"use client\""));
check("No UI imports", !allContent.includes("@/components") && !allContent.includes("lib/ui/"));
check("No direct SAG HTTP calls", !allContent.includes("SAG_API_URL") && !allContent.includes("soap-client"));
check("No Rules Engine imports", !allContent.includes("coverage-engine") && !allContent.includes("rotation-engine"));

// ── 9. Uses foundation infrastructure ────────────────────────────────────────

console.log("\n--- 9. Foundation integration ---");

check("Imports from ../../contracts", allContent.includes("../../contracts"));
check("Imports from ../../shared", allContent.includes("../../shared"));
check("Imports from ../../quality", allContent.includes("../../quality"));
check("Imports from ../../adapters", allContent.includes("../../adapters"));

// ── 10. Functional tests exist ───────────────────────────────────────────────

console.log("\n--- 10. Tests ---");

const testFile = resolve(__dirname, "test-sales-domain-01.ts");
check("Test file exists", existsSync(testFile));
const tests = readFileSync(testFile, "utf-8");
check("Tests normalization", tests.includes("Normalization"));
check("Tests quality", tests.includes("Quality"));
check("Tests valid sale filter", tests.includes("Valid Sale Filter"));
check("Tests adapter", tests.includes("Adapter"));
check("Tests registration", tests.includes("Registration"));
check("Tests multi-tenant isolation", tests.includes("Different tenant"));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("SALES-DOMAIN-01 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("SALES-DOMAIN-01 VALIDATION PASSED.\n");
}
