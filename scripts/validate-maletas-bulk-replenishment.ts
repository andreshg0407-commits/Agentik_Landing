/**
 * scripts/validate-maletas-bulk-replenishment.ts
 *
 * Structural validation for MALETAS-BULK-REPLENISHMENT-01
 *
 * Usage: npx tsx scripts/validate-maletas-bulk-replenishment.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else    { fail++; console.log(`  FAIL  ${label}`); }
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileNotContains(rel: string, text: string): boolean {
  return !fileContains(rel, text);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== MALETAS-BULK-REPLENISHMENT-01 Validation ===\n");

const types = "lib/comercial/maletas/replenishment-plan-types.ts";
const client = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";

// 1. MaletaReplenishmentPlan exists
console.log("CHECK 1: MaletaReplenishmentPlan entity");
check("Types file exists", fileExists(types));
check("MaletaReplenishmentPlan interface", fileContains(types, "export interface MaletaReplenishmentPlan"));
check("Plan has id", fileContains(types, "id: string"));
check("Plan has organizationId", fileContains(types, "organizationId: string"));
check("Plan has vendorId", fileContains(types, "vendorId: string"));
check("Plan has vendorName", fileContains(types, "vendorName: string"));
check("Plan has warehouseCode", fileContains(types, "warehouseCode: string"));
check("Plan has status", fileContains(types, "status: ReplenishmentPlanStatus"));
check("Plan has createdAt", fileContains(types, "createdAt: string"));
check("Plan has updatedAt", fileContains(types, "updatedAt: string"));
check("Plan has createdBy", fileContains(types, "createdBy: string"));
check("Plan has notes", fileContains(types, "notes: string"));
check("Plan has summaryAddedRefs", fileContains(types, "summaryAddedRefs: number"));
check("Plan has summaryRemovedRefs", fileContains(types, "summaryRemovedRefs: number"));

// 2. MaletaReplenishmentItem exists
console.log("\nCHECK 2: MaletaReplenishmentItem entity");
check("MaletaReplenishmentItem interface", fileContains(types, "export interface MaletaReplenishmentItem"));
check("Item has planId", fileContains(types, "planId: string"));
check("Item has subgroupSag", fileContains(types, "subgroupSag: string"));
check("Item has removedReference", fileContains(types, "removedReference: string | null"));
check("Item has removedDescription", fileContains(types, "removedDescription: string | null"));
check("Item has addedReference", fileContains(types, "addedReference: string"));
check("Item has addedDescription", fileContains(types, "addedDescription: string"));
check("Item has quantity", fileContains(types, "quantity: number"));
check("Item has reason", fileContains(types, "reason: string"));

// 3. Plan statuses
console.log("\nCHECK 3: Plan statuses");
check("Status: draft", fileContains(types, '"draft"'));
check("Status: pending_warehouse", fileContains(types, '"pending_warehouse"'));
check("Status: prepared", fileContains(types, '"prepared"'));
check("Status: shipped", fileContains(types, '"shipped"'));
check("Status: received", fileContains(types, '"received"'));
check("Status: cancelled", fileContains(types, '"cancelled"'));
check("PLAN_STATUS_LABEL exported", fileContains(types, "export const PLAN_STATUS_LABEL"));

// 4. Plan accumulation (no duplicate drafts)
console.log("\nCHECK 4: Plan accumulation");
check("Client imports replenishment plan types", fileContains(client, "from \"@/lib/comercial/maletas/replenishment-plan-types\""));
check("getDraftPlan helper exists", fileContains(client, "getDraftPlan"));
check("addItemToPlan helper exists", fileContains(client, "addItemToPlan"));
check("No duplicate draft check", fileContains(client, 'p.status === "draft"'));
check("Adds to existing draft plan", fileContains(client, "Add to existing draft plan"));

// 5. Plan drawer
console.log("\nCHECK 5: Plan drawer");
check("PlanDrawerContent component exists", fileContains(client, "function PlanDrawerContent"));
check("Plan drawer state exists", fileContains(client, "planDrawerOpen"));
check("Plan drawer vendor state", fileContains(client, "planDrawerVendor"));
check("openPlanDrawer handler", fileContains(client, "openPlanDrawer"));

// 6. Plan editing
console.log("\nCHECK 6: Plan editing");
check("removeItemFromPlan exists", fileContains(client, "removeItemFromPlan"));
check("Quitar button in plan", fileContains(client, "Quitar"));

// 7. Document generation
console.log("\nCHECK 7: Document generation");
check("generatePlanDocument handler", fileContains(client, "generatePlanDocument"));
check("Generar documento de surtido button", fileContains(client, "Generar documento de surtido"));
check("generatePlanDocumentNumber exists", fileContains(types, "export function generatePlanDocumentNumber"));
check("Document number format PS-", fileContains(types, 'return `PS-'));

// 8. PDF / print
console.log("\nCHECK 8: Print plan");
check("PrintPlanOverlay component exists", fileContains(client, "function PrintPlanOverlay"));
check("printPlan state exists", fileContains(client, "printPlan"));
check("Imprimir button in overlay", fileContains(client, "Imprimir"));

// 9. History drawer
console.log("\nCHECK 9: History");
check("HistoryDrawerContent component exists", fileContains(client, "function HistoryDrawerContent"));
check("historyOpen state exists", fileContains(client, "historyOpen"));
check("Historial de surtidos button", fileContains(client, "Historial de surtidos"));
check("Status filter in history", fileContains(client, "historyFilter"));
check("Vendor filter in history", fileContains(client, "historyVendorFilter"));

// 10. Traceability
console.log("\nCHECK 10: Traceability");
check("ReplenishmentEvent type exists", fileContains(types, "export interface ReplenishmentEvent"));
check("Event types: created", fileContains(types, '"created"'));
check("Event types: item_added", fileContains(types, '"item_added"'));
check("Event types: item_removed", fileContains(types, '"item_removed"'));
check("Event types: document_generated", fileContains(types, '"document_generated"'));
check("Event types: dispatched", fileContains(types, '"dispatched"'));
check("Event types: received", fileContains(types, '"received"'));
check("Event types: cancelled", fileContains(types, '"cancelled"'));
check("createReplenishmentEvent helper", fileContains(types, "export function createReplenishmentEvent"));
check("Trazabilidad section in plan drawer", fileContains(client, "Trazabilidad"));

// 11. KPIs
console.log("\nCHECK 11: KPIs");
check("planCounts computed", fileContains(client, "planCounts"));
check("Planes draft KPI", fileContains(client, "Planes draft"));
check("Pendientes bodega KPI", fileContains(client, "Pendientes bodega"));
check("Enviados KPI label", fileContains(client, '"Enviados"'));
check("Recibidos KPI label", fileContains(client, '"Recibidos"'));

// 12. Coverage recovery
console.log("\nCHECK 12: Coverage recovery");
check("CoverageRecovery type exists", fileContains(types, "export interface CoverageRecovery"));
check("computeCoverageRecovery exists", fileContains(types, "export function computeCoverageRecovery"));
check("Cobertura recuperada in print", fileContains(client, "Cobertura recuperada"));

// 13. Backward compatibility
console.log("\nCHECK 13: Backward compatibility");
check("ProductionDetailDrawer still exists", fileContains(client, "function ProductionDetailDrawer"));
check("CoverageGapRow still exists", fileContains(client, "function CoverageGapRow"));
check("ProductionRow still exists", fileContains(client, "function ProductionRow"));
check("ReplacementDetailPanel still exists", fileContains(client, "function ReplacementDetailPanel"));
check("PrintGuideOverlay still exists", fileContains(client, "function PrintGuideOverlay"));
check("VendorIntelligencePanel still exists", fileContains(client, "function VendorIntelligencePanel"));

// 14. Print document sections
console.log("\nCHECK 14: Print document sections");
check("Print has Retirar section", fileContains(client, "Referencias a retirar"));
check("Print has Agregar section", fileContains(client, "Referencias a agregar"));
check("Print has Preparo signature", fileContains(client, "Preparo"));
check("Print has Despacho signature", fileContains(client, "Despacho"));
check("Print has Recibio signature", fileContains(client, "Recibio"));
check("Print has Fecha entrega", fileContains(client, "Fecha entrega"));
check("Print has Fecha recepcion", fileContains(client, "Fecha recepcion"));

// 15. Plan on vendor card
console.log("\nCHECK 15: Vendor card plan integration");
check("VendorCard receives draftPlan", fileContains(client, "draftPlan"));
check("VendorCard receives onOpenPlan", fileContains(client, "onOpenPlan"));
check("Plan draft badge on card", fileContains(client, "Plan draft:"));

// 16. Gap action now feeds plan
console.log("\nCHECK 16: Gap action feeds plan");
check("Gap drawer title says plan", fileContains(client, "Agregar al plan de surtido"));
check("Confirm button says plan", fileContains(client, "Agregar al plan de surtido"));
check("Done step says plan", fileContains(client, "Agregado al plan de surtido"));
check("Seguir agregando button", fileContains(client, "Seguir agregando"));

// 17. Plan lifecycle transitions
console.log("\nCHECK 17: Plan lifecycle");
check("updatePlanStatus handler", fileContains(client, "updatePlanStatus"));
check("Marcar como enviado button", fileContains(client, "Marcar como enviado"));
check("Marcar como recibido button", fileContains(client, "Marcar como recibido"));
check("Cancelar plan button", fileContains(client, "Cancelar plan"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
