/**
 * scripts/validate-maletas-actions-and-guides.ts
 *
 * Structural validation for MALETAS-ACTIONS-AND-GUIDES-01
 *
 * Usage: npx tsx scripts/validate-maletas-actions-and-guides.ts
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

console.log("=== MALETAS-ACTIONS-AND-GUIDES-01 Validation ===\n");

const client = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";
const types = "lib/comercial/maletas/maleta-surtido-types.ts";

// 1. Tables don't overflow
console.log("CHECK 1: Table overflow fix");
check("Production grid uses compact columns", fileContains(client, 'const PROD_GRID = "40px 80px'));
check("Gap grid uses compact columns", fileContains(client, 'const GAP_GRID  = "40px 80px'));
check("Production table has overflowX: auto", fileContains(client, "overflowX: \"auto\""));
check("No fixed 128px button in production row", fileNotContains(client, "width: 128, maxWidth: 128"));
check("Compact production button", fileContains(client, "Detalle"));
check("Compact coverage button", fileContains(client, "+ Maleta"));

// 2. Production detail drawer
console.log("\nCHECK 2: Production detail drawer");
check("prodDetailOpen state", fileContains(client, "prodDetailOpen"));
check("prodDetailItem state", fileContains(client, "prodDetailItem"));
check("openProductionDetail handler", fileContains(client, "openProductionDetail"));
check("ProductionRow accepts onDetail prop", fileContains(client, "onDetail: () => void"));
check("ProductionDetailDrawer component", fileContains(client, "function ProductionDetailDrawer"));

// 3. Detail explains production reason
console.log("\nCHECK 3: Production detail content");
check("Shows reference", fileContains(client, "item.reference"));
check("Shows description", fileContains(client, "item.description"));
check("Shows line", fileContains(client, "item.line"));
check("Shows centralAvailable", fileContains(client, "item.centralAvailable"));
check("Shows minimumRequired", fileContains(client, "item.minimumRequired"));
check("Shows shortfall", fileContains(client, "item.shortfall"));
check("Shows suggestedQty", fileContains(client, "item.suggestedQty"));
check("Explains why production needed", fileContains(client, "Por que se sugiere producir"));
check("Shows affected maletas count", fileContains(client, "affectedCount"));
check("Shows affected vendor names", fileContains(client, "affectedNames"));
check("Gap explanation", fileContains(client, "cubrir la demanda"));
check("Replacement context", fileContains(client, "Se produce para reemplazar"));

// 4. Coverage gap action
console.log("\nCHECK 4: Coverage gap action");
check("gapActionOpen state", fileContains(client, "gapActionOpen"));
check("gapActionItem state", fileContains(client, "gapActionItem"));
check("openGapAction handler", fileContains(client, "openGapAction"));
check("CoverageGapRow accepts onAction prop", fileContains(client, "onAction: () => void"));
check("GapActionDrawer component", fileContains(client, "function GapActionDrawer"));

// 5. Maleta selection
console.log("\nCHECK 5: Maleta selection");
check("buildMaletaCandidates", fileContains(client, "buildMaletaCandidates"));
check("MaletaCandidate type used", fileContains(client, "MaletaCandidate"));
check("Shows vendor name", fileContains(client, "c.vendorName"));
check("Shows warehouse", fileContains(client, "c.warehouseCode"));
check("Shows coverage", fileContains(client, "c.currentCoverage"));
check("Shows refs at risk", fileContains(client, "c.refsAtRisk"));
check("Shows replaceable refs count", fileContains(client, "replaceableRefs.length"));

// 6. Reference out selection
console.log("\nCHECK 6: Reference out selection");
check("gapSelectedRefOut state", fileContains(client, "gapSelectedRefOut"));
check("Step: select_ref_out", fileContains(client, '"select_ref_out"'));
check("Ninguna option", fileContains(client, "Ninguna (agregar sin retirar)"));
check("Replaceable refs list", fileContains(client, "selected.replaceableRefs.map"));

// 7. Reservation creation
console.log("\nCHECK 7: Reservation creation");
check("confirmGapReservation", fileContains(client, "confirmGapReservation"));
check("MaletaReservation used", fileContains(client, "MaletaReservation"));
check("generateReservationId used", fileContains(client, "generateReservationId"));
check("Status pendiente_bodega", fileContains(client, '"pendiente_bodega"'));

// 8. Surtido guide document
console.log("\nCHECK 8: Surtido guide document");
check("MaletaSurtidoGuide type", fileContains(client, "MaletaSurtidoGuide"));
check("generateGuideId used", fileContains(client, "generateGuideId"));
check("generateDocumentNumber used", fileContains(client, "generateDocumentNumber"));
check("Guide has reservations array", fileContains(client, "reservations:"));
check("Guide document number GS-", fileContains(types, "GS-"));

// 9. Guide has in/out references
console.log("\nCHECK 9: Guide has entries and exits");
check("refIn field on reservation", fileContains(types, "refIn: string"));
check("refOut field on reservation", fileContains(types, "refOut: string | null"));
check("Print view shows refs to send", fileContains(client, "Referencias a enviar"));
check("Print view shows refs to withdraw", fileContains(client, "Referencias a retirar"));
check("Print has signature fields", fileContains(client, "Firma entrega"));
check("Print has Firma recibe", fileContains(client, "Firma recibe"));

// 10. Domain types
console.log("\nCHECK 10: Domain types");
check("maleta-surtido-types.ts exists", fileExists(types));
check("MaletaReservationStatus type", fileContains(types, "MaletaReservationStatus"));
check("5 reservation states", fileContains(types, '"pendiente_bodega"') && fileContains(types, '"preparado"') && fileContains(types, '"enviado"') && fileContains(types, '"recibido"') && fileContains(types, '"cancelado"'));
check("RESERVATION_STATUS_LABEL exported", fileContains(types, "export const RESERVATION_STATUS_LABEL"));
check("ProductionDetail interface", fileContains(types, "export interface ProductionDetail"));
check("MaletaCandidate interface", fileContains(types, "export interface MaletaCandidate"));
check("MaletaSurtidoGuide interface", fileContains(types, "export interface MaletaSurtidoGuide"));
check("documentNumber field", fileContains(types, "documentNumber: string"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
