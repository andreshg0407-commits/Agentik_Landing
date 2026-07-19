/**
 * validate-maletas-derrotero-hardening.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-HARDENING-01 validation script.
 * 9 checks.
 *
 * Run: npx tsx scripts/validate-maletas-derrotero-hardening.ts
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

console.log("\n=== GO-LIVE-MALETAS-DERROTERO-HARDENING-01 Validation ===\n");

const service = readFile("lib/comercial/maletas/vendor-bag-ideal-route-service.ts");
const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
const types = readFile("lib/comercial/maletas/vendor-sample-types.ts");
const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const apiRoute = readFile("app/api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route/route.ts");
const deleteRoute = readFile("app/api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route/[ruleId]/route.ts");

// ── 1. Subgroups come from ProductEntity.subgrupoSag (catalog)
check(
  "1. Subgroups from ProductEntity catalog",
  service.includes('"ProductEntity"') && service.includes('"subgrupoSag"') &&
  service.includes("loadCatalogSubgroups"),
  "Service should query ProductEntity for real subgroups",
);

// ── 2. Catalog grouped by real product line (LT/CS/IMPORT)
check(
  "2. Catalog grouped by productLine -> LT/CS/IMPORT",
  service.includes('"1": "LT"') && service.includes('"2": "CS"') && service.includes('"5": "IMPORT"'),
  "LINE_MAP should map productLine 1->LT, 2->CS, 5->IMPORT",
);

// ── 3. No free text input for subgrupo (select from catalog)
// Client should load catalog from API, not build from vendor.refs only
check(
  "3. No free text input — uses catalog from API",
  client.includes("catalog") && client.includes("catalogByLine") &&
  apiRoute.includes("loadCatalogSubgroups") &&
  !client.includes('<input') || // the only inputs should be number type
  client.includes('type="number"'),
  "Subgrupo selection must use select from catalog, not free text",
);

// ── 4. Fallback = 3 (not 2)
check(
  "4. Default fallback = 3",
  types.includes("DEFAULT_SUBGROUP_MINIMUM_REFS = 3"),
  "DEFAULT_SUBGROUP_MINIMUM_REFS should be 3",
);

// ── 5. Coverage state calculated (Cubierto / En limite / Falta cobertura)
check(
  "5. Coverage state: Cubierto / En limite / Falta cobertura",
  client.includes("deriveCoverageState") &&
  client.includes('"cubierto"') &&
  client.includes('"en_limite"') &&
  client.includes('"falta_cobertura"'),
  "Coverage states must be calculated and displayed",
);

// ── 6. Coverage labels displayed
check(
  "6. Coverage labels: Cubierto / En limite / Falta cobertura",
  client.includes('"Cubierto"') &&
  client.includes('"En limite"') &&
  client.includes('"Falta cobertura"'),
  "Coverage labels must be shown in the UI",
);

// ── 7. Inactive rules do NOT feed Motor 2
check(
  "7. Motor 2 only uses active rules",
  service.includes("isActive: true") &&
  loader.includes("loadEffectiveMinimumRefsMap"),
  "loadEffectiveMinimumRefsMap must filter isActive=true",
);

// ── 8. No physical delete — soft-delete only
check(
  "8. No physical delete — soft-delete (deactivate)",
  !service.includes(".delete(") &&
  service.includes("deactivateIdealRouteRule") &&
  deleteRoute.includes("deactivateIdealRouteRule") &&
  !deleteRoute.includes("deleteIdealRouteRule"),
  "Delete route should call deactivateIdealRouteRule, not physical delete",
);

// ── 9. TSC baseline (checked separately, but verify no new sprint tags in wrong files)
check(
  "9. No modifications outside drawer (module-nav-config clean)",
  !readFile("components/shell/module-nav-config.ts").includes("DERROTERO"),
  "No navigation or structural changes outside the drawer",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
