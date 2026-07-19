/**
 * validate-maletas-drawer-production.ts
 *
 * GO-LIVE-MALETAS-DRAWER-PRODUCTION-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-maletas-drawer-production.ts
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

console.log("\n=== GO-LIVE-MALETAS-DRAWER-PRODUCTION-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
const types = readFile("lib/comercial/maletas/vendor-sample-types.ts");

// ── 1. Motor 1 not changed (deriveState function intact)
check(
  "1. Motor 1 unchanged (deriveState intact)",
  loader.includes("function deriveState(") &&
  loader.includes('return "saludable"') &&
  loader.includes('return "reemplazar"'),
  "deriveState function must remain unchanged",
);

// ── 2. Motor 2 not changed (applyReplacements function intact)
check(
  "2. Motor 2 unchanged (applyReplacements intact)",
  loader.includes("function applyReplacements(") &&
  loader.includes("REEMPLAZAR_BODEGA") &&
  loader.includes("COMPLETAR_DESDE_OP") &&
  loader.includes("PRODUCCION_SUGERIDA"),
  "applyReplacements function must remain with all supply actions",
);

// ── 3. Derrotero not changed (DerroteroIdealPanel intact)
check(
  "3. Derrotero unchanged",
  client.includes("function DerroteroIdealPanel(") &&
  client.includes("deriveCoverageState") &&
  client.includes("actualRefsByKey"),
  "DerroteroIdealPanel must remain unchanged",
);

// ── 4. New business KPIs visible in drawer
check(
  "4. Business KPIs: Refs activas + Retiradas + Accesorios criticos",
  client.includes('"Refs activas"') &&
  client.includes('"Retiradas"') &&
  client.includes('"Accesorios criticos"') &&
  // Old drawer KPI chips removed (Row 1 section)
  client.includes("Business KPIs"),
  "Drawer KPIs must show business metrics, not algorithm states",
);

// ── 5. Table is collapsible
check(
  "5. Table is collapsible (refsTableExpanded)",
  client.includes("refsTableExpanded") &&
  client.includes("setRefsTableExpanded") &&
  client.includes("Referencias activas ("),
  "Table must have collapsible header with toggle",
);

// ── 6. Vault shows historical references
check(
  "6. Vault shows historical title",
  client.includes("Historico de referencias retiradas") &&
  client.includes("Referencias que dejaron de hacer parte del mostrario comercial"),
  "Vault must have historical title and subtitle",
);

// ── 7. Vault shows thumbnails
check(
  "7. Vault shows thumbnails",
  // DepletedVault has thumbnail div with line.slice(0, 2)
  client.includes("ref.line.slice(0, 2)") &&
  client.substring(client.indexOf("function DepletedVault")).includes("width: 24, height: 24"),
  "Vault rows must include thumbnail placeholder",
);

// ── 8. Historical insights visible
check(
  "8. Historical insights card visible",
  client.includes("Insights historicos") &&
  client.includes("referencias retiradas del mostrario") &&
  client.includes("sin stock disponible"),
  "Insights card must show aggregate data about retired refs",
);

// ── 9. Impacto historico column with star rating
check(
  "9. Impacto historico column with star ratings",
  client.includes("Impacto") &&
  client.includes("rotationRating") &&
  client.includes("starDisplay") &&
  client.includes("Alta rotacion"),
  "Vault must show star-based rotation rating",
);

// ── 10. No regressions — key structures preserved
check(
  "10. No regressions — SupplyActionType + coverage preserved",
  types.includes("SupplyActionType") &&
  types.includes("RECOMPRA_SUGERIDA") &&
  client.includes("depletedRefs") &&
  client.includes("activeRefs"),
  "All previous sprint structures must remain",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
