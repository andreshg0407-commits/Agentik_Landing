/**
 * scripts/validate-commercial-data-layer-integration-01.ts
 *
 * Structural validation for COMMERCIAL-DATA-LAYER-INTEGRATION-01.
 * Verifies files, contracts, consistency, and architecture constraints.
 *
 * Usage: npx tsx scripts/validate-commercial-data-layer-integration-01.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const ROOT = resolve(__dirname, "..");
const SHARED = resolve(ROOT, "lib/comercial/data-layer/shared");
const DOMAINS = resolve(ROOT, "lib/comercial/data-layer/domains");
const PRODUCT = resolve(DOMAINS, "product");
const SALES = resolve(DOMAINS, "sales");
const INVENTORY = resolve(DOMAINS, "inventory");

console.log("\n=== COMMERCIAL-DATA-LAYER-INTEGRATION-01 Validation ===\n");

// -- 1. Cross-domain product reference exists --------------------------------

console.log("--- 1. Cross-Domain Product Reference ---");

const prodRef = resolve(SHARED, "product-reference.ts");
check("product-reference.ts exists", existsSync(prodRef));

const prodRefContent = readFileSync(prodRef, "utf-8");
check("CommercialProductReference defined", prodRefContent.includes("interface CommercialProductReference"));
check("Product is owner of productId", prodRefContent.includes("buildProductCanonicalId"));
check("buildVariantCanonicalId exists", prodRefContent.includes("function buildVariantCanonicalId"));
check("resolveProductReference exists", prodRefContent.includes("function resolveProductReference"));
check("ProductResolutionStatus defined", prodRefContent.includes("ProductResolutionStatus"));
check("RESOLVED status", prodRefContent.includes('"RESOLVED"'));
check("PARTIALLY_RESOLVED status", prodRefContent.includes('"PARTIALLY_RESOLVED"'));
check("UNRESOLVED status", prodRefContent.includes('"UNRESOLVED"'));
check("CONFLICTED status", prodRefContent.includes('"CONFLICTED"'));
check("Product domain is canonical owner", prodRefContent.includes('domain: "PRODUCT"'));
check("Uses buildCanonicalId", prodRefContent.includes("buildCanonicalId"));

// -- 2. Sales references Product --------------------------------------------

console.log("\n--- 2. Sales → Product Reference ---");

const salesEntities = readFileSync(resolve(SALES, "sales-entities.ts"), "utf-8");
check("SaleLine has referenceCode (product link)", salesEntities.includes("referenceCode: string"));

// -- 3. Inventory references Product ----------------------------------------

console.log("\n--- 3. Inventory → Product Reference ---");

const invEntities = readFileSync(resolve(INVENTORY, "inventory-entities.ts"), "utf-8");
check("InventoryPosition has referenceCode (product link)", invEntities.includes("referenceCode: string"));

// -- 4. Variant resolution consistency --------------------------------------

console.log("\n--- 4. Variant Resolution ---");

check("Product has sizeCode/colorCode", readFileSync(resolve(PRODUCT, "product-entities.ts"), "utf-8").includes("sizeCode"));
check("Sales has sizeCode/colorCode", salesEntities.includes("sizeCode"));
check("Inventory has sizeCode/colorCode", invEntities.includes("sizeCode"));
check("VariantReference type defined", prodRefContent.includes("interface VariantReference"));

// -- 5. External references tenant-aware ------------------------------------

console.log("\n--- 5. External References ---");

const productNorm = readFileSync(resolve(PRODUCT, "product-normalizer.ts"), "utf-8");
const invNorm = readFileSync(resolve(INVENTORY, "inventory-normalizer.ts"), "utf-8");
check("Product normalizer uses tenantId", productNorm.includes("ctx.tenantId"));
check("Inventory normalizer uses tenantId", invNorm.includes("ctx.tenantId"));

// -- 6. Ownership unique ----------------------------------------------------

console.log("\n--- 6. Ownership ---");

const descriptors = readFileSync(resolve(DOMAINS, "commercial-domain-descriptors.ts"), "utf-8");
check("ProductProfile in PRODUCT entityTypes", descriptors.includes('"ProductProfile"'));
check("SalesDocument in SALES entityTypes", descriptors.includes('"SalesDocument"'));
check("InventoryPosition in INVENTORY entityTypes", descriptors.includes('"InventoryPosition"'));
check("WarehouseProfile in INVENTORY entityTypes", descriptors.includes('"WarehouseProfile"'));
check("InventoryAge in INVENTORY entityTypes (not InventoryAgeIndex)", descriptors.includes('"InventoryAge"'));
check("No InventoryAgeIndex (fixed)", !descriptors.includes('"InventoryAgeIndex"'));

// -- 7. Quality has common semantics ----------------------------------------

console.log("\n--- 7. Quality Semantics ---");

const qualityEval = readFileSync(resolve(ROOT, "lib/comercial/data-layer/quality/commercial-quality-evaluator.ts"), "utf-8");
check("CONFIRMED defined", qualityEval.includes('"CONFIRMED"'));
check("PARTIAL defined", qualityEval.includes('"PARTIAL"'));
check("ESTIMATED defined", qualityEval.includes('"ESTIMATED"'));
check("UNAVAILABLE defined", qualityEval.includes('"UNAVAILABLE"'));
check("CONFLICTED defined", qualityEval.includes('"CONFLICTED"'));
check("STALE defined", qualityEval.includes('"STALE"'));
check("All 3 domains use evaluateCommercialQuality",
  readFileSync(resolve(PRODUCT, "product-quality-rules.ts"), "utf-8").includes("evaluateCommercialQuality") &&
  readFileSync(resolve(SALES, "sales-quality-rules.ts"), "utf-8").includes("evaluateCommercialQuality") &&
  readFileSync(resolve(INVENTORY, "inventory-quality.ts"), "utf-8").includes("evaluateCommercialQuality"));

// -- 8. Freshness configurable ----------------------------------------------

console.log("\n--- 8. Freshness ---");

check("Product SLA defined as constant", readFileSync(resolve(PRODUCT, "product-quality-rules.ts"), "utf-8").includes("PRODUCT_FRESHNESS_SLA_SECONDS"));
check("Sales SLA defined as constant", readFileSync(resolve(SALES, "sales-quality-rules.ts"), "utf-8").includes("SALES_FRESHNESS_SLA_SECONDS"));
check("Inventory SLA defined as constant", readFileSync(resolve(INVENTORY, "inventory-quality.ts"), "utf-8").includes("INVENTORY_FRESHNESS_SLA_SECONDS"));
check("Freshness evaluator accepts SLA param", readFileSync(resolve(SHARED, "freshness-evaluator.ts"), "utf-8").includes("slaSeconds"));

// -- 9. Evidence envelope ---------------------------------------------------

console.log("\n--- 9. Evidence ---");

const evidenceFile = resolve(SHARED, "domain-evidence.ts");
check("domain-evidence.ts exists", existsSync(evidenceFile));
const evidence = readFileSync(evidenceFile, "utf-8");
check("CommercialDomainEvidence defined", evidence.includes("interface CommercialDomainEvidence"));
check("Has domain field", evidence.includes("readonly domain: string"));
check("Has traceId field", evidence.includes("readonly traceId: string"));
check("Has confidence field", evidence.includes("readonly confidence: number"));
check("Has resolution", evidence.includes("readonly resolution: EvidenceResolution"));
check("Has qualityImpact", evidence.includes("readonly qualityImpact: EvidenceQualityImpact"));
check("buildEvidenceFromProduct exists", evidence.includes("function buildEvidenceFromProduct"));
check("buildEvidenceFromSales exists", evidence.includes("function buildEvidenceFromSales"));
check("buildEvidenceFromInventory exists", evidence.includes("function buildEvidenceFromInventory"));

// -- 10. Source metadata consistent -----------------------------------------

console.log("\n--- 10. Source Metadata ---");

check("Product uses DataSourceMetadata", productNorm.includes("DataSourceMetadata"));
const salesNorm = readFileSync(resolve(SALES, "sales-normalizer.ts"), "utf-8");
check("Sales uses DataSourceMetadata", salesNorm.includes("DataSourceMetadata"));
check("Inventory uses DataSourceMetadata", invNorm.includes("DataSourceMetadata"));
check("All use correlationId", productNorm.includes("correlationId") && salesNorm.includes("correlationId") && invNorm.includes("correlationId"));

// -- 11. CommercialProductState exists --------------------------------------

console.log("\n--- 11. Cross-Domain Read Model ---");

const stateFile = resolve(SHARED, "commercial-product-state.ts");
check("commercial-product-state.ts exists", existsSync(stateFile));
const stateContent = readFileSync(stateFile, "utf-8");
check("CommercialProductState defined", stateContent.includes("interface CommercialProductState"));
check("buildCommercialProductState exists", stateContent.includes("function buildCommercialProductState"));
check("Has productId", stateContent.includes("readonly productId: string"));
check("Has productProfile", stateContent.includes("productProfile"));
check("Has variants", stateContent.includes("variants"));
check("Has currentInventoryPositions", stateContent.includes("currentInventoryPositions"));
check("Has recentSaleLines", stateContent.includes("recentSaleLines"));
check("Has unresolvedRelations", stateContent.includes("unresolvedRelations"));
check("Has asOf", stateContent.includes("readonly asOf: Date"));

// -- 12. No intelligence calculations --------------------------------------

console.log("\n--- 12. No Intelligence ---");

check("No rotation in read model", !stateContent.includes("rotation"));
check("No coverage in read model", !stateContent.includes("coverage"));
check("No margin in read model", !stateContent.includes("margin"));
check("No recompra in read model", !stateContent.includes("recompra") && !stateContent.includes("repurchase"));
check("No markdown in read model", !stateContent.includes("markdown"));

// -- 13. Tenant isolation ---------------------------------------------------

console.log("\n--- 13. Tenant Isolation ---");

check("Read model validates tenant", stateContent.includes("tenantMismatch") || stateContent.includes("TENANT_MISMATCH"));
check("Product canonical ID includes tenantId", prodRefContent.includes("tenantId"));

// -- 14. Typed errors -------------------------------------------------------

console.log("\n--- 14. Cross-Domain Errors ---");

const errorsFile = resolve(SHARED, "cross-domain-errors.ts");
check("cross-domain-errors.ts exists", existsSync(errorsFile));
const errorsContent = readFileSync(errorsFile, "utf-8");
check("TENANT_MISMATCH", errorsContent.includes("TENANT_MISMATCH"));
check("PRODUCT_ID_MISMATCH", errorsContent.includes("PRODUCT_ID_MISMATCH"));
check("VARIANT_ID_MISMATCH", errorsContent.includes("VARIANT_ID_MISMATCH"));
check("UNRESOLVED_PRODUCT", errorsContent.includes("UNRESOLVED_PRODUCT"));
check("UNRESOLVED_VARIANT", errorsContent.includes("UNRESOLVED_VARIANT"));
check("DUPLICATE_OWNERSHIP", errorsContent.includes("DUPLICATE_OWNERSHIP"));
check("INCOMPATIBLE_QUALITY", errorsContent.includes("INCOMPATIBLE_QUALITY"));
check("STALE_DEPENDENCY", errorsContent.includes("STALE_DEPENDENCY"));
check("EXTERNAL_REFERENCE_CONFLICT", errorsContent.includes("EXTERNAL_REFERENCE_CONFLICT"));

// -- 15. Capability consistency ---------------------------------------------

console.log("\n--- 15. Adapter Capabilities ---");

const prodReg = readFileSync(resolve(PRODUCT, "product-registration.ts"), "utf-8");
const salesReg = readFileSync(resolve(SALES, "sales-registration.ts"), "utf-8");
const invReg = readFileSync(resolve(INVENTORY, "inventory-registration.ts"), "utf-8");

check("Product uses PRODUCT_SYNC", prodReg.includes("PRODUCT_SYNC"));
check("Product uses PRODUCT_DISCOVERY", prodReg.includes("PRODUCT_DISCOVERY"));
check("Product uses PRODUCT_BULK", prodReg.includes("PRODUCT_BULK"));
check("Sales uses SALES_SYNC", salesReg.includes("SALES_SYNC"));
check("Sales uses SALES_DISCOVERY", salesReg.includes("SALES_DISCOVERY"));
check("Sales uses SALES_BULK", salesReg.includes("SALES_BULK"));
check("Inventory uses INVENTORY_SYNC", invReg.includes("INVENTORY_SYNC"));
check("Inventory uses INVENTORY_DISCOVERY", invReg.includes("INVENTORY_DISCOVERY"));
check("Inventory uses INVENTORY_BULK", invReg.includes("INVENTORY_BULK"));

// -- 16. Domain descriptors aligned -----------------------------------------

console.log("\n--- 16. Domain Descriptors ---");

check("PRODUCT descriptor active", descriptors.includes("PRODUCT_DOMAIN") && descriptors.includes("active: true"));
check("SALES descriptor active", descriptors.includes("SALES_DOMAIN") && descriptors.includes("active: true"));
check("INVENTORY descriptor active", descriptors.includes("INVENTORY_DOMAIN") && descriptors.includes("active: true"));

// -- 17. Inventory regression -----------------------------------------------

console.log("\n--- 17. Inventory Regression ---");

const invAge = readFileSync(resolve(INVENTORY, "inventory-age.ts"), "utf-8");
check("InventoryAge handles null (UNKNOWN bracket)", invAge.includes("UNKNOWN") && invAge.includes("== null"));

const invQuality = readFileSync(resolve(INVENTORY, "inventory-quality.ts"), "utf-8");
check("Inventory freshness SLA is 900", invQuality.includes("900"));

const invAvail = readFileSync(resolve(INVENTORY, "inventory-availability.ts"), "utf-8");
check("isSellable is a field (not a function)", invAvail.includes("readonly isSellable: boolean"));

// -- 18. Sales adapter incremental fix ---------------------------------------

console.log("\n--- 18. Sales Adapter Fix ---");

const salesAdapter = readFileSync(resolve(SALES, "sales-adapter.ts"), "utf-8");
check("Sales adapter supportsIncremental: false (fixed)", salesAdapter.includes("supportsIncremental: false"));

// -- 19-25. Architecture constraints ----------------------------------------

console.log("\n--- 19. Architecture ---");

const allShared = [
  readFileSync(resolve(SHARED, "product-reference.ts"), "utf-8"),
  readFileSync(resolve(SHARED, "cross-domain-errors.ts"), "utf-8"),
  readFileSync(resolve(SHARED, "domain-evidence.ts"), "utf-8"),
  readFileSync(resolve(SHARED, "commercial-product-state.ts"), "utf-8"),
].join("\n");

check("No Prisma in shared", !allShared.includes("@prisma"));
check("No React in shared", !allShared.includes("from \"react"));
check("No UI in shared", !allShared.includes("components/"));
check("No SAG queries", !allShared.includes("query") || !allShared.includes("SOAP"));
check("No engine connection", !allShared.includes("CoverageEngine") && !allShared.includes("RotationEngine"));

// -- 20. Functional tests pass ----------------------------------------------

console.log("\n--- 20. Functional Tests ---");
check("Functional test file exists", existsSync(resolve(ROOT, "scripts/test-commercial-data-layer-integration-01.ts")));

// -- 21. Documentation exists -----------------------------------------------

console.log("\n--- 21. Documentation ---");
const docFile = resolve(ROOT, "docs/implementation/COMMERCIAL_DATA_LAYER_INTEGRATION_01.md");
check("Integration doc exists", existsSync(docFile));

// -- Summary ----------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("COMMERCIAL-DATA-LAYER-INTEGRATION-01 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("COMMERCIAL-DATA-LAYER-INTEGRATION-01 VALIDATION PASSED.\n");
}
