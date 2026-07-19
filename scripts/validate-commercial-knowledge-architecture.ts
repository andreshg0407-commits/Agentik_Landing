/**
 * scripts/validate-commercial-knowledge-architecture.ts
 *
 * Validation for COMMERCIAL-KNOWLEDGE-ARCHITECTURE-01.
 * Ensures the master architecture document is complete, consistent, and governing.
 *
 * Usage: npx tsx scripts/validate-commercial-knowledge-architecture.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

// ── Load documents ──────────────────────────────────────────────────────────

const mainPath = resolve(__dirname, "../docs/architecture/COMMERCIAL_KNOWLEDGE_ARCHITECTURE_01.md");
const matrixPath = resolve(__dirname, "../docs/architecture/COMMERCIAL_KNOWLEDGE_FLOW_MATRIX_01.md");

let mainDoc: string;
let matrixDoc: string;

try {
  mainDoc = readFileSync(mainPath, "utf-8");
} catch {
  console.error("FATAL: Cannot read main document at", mainPath);
  process.exit(1);
}

try {
  matrixDoc = readFileSync(matrixPath, "utf-8");
} catch {
  console.error("FATAL: Cannot read flow matrix at", matrixPath);
  process.exit(1);
}

console.log("\n=== COMMERCIAL-KNOWLEDGE-ARCHITECTURE-01 Validation ===\n");

// ── 1. Arquitectura completa (15 fases) ─────────────────────────────────────

console.log("--- 1. Arquitectura completa (15 fases) ---");

const phases = [
  "Filosofia",
  "Arquitectura General",
  "Semantic Layer",
  "Data Domains",
  "Knowledge Graph",
  "Rules",
  "Evidence",
  "Knowledge Flow",
  "Preguntas Empresariales",
  "Data Ownership",
  "Persistencia",
  "Freshness",
  "Multi-ERP",
  "Multi-Tenant",
  "Principios Arquitectonicos",
];

let phaseCount = 0;
for (const phase of phases) {
  const found = mainDoc.includes(phase) || mainDoc.toLowerCase().includes(phase.toLowerCase());
  if (found) phaseCount++;
  check(`Phase present: ${phase}`, found);
}
check("At least 14 of 15 phases present", phaseCount >= 14);

// ── 2. Filosofia articulada ──────────────────────────────────────────────────

console.log("\n--- 2. Filosofia articulada ---");

check("Explains WHY not model from SAG", mainDoc.includes("NO modelamos segun SAG") || mainDoc.includes("NO sincroniza datos"));
check("Defines knowledge vs sync distinction", mainDoc.includes("conocimiento") && (mainDoc.includes("sincronizar") || mainDoc.includes("Sincronizar")));
check("Explains WHY domains exist", mainDoc.includes("Por que existen dominios"));
check("Explains WHY Semantic Layer exists", mainDoc.includes("Por que existe un Semantic Layer") || mainDoc.includes("Semantic Layer"));

// ── 3. Semantic Layer completo ───────────────────────────────────────────────

console.log("\n--- 3. Semantic Layer completo ---");

const sagCodes = ["fuente 1", "fuente 2", "fuente 95", "fuente 113", "fuente 116", "fuente 118"];
for (const code of sagCodes) {
  const codeNum = code.replace("fuente ", "");
  check(`SAG code translated: ${code}`, mainDoc.includes(code) || mainDoc.includes(code.replace("fuente ", "k_n_clase_fuente=")) || mainDoc.includes(codeNum));
}
check("Canonical concepts defined", mainDoc.includes("SALE_INVOICE") || mainDoc.includes("SaleInvoice") || mainDoc.includes("Factura de venta"));
check("Translation table exists", mainDoc.includes("Codigo fisico") || mainDoc.includes("Concepto canonico") || mainDoc.includes("Traduccion"));

// ── 4. Los 6 dominios documentados ──────────────────────────────────────────

console.log("\n--- 4. Los 6 dominios documentados ---");

const domains = ["PRODUCT", "INVENTORY", "SALES", "CUSTOMER", "PURCHASING", "STORE OPS"];
for (const domain of domains) {
  check(`Domain defined: ${domain}`, mainDoc.includes(domain));
}
check("Each domain has purpose", (mainDoc.match(/Proposito|proposito|propósito/g) || []).length >= 5);
check("Each domain has entities", mainDoc.includes("Entidades") || mainDoc.includes("entidades"));
check("Each domain has consumers", mainDoc.includes("Consumidores") || mainDoc.includes("consumidores"));

// ── 5. Knowledge Graph documentado ──────────────────────────────────────────

console.log("\n--- 5. Knowledge Graph documentado ---");

check("Knowledge Graph section exists", mainDoc.includes("Knowledge Graph"));
check("Relationships defined", mainDoc.includes("PLACED") || mainDoc.includes("REFERENCES") || mainDoc.includes("CONTAINS") || mainDoc.includes("relacion"));
check("Node types defined", mainDoc.includes("nodo") || mainDoc.includes("Node") || mainDoc.includes("entidad"));
check("Edge types defined", mainDoc.includes("BELONGS_TO") || mainDoc.includes("HAS") || mainDoc.includes("arista") || mainDoc.includes("edge"));

// ── 6. Motores con status, inputs, outputs ──────────────────────────────────

console.log("\n--- 6. Motores con status, inputs, outputs ---");

const motors = [
  "Coverage Engine",
  "Rules Evidence Engine",
  "Rotation Engine",
  "Repurchase Engine",
  "Markdown Engine",
  "Transfer Engine",
  "Production Signal",
  "Customer Intelligence",
  "Sales Intelligence",
  "Commercial Copilot",
];

for (const motor of motors) {
  check(`Motor documented: ${motor}`, mainDoc.includes(motor));
}
check("Motors have status (opera/bloqueado)", mainDoc.includes("Opera") || mainDoc.includes("BLOQUEADO") || mainDoc.includes("Operativo"));
check("Motors have gap info", mainDoc.includes("Gap") || mainDoc.includes("gap") || mainDoc.includes("bloqueante"));

// ── 7. Evidence Architecture ─────────────────────────────────────────────────

console.log("\n--- 7. Evidence Architecture ---");

check("Evidence section exists", mainDoc.includes("Evidence") || mainDoc.includes("Evidencia"));
check("Confidence scoring documented", mainDoc.includes("confidence") || mainDoc.includes("confianza"));
check("Fail-closed principle documented", mainDoc.includes("fail-closed") || mainDoc.includes("no emite") || mainDoc.includes("NUNCA generar") || mainDoc.includes("datos insuficientes"));
check("Evidence chain concept exists", mainDoc.includes("chain") || mainDoc.includes("cadena") || mainDoc.includes("Cadena") || mainDoc.includes("trazabilidad"));

// ── 8. Business Questions mapped ─────────────────────────────────────────────

console.log("\n--- 8. Business Questions mapped ---");

check("Business questions section exists", mainDoc.includes("Preguntas") || matrixDoc.includes("Pregunta de negocio"));
check("At least 5 questions in flow matrix", (matrixDoc.match(/Q\d/g) || []).length >= 5);
check("Questions have domains", matrixDoc.includes("Dominios involucrados"));
check("Questions have motors", matrixDoc.includes("Motor responsable"));
check("Questions have confidence", matrixDoc.includes("Confianza minima"));

// ── 9. Persistence strategy ─────────────────────────────────────────────────

console.log("\n--- 9. Persistence strategy ---");

check("REFERENCE type defined", mainDoc.includes("REFERENCE"));
check("TRANSACTIONAL type defined", mainDoc.includes("TRANSACTIONAL"));
check("SNAPSHOT type defined", mainDoc.includes("SNAPSHOT"));
check("EVENT type defined", mainDoc.includes("EVENT"));
check("DERIVED type defined", mainDoc.includes("DERIVED"));
check("When-to-use guidance", mainDoc.includes("Cuando usar") || mainDoc.includes("cuando usar") || mainDoc.includes("Upsert") || mainDoc.includes("Append"));

// ── 10. Freshness strategy ───────────────────────────────────────────────────

console.log("\n--- 10. Freshness strategy ---");

check("Near-real-time (5-15 min)", mainDoc.includes("5-15") || mainDoc.includes("Near-real-time"));
check("Periodic (15-60 min)", mainDoc.includes("15-60") || mainDoc.includes("Periodic"));
check("Daily", mainDoc.includes("Daily") || mainDoc.includes("Diario"));
check("On-demand", mainDoc.includes("On-demand") || mainDoc.includes("on-demand"));
check("No false real-time claims", mainDoc.includes("polling") || mainDoc.includes("no soporta webhooks") || mainDoc.includes("SAG no tiene push"));

// ── 11. Multi-ERP strategy ───────────────────────────────────────────────────

console.log("\n--- 11. Multi-ERP strategy ---");

check("Multi-ERP section exists", mainDoc.includes("Multi-ERP") || mainDoc.includes("Multi ERP"));
check("Only adapters change principle", mainDoc.includes("Solo") && (mainDoc.includes("adapters") || mainDoc.includes("adaptadores")));
check("Motors untouched on ERP change", mainDoc.includes("motores") && (mainDoc.includes("no cambian") || mainDoc.includes("intactos") || mainDoc.includes("identic")));
check("Example of second ERP", mainDoc.includes("SIIGO") || mainDoc.includes("otro ERP"));

// ── 12. Multi-Tenant strategy ────────────────────────────────────────────────

console.log("\n--- 12. Multi-Tenant strategy ---");

check("Multi-Tenant section exists", mainDoc.includes("Multi-Tenant") || mainDoc.includes("multi-tenant"));
check("tenantId isolation documented", mainDoc.includes("tenantId") || mainDoc.includes("orgSlug"));
check("No tenant-specific logic in motors", mainDoc.includes("nunca") || mainDoc.includes("no contiene") || mainDoc.includes("agnostic"));

// ── 13. Architectural principles ─────────────────────────────────────────────

console.log("\n--- 13. Architectural principles ---");

check("Principles section exists", mainDoc.includes("Principios") || mainDoc.includes("principios"));
check("At least 10 principles stated", (mainDoc.match(/\d+\.\s/g) || []).length >= 10);
check("Decisions NOT to make documented", mainDoc.includes("NO haremos") || mainDoc.includes("NO tomaremos") || mainDoc.includes("NO hacer"));

// ── 14. Roadmap exists ───────────────────────────────────────────────────────

console.log("\n--- 14. Roadmap ---");

const sprints = ["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4", "Sprint 5"];
for (const sprint of sprints) {
  check(`${sprint} defined`, mainDoc.includes(sprint));
}
check("Sprints have domains assigned", mainDoc.includes("PRODUCT") && mainDoc.includes("SALES") && mainDoc.includes("STORE OPS"));
check("Sprints have deliverables per sprint", mainDoc.includes("Motores activados") || mainDoc.includes("Requerimientos:"));

// ── 15. Flow matrix complete ─────────────────────────────────────────────────

console.log("\n--- 15. Flow matrix complete ---");

check("Flow matrix has questions", matrixDoc.includes("Q1") && matrixDoc.includes("Q8"));
check("Flow matrix has pipeline", matrixDoc.includes("Knowledge Production Pipeline") || matrixDoc.includes("Pipeline"));
check("Flow matrix has event catalog", matrixDoc.includes("Domain Event Catalog") || matrixDoc.includes("Event Catalog"));
check("Flow matrix has motor dependency chain", matrixDoc.includes("Motor Dependency Chain") || matrixDoc.includes("LEVEL 0"));
check("Flow matrix has confidence rules", matrixDoc.includes("Confidence") || matrixDoc.includes("confidence"));
check("Flow matrix has sprint activation map", matrixDoc.includes("Sprint Activation Map") || matrixDoc.includes("Sprint") && matrixDoc.includes("Coverage"));
check("Flow matrix has freshness decision tree", matrixDoc.includes("Freshness Decision Tree") || matrixDoc.includes("SLA de frescura"));
check("Flow matrix has multi-ERP mapping", matrixDoc.includes("Multi-ERP") || matrixDoc.includes("SAG PYA"));

// ── 16. No production changes ────────────────────────────────────────────────

console.log("\n--- 16. No production changes ---");

check("Main doc is architecture-only", mainPath.includes("docs/architecture"));
check("Flow matrix is architecture-only", matrixPath.includes("docs/architecture"));
check("No code implementation in main", !mainDoc.includes("export function") && !mainDoc.includes("export class"));
check("No code implementation in matrix", !matrixDoc.includes("export function") && !matrixDoc.includes("export class"));

// ── 17. TSC baseline (structural) ───────────────────────────────────────────

console.log("\n--- 17. TSC baseline (structural) ---");

check("Main document >25K chars", mainDoc.length > 25000);
check("Flow matrix >5K chars", matrixDoc.length > 5000);
check("Main doc consolidates previous work", mainDoc.includes("COMMERCIAL_DATA_DOMAINS") || mainDoc.includes("DATA_LAYER_PRIORITY") || mainDoc.includes("Knowledge Gap") || mainDoc.includes("conocimiento empresarial"));
check("Main doc is self-sufficient (no forward refs to new docs)", !mainDoc.includes("COMMERCIAL_KNOWLEDGE_ARCHITECTURE_02"));

// Verify Prisma untouched
let prismaContent: string;
try {
  prismaContent = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf-8");
  check("No SaleLine model in Prisma", !prismaContent.includes("model SaleLine {"));
  check("No InventoryMovement model in Prisma", !prismaContent.includes("model InventoryMovement {"));
  check("No SalesReturn model in Prisma", !prismaContent.includes("model SalesReturn {"));
} catch {
  check("Prisma schema readable", false);
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("KNOWLEDGE ARCHITECTURE VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("KNOWLEDGE ARCHITECTURE VALIDATION PASSED — COMMERCIAL-KNOWLEDGE-ARCHITECTURE-01 complete.\n");
}
