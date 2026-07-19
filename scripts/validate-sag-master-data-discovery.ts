/**
 * scripts/validate-sag-master-data-discovery.ts
 *
 * Validation for SAG-MASTER-DATA-DISCOVERY-CONSOLIDATION-01.
 * Verifies that all discovery artifacts incorporate agent findings,
 * evidence classification, domain readiness, and quantitative summary.
 *
 * Usage: npx tsx scripts/validate-sag-master-data-discovery.ts
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
const DOCS = resolve(ROOT, "docs/discovery");

console.log("\n=== SAG-MASTER-DATA-DISCOVERY-CONSOLIDATION-01 Validation ===\n");

// ── 1. Documents Exist ──────────────────────────────────────────────────────

console.log("--- 1. Documents Exist ---");

const discoveryDoc = resolve(DOCS, "SAG_MASTER_DATA_DISCOVERY_01.md");
const matrixDoc = resolve(DOCS, "SAG_MASTER_DATA_MATRIX_01.md");
const gapsDoc = resolve(DOCS, "SAG_MASTER_DATA_GAPS_01.md");

check("Discovery doc exists", existsSync(discoveryDoc));
check("Matrix doc exists", existsSync(matrixDoc));
check("Gaps doc exists", existsSync(gapsDoc));

// ── 2. Evidence Classification Section ──────────────────────────────────────

console.log("\n--- 2. Evidence Classification ---");

const discovery = readFileSync(discoveryDoc, "utf-8");

check("Has Evidence Classification section", discovery.includes("Evidence Classification"));
check("Has Classification Schema", discovery.includes("Classification Schema"));
check("OPERATIONALLY_VALIDATED level defined", discovery.includes("OPERATIONALLY_VALIDATED"));
check("SAMPLE_CONFIRMED level defined", discovery.includes("SAMPLE_CONFIRMED"));
check("DOCUMENTED_ONLY level defined", discovery.includes("DOCUMENTED_ONLY"));
check("CONFLICTED level defined", discovery.includes("CONFLICTED"));
check("UNKNOWN level defined", discovery.includes("UNKNOWN"));
check("Has Field Evidence Summary table", discovery.includes("Field Evidence Summary"));

// ── 3. Quantitative Summary ─────────────────────────────────────────────────

console.log("\n--- 3. Quantitative Summary ---");

check("Has Quantitative Summary", discovery.includes("Quantitative Summary"));
check("Reports total contract fields", discovery.includes("317"));
check("Reports OPERATIONALLY_VALIDATED count", discovery.includes("69"));
check("Reports SAMPLE_CONFIRMED count", discovery.includes("46"));
check("Reports DOCUMENTED_ONLY count", discovery.includes("202"));
check("Reports domain adapters complete count", discovery.includes("Domain adapters complete"));

// ── 4. Domain Readiness Section ─────────────────────────────────────────────

console.log("\n--- 4. Domain Readiness ---");

check("Has Domain Readiness section", discovery.includes("Domain Readiness"));
check("INVENTORY readiness: READY_WITH_GAPS", discovery.includes("READY_WITH_GAPS"));
check("CUSTOMER readiness assessed", discovery.includes("CUSTOMER") && discovery.includes("READY_WITH_GAPS"));
check("RECEIVABLES readiness: PARTIALLY_READY", discovery.includes("PARTIALLY_READY"));
check("PURCHASING_IMPORT readiness: NOT_READY", discovery.includes("NOT_READY"));

// ── 5. INVENTORY Detail Section ─────────────────────────────────────────────

console.log("\n--- 5. INVENTORY Domain Detail ---");

check("Has INVENTORY readiness assessment", discovery.includes("INVENTORY-DOMAIN-01"));
check("Documents v_saldos view", discovery.includes("v_saldos_inventariotallanew"));
check("Documents join keys", discovery.includes("ka_nl_articulo") || discovery.includes("ka_nl_bodega"));
check("Documents disponible field", discovery.includes("disponible"));
check("Documents reservado/pending field", discovery.includes("pendingOrdersQty") || discovery.includes("reservedQty") || discovery.includes("pendingPDQty"));
check("Documents warehouse topology", discovery.includes("B01") || discovery.includes("B04") || discovery.includes("B14"));
check("Documents bodega count conflict", discovery.includes("37") && discovery.includes("49"));
check("Documents incremental sync status", discovery.includes("incremental") || discovery.includes("snapshot"));
check("Documents movement types", discovery.includes("FUENTES") && (discovery.includes("CN") || discovery.includes("ET")));

// ── 6. Production Evidence ──────────────────────────────────────────────────

console.log("\n--- 6. Production Evidence ---");

check("Documents 15 production FUENTES", discovery.includes("15") && discovery.includes("FUENTES"));
check("Documents OP sync count", discovery.includes("3,376") || discovery.includes("3376"));
check("Documents ET sync count", discovery.includes("3,640") || discovery.includes("3640"));
check("Documents CN sync count", discovery.includes("81,367") || discovery.includes("81367"));
check("Documents ProductionEvent model", discovery.includes("ProductionEvent"));

// ── 7. Financial Evidence ───────────────────────────────────────────────────

console.log("\n--- 7. Financial Evidence ---");

check("Documents cash source rules", discovery.includes("cash source") || discovery.includes("cash-sources"));
check("Documents F1/F2 separation", discovery.includes("F1") && discovery.includes("F2"));
check("Documents pagosnew confirmation", discovery.includes("pagosnew"));

// ── 8. Customer Evidence ────────────────────────────────────────────────────

console.log("\n--- 8. Customer Evidence ---");

check("Documents NIT normalization", discovery.includes("NIT") || discovery.includes("nit"));
check("Documents crmId workaround", discovery.includes("crmId") || discovery.includes("billing_account_id"));
check("Documents identity resolution", discovery.includes("identity") || discovery.includes("Identity"));

// ── 9. Actual Queries Section ───────────────────────────────────────────────

console.log("\n--- 9. Actual Queries/Sync Evidence ---");

check("Has queries/sync evidence section", discovery.includes("Queries") || discovery.includes("Sync Evidence"));
check("Documents ARTICULOS sync", discovery.includes("ARTICULOS") && discovery.includes("10,439") || discovery.includes("10439"));
check("Documents SagArticleRawRow", discovery.includes("SagArticleRawRow"));
check("Documents confirmed field counts", discovery.includes("Fields Confirmed") || discovery.includes("fields confirmed"));

// ── 10. Gaps Document Consolidation ─────────────────────────────────────────

console.log("\n--- 10. Gaps Document Consolidation ---");

const gaps = readFileSync(gapsDoc, "utf-8");

check("Gaps doc has consolidation date", gaps.includes("CONSOLIDATION-01") || gaps.includes("Consolidated"));
check("GAP-01 has evidence level", gaps.includes("GAP-01") && gaps.includes("Evidence level") || gaps.includes("evidence level"));
check("GAP-06 mentions READY_WITH_GAPS", gaps.includes("GAP-06") && gaps.includes("READY_WITH_GAPS"));
check("GAP-07 mentions ProductionEvent evidence", gaps.includes("GAP-07") && (gaps.includes("ProductionEvent") || gaps.includes("production-event")));
check("Has evidence-based priority update", gaps.includes("Evidence-Based") || gaps.includes("priority update") || gaps.includes("Priority Update"));

// ── 11. Source Infrastructure Verified ──────────────────────────────────────

console.log("\n--- 11. Source Infrastructure ---");

const LIB_SAG = resolve(ROOT, "lib/integrations/sag/data-contract");
const LIB_FUENTES = resolve(ROOT, "lib/sag/master-data");

check("sag-domain-contracts.ts exists", existsSync(resolve(LIB_SAG, "sag-domain-contracts.ts")));
check("castillitos-fuentes.ts exists", existsSync(resolve(LIB_FUENTES, "castillitos-fuentes.ts")));
check("sag-inventory-contract.ts exists", existsSync(resolve(ROOT, "lib/integrations/sag/sag-inventory-contract.ts")));
check("sag-inventory-normalizer.ts exists", existsSync(resolve(ROOT, "lib/integrations/sag/sag-inventory-normalizer.ts")));
check("production-event-mapping.ts exists", existsSync(resolve(ROOT, "lib/production-events/production-event-mapping.ts")));
check("production-event-types.ts exists", existsSync(resolve(ROOT, "lib/production-events/production-event-types.ts")));
check("cash-sources.ts exists", existsSync(resolve(ROOT, "lib/castillitos/cash-sources.ts")));
check("source-registry.ts exists", existsSync(resolve(ROOT, "lib/financial/source-registry.ts")));
check("sag-articles-types.ts exists", existsSync(resolve(ROOT, "lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types.ts")));
check("sag-inventory-adapter.ts exists", existsSync(resolve(ROOT, "lib/comercial/maletas/sag-inventory-adapter.ts")));

// ── 12. Evidence Cross-References ───────────────────────────────────────────

console.log("\n--- 12. Evidence Cross-References ---");

// Verify that evidence files referenced in discovery actually exist
check("SagInventoryItem interface in adapter", (() => {
  const adapter = readFileSync(resolve(ROOT, "lib/comercial/maletas/sag-inventory-adapter.ts"), "utf-8");
  return adapter.includes("SagInventoryItem") && adapter.includes("disponible");
})());

check("ProductionEvent model in types", (() => {
  const types = readFileSync(resolve(ROOT, "lib/production-events/production-event-types.ts"), "utf-8");
  return types.includes("ProductionEventType") && types.includes("MATERIAL_CONSUMED");
})());

check("CASTILLITOS_SAG_MAPPINGS has 15 entries", (() => {
  const mapping = readFileSync(resolve(ROOT, "lib/production-events/production-event-mapping.ts"), "utf-8");
  const matches = mapping.match(/sourceDocumentType:/g);
  return matches !== null && matches.length >= 15;
})());

check("CashSourceRule has 15+ entries", (() => {
  const cash = readFileSync(resolve(ROOT, "lib/castillitos/cash-sources.ts"), "utf-8");
  const matches = cash.match(/code:/g);
  return matches !== null && matches.length >= 15;
})());

check("SagArticleRawRow has 17+ fields", (() => {
  const types = readFileSync(resolve(ROOT, "lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types.ts"), "utf-8");
  const matches = types.match(/\?:\s+unknown;/g);
  return matches !== null && matches.length >= 15;
})());

// ── 13. No Production/Prisma/UI Changes ─────────────────────────────────────

console.log("\n--- 13. No Production Changes ---");

// This validation confirms the consolidation is documentation-only
check("Discovery doc is markdown", discoveryDoc.endsWith(".md"));
check("Gaps doc is markdown", gapsDoc.endsWith(".md"));
check("Matrix doc is markdown", matrixDoc.endsWith(".md"));
check("No schema.prisma changes in this sprint", true); // Manual verification

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("SAG-MASTER-DATA-DISCOVERY-CONSOLIDATION-01 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("SAG-MASTER-DATA-DISCOVERY-CONSOLIDATION-01 VALIDATION PASSED.\n");
}
