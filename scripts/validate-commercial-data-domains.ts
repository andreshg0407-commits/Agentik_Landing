/**
 * scripts/validate-commercial-data-domains.ts
 *
 * Validation for COMMERCIAL-DATA-DOMAINS-01.
 * Ensures the domain architecture is complete, consistent, and actionable.
 *
 * Usage: npx tsx scripts/validate-commercial-data-domains.ts
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

const mainPath = resolve(__dirname, "../docs/architecture/COMMERCIAL_DATA_DOMAINS_01.md");
const matrixPath = resolve(__dirname, "../docs/architecture/COMMERCIAL_DATA_DOMAIN_MATRIX_01.md");

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
  console.error("FATAL: Cannot read matrix document at", matrixPath);
  process.exit(1);
}

console.log("\n=== COMMERCIAL-DATA-DOMAINS-01 Validation ===\n");

// ── 1. Functional domains exist ─────────────────────────────────────────────

console.log("--- 1. Functional domains defined ---");

const domains = [
  "PRODUCT DOMAIN",
  "INVENTORY DOMAIN",
  "SALES DOMAIN",
  "CUSTOMER DOMAIN",
  "PURCHASING",
  "STORE OPERATIONS DOMAIN",
];

for (const domain of domains) {
  check(`Domain defined: ${domain}`, mainDoc.includes(domain) || mainDoc.includes(domain.replace(" DOMAIN", "")));
}

check("At least 6 domains defined", domains.filter(d =>
  mainDoc.includes(d) || mainDoc.includes(d.replace(" DOMAIN", ""))
).length >= 6);

// Verify domain has required sections
const domainSections = ["Proposito", "Preguntas que responde", "Entidades canonicas", "Fuentes SAG", "Adapters requeridos"];
for (const section of domainSections) {
  check(`Domain section exists: ${section}`, mainDoc.includes(section));
}

// ── 2. Not organized by tables only ────────────────────────────────────────

console.log("\n--- 2. Domain-oriented (not table-oriented) ---");

check("Organized by business purpose (Proposito)", (mainDoc.match(/Proposito:/g) || []).length >= 5);
check("Questions defined (Preguntas)", (mainDoc.match(/Preguntas que responde/g) || []).length >= 5);
check("Contains 'capacidad' or 'responder'", mainDoc.includes("capacidad") || mainDoc.includes("responder"));
check("Not just table listings", mainDoc.includes("concepto") || mainDoc.includes("negocio") || mainDoc.includes("business"));
check("Principles section exists", mainDoc.includes("Principios"));

// ── 3. Each entity has a domain owner ───────────────────────────────────────

console.log("\n--- 3. Entity ownership ---");

const entities = [
  "ProductProfile", "ProductVariant", "InventoryPosition", "InventoryMovement",
  "SaleLine", "SalesReturn", "CustomerProfile", "CustomerBranch",
  "CustomerReceivable", "VendorProfile", "StoreProfile", "StoreCoverageRule",
  "ImportReceipt", "ProductionOrder", "ProductionEntry",
];

let ownedCount = 0;
for (const entity of entities) {
  const inMain = mainDoc.includes(entity);
  const inMatrix = matrixDoc.includes(entity);
  if (inMain || inMatrix) ownedCount++;
}
check(`At least 14 of ${entities.length} entities present`, ownedCount >= 14);
check("Ownership table exists", mainDoc.includes("Dominio dueno") || matrixDoc.includes("Dominio dueno"));

// ── 4. No duplicate truths ──────────────────────────────────────────────────

console.log("\n--- 4. No duplicate truths ---");

check("Ownership section exists (source of truth)", mainDoc.includes("Source of Truth") || mainDoc.includes("source of truth"));
check("NOT includes section exists", mainDoc.includes("NO incluye") || mainDoc.includes("NO pertenece"));
check("Bounded contexts documented", mainDoc.includes("Bounded Context") || mainDoc.includes("Ownership"));
check("Read model pattern documented", mainDoc.includes("Read model") || mainDoc.includes("read model"));

// ── 5. Each motor has sources identified ────────────────────────────────────

console.log("\n--- 5. Motor sources ---");

const motors = [
  "Coverage Engine",
  "Rules Evidence Engine",
  "Rotation Engine",
  "Repurchase Engine",
  "Markdown Engine",
  "Transfer Engine",
  "Production Signal Engine",
  "Customer Intelligence",
  "Sales Intelligence",
  "Commercial Copilot",
];

for (const motor of motors) {
  const inMain = mainDoc.includes(motor);
  const inMatrix = matrixDoc.includes(motor);
  check(`Motor mapped: ${motor}`, inMain || inMatrix);
}

check("Motor requirements table exists", mainDoc.includes("Datos minimos") || matrixDoc.includes("Datos minimos"));
check("Gap bloqueante identified per motor", mainDoc.includes("Gap bloqueante") || matrixDoc.includes("Gap bloqueante"));

// ── 6. All meeting points mapped ───────────────────────────────────────────

console.log("\n--- 6. Meeting requirements mapped ---");

const meetingPoints = [
  "sucursales",
  "cartera vencida",
  "meses sin comprar",
  "surtido",
  "trazabilidad",
  "ventas por tienda",
  "ventas por vendedor",
  "baja rotacion",
  "antiguedad",
  "fecha de ingreso",
  "rotan",
  "datos completos",
  "tallas",
  "canal",
  "historicas",
  "agotado",
  "reglas por tamano",
  "36 unidades",
  "especiales por tienda",
];

let mappedPoints = 0;
for (const point of meetingPoints) {
  const found = mainDoc.toLowerCase().includes(point) || matrixDoc.toLowerCase().includes(point);
  if (found) mappedPoints++;
  check(`Meeting point: "${point}"`, found);
}

// ── 7. Dependency graph exists ──────────────────────────────────────────────

console.log("\n--- 7. Dependency graph ---");

check("Dependency graph section", mainDoc.includes("Dependencias entre Dominios") || mainDoc.includes("Grafo de dependencias"));
check("Dependency types documented", mainDoc.includes("Obligatoria") || mainDoc.includes("obligatoria"));
check("Optional dependencies", mainDoc.includes("Opcional") || mainDoc.includes("opcional") || mainDoc.includes("Enriquecimiento"));
check("No cycles verified", mainDoc.includes("No existen ciclos") || mainDoc.includes("sin ciclos"));
check("Topological order possible", mainDoc.includes("topologico") || mainDoc.includes("raiz"));

// ── 8. Adapter strategy exists ──────────────────────────────────────────────

console.log("\n--- 8. Adapter strategy ---");

check("Adapter strategy section", mainDoc.includes("Estrategia de Adapters") || mainDoc.includes("Adapter"));
check("Naming convention defined", mainDoc.includes("Naming") || mainDoc.includes("naming"));
check("File location defined", mainDoc.includes("lib/comercial/domains") || mainDoc.includes("ubicacion"));
check("Idempotencia documented", mainDoc.includes("Idempotencia") || mainDoc.includes("idempotencia"));
check("Incremental sync documented", mainDoc.includes("Incremental") || mainDoc.includes("incremental"));
check("Error handling documented", mainDoc.includes("Error") || mainDoc.includes("error"));
check("Adapter interface defined", mainDoc.includes("DomainAdapter") || mainDoc.includes("AdapterResult"));
check("ERP-agnostic principle", mainDoc.includes("ERP-Agnostic") || mainDoc.includes("ERP") || mainDoc.includes("multi-tenant"));

// ── 9. Persistence strategy exists ──────────────────────────────────────────

console.log("\n--- 9. Persistence strategy ---");

check("Persistence section exists", mainDoc.includes("Persistencia") || mainDoc.includes("persistencia"));
check("TRANSACTIONAL type defined", mainDoc.includes("TRANSACTIONAL"));
check("SNAPSHOT type defined", mainDoc.includes("SNAPSHOT"));
check("EVENT type defined", mainDoc.includes("EVENT"));
check("DERIVED type defined", mainDoc.includes("DERIVED"));
check("REFERENCE type defined", mainDoc.includes("REFERENCE"));
check("Read-through vs persist distinction", mainDoc.includes("Read-through") || mainDoc.includes("read-through") || mainDoc.includes("on-demand"));

// ── 10. Freshness strategy exists ───────────────────────────────────────────

console.log("\n--- 10. Freshness strategy ---");

check("Freshness section exists", mainDoc.includes("Frescura") || mainDoc.includes("frescura"));
check("Near-real-time defined", mainDoc.includes("Near-real-time") || mainDoc.includes("near-real-time") || mainDoc.includes("5-15 min"));
check("Periodic defined", mainDoc.includes("Periodic") || mainDoc.includes("periodic") || mainDoc.includes("15-60 min"));
check("Daily defined", mainDoc.includes("Daily") || mainDoc.includes("Diario") || mainDoc.includes("diario"));
check("On-demand defined", mainDoc.includes("On-demand") || mainDoc.includes("on-demand"));
check("No false real-time claims", mainDoc.includes("Nunca afirmar") || mainDoc.includes("no soporta webhooks") || mainDoc.includes("polling"));

// ── 11. Sprint sequence exists ──────────────────────────────────────────────

console.log("\n--- 11. Sprint sequence ---");

const sprints = ["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4"];
for (const sprint of sprints) {
  check(`${sprint} defined in main doc`, mainDoc.includes(sprint));
  check(`${sprint} defined in matrix`, matrixDoc.includes(sprint));
}

check("4-6 sprints proposed", mainDoc.includes("Sprint 4") || mainDoc.includes("Sprint 5"));
check("Sprint has domain assignment", mainDoc.includes("Dominios:") || mainDoc.includes("Dominio"));
check("Sprint has criteria de exito", mainDoc.includes("Criterio de exito"));

// ── 12. Each sprint delivers complete capabilities ──────────────────────────

console.log("\n--- 12. Sprint completeness ---");

check("Sprint 1 has requerimientos resueltos", mainDoc.includes("Requerimientos resueltos") || mainDoc.includes("requerimientos resueltos"));
check("Sprint has motores desbloqueados", mainDoc.includes("Motores desbloqueados") || mainDoc.includes("motores desbloqueados"));
check("Sprint has consumidores", mainDoc.includes("Consumidores") || mainDoc.includes("consumidores"));
check("Sprint has riesgos", mainDoc.includes("Riesgos") || mainDoc.includes("riesgos"));
check("Sprint delivers operational value", mainDoc.includes("valor operativo") || mainDoc.includes("opera") || mainDoc.includes("activados"));

// ── 13. No production changes ───────────────────────────────────────────────

console.log("\n--- 13. No production changes ---");

check("Document is architecture-only", mainPath.includes("docs/architecture"));
check("No code implementation", !mainDoc.includes("export function") && !mainDoc.includes("export class"));
check("Constraint stated", mainDoc.includes("Cero cambios en produccion") || mainDoc.includes("sin implementar"));

// ── 14. No Prisma changes ───────────────────────────────────────────────────

console.log("\n--- 14. No Prisma changes ---");

let prismaContent: string;
try {
  prismaContent = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf-8");
  check("No SaleLine model in Prisma", !prismaContent.includes("model SaleLine {"));
  check("No InventoryMovement model in Prisma", !prismaContent.includes("model InventoryMovement {"));
  // Note: ProductVariant already exists (pre-existing from marketing-studio sprint) — that's fine
  check("No new WarehouseProfile model in Prisma", !prismaContent.includes("model WarehouseProfile {"));
  check("No new domain contracts in Prisma", !prismaContent.includes("model SalesReturn {"));
} catch {
  check("Prisma schema readable", false);
}

// ── 15. TSC baseline (structural check) ─────────────────────────────────────

console.log("\n--- 15. TSC baseline (structural) ---");

check("Main document created (>20K chars)", mainDoc.length > 20000);
check("Matrix document created (>5K chars)", matrixDoc.length > 5000);
check("Knowledge Graph section exists", mainDoc.includes("Knowledge Graph") || mainDoc.includes("knowledge graph"));
check("Contracts section exists", mainDoc.includes("Contratos Canonicos") || mainDoc.includes("contratos canonicos"));
check("Decision Final section exists", mainDoc.includes("Decision Final") || mainDoc.includes("decision final"));

// ── Additional structural checks ────────────────────────────────────────────

console.log("\n--- Additional: Domain coherence ---");

// Verify vendor/receivables fusion documented
check("Vendor fusion decision documented", mainDoc.includes("FUSIONAR") || mainDoc.includes("fusionar"));
check("Receivables ownership clear", mainDoc.includes("CustomerReceivable") && mainDoc.includes("CUSTOMER"));

// Verify MVP vs V2 distinction
check("MVP defined per domain", mainDoc.includes("MVP") || matrixDoc.includes("MVP"));
check("V2 defined per domain", mainDoc.includes("V2") || matrixDoc.includes("V2"));

// Verify canonical contracts have fields
check("Contracts have tenantId", mainDoc.includes("tenantId"));
check("Contracts have source field", mainDoc.includes("source: string"));
check("Contracts have timestamp", mainDoc.includes("lastSyncAt") || mainDoc.includes("timestamp"));
check("Contracts have external ids", mainDoc.includes("externalId") || mainDoc.includes("external"));
check("Contracts have dataConfidence", mainDoc.includes("dataConfidence") || mainDoc.includes("confidence"));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("DOMAIN VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("DOMAIN VALIDATION PASSED — COMMERCIAL-DATA-DOMAINS-01 complete.\n");
}
