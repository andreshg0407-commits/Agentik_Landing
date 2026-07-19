/**
 * validate-maletas-derrotero-por-linea.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-POR-LINEA-01 validation script.
 * 8 checks.
 *
 * Run: npx tsx scripts/validate-maletas-derrotero-por-linea.ts
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

console.log("\n=== GO-LIVE-MALETAS-DERROTERO-POR-LINEA-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. No global coverage as primary KPI source
check(
  "1. No global coverage KPI (vendorIntel.coveragePct not in KPI row)",
  // The KPI section (between "Per-line derrotero KPIs" and "Row 2:") should NOT use vendorIntel.coveragePct
  (() => {
    const kpiStart = client.indexOf("Per-line derrotero KPIs");
    const kpiEnd = client.indexOf("Row 2:", kpiStart);
    const section = kpiStart > 0 && kpiEnd > kpiStart ? client.substring(kpiStart, kpiEnd) : "";
    return !section.includes("vendorIntel.coveragePct") && !section.includes("vendorIntel.subgruposMissing");
  })(),
  "KPIs must use coverageByLine, not vendorIntel global coverage",
);

// ── 2. KPIs use coverageByLine
check(
  "2. KPIs use coverageByLine",
  client.includes("coverageByLine") &&
  client.includes("coverageByLine.entries()"),
  "KPI section must iterate over coverageByLine entries",
);

// ── 3. Each line calculates coverage with its own rules
check(
  "3. Per-line coverage calculation exists",
  // coverageByLine useMemo groups rules by line
  client.includes("const lineRules = activeRulesAll.filter((r) => r.line === line)") &&
  client.includes("refCountByKey.get("),
  "Coverage must be computed per-line from matching rules and refs",
);

// ── 4. Line without derrotero shows "Configurar derrotero"
check(
  "4. Lines without derrotero show 'Configurar derrotero'",
  client.includes('"Configurar derrotero"') &&
  client.includes("cov.total === 0"),
  "Lines with no active rules must show 'Configurar derrotero'",
);

// ── 5. No cross-line ref mixing
check(
  "5. No cross-line mixing in coverage calculation",
  // Each rule uses rule.line to match refs: `${rule.line}|${rule.subgrupoSag}`
  client.includes("`${rule.line}|${rule.subgrupoSag}`") &&
  // activeRefs are filtered by ref.line for counting
  client.includes("`${ref.line}|${ref.subgrupoSag}`"),
  "Coverage keys must use line|subgrupo to prevent cross-line counting",
);

// ── 6. Derrotero changes update KPIs (onRulesChange callback)
check(
  "6. Derrotero changes propagate to KPIs (onRulesChange)",
  client.includes("onRulesChange") &&
  client.includes("setDerroteroRules") &&
  client.includes("externalRules"),
  "DerroteroIdealPanel must notify parent of rule changes via onRulesChange",
);

// ── 7. No hardcode of lines as unique option
check(
  "7. No hardcode — lines come from coverageByLine map keys",
  // KPIs use .entries() from coverageByLine which is built from allLines Set
  client.includes("const allLines = new Set<string>()") &&
  client.includes("for (const line of allLines)"),
  "Lines must be discovered dynamically, not hardcoded",
);

// ── 8. TSC baseline (run `npx tsc --noEmit | grep -c error` separately)
check(
  "8. derroteroRules state lifted to drawer level",
  client.includes("const [derroteroRules, setDerroteroRules]") &&
  client.includes("fetchDerroteroRules"),
  "Derrotero rules must be fetched at drawer level for KPI consumption",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
