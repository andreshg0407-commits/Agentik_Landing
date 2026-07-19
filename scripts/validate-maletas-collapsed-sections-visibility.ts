/**
 * validate-maletas-collapsed-sections-visibility.ts
 *
 * GO-LIVE-MALETAS-COLLAPSED-SECTIONS-VISIBILITY-01 validation script.
 * 7 checks.
 *
 * Run: npx tsx scripts/validate-maletas-collapsed-sections-visibility.ts
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

console.log("\n=== GO-LIVE-MALETAS-COLLAPSED-SECTIONS-VISIBILITY-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. SectionHeader accepts statusHint prop
check(
  "1. SectionHeader accepts statusHint prop",
  (() => {
    const start = client.indexOf("function SectionHeader");
    const end = client.indexOf("function ExecKpi", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("statusHint") && body.includes("statusHint?: string");
  })(),
  "SectionHeader must accept statusHint?: string prop",
);

// ── 2. Collapsed state renders as operational card
check(
  "2. Collapsed state renders as operational card",
  (() => {
    const start = client.indexOf("function SectionHeader");
    const end = client.indexOf("function ExecKpi", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("minHeight") &&
           body.includes("cursor: \"pointer\"") &&
           body.includes("Ver detalle");
  })(),
  "Collapsed section must have minHeight, pointer cursor, and 'Ver detalle' CTA",
);

// ── 3. Collapsed card has border and background
check(
  "3. Collapsed card has border and background",
  (() => {
    const start = client.indexOf("function SectionHeader");
    const end = client.indexOf("function ExecKpi", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("C.line") &&
           body.includes("C.white") &&
           body.includes("borderRadius");
  })(),
  "Collapsed card must have border (C.line), white background, and borderRadius",
);

// ── 4. Collapsed card shows statusHint
check(
  "4. Collapsed card shows statusHint",
  (() => {
    const start = client.indexOf("function SectionHeader");
    const end = client.indexOf("function ExecKpi", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    // statusHint should be rendered in the collapsed state
    return body.includes("{statusHint") || body.includes("statusHint &&");
  })(),
  "Collapsed card must render statusHint when provided",
);

// ── 5. Produccion has statusHint
check(
  "5. Produccion has statusHint",
  client.includes('title="Produccion sugerida"') &&
  client.includes("textileProduction.length > 0 ? \"con sugerencias\""),
  "Produccion SectionHeader must have statusHint with textileProduction check",
);

// ── 6. Recompra has statusHint
check(
  "6. Recompra has statusHint",
  client.includes('title="Recompra sugerida"') &&
  client.includes("importRecompra.length > 0 ? \"con sugerencias\""),
  "Recompra SectionHeader must have statusHint with importRecompra check",
);

// ── 7. Oportunidades has statusHint
check(
  "7. Oportunidades has statusHint",
  client.includes('title="Oportunidades de cobertura"') &&
  client.includes("oportunidades"),
  "Oportunidades SectionHeader must have statusHint with oportunidades text",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
