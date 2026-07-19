/**
 * scripts/validate-product-domain-01.ts
 *
 * Validation for PRODUCT-DOMAIN-01.
 *
 * Usage: npx tsx scripts/validate-product-domain-01.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const BASE = resolve(__dirname, "../lib/comercial/data-layer/domains/product");

console.log("\n=== PRODUCT-DOMAIN-01 Validation ===\n");

// ── 1. Structure ─────────────────────────────────────────────────────────────

console.log("--- 1. Domain structure ---");

const expectedFiles = [
  "product-entities.ts",
  "product-normalizer.ts",
  "product-quality-rules.ts",
  "product-adapter.ts",
  "product-registration.ts",
  "index.ts",
];

for (const file of expectedFiles) {
  check(`File exists: ${file}`, existsSync(join(BASE, file)));
}

// ── 2. Canonical entities ────────────────────────────────────────────────────

console.log("\n--- 2. Canonical entities ---");

const entities = readFileSync(join(BASE, "product-entities.ts"), "utf-8");
check("ProductProfile interface", entities.includes("interface ProductProfile"));
check("ProductVariant interface", entities.includes("interface ProductVariant"));
check("ProductClassification interface", entities.includes("interface ProductClassification"));
check("ProductPricing interface", entities.includes("interface ProductPricing"));
check("ProductOperational interface", entities.includes("interface ProductOperational"));
check("ProductCommercialStatus type", entities.includes("ProductCommercialStatus"));
check("deriveCommercialStatus function", entities.includes("deriveCommercialStatus"));

// Verify entities use foundation contracts
check("Uses CommercialIdentity", entities.includes("CommercialIdentity"));
check("Uses CommercialTimestamp", entities.includes("CommercialTimestamp"));
check("Uses ExternalReference", entities.includes("ExternalReference"));
check("Uses DataSourceMetadata", entities.includes("DataSourceMetadata"));

// ── 3. Normalizer ────────────────────────────────────────────────────────────

console.log("\n--- 3. Normalizer ---");

const normalizer = readFileSync(join(BASE, "product-normalizer.ts"), "utf-8");
check("normalizeProductRaw function", normalizer.includes("normalizeProductRaw"));
check("ProductRawInput interface", normalizer.includes("interface ProductRawInput"));
check("Uses shared normalizers", normalizer.includes("normalizeReferenceCode"));
check("Uses shared identifiers", normalizer.includes("buildCanonicalId"));
check("Uses buildExternalReference", normalizer.includes("buildExternalReference"));
check("Handles missing code gracefully", normalizer.includes("Missing or invalid product code"));
check("Handles missing name gracefully", normalizer.includes("Missing product name"));

// ── 4. Quality rules ─────────────────────────────────────────────────────────

console.log("\n--- 4. Quality rules ---");

const quality = readFileSync(join(BASE, "product-quality-rules.ts"), "utf-8");
check("evaluateProductQuality function", quality.includes("evaluateProductQuality"));
check("evaluateProductFreshness function", quality.includes("evaluateProductFreshness"));
check("isCommercialProduct function", quality.includes("isCommercialProduct"));
check("Uses evaluateCommercialQuality", quality.includes("evaluateCommercialQuality"));
check("Uses evaluateCommercialFreshness", quality.includes("evaluateCommercialFreshness"));
check("24h SLA defined", quality.includes("86400"));
check("Required fields defined", quality.includes("referenceCode") && quality.includes("name"));

// ── 5. Adapter ───────────────────────────────────────────────────────────────

console.log("\n--- 5. Adapter ---");

const adapter = readFileSync(join(BASE, "product-adapter.ts"), "utf-8");
check("createSagProductAdapter factory", adapter.includes("createSagProductAdapter"));
check("Implements CommercialAdapter", adapter.includes("CommercialAdapter"));
check("Has discover()", adapter.includes("async discover("));
check("Has validate()", adapter.includes("async validate("));
check("Has normalize()", adapter.includes("async normalize("));
check("Has synchronize()", adapter.includes("async synchronize("));
check("Has health()", adapter.includes("async health("));
check("Has capabilities()", adapter.includes("capabilities()"));
check("Dependency injection (fetchArticles)", adapter.includes("fetchArticles"));
check("Does NOT call SAG directly", !adapter.includes("fetch(") && !adapter.includes("axios"));

// ── 6. Registration ──────────────────────────────────────────────────────────

console.log("\n--- 6. Registration ---");

const registration = readFileSync(join(BASE, "product-registration.ts"), "utf-8");
check("registerProductAdapter function", registration.includes("registerProductAdapter"));
check("Uses CommercialAdapterRegistry", registration.includes("CommercialAdapterRegistry"));
check("Registers capabilities", registration.includes("PRODUCT_SYNC"));

// ── 7. Barrel export ─────────────────────────────────────────────────────────

console.log("\n--- 7. Barrel export ---");

const barrel = readFileSync(join(BASE, "index.ts"), "utf-8");
check("Exports ProductProfile", barrel.includes("ProductProfile"));
check("Exports normalizeProductRaw", barrel.includes("normalizeProductRaw"));
check("Exports evaluateProductQuality", barrel.includes("evaluateProductQuality"));
check("Exports createSagProductAdapter", barrel.includes("createSagProductAdapter"));
check("Exports registerProductAdapter", barrel.includes("registerProductAdapter"));
check("Exports isCommercialProduct", barrel.includes("isCommercialProduct"));

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

const testFile = resolve(__dirname, "test-product-domain-01.ts");
check("Test file exists", existsSync(testFile));
const tests = readFileSync(testFile, "utf-8");
check("Tests normalization", tests.includes("Normalization"));
check("Tests quality", tests.includes("Quality"));
check("Tests commercial filter", tests.includes("Commercial Filter"));
check("Tests adapter", tests.includes("Adapter"));
check("Tests registration", tests.includes("Registration"));
check("Tests multi-tenant isolation", tests.includes("Different tenant"));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("PRODUCT-DOMAIN-01 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("PRODUCT-DOMAIN-01 VALIDATION PASSED.\n");
}
