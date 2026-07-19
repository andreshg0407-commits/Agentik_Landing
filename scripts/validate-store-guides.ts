/**
 * scripts/validate-store-guides.ts
 *
 * FASE 17 — Validation for TIENDAS-WAREHOUSE-GUIDE-01.
 * Tests the guide generator — pure logic, no DB.
 *
 * Usage: npx tsx scripts/validate-store-guides.ts
 */

import {
  buildWarehouseGuides,
  buildWarehouseGuide,
} from "../lib/comercial/tiendas/store-guide-generator";
import { GUIDE_TRANSITIONS } from "../lib/comercial/tiendas/store-guide-types";
import { renderGuideHtml } from "../lib/comercial/tiendas/store-guide-pdf-renderer";
import type { StoreReplenishmentSuggestion } from "../lib/comercial/tiendas/store-suggestions-types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Test data ─────────────────────────────────────────────────────────────────

function makeSuggestion(overrides: Partial<StoreReplenishmentSuggestion>): StoreReplenishmentSuggestion {
  return {
    suggestionId:    "sug-1",
    storeId:         "bodega-sandiego",
    storeName:       "BODEGA SANDIEGO",
    warehouseId:     "11",
    warehouseName:   "BODEGA SANDIEGO",
    referenceCode:   "CJ-57673",
    productName:     "Camiseta Roja LK",
    line:            "Latin Kids",
    subgroup:        "Camisetas",
    productClass:    "textile",
    size:            "10-12",
    color:           "ROJO",
    currentStoreQty: 0,
    neededQty:       2,
    mainWarehouseQty: 8,
    needStatus:      "out",
    priorityScore:   130,
    policySource:    "line_subgroup",
    suggestedAction: "transfer_full",
    transferQty:     2,
    confidence:      "high",
    reason:          "Agotado: Camiseta Roja LK T10-12 ROJO — transferir 2 uds",
    warnings:        [],
    ...overrides,
  };
}

function main() {
  console.log("\n=== TIENDAS-WAREHOUSE-GUIDE-01 VALIDATION ===\n");

  // ── 1. Grouping by store ──────────────────────────────────────────────────
  console.log("--- 1. Grouping by store ---");
  const suggestions: StoreReplenishmentSuggestion[] = [
    makeSuggestion({ storeId: "s1", storeName: "Tienda A", suggestionId: "sug-1" }),
    makeSuggestion({ storeId: "s1", storeName: "Tienda A", suggestionId: "sug-2", referenceCode: "CJ-8811", size: "8", color: "AZUL" }),
    makeSuggestion({ storeId: "s2", storeName: "Tienda B", suggestionId: "sug-3", referenceCode: "CJ-9934" }),
    makeSuggestion({ storeId: "s1", storeName: "Tienda A", suggestionId: "sug-no", suggestedAction: "no_action", transferQty: 0, needStatus: "healthy", priorityScore: 0 }),
  ];

  const guides = buildWarehouseGuides(suggestions, "org-1", "user-1", 1);
  check("2 guides generated (2 stores)", guides.length === 2, `got ${guides.length}`);

  const guideA = guides.find(g => g.storeName === "Tienda A");
  const guideB = guides.find(g => g.storeName === "Tienda B");
  check("Tienda A guide has 2 lines (no_action excluded)", guideA?.totalLines === 2, `got ${guideA?.totalLines}`);
  check("Tienda B guide has 1 line", guideB?.totalLines === 1, `got ${guideB?.totalLines}`);

  // ── 2. Line generation ────────────────────────────────────────────────────
  console.log("\n--- 2. Line generation ---");
  const guide = guideA!;
  check("Lines have referenceCode", guide.lines.every(l => l.referenceCode.length > 0));
  check("Lines have requestedQty > 0", guide.lines.every(l => l.requestedQty > 0));
  check("Lines have reason text", guide.lines.every(l => l.reason.length > 0));

  // ── 3. Priority calculated ────────────────────────────────────────────────
  console.log("\n--- 3. Priority calculated ---");
  check("Guide has priority", ["critica", "alta", "media", "baja"].includes(guide.priority),
    `got ${guide.priority}`);
  check("Guide has priorityScore > 0", guide.priorityScore > 0, `got ${guide.priorityScore}`);

  // ── 4. Summary generated ──────────────────────────────────────────────────
  console.log("\n--- 4. Summary generated ---");
  check("Summary has executiveSummary", guide.summary.executiveSummary.length > 0);
  check("Summary mentions unidades", guide.summary.executiveSummary.includes("unidades"));
  check("Summary totalUnits matches", guide.summary.totalUnits === guide.totalUnits);

  // ── 5. Valid initial state ────────────────────────────────────────────────
  console.log("\n--- 5. Valid initial state ---");
  check("Initial status = draft", guide.status === "draft");
  check("Has audit entry", guide.audit.length === 1);
  check("Audit entry = created", guide.audit[0]?.action === "created");

  // ── 6. State transition rules ─────────────────────────────────────────────
  console.log("\n--- 6. State transition rules ---");
  check("draft → approved allowed", GUIDE_TRANSITIONS.draft.includes("approved"));
  check("draft → cancelled allowed", GUIDE_TRANSITIONS.draft.includes("cancelled"));
  check("approved → executed allowed", GUIDE_TRANSITIONS.approved.includes("executed"));
  check("executed → nothing", GUIDE_TRANSITIONS.executed.length === 0);
  check("cancelled → nothing", GUIDE_TRANSITIONS.cancelled.length === 0);
  check("cancelled → approved NOT allowed", !GUIDE_TRANSITIONS.cancelled.includes("approved"));
  check("executed → draft NOT allowed", !GUIDE_TRANSITIONS.executed.includes("draft"));

  // ── 7. PDF renders ────────────────────────────────────────────────────────
  console.log("\n--- 7. PDF renders ---");
  const html = renderGuideHtml(guide, "Castillitos");
  check("HTML generated", html.length > 100);
  check("HTML contains guide number", html.includes(guide.guideNumber));
  check("HTML contains store name", html.includes("Tienda A"));
  check("HTML contains tenant name", html.includes("Castillitos"));

  // ── 8. Multi-tenant correct ───────────────────────────────────────────────
  console.log("\n--- 8. Multi-tenant ---");
  check("organizationId set", guide.organizationId === "org-1");
  const guidesOrg2 = buildWarehouseGuides(
    [makeSuggestion({ storeId: "s3", storeName: "Tienda C" })],
    "org-2",
    "user-2",
  );
  check("Different org produces different orgId", guidesOrg2[0]?.organizationId === "org-2");

  // ── 9. Guide numbering ───────────────────────────────────────────────────
  console.log("\n--- 9. Guide numbering ---");
  check("First guide numbered TG-00001", guides[0]?.guideNumber === "TG-00001" || guides[1]?.guideNumber === "TG-00001");
  check("Second guide numbered TG-00002", guides[0]?.guideNumber === "TG-00002" || guides[1]?.guideNumber === "TG-00002");

  // ── 10. Replacement lines ─────────────────────────────────────────────────
  console.log("\n--- 10. Replacement lines ---");
  const replSugs = [
    makeSuggestion({
      suggestedAction: "find_replacement",
      transferQty: 0,
      mainWarehouseQty: 0,
      replacementCandidates: [{
        referenceCode: "CJ-8891", productName: "Camiseta Azul",
        size: "", color: "", line: "Latin Kids", subgroup: "Camisetas",
        productClass: "textile", mainWarehouseQty: 42,
        price: 106000, priceDeltaPercent: 6, recentSalesQty: 35,
        matchScore: 140, matchConfidence: "high",
        matchReasons: ["Mismo subgrupo"],
      }],
    }),
  ];
  const replGuide = buildWarehouseGuide(replSugs, "org-1", "user-1");
  check("Replacement line has replacementReferenceCode",
    replGuide.lines[0]?.replacementReferenceCode === "CJ-8891");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
  console.log(`${"=".repeat(60)}`);

  process.exit(fail > 0 ? 1 : 0);
}

main();
