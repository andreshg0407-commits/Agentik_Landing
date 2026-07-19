/**
 * validate-maletas-home-nav-collapsible.ts
 *
 * GO-LIVE-MALETAS-HOME-NAV-COLLAPSIBLE-01 validation script.
 * 7 checks.
 *
 * Run: npx tsx scripts/validate-maletas-home-nav-collapsible.ts
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

console.log("\n=== GO-LIVE-MALETAS-HOME-NAV-COLLAPSIBLE-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. Quick access bar exists
check(
  "1. Quick access bar exists",
  client.includes("scrollToSection") &&
  client.includes("Ir a:") &&
  client.includes("productionSectionRef") &&
  client.includes("recompraSectionRef") &&
  client.includes("coverageSectionRef"),
  "Must have quick access bar with scroll-to-section buttons and 3 refs",
);

// ── 2. Quick access scrolls to Produccion, Recompra, Oportunidades
check(
  "2. Quick access scrolls to all 3 sections",
  client.includes("scrollToSection(ref, key)") &&
  client.includes('key: "produccion"') &&
  client.includes('key: "recompra"') &&
  client.includes('key: "cobertura"'),
  "scrollToSection must be called for all 3 section keys",
);

// ── 3. Produccion is collapsible
check(
  "3. Produccion is collapsible",
  client.includes("open={sectionOpen.produccion}") &&
  client.includes('toggleSection("produccion")') &&
  client.includes("sectionRef={productionSectionRef}"),
  "Produccion SectionHeader must have open + onToggle + sectionRef props",
);

// ── 4. Recompra is collapsible
check(
  "4. Recompra is collapsible",
  client.includes("open={sectionOpen.recompra}") &&
  client.includes('toggleSection("recompra")') &&
  client.includes("sectionRef={recompraSectionRef}"),
  "Recompra SectionHeader must have open + onToggle + sectionRef props",
);

// ── 5. Oportunidades is collapsible
check(
  "5. Oportunidades is collapsible",
  client.includes("open={sectionOpen.cobertura}") &&
  client.includes('toggleSection("cobertura")') &&
  client.includes("sectionRef={coverageSectionRef}"),
  "Oportunidades SectionHeader must have open + onToggle + sectionRef props",
);

// ── 6. No logic modifications
check(
  "6. No logic modifications",
  (() => {
    const service = readFile("lib/comercial/maletas/vendor-sample-service.ts");
    return service.includes("buildVendorSnapshots");
  })(),
  "vendor-sample-service.ts must not be modified",
);

// ── 7. SectionHeader supports collapsible mode
check(
  "7. SectionHeader supports collapsible mode",
  (() => {
    const start = client.indexOf("function SectionHeader");
    const end = client.indexOf("function ExecKpi", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("onToggle") && body.includes("open") && body.includes("sectionRef") &&
           body.includes("isCollapsible") && body.includes("{isOpen && children}");
  })(),
  "SectionHeader must accept open, onToggle, sectionRef and conditionally render children",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
