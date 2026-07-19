/**
 * scripts/audit-sag-master-data-discovery.ts
 *
 * Validation for SAG-MASTER-DATA-DISCOVERY-01.
 * Verifies that all discovery artifacts exist and are complete.
 *
 * Usage: npx tsx scripts/audit-sag-master-data-discovery.ts
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
const LIB_SAG = resolve(ROOT, "lib/integrations/sag/data-contract");
const LIB_FUENTES = resolve(ROOT, "lib/sag/master-data");
const LIB_DOMAINS = resolve(ROOT, "lib/comercial/data-layer/domains");

console.log("\n=== SAG-MASTER-DATA-DISCOVERY-01 Audit ===\n");

// ── 1. Discovery Documents Exist ─────────────────────────────────────────────

console.log("--- 1. Discovery Documents ---");

const discoveryDoc = resolve(DOCS, "SAG_MASTER_DATA_DISCOVERY_01.md");
const matrixDoc = resolve(DOCS, "SAG_MASTER_DATA_MATRIX_01.md");
const gapsDoc = resolve(DOCS, "SAG_MASTER_DATA_GAPS_01.md");

check("Discovery doc exists", existsSync(discoveryDoc));
check("Matrix doc exists", existsSync(matrixDoc));
check("Gaps doc exists", existsSync(gapsDoc));

// ── 2. Discovery Document Completeness ───────────────────────────────────────

console.log("\n--- 2. Discovery Document (10 Phases) ---");

const discovery = readFileSync(discoveryDoc, "utf-8");

check("Phase 1 — Entity Catalog", discovery.includes("Phase 1") && discovery.includes("Entity Catalog"));
check("Phase 2 — Relationships", discovery.includes("Phase 2") && discovery.includes("Relationships"));
check("Phase 3 — Domain Classification", discovery.includes("Phase 3") && discovery.includes("Domain Classification"));
check("Phase 4 — Priority Classification", discovery.includes("Phase 4") && discovery.includes("Priority"));
check("Phase 5 — Semantic Mapping", discovery.includes("Phase 5") && discovery.includes("Semantic Mapping"));
check("Phase 6 — Ownership Matrix", discovery.includes("Phase 6") && discovery.includes("Ownership"));
check("Phase 7 — Consumer Engines", discovery.includes("Phase 7") && discovery.includes("Consumer Engines"));
check("Phase 8 — Business Questions", discovery.includes("Phase 8") && discovery.includes("Business Questions"));
check("Phase 9 — Knowledge Gaps", discovery.includes("Phase 9") && discovery.includes("Knowledge Gaps"));
check("Phase 10 — Sync Roadmap", discovery.includes("Phase 10") && discovery.includes("Sync Roadmap"));

// ── 3. Key Entities Covered ──────────────────────────────────────────────────

console.log("\n--- 3. Key Entities Covered ---");

check("Covers TERCEROS", discovery.includes("TERCEROS"));
check("Covers MOVIMIENTOS", discovery.includes("MOVIMIENTOS"));
check("Covers MOVIMIENTOS_ITEMS", discovery.includes("MOVIMIENTOS_ITEMS"));
check("Covers ARTICULOS", discovery.includes("ARTICULOS"));
check("Covers BODEGAS", discovery.includes("BODEGAS"));
check("Covers VENDEDORES", discovery.includes("VENDEDORES"));
check("Covers FUENTES", discovery.includes("FUENTES"));
check("Covers pagosnew", discovery.includes("pagosnew"));
check("Covers v_saldos_inventariotallanew", discovery.includes("v_saldos_inventariotallanew"));

// ── 4. All 10 SAG Domains Covered ───────────────────────────────────────────

console.log("\n--- 4. SAG Domains ---");

const sagDomains = ["ventas", "pagos", "recaudos", "cartera", "bancos",
                    "inventario", "compras", "clientes", "productos", "produccion"];

for (const domain of sagDomains) {
  check(`SAG domain: ${domain}`, discovery.includes(domain));
}

// ── 5. All 10 Agentik Domains Covered ───────────────────────────────────────

console.log("\n--- 5. Agentik Domains ---");

const agentikDomains = ["PRODUCT", "CUSTOMER", "INVENTORY", "SALES",
                        "PURCHASING_IMPORT", "STORE_OPERATIONS",
                        "PRODUCTION", "RECEIVABLES", "WORKFORCE", "LOGISTICS"];

for (const domain of agentikDomains) {
  check(`Agentik domain: ${domain}`, discovery.includes(domain));
}

// ── 6. Consumer Engines Mapped ──────────────────────────────────────────────

console.log("\n--- 6. Consumer Engines ---");

const engines = ["CoverageEngine", "RotationEngine", "RepurchaseEngine",
                 "MarkdownEngine", "TransferEngine", "ProductionSignalEngine",
                 "RulesEvidenceEngine", "CustomerIntelligence", "SalesIntelligence",
                 "CommercialCopilot", "MarketingStudio"];

for (const engine of engines) {
  check(`Engine mapped: ${engine}`, discovery.includes(engine));
}

// ── 7. Matrix Document Completeness ─────────────────────────────────────────

console.log("\n--- 7. Matrix Document ---");

const matrix = readFileSync(matrixDoc, "utf-8");

check("Matrix covers VENTAS domain", matrix.includes("VENTAS Domain"));
check("Matrix covers PAGOS domain", matrix.includes("PAGOS Domain"));
check("Matrix covers RECAUDOS domain", matrix.includes("RECAUDOS Domain"));
check("Matrix covers CARTERA domain", matrix.includes("CARTERA Domain"));
check("Matrix covers INVENTARIO domain", matrix.includes("INVENTARIO Domain"));
check("Matrix covers BANCOS domain", matrix.includes("BANCOS Domain"));
check("Matrix covers COMPRAS domain", matrix.includes("COMPRAS Domain"));
check("Matrix covers CLIENTES domain", matrix.includes("CLIENTES Domain"));
check("Matrix covers PRODUCTOS domain", matrix.includes("PRODUCTOS Domain"));
check("Matrix covers PRODUCCION domain", matrix.includes("PRODUCCION Domain"));
check("Matrix has Cross-Domain Join Matrix", matrix.includes("Cross-Domain Join Matrix"));

// Verify matrix columns: Field -> Concept -> Domain -> Engine -> Priority -> Questions
check("Matrix has SAG Field column", matrix.includes("SAG Field"));
check("Matrix has Concept column", matrix.includes("Concept"));
check("Matrix has Agentik Domain column", matrix.includes("Agentik Domain"));
check("Matrix has Consumer Engines column", matrix.includes("Consumer Engines"));
check("Matrix has Priority column", matrix.includes("Priority"));
check("Matrix has Business Questions column", matrix.includes("Business Questions"));

// ── 8. Gaps Document Completeness ───────────────────────────────────────────

console.log("\n--- 8. Gaps Document ---");

const gaps = readFileSync(gapsDoc, "utf-8");

check("Gaps has P1 Critical section", gaps.includes("P1") && gaps.includes("Critical"));
check("Gaps has P2 Strategic section", gaps.includes("P2") && gaps.includes("Strategic"));
check("Gaps has P3 Future section", gaps.includes("P3") && gaps.includes("Future"));
check("Gaps identifies CLIENTES under-specification", gaps.includes("GAP-01") && gaps.includes("CLIENTES"));
check("Gaps identifies BANCOS uncertainty", gaps.includes("GAP-02") && gaps.includes("BANCOS"));
check("Gaps identifies RECAUDOS separation", gaps.includes("GAP-03") && gaps.includes("RECAUDOS"));
check("Gaps identifies CARTERA granularity", gaps.includes("GAP-04") && gaps.includes("CARTERA"));
check("Gaps identifies INVENTORY adapter gap", gaps.includes("GAP-06") && gaps.includes("INVENTORY"));
check("Gaps identifies PRODUCCION under-specification", gaps.includes("GAP-07") && gaps.includes("PRODUCCION"));
check("Gaps has resolution order", gaps.includes("Recommended Resolution Order"));
check("Gaps has gap summary table", gaps.includes("Gap Summary by Domain"));

// ── 9. Source Infrastructure Exists ─────────────────────────────────────────

console.log("\n--- 9. Source Infrastructure ---");

check("sag-domain-contracts.ts exists", existsSync(resolve(LIB_SAG, "sag-domain-contracts.ts")));
check("sag-data-contract.ts exists", existsSync(resolve(LIB_SAG, "sag-data-contract.ts")));
check("sag-field-catalog.ts exists", existsSync(resolve(LIB_SAG, "sag-field-catalog.ts")));
check("castillitos-overrides.ts exists", existsSync(resolve(LIB_FUENTES, "castillitos-overrides.ts")));
check("castillitos-fuentes.ts exists", existsSync(resolve(LIB_FUENTES, "castillitos-fuentes.ts")));

// ── 10. Domain Implementations ──────────────────────────────────────────────

console.log("\n--- 10. Domain Implementations ---");

check("PRODUCT domain exists", existsSync(resolve(LIB_DOMAINS, "product/index.ts")));
check("SALES domain exists", existsSync(resolve(LIB_DOMAINS, "sales/index.ts")));
check("Domain descriptors exist", existsSync(resolve(LIB_DOMAINS, "commercial-domain-descriptors.ts")));
check("Domain registry exists", existsSync(resolve(LIB_DOMAINS, "commercial-domain-registry.ts")));

// Verify descriptor completeness
const descriptors = readFileSync(resolve(LIB_DOMAINS, "commercial-domain-descriptors.ts"), "utf-8");
check("PRODUCT_DOMAIN descriptor", descriptors.includes("PRODUCT_DOMAIN"));
check("CUSTOMER_DOMAIN descriptor", descriptors.includes("CUSTOMER_DOMAIN"));
check("INVENTORY_DOMAIN descriptor", descriptors.includes("INVENTORY_DOMAIN"));
check("SALES_DOMAIN descriptor", descriptors.includes("SALES_DOMAIN"));
check("PURCHASING_IMPORT_DOMAIN descriptor", descriptors.includes("PURCHASING_IMPORT_DOMAIN"));
check("STORE_OPERATIONS_DOMAIN descriptor", descriptors.includes("STORE_OPERATIONS_DOMAIN"));

// ── 11. SAG Contract Completeness ───────────────────────────────────────────

console.log("\n--- 11. SAG Contract ---");

const contracts = readFileSync(resolve(LIB_SAG, "sag-domain-contracts.ts"), "utf-8");
check("SAG_MASTER_CONTRACT defined", contracts.includes("SAG_MASTER_CONTRACT"));
check("Contract version 2.6.0", contracts.includes("2.6.0"));
check("10 domain contracts", contracts.includes("pagosContract") && contracts.includes("produccionContract"));
check("View requests catalog", contracts.includes("SAG_VIEW_REQUESTS"));
check("getDomainContract accessor", contracts.includes("getDomainContract"));
check("getDomainsForModule accessor", contracts.includes("getDomainsForModule"));
check("getAgreedDomains accessor", contracts.includes("getAgreedDomains"));
check("getCriticalDomains accessor", contracts.includes("getCriticalDomains"));

// ── 12. Document Sources (FUENTES) ──────────────────────────────────────────

console.log("\n--- 12. FUENTES Registry ---");

const fuentes = readFileSync(resolve(LIB_FUENTES, "castillitos-fuentes.ts"), "utf-8");
check("FUENTES registry defined", fuentes.includes("CASTILLITOS_FUENTES_REGISTRY"));
check("OFICIAL category", fuentes.includes("OFICIAL"));
check("PRODUCCION category", fuentes.includes("PRODUCCION"));
check("INVENTARIO category", fuentes.includes("INVENTARIO"));
check("HISTORICA category", fuentes.includes("HISTORICA"));
check("OBSOLETA category", fuentes.includes("OBSOLETA"));
check("ARKETOPS category", fuentes.includes("ARKETOPS"));
check("Document family map", fuentes.includes("CASTILLITOS_DOCUMENT_FAMILY_MAP"));
check("OFFICIAL_INVOICE family", fuentes.includes("OFFICIAL_INVOICE"));
check("CREDIT_NOTE family", fuentes.includes("CREDIT_NOTE"));
check("DISPATCH_REMISION family", fuentes.includes("DISPATCH_REMISION"));
check("fuenteByKa lookup", fuentes.includes("fuenteByKa"));
check("fuenteByCodigo lookup", fuentes.includes("fuenteByCodigo"));
check("isActiveFuente helper", fuentes.includes("isActiveFuente"));
check("isOficialFuente helper", fuentes.includes("isOficialFuente"));
check("isFacturaVenta helper", fuentes.includes("isFacturaVenta"));

// ── 13. Sync Roadmap in Discovery ───────────────────────────────────────────

console.log("\n--- 13. Sync Roadmap ---");

check("INVENTORY-DOMAIN-01 planned", discovery.includes("INVENTORY-DOMAIN-01"));
check("CUSTOMER-DOMAIN-01 planned", discovery.includes("CUSTOMER-DOMAIN-01"));
check("RECEIVABLES-EXTENSION-01 planned", discovery.includes("RECEIVABLES-EXTENSION-01"));
check("PURCHASING-DOMAIN-01 planned", discovery.includes("PURCHASING-DOMAIN-01"));
check("PRODUCTION-DOMAIN-01 planned", discovery.includes("PRODUCTION-DOMAIN-01"));
check("STORE-OPS-DOMAIN-01 planned", discovery.includes("STORE-OPS-DOMAIN-01"));

// ── 14. Business Questions Coverage ─────────────────────────────────────────

console.log("\n--- 14. Business Questions ---");

check("Revenue questions", discovery.includes("Cuanto vendimos"));
check("Receivables questions", discovery.includes("Cuanto nos deben"));
check("Inventory questions", discovery.includes("productos estan agotados"));
check("Product questions", discovery.includes("necesitan contenido"));
check("Purchasing questions", discovery.includes("compras estan pendientes"));
check("Production questions", discovery.includes("unidades se produjeron"));

// ── 15. Cross-Domain Awareness ──────────────────────────────────────────────

console.log("\n--- 15. Cross-Domain Awareness ---");

check("Discovery mentions dual-state (ENTERPRISE-05)", discovery.includes("ENTERPRISE-05") || discovery.includes("Dual-State"));
check("Discovery mentions freshness SLA", discovery.includes("freshness") || discovery.includes("Freshness"));
check("Discovery maps SAG→Agentik domains", discovery.includes("SAG Contract Domain") && discovery.includes("Agentik Data Layer Domain"));
check("Matrix has join paths", matrix.includes("Join") && matrix.includes("Join Key"));
check("Gaps linked to resolution sprints", gaps.includes("Resolution") || gaps.includes("resolution"));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("SAG-MASTER-DATA-DISCOVERY-01 AUDIT FAILED.\n");
  process.exit(1);
} else {
  console.log("SAG-MASTER-DATA-DISCOVERY-01 AUDIT PASSED.\n");
}
