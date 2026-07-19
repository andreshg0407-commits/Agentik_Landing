/**
 * validate-maletas-inteligencia-v2.ts
 *
 * GO-LIVE-MALETAS-INTELIGENCIA-V2-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-maletas-inteligencia-v2.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

console.log("\n=== GO-LIVE-MALETAS-INTELIGENCIA-V2-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. Inteligencia does NOT recalculate coverage (no deriveCoverageState in decision center)
check(
  "1. Inteligencia does not recalculate coverage",
  (() => {
    const dcStart = client.indexOf("function CommercialDecisionCenter");
    const dcEnd = client.indexOf("// ── Production Detail Drawer", dcStart);
    const dcBody = dcStart > 0 && dcEnd > dcStart ? client.substring(dcStart, dcEnd) : "";
    return !dcBody.includes("deriveCoverageState") && !dcBody.includes("deriveState");
  })(),
  "CommercialDecisionCenter must not recalculate coverage or state",
);

// ── 2. Uses coverageByLine
check(
  "2. Uses coverageByLine",
  client.includes("CommercialDecisionCenter") &&
  client.includes("coverageByLine={coverageByLine}") &&
  (client.includes("function LineCoverageCard") || client.includes("function CoverageCircle")),
  "Decision center must consume coverageByLine from parent",
);

// ── 3. Uses activeRefs
check(
  "3. Uses activeRefs",
  client.includes("activeRefs={activeRefs}") &&
  client.includes("function PriorityActionsCard") &&
  client.includes("function PendingSubgroupsCard"),
  "Decision center must consume activeRefs",
);

// ── 4. Uses Motor 2 (supplyAction)
check(
  "4. Uses Motor 2 supply actions",
  client.includes("REEMPLAZAR_BODEGA") &&
  client.includes("COMPLETAR_DESDE_OP") &&
  client.includes("PRODUCCION_SUGERIDA") &&
  client.includes("RECOMPRA_SUGERIDA") &&
  client.includes("RETIRAR_MOSTRARIO") &&
  client.includes("SUPPLY_ACTION_LABEL"),
  "Decision center must group by Motor 2 supply actions",
);

// ── 5. Lines are dynamic (no hardcode)
check(
  "5. Lines are dynamic (from coverageByLine.entries)",
  client.includes("coverageByLine.entries()") &&
  client.includes("DERROTERO_LINE_LABEL[line] ?? line"),
  "Lines must come from coverageByLine map, with fallback label",
);

// ── 6. Actions grouped correctly (PriorityActionsCard)
check(
  "6. Actions grouped by type in PriorityActionsCard",
  client.includes("function PriorityActionsCard") &&
  client.includes("ref.supplyAction") &&
  client.includes("SUPPLY_ACTION_LABEL[action]"),
  "Actions must be grouped by supplyAction type",
);

// ── 7. Subgrupos pendientes from derrotero
check(
  "7. Pending subgroups from derrotero rules",
  client.includes("function PendingSubgroupsCard") &&
  client.includes("derroteroRules.filter((r) => r.isActive)") &&
  client.includes("actual < rule.minimumRefs"),
  "Pending subgroups must compare active rules vs actual ref counts",
);

// ── 8. No old intelligence blocks (Score, Oportunidades, Reemplazar as sections)
check(
  "8. No old intelligence blocks",
  !client.includes("function VendorIntelligencePanel") &&
  !client.includes("BLOQUE 1") &&
  !client.includes("Cobertura de portafolio") &&
  !client.includes("Top Oportunidades"),
  "Old VendorIntelligencePanel and its sections must be removed",
);

// ── 9. No new API calls in decision center
check(
  "9. No new fetch/API calls in decision center",
  (() => {
    const dcStart = client.indexOf("function CommercialDecisionCenter");
    const dcEnd = client.indexOf("// ── Production Detail Drawer", dcStart);
    const dcBody = dcStart > 0 && dcEnd > dcStart ? client.substring(dcStart, dcEnd) : "";
    return !dcBody.includes("fetch(") && !dcBody.includes("await ");
  })(),
  "CommercialDecisionCenter must not make API calls",
);

// ── 10. Component separation (5 sub-components + 1 main)
check(
  "10. Componentized (5 sub-components + 1 main)",
  (client.includes("function LineCoverageCard") || client.includes("function CoverageCircle")) &&
  client.includes("function PriorityActionsCard") &&
  client.includes("function PendingSubgroupsCard") &&
  client.includes("function OperationalImpactCard") &&
  client.includes("function LineActionSummary") &&
  client.includes("function CommercialDecisionCenter"),
  "Must have 5 sub-components and 1 main CommercialDecisionCenter",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
