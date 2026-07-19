/**
 * scripts/validate-maletas-drawer-ux-and-plan-flow.ts
 *
 * MALETAS-DRAWER-UX-AND-PLAN-FLOW-01 — FASE 12
 *
 * Structural validation of the drawer UX and plan flow changes.
 *
 * Usage:
 *   npx tsx scripts/validate-maletas-drawer-ux-and-plan-flow.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function fileContains(rel: string, needle: string): boolean {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) return false;
  return fs.readFileSync(fullPath, "utf-8").includes(needle);
}

console.log("=== MALETAS DRAWER UX AND PLAN FLOW VALIDATION ===\n");

const drawerPath = "components/workspace/operational-side-drawer.tsx";
const clientPath = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";

// ── 1. Drawer scroll ─────────────────────────────────────────────────────────
console.log("[1] Drawer has own scroll");
check("Drawer body has overflowY auto", fileContains(drawerPath, 'overflowY: "auto"'));
check("Drawer panel overflow hidden (panel itself)", fileContains(drawerPath, 'overflow:    "hidden"'));

// ── 2. Background scroll block ───────────────────────────────────────────────
console.log("\n[2] Background scroll blocked when drawer open");
check("Body overflow hidden on open", fileContains(drawerPath, 'document.body.style.overflow = "hidden"'));
check("Body overflow restored on close", fileContains(drawerPath, "document.body.style.overflow = prev"));

// ── 3. Button rename ─────────────────────────────────────────────────────────
console.log("\n[3] Coverage gap button renamed");
check("No longer says '+ Plan'", !fileContains(clientPath, ">+ Plan<") && !fileContains(clientPath, "          + Plan"));
check("Says 'Agregar'", fileContains(clientPath, ">Agregar<") || fileContains(clientPath, "          Agregar"));
check("Has tooltip for plan de surtido", fileContains(clientPath, "Agregar esta referencia a un plan de surtido de maleta"));

// ── 4. Drawer has Reemplazar action ──────────────────────────────────────────
console.log("\n[4] Drawer reference rows have Reemplazar action");
check("Reemplazar button exists", fileContains(clientPath, ">Reemplazar<") || fileContains(clientPath, "                Reemplazar"));
check("drawerReplacingRef state", fileContains(clientPath, "drawerReplacingRef"));
check("Elegir reemplazo tooltip", fileContains(clientPath, "Elegir reemplazo para esta referencia"));

// ── 5. Candidate selector ────────────────────────────────────────────────────
console.log("\n[5] Replacement candidates shown");
check("DrawerCandidateSelector component", fileContains(clientPath, "function DrawerCandidateSelector"));
check("Candidates filtered by subgrupo", fileContains(clientPath, "replacementOptions"));
check("Candidates sorted by availability", fileContains(clientPath, "b.available - a.available"));
check("Candidates exclude existing maleta refs", fileContains(clientPath, "vendorRefs.has(opt.reference)"));
check("Candidates exclude already in plan", fileContains(clientPath, "alreadyInPlan.has(opt.reference)"));
check("Elegir button per candidate", fileContains(clientPath, ">Elegir<") || fileContains(clientPath, "            Elegir"));

// ── 6. Adds item to persistent plan ──────────────────────────────────────────
console.log("\n[6] Selection adds to persistent plan API");
check("addReplacementFromDrawer function", fileContains(clientPath, "addReplacementFromDrawer"));
check("Calls addItemToPlanApi", fileContains(clientPath, "addItemToPlanApi"));
check("Sets removedReference from drawer ref", fileContains(clientPath, "removedRef.reference"));
check("Reason: Reemplazo desde drawer", fileContains(clientPath, "Reemplazo desde drawer de maleta"));

// ── 7. No duplicate removedReference ─────────────────────────────────────────
console.log("\n[7] Duplicate prevention");
check("Checks draft for existing removedReference", fileContains(clientPath, "i.removedReference === removedRef.reference"));
check("Shows duplicate message", fileContains(clientPath, "ya esta incluida en el plan de surtido"));
check("Also checks in DrawerCandidateSelector", fileContains(clientPath, "alreadyRemovedInPlan"));

// ── 8. Plan summary in drawer ────────────────────────────────────────────────
console.log("\n[8] Active plan summary in drawer");
check("Plan de surtido actual label", fileContains(clientPath, "Plan de surtido actual"));
check("Sin plan activo empty state", fileContains(clientPath, "Sin plan activo"));
check("Ver plan button", fileContains(clientPath, "Ver plan"));
check("Generar guia button", fileContains(clientPath, "Generar guia"));

// ── 9. Generate document from drawer ─────────────────────────────────────────
console.log("\n[9] Generate document from drawer");
check("Calls generatePlanDocument from drawer", fileContains(clientPath, "generatePlanDocument(activeDraft.id)"));

// ── 10. Feedback after adding ────────────────────────────────────────────────
console.log("\n[10] UX feedback after replacement");
check("drawerFeedback state", fileContains(clientPath, "drawerFeedback"));
check("Shows 'Agregado al plan de surtido'", fileContains(clientPath, "Agregado al plan de surtido de"));
check("Auto-dismiss with setTimeout", fileContains(clientPath, "setTimeout(() => setDrawerFeedback(null)"));

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
