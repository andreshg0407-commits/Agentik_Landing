/**
 * scripts/audit-customer-sag-enrichment-discovery.ts
 *
 * Structural audit for CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01.
 * Validates discovery deliverables and cross-references against codebase.
 *
 * Usage: npx tsx scripts/audit-customer-sag-enrichment-discovery.ts
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
const DISCOVERY = resolve(ROOT, "docs/discovery");
const SAG = resolve(ROOT, "lib/connectors/adapters/sag-pya-soap");
const CUSTOMER = resolve(ROOT, "lib/comercial/data-layer/domains/customer");
const SHARED = resolve(ROOT, "lib/comercial/data-layer/shared");

console.log("\n=== CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01 Audit ===\n");

// -- 1. Deliverable files exist -----------------------------------------------

console.log("--- 1. Deliverables ---");

const deliverables = [
  "CUSTOMER_SAG_ENRICHMENT_DISCOVERY_01.md",
  "CUSTOMER_KNOWLEDGE_GRAPH_01.md",
  "CUSTOMER_ENRICHMENT_GAPS_01.md",
];

for (const f of deliverables) {
  check(`${f} exists`, existsSync(resolve(DISCOVERY, f)));
}

check("Audit script exists", existsSync(resolve(ROOT, "scripts/audit-customer-sag-enrichment-discovery.ts")));

// -- 2. Discovery doc covers all SAG sources ----------------------------------

console.log("\n--- 2. Data Source Coverage ---");

const discovery = readFileSync(resolve(DISCOVERY, "CUSTOMER_SAG_ENRICHMENT_DISCOVERY_01.md"), "utf-8");

check("Covers SAG TERCEROS", discovery.includes("TERCEROS") && discovery.includes("Primary Customer Source"));
check("Covers SAG CARTERA", discovery.includes("CARTERA") && discovery.includes("Receivables"));
check("Covers SAG v_pagosnew", discovery.includes("v_pagosnew") && discovery.includes("Collections"));
check("Covers SAG MOVIMIENTOS", discovery.includes("MOVIMIENTOS") && discovery.includes("Sales Documents"));
check("Covers SuiteCRM", discovery.includes("SuiteCRM") && discovery.includes("CRM Layer"));
check("Covers Agentik-Native", discovery.includes("Agentik-Native") && discovery.includes("Pedidos"));

// -- 3. Discovery doc references key SAG fields --------------------------------

console.log("\n--- 3. SAG Field References ---");

check("References VENDEDOR field", discovery.includes("VENDEDOR"));
check("References NIT_VENDEDOR field", discovery.includes("NIT_VENDEDOR"));
check("References ZONA field", discovery.includes("ZONA"));
check("References FORMA_PAGO field", discovery.includes("FORMA_PAGO"));
check("References TIPO_TERCERO field", discovery.includes("TIPO_TERCERO"));
check("References TIPO_CLIENTE field", discovery.includes("TIPO_CLIENTE"));
check("References PRECIO_VENTA field", discovery.includes("PRECIO_VENTA"));
check("References CREDITO field", discovery.includes("CREDITO"));
check("References DIAS_CREDITO field", discovery.includes("DIAS_CREDITO"));
check("References ACTIVO field", discovery.includes("ACTIVO"));

// -- 4. Discovery doc documents normalizeNit ----------------------------------

console.log("\n--- 4. NIT Normalization ---");

check("Documents normalizeNit", discovery.includes("normalizeNit"));
check("Documents DV stripping", discovery.includes("DV") || discovery.includes("digito de verificacion"));
check("Documents 10-to-9 digit", discovery.includes("10") && discovery.includes("9"));

// -- 5. Discovery doc documents lookup blockers --------------------------------

console.log("\n--- 5. Lookup Table Blockers ---");

check("Documents formasPago placeholder", discovery.includes("formasPago") || discovery.includes("Formas de Pago"));
check("Documents zonas placeholder", discovery.includes("zonas") || discovery.includes("Zonas"));
check("Documents tiposTercero placeholder", discovery.includes("tiposTercero") || discovery.includes("Tipos Tercero"));
check("Documents tiposCliente placeholder", discovery.includes("tiposCliente") || discovery.includes("Tipos Cliente"));
check("Documents vendedores placeholder", discovery.includes("vendedores") || discovery.includes("Vendedores"));
check("Documents listasPrecios placeholder", discovery.includes("listasPrecios") || discovery.includes("Listas Precios"));

// -- 6. Knowledge graph covers identity chain ----------------------------------

console.log("\n--- 6. Identity Chain ---");

const graph = readFileSync(resolve(DISCOVERY, "CUSTOMER_KNOWLEDGE_GRAPH_01.md"), "utf-8");

check("Documents sagTerceroId", graph.includes("sagTerceroId"));
check("Documents nitNormalized", graph.includes("nitNormalized"));
check("Documents canonicalId", graph.includes("canonicalId"));
check("Documents crmId", graph.includes("crmId"));
check("Documents customerProfileId", graph.includes("customerProfileId"));
check("Documents identity match strategy", graph.includes("Identity Match Strategy") || graph.includes("Identity Resolution"));

// -- 7. Knowledge graph covers cross-domain relationships ---------------------

console.log("\n--- 7. Cross-Domain Relationships ---");

check("Customer -> Receivables relationship", graph.includes("Receivables") && graph.includes("CARTERA"));
check("Customer -> Collections relationship", graph.includes("Collections") && graph.includes("v_pagosnew"));
check("Customer -> Sales relationship", graph.includes("Sales") && graph.includes("MOVIMIENTOS"));
check("Customer -> CRM Account relationship", graph.includes("CRM Account"));
check("Customer -> CRM Quotes relationship", graph.includes("CRM Quotes") || graph.includes("CRMQuote"));
check("Customer -> Orders relationship", graph.includes("Orders") || graph.includes("Pedidos"));
check("Customer -> Sales Rep relationship", graph.includes("Sales Rep") || graph.includes("VENDEDOR"));
check("Customer -> Geography relationship", graph.includes("Geography") || graph.includes("DANE"));

// -- 8. Knowledge graph documents key bugs ------------------------------------

console.log("\n--- 8. Known Bugs ---");

check("Documents Bug 526 (ka_nl_tercero as NIT)", graph.includes("Bug 526") || graph.includes("ka_nl_tercero"));
check("Documents CRMQuote.customerId NULL bug", graph.includes("customerId") && graph.includes("NULL"));
check("Documents SAG city FK problem", graph.includes("ka_ni_ciudad") || graph.includes("integer FK"));

// -- 9. Enrichment gaps are classified P1/P2/P3 ------------------------------

console.log("\n--- 9. Gap Classification ---");

const gaps = readFileSync(resolve(DISCOVERY, "CUSTOMER_ENRICHMENT_GAPS_01.md"), "utf-8");

check("Has P1 section", gaps.includes("P1"));
check("Has P2 section", gaps.includes("P2"));
check("Has P3 section", gaps.includes("P3"));
check("P1 gaps have GAP IDs", gaps.includes("GAP-P1-01"));
check("P2 gaps have GAP IDs", gaps.includes("GAP-P2-01"));
check("P3 gaps have GAP IDs", gaps.includes("GAP-P3-01"));

// -- 10. Gaps reference specific source fields --------------------------------

console.log("\n--- 10. Gap Source References ---");

check("GAP-P1-01 references VENDEDOR", gaps.includes("VENDEDOR") && gaps.includes("P1-01"));
check("GAP-P1-02 references CREDITO/DIAS_CREDITO", gaps.includes("CREDITO") && gaps.includes("P1-02"));
check("GAP-P1-03 references ZONA", gaps.includes("ZONA") && gaps.includes("P1-03"));
check("GAP-P1-04 references ACTIVO", gaps.includes("ACTIVO") && gaps.includes("P1-04"));
check("GAP-P1-05 references PRECIO_VENTA", gaps.includes("PRECIO_VENTA") && gaps.includes("P1-05"));

// -- 11. Gaps document fix complexity -----------------------------------------

console.log("\n--- 11. Fix Complexity ---");

check("Gaps include LOW complexity", gaps.includes("LOW"));
check("Gaps include MEDIUM complexity", gaps.includes("MEDIUM"));
check("Gaps include HIGH complexity", gaps.includes("HIGH"));
check("Has recommended next sprint", gaps.includes("CUSTOMER-SAG-ENRICHMENT-02") || gaps.includes("Next Sprint"));

// -- 12. Cross-reference: SAG query-catalog consistency -----------------------

console.log("\n--- 12. SAG Query Catalog Consistency ---");

const catalog = readFileSync(resolve(SAG, "query-catalog.ts"), "utf-8");

check("query-catalog has CUSTOMERS query", catalog.includes("CUSTOMERS") || catalog.includes("TERCEROS"));
check("query-catalog has CARTERA/RECEIVABLES", catalog.includes("RECEIVABLES") || catalog.includes("CARTERA"));
check("query-catalog has COLLECTIONS", catalog.includes("COLLECTIONS") || catalog.includes("v_pagosnew"));

// -- 13. Cross-reference: Customer domain entities exist ----------------------

console.log("\n--- 13. Customer Domain Exists ---");

check("customer-entities.ts exists", existsSync(resolve(CUSTOMER, "customer-entities.ts")));
check("customer-normalizer.ts exists", existsSync(resolve(CUSTOMER, "customer-normalizer.ts")));
check("customer-quality-rules.ts exists", existsSync(resolve(CUSTOMER, "customer-quality-rules.ts")));
check("customer-adapter.ts exists", existsSync(resolve(CUSTOMER, "customer-adapter.ts")));

// -- 14. Cross-reference: Shared evidence builder exists ----------------------

console.log("\n--- 14. Evidence Builder ---");

const evidence = readFileSync(resolve(SHARED, "domain-evidence.ts"), "utf-8");
check("buildEvidenceFromCustomer exists", evidence.includes("buildEvidenceFromCustomer"));

// -- 15. No code artifacts in discovery (constraint check) --------------------

console.log("\n--- 15. Discovery Constraints ---");

check("Discovery doc has no TypeScript code blocks",
  !discovery.includes("export function") && !discovery.includes("export interface"));
check("Knowledge graph has no TypeScript code blocks",
  !graph.includes("export function") && !graph.includes("export interface"));
check("Gaps doc has no TypeScript code blocks",
  !gaps.includes("export function") && !gaps.includes("export interface"));
check("No Prisma changes in discovery",
  !discovery.includes("model ") || !discovery.includes("@@"));
check("No adapter code in discovery",
  !discovery.includes("createSag") && !discovery.includes("CommercialAdapter"));

// -- Summary ------------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01 AUDIT FAILED.\n");
  process.exit(1);
} else {
  console.log("CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01 AUDIT PASSED.\n");
}
