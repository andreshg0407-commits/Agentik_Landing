/**
 * validate-inteligencia-navegable.ts
 *
 * GO-LIVE-MALETAS-INTELIGENCIA-NAVEGABLE-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-inteligencia-navegable.ts
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

console.log("\n=== GO-LIVE-MALETAS-INTELIGENCIA-NAVEGABLE-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. NavigateTarget type exists
check(
  "1. NavigateTarget type defined",
  client.includes("type NavigateTarget =") &&
  client.includes('{ tab: "referencias"') &&
  client.includes('{ tab: "derrotero"'),
  "NavigateTarget union type must define tab targets",
);

// ── 2. DecisionCenterProps includes onNavigate
check(
  "2. DecisionCenterProps has onNavigate callback",
  client.includes("onNavigate?: (target: NavigateTarget) => void"),
  "DecisionCenterProps must have optional onNavigate callback",
);

// ── 3. CoverageCircle replaces LineCoverageCard
check(
  "3. CoverageCircle replaces LineCoverageCard",
  client.includes("function CoverageCircle") &&
  !client.includes("function LineCoverageCard"),
  "LineCoverageCard must be replaced by CoverageCircle",
);

// ── 4. CoverageCircle uses SVG circular indicator
check(
  "4. CoverageCircle uses SVG ring",
  (() => {
    const start = client.indexOf("function CoverageCircle");
    const end = client.indexOf("function PriorityActionsCard", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("<svg") && body.includes("<circle") && body.includes("strokeDasharray");
  })(),
  "CoverageCircle must render SVG with circle and strokeDasharray",
);

// ── 5. CoverageCircle is clickable (uses <button>)
check(
  "5. CoverageCircle is a clickable button",
  (() => {
    const start = client.indexOf("function CoverageCircle");
    const end = client.indexOf("function PriorityActionsCard", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("<button") && body.includes("onClick={onClick}") && body.includes("cursor: \"pointer\"");
  })(),
  "CoverageCircle must use <button> with onClick and cursor:pointer",
);

// ── 6. PriorityActionsCard rows are clickable buttons
check(
  "6. PriorityActionsCard action rows are clickable",
  (() => {
    const start = client.indexOf("function PriorityActionsCard");
    const end = client.indexOf("function PendingSubgroupsCard", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("onActionClick") && body.includes("<button key={action}") && body.includes("cursor: \"pointer\"");
  })(),
  "Action rows must be <button> elements with onActionClick callback",
);

// ── 7. PendingSubgroupsCard items are clickable
check(
  "7. PendingSubgroupsCard items are clickable",
  (() => {
    const start = client.indexOf("function PendingSubgroupsCard");
    const end = client.indexOf("function OperationalImpactCard", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("onSubgroupClick") && body.includes("<button key={item.subgrupo}") && body.includes("cursor: \"pointer\"");
  })(),
  "Pending subgroup items must be clickable with onSubgroupClick callback",
);

// ── 8. CommercialDecisionCenter threads onNavigate to sub-components
check(
  "8. CommercialDecisionCenter threads navigation callbacks",
  (() => {
    const start = client.indexOf("function CommercialDecisionCenter");
    const end = client.indexOf("// ── Production Detail Drawer", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("handleCoverageClick") &&
           body.includes("handleActionClick") &&
           body.includes("handleSubgroupClick") &&
           body.includes("onNavigate");
  })(),
  "Main component must create navigation handlers from onNavigate",
);

// ── 9. Call site passes onNavigate that switches drawerTab
check(
  "9. Call site passes onNavigate with tab switching",
  client.includes("onNavigate={(target)") &&
  client.includes("setDrawerTab(target.tab)"),
  "CommercialDecisionCenter call site must wire setDrawerTab via onNavigate",
);

// ── 10. No new API calls or state recalculation
check(
  "10. No new fetch/API calls added",
  (() => {
    const start = client.indexOf("function CoverageCircle");
    const end = client.indexOf("// ── Production Detail Drawer", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return !body.includes("fetch(") && !body.includes("await ");
  })(),
  "Decision center components must not make API calls",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
