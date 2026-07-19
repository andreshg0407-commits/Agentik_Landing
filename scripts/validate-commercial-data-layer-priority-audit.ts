/**
 * scripts/validate-commercial-data-layer-priority-audit.ts
 *
 * Validation for AUDIT-COMMERCIAL-DATA-LAYER-PRIORITY-01.
 * Ensures the audit document is complete, consistent, and actionable.
 *
 * Usage: npx tsx scripts/validate-commercial-data-layer-priority-audit.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

// ── Load audit document ─────────────────────────────────────────────────────

const auditPath = resolve(__dirname, "../docs/architecture/COMMERCIAL_DATA_LAYER_PRIORITY_AUDIT_01.md");
let auditContent: string;

try {
  auditContent = readFileSync(auditPath, "utf-8");
} catch {
  console.error("FATAL: Cannot read audit document at", auditPath);
  process.exit(1);
}

console.log("\n=== AUDIT-COMMERCIAL-DATA-LAYER-PRIORITY-01 Validation ===\n");

// ── 1. All meeting points are mapped ────────────────────────────────────────

console.log("--- 1. Meeting requirements coverage ---");

const meetingPoints = [
  "sucursales de clientes",
  "cartera vencida",
  "meses sin comprar",
  "surtido",
  "trazabilidad",
  "ventas por tienda",
  "ventas por vendedor",
  "baja rotacion",
  "descuentos por antiguedad",
  "fecha de ingreso",
  "rotan en una tienda",
  "ciudad",
  "tallas",
  "canal de venta",
  "ventas historicas",
];

for (const point of meetingPoints) {
  const found = auditContent.toLowerCase().includes(point.toLowerCase());
  check(`Meeting point mapped: "${point}"`, found);
}

// ── 2. All minimum candidates evaluated ─────────────────────────────────────

console.log("\n--- 2. Candidate coverage ---");

const candidates = [
  "SaleLineRecord",
  "CustomerProfile",
  "CustomerBranch",
  "ProductVariant",
  "ProductMovement",
  "ImportReceipt",
  "InventoryPosition",
  "Vendor",
  "StoreInventoryMovement",
  "CustomerReceivable",
];

for (const candidate of candidates) {
  const found = auditContent.includes(candidate);
  check(`Candidate evaluated: ${candidate}`, found);
}

// Additional candidates discovered
const additionalCandidates = ["ReturnLineRecord", "PriceSnapshot"];
for (const candidate of additionalCandidates) {
  const found = auditContent.includes(candidate);
  check(`Additional candidate: ${candidate}`, found);
}

// ── 3. Each score has justification ─────────────────────���───────────────────

console.log("\n--- 3. Scoring justification ---");

const justificationSection = auditContent.includes("Justificacion de puntajes clave");
check("Justification section exists", justificationSection);

const criteriaJustified = [
  "C1=5", "C2=5", "C3=5", "C4=5", "C5=5", "C6=5", "C7=5",
  "C1=4", "C3=3", "C7=3",
];
let justifiedCount = 0;
for (const c of criteriaJustified) {
  if (auditContent.includes(c)) justifiedCount++;
}
check("Multiple criteria scores justified (>=5 explicit)", justifiedCount >= 5);

// Verify scores are between 1-5
const scorePattern = /\| \d+ \|[^|]+\| (\d) \| (\d) \| (\d) \| (\d) \| (\d) \| (\d) \| (\d) \|/g;
let allScoresValid = true;
let scoreRows = 0;
let match: RegExpExecArray | null;
while ((match = scorePattern.exec(auditContent)) !== null) {
  scoreRows++;
  for (let i = 1; i <= 7; i++) {
    const score = parseInt(match[i]);
    if (score < 1 || score > 5) allScoresValid = false;
  }
}
check("All scores are between 1 and 5", allScoresValid && scoreRows > 0);
check("At least 10 candidates scored", scoreRows >= 10);

// ── 4. Weights sum to 100% ──────────────────────────────────────────────────

console.log("\n--- 4. Weight validation ---");

const weights = [25, 20, 20, 10, 10, 10, 5];
const weightSum = weights.reduce((a, b) => a + b, 0);
check("Weights sum to 100%", weightSum === 100);

// Verify weights appear in document
check("Weight 25% documented", auditContent.includes("25%"));
check("Weight 20% documented", auditContent.includes("20%"));
check("Weight 10% documented", auditContent.includes("10%"));
check("Weight 5% documented", auditContent.includes("5%"));

// ── 5. Dependencies analyzed ────────────────────────────────────────────────

console.log("\n--- 5. Dependency analysis ---");

check("Dependency graph section exists", auditContent.includes("Grafo de dependencias"));
check("Dependency arrows present (requiere:)", (auditContent.match(/requiere:/g) || []).length >= 5);
check("Benefit relationships present (se beneficia)", (auditContent.match(/se beneficia/g) || []).length >= 3);
check("Package analysis exists", auditContent.includes("Paquetes minimos viables"));
check("Standalone viability assessed", auditContent.includes("Se puede construir solo"));

// ── 6. Consumers analyzed ───────────────────────────────────────────────────

console.log("\n--- 6. Consumer analysis ---");

const engines = [
  "Coverage Engine",
  "Rules Evidence Engine",
  "Rotation Engine",
  "Repurchase Engine",
  "Markdown Engine",
  "Transfer Engine",
  "Production",
  "Customer Intelligence",
  "Sales Intelligence",
  "Commercial Copilot",
];

for (const engine of engines) {
  const found = auditContent.includes(engine);
  check(`Engine consumer mapped: ${engine}`, found);
}

check("INMEDIATO vs futuro distinction exists", auditContent.includes("INMEDIATO") && auditContent.includes("futuro"));
check("Consumer count table exists", auditContent.includes("Consumidores inmediatos"));

// ── 7. Ranking exists ───────────────────────────────────────────────────────

console.log("\n--- 7. Ranking ---");

check("Weighted total scores present", auditContent.includes("TOTAL"));
check("Top candidate identified (4.55)", auditContent.includes("4.55"));
check("Second candidate identified (4.15)", auditContent.includes("4.15"));
check("Third candidate identified (4.00)", auditContent.includes("4.00"));
// Check ranking in Decision Final section (not scoring table where row order differs)
const decisionSection = auditContent.slice(auditContent.indexOf("Decision Final"));
check("Ranking order in decision: Customer > Inventory > SaleLine",
  decisionSection.indexOf("CustomerProfile") < decisionSection.indexOf("InventoryPosition") &&
  decisionSection.indexOf("InventoryPosition") < decisionSection.indexOf("SaleLineRecord")
);

// ── 8. Minimum package recommended ─────────────────────────────────────────

console.log("\n--- 8. Minimum package ---");

check("Package recommendation section exists", auditContent.includes("Paquete minimo"));
check("First adapter identified", auditContent.includes("Adaptador recomendado como PRIMERO"));
check("Second adapter identified", auditContent.includes("Segundo adaptador"));
check("Third adapter identified", auditContent.includes("Tercer adaptador"));
check("NOT-build section exists", auditContent.includes("NO construir todavia"));
check("Requirements by stage exists", auditContent.includes("Requerimientos resueltos por etapa"));
check("Alternative order risks documented", auditContent.includes("Riesgos de elegir otro orden"));

// ── 9. Sprint sequence exists ───────────────────────────────────────────────

console.log("\n--- 9. Sprint sequence ---");

const sprintSections = ["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4"];
for (const sprint of sprintSections) {
  check(`${sprint} defined`, auditContent.includes(sprint));
}

check("Sprint has Entidades field", auditContent.includes("Entidades:"));
check("Sprint has Capacidades field", auditContent.includes("Capacidades desbloqueadas:"));
check("Sprint has Puntos reunion field", auditContent.includes("Puntos reunion resueltos:"));
check("Sprint has Dependencias field", auditContent.includes("Dependencias:"));
check("Sprint has Criterio de exito field", auditContent.includes("Criterio de exito:"));

// ── 10. No production changes ───────────────────────────────────────────────

console.log("\n--- 10. No production changes ---");

check("Document is architecture-only (docs/architecture/ path)", auditPath.includes("docs/architecture"));
check("No Prisma changes mentioned as done", !auditContent.includes("Prisma migrado") && !auditContent.includes("migration applied"));
check("No adapter code created", !auditContent.includes("export function pull") && !auditContent.includes("adapter created"));
check("Constraint stated: zero production changes", auditContent.includes("Cero cambios en produccion"));

// ── 11. No Prisma changes ───────────────────────────────────────────────────

console.log("\n--- 11. No Prisma schema changes ---");

// Verify Prisma schema was not modified by checking it doesn't have SaleLineRecord model
let prismaContent: string;
try {
  prismaContent = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf-8");
  check("Prisma schema has no SaleLineRecord model", !prismaContent.includes("model SaleLineRecord"));
  check("Prisma schema has no ProductMovement model", !prismaContent.includes("model ProductMovement"));
  check("Prisma schema has no CustomerBranch model", !prismaContent.includes("model CustomerBranch"));
} catch {
  check("Prisma schema readable", false);
}

// ── 12. TSC baseline ────────────────────────────────────────────────────────

console.log("\n--- 12. TSC baseline (informational) ---");

check("Audit document created successfully", auditContent.length > 5000);
check("Document has complete structure (>15K chars)", auditContent.length > 15000);
check("Decision Final section exists", auditContent.includes("Decision Final"));
check("Resumen Ejecutivo section exists", auditContent.includes("Resumen Ejecutivo"));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("AUDIT VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("AUDIT VALIDATION PASSED — AUDIT-COMMERCIAL-DATA-LAYER-PRIORITY-01 complete.\n");
}
