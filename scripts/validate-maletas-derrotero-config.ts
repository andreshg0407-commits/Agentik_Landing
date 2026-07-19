/**
 * validate-maletas-derrotero-config.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-CONFIG-01 validation script.
 * 9 checks.
 *
 * Run: npx tsx scripts/validate-maletas-derrotero-config.ts
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

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("\n=== GO-LIVE-MALETAS-DERROTERO-CONFIG-01 Validation ===\n");

// ── Files under test ────────────────────────────────────────────────────────
const service = readFile("lib/comercial/maletas/vendor-bag-ideal-route-service.ts");
const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
const schema = readFile("prisma/schema.prisma");
const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── Check 1: Prisma model VendorBagIdealRouteRule exists
check(
  "1. Prisma model VendorBagIdealRouteRule",
  schema.includes("model VendorBagIdealRouteRule"),
  "Model not found in schema.prisma",
);

// ── Check 2: Service has CRUD + getEffectiveMinimumRefs
check(
  "2. Service: CRUD + getEffectiveMinimumRefs + loadEffectiveMinimumRefsMap",
  service.includes("listIdealRouteRules") &&
  service.includes("upsertIdealRouteRule") &&
  service.includes("deleteIdealRouteRule") &&
  service.includes("getEffectiveMinimumRefs") &&
  service.includes("loadEffectiveMinimumRefsMap"),
  "Missing one or more service functions",
);

// ── Check 3: Service uses DEFAULT_SUBGROUP_MINIMUM_REFS as fallback
check(
  "3. Service: default fallback = DEFAULT_SUBGROUP_MINIMUM_REFS",
  service.includes("DEFAULT_SUBGROUP_MINIMUM_REFS"),
  "Service should fall back to default when no manual rule exists",
);

// ── Check 4: Motor 2 uses derroteroMap (manual rules)
check(
  "4. Loader: Motor 2 uses derroteroMap for coverage threshold",
  loader.includes("derroteroMap") && loader.includes("loadEffectiveMinimumRefsMap"),
  "Motor 2 should load and use manual derrotero rules",
);

// ── Check 5: Motor 2 still falls back to DEFAULT when no manual rule
check(
  "5. Loader: fallback to DEFAULT_SUBGROUP_MINIMUM_REFS when no rule",
  loader.includes("DEFAULT_SUBGROUP_MINIMUM_REFS"),
  "Motor 2 should still use default when no manual rule exists",
);

// ── Check 6: Lines are separate (LT, CS, IMPORT keys in derrotero)
check(
  "6. Loader: derrotero key includes line for separation",
  loader.includes('`${line}|${sg}`') || loader.includes("`${line}|${sg}`"),
  "Derrotero lookup key should be line|subgrupoSag to keep lines separate",
);

// ── Check 7: API routes exist
check(
  "7. API routes: ideal-route GET/POST + [ruleId] DELETE",
  fileExists("app/api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route/route.ts") &&
  fileExists("app/api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route/[ruleId]/route.ts"),
  "API routes missing",
);

// ── Check 8: Drawer tab 'derrotero' added
check(
  "8. Drawer: 'derrotero' tab exists",
  client.includes('"derrotero"') && client.includes("DerroteroIdealPanel"),
  "Drawer should have 'derrotero' tab with DerroteroIdealPanel component",
);

// ── Check 9: UI changes ONLY inside drawer (no structural changes outside)
// Verify no changes to KPI sections, navigation, or module layout
check(
  "9. No structural UI changes outside drawer",
  // DerroteroIdealPanel should be the only new component
  client.includes("DerroteroIdealPanel") &&
  // Navigation config should not be modified
  !readFile("components/shell/module-nav-config.ts").includes("DERROTERO"),
  "Should not modify navigation or module layout",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
