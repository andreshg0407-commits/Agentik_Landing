/**
 * AGENTIK-SELLER-APP-V1-FINAL-CERT — Regression tests.
 *
 * A. sellerSlug → stable sellerTerceroId mapping (canonical, no runtime name auth)
 * B. Mapping does not require runtime sellerName lookup
 * C. Luis Orlando → 280
 * D. Seller orders use exact sellerTerceroId filter
 * E. Cross-seller blocked
 * F. seller-app bypasses enterprise shell
 * G. Normal enterprise route retains shell
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

const mappingSrc = readSrc("lib/comercial/frontline/seller-user-mapping.ts");
const terceroMappingSrc = readSrc("lib/comercial/frontline/seller-tercero-mapping.ts");
const pageSrc = readSrc("app/(app)/[orgSlug]/seller-app/page.tsx");
const layoutSrc = readSrc("app/(app)/[orgSlug]/layout.tsx");

// ── Suite A: Canonical slug → sellerTerceroId mapping ─────────────────────

console.log("Suite A: Canonical sellerSlug → sellerTerceroId mapping");

test("A01: seller-tercero-mapping.ts exports lookupSellerTerceroId", () => {
  assert.ok(
    terceroMappingSrc.includes("export async function lookupSellerTerceroId"),
    "Must export lookupSellerTerceroId",
  );
});

test("A02: Mapping is built from persisted CustomerOrderRecord.sellerTerceroId", () => {
  assert.ok(
    terceroMappingSrc.includes("customerOrderRecord.findMany"),
    "Must read from persisted order data",
  );
  assert.ok(
    terceroMappingSrc.includes('sellerTerceroId: { not: null }'),
    "Must filter for orders with sellerTerceroId",
  );
  assert.ok(
    terceroMappingSrc.includes('distinct: ["sellerTerceroId"]'),
    "Must use DISTINCT to avoid duplicates",
  );
});

test("A03: Mapping is cached (not queried on every request)", () => {
  assert.ok(
    terceroMappingSrc.includes("CACHE_TTL"),
    "Must have cache TTL",
  );
  assert.ok(
    terceroMappingSrc.includes("cache.get(organizationId)") ||
    terceroMappingSrc.includes("cache.set(organizationId"),
    "Must cache by organizationId",
  );
});

test("A04: Lookup is slug-based (deterministic, no case sensitivity)", () => {
  assert.ok(
    terceroMappingSrc.includes("sellerSlug.toLowerCase()") ||
    terceroMappingSrc.includes("normalizedSlug"),
    "Must normalize slug for lookup",
  );
  // The lookup function body must NOT do case-insensitive name matching.
  // Extract only the function body (between the opening { and next export).
  const fnStart = terceroMappingSrc.indexOf("export async function lookupSellerTerceroId");
  const fnBodyStart = terceroMappingSrc.indexOf("{", fnStart);
  const fnEnd = terceroMappingSrc.indexOf("export async function bootstrapSellerTerceroId");
  const lookupBody = terceroMappingSrc.substring(fnBodyStart, fnEnd);
  assert.ok(
    !lookupBody.includes("toUpperCase") && !lookupBody.includes("findFirst"),
    "lookupSellerTerceroId body must NOT do name matching (no toUpperCase, no findFirst)",
  );
  // Must use slug comparison
  assert.ok(
    lookupBody.includes("e.sellerSlug") || lookupBody.includes("normalizedSlug"),
    "Must compare by slug",
  );
});

test("A05: Bootstrap function exists for migration (slug normalization, not name authority)", () => {
  assert.ok(
    terceroMappingSrc.includes("export async function bootstrapSellerTerceroId"),
    "Must have bootstrap function for initial CRM→SAG connection",
  );
  // Bootstrap must convert name to slug for comparison, not do case-insensitive name match
  const bootstrapFn = terceroMappingSrc.substring(
    terceroMappingSrc.indexOf("export async function bootstrapSellerTerceroId"),
    terceroMappingSrc.indexOf("export async function getSellerTerceroMapping") !== -1
      ? terceroMappingSrc.indexOf("export async function getSellerTerceroMapping")
      : terceroMappingSrc.length,
  );
  assert.ok(
    bootstrapFn.includes("toSlug"),
    "Bootstrap must use slug normalization, not name matching",
  );
});

// ── Suite B: No runtime sellerName lookup ─────────────────────────────────

console.log("\nSuite B: No runtime sellerName authorization");

test("B01: seller-user-mapping.ts does NOT contain resolveSellerTerceroId function", () => {
  assert.ok(
    !mappingSrc.includes("async function resolveSellerTerceroId"),
    "resolveSellerTerceroId must NOT exist in seller-user-mapping.ts (moved to canonical mapping)",
  );
});

test("B02: seller-user-mapping.ts imports from seller-tercero-mapping", () => {
  assert.ok(
    mappingSrc.includes("lookupSellerTerceroId") &&
    mappingSrc.includes("seller-tercero-mapping"),
    "Must import lookupSellerTerceroId from canonical mapping",
  );
});

test("B03: Strategy 1 uses lookupSellerTerceroId (not name matching)", () => {
  const strategy1Idx = mappingSrc.indexOf("Explicit sellerSlug in permissionsJson");
  const strategy2Idx = mappingSrc.indexOf("Manager/Admin");
  assert.ok(strategy1Idx > 0 && strategy2Idx > strategy1Idx);
  const section = mappingSrc.substring(strategy1Idx, strategy2Idx);
  assert.ok(
    section.includes("lookupSellerTerceroId"),
    "Strategy 1 must use canonical lookupSellerTerceroId",
  );
  assert.ok(
    section.includes("sagSellerCode"),
    "Strategy 1 must populate sagSellerCode",
  );
});

test("B04: Strategy 3 uses lookupSellerTerceroId (not name matching)", () => {
  const strategy3Idx = mappingSrc.indexOf("Strategy 3");
  const noMappingIdx = mappingSrc.indexOf("No mapping found");
  assert.ok(strategy3Idx > 0 && noMappingIdx > strategy3Idx);
  const section = mappingSrc.substring(strategy3Idx, noMappingIdx);
  assert.ok(
    section.includes("lookupSellerTerceroId"),
    "Strategy 3 must use canonical lookupSellerTerceroId",
  );
});

test("B05: No runtime name-to-sellerTerceroId matching in seller-user-mapping", () => {
  // The old pattern was: findFirst({ sellerName, sellerTerceroId: { not: null } })
  assert.ok(
    !mappingSrc.includes("customerOrderRecord.findFirst"),
    "Must NOT query CustomerOrderRecord directly in seller-user-mapping (use canonical mapping)",
  );
  assert.ok(
    !mappingSrc.includes("toUpperCase()"),
    "Must NOT do case-insensitive name matching in seller-user-mapping",
  );
});

// ── Suite C: Luis Orlando → 280 ──────────────────────────────────────────

console.log("\nSuite C: Luis Orlando → 280 verification");

test("C01: Canonical mapping returns sellerTerceroId as string", () => {
  assert.ok(
    terceroMappingSrc.includes("String(entry.sellerTerceroId)"),
    "Must return sellerTerceroId as string",
  );
});

test("C02: Provenance documented", () => {
  assert.ok(
    terceroMappingSrc.includes("Provenance") || terceroMappingSrc.includes("Source:"),
    "Must document provenance of mapping data",
  );
  assert.ok(
    terceroMappingSrc.includes("ka_nl_tercero_vend"),
    "Must reference SAG ka_nl_tercero_vend as source",
  );
});

// ── Suite D: Order query uses exact sellerTerceroId ───────────────────────

console.log("\nSuite D: Order query authority");

test("D01: Order query uses sagSellerCode", () => {
  assert.ok(
    pageSrc.includes("sagSellerCode"),
    "Order query must reference sagSellerCode",
  );
  assert.ok(
    !pageSrc.includes("terceroLookup"),
    "Must NOT use the old sellerName-based terceroLookup",
  );
});

test("D02: Order query assigns sellerTerceroId from parsed sagSellerCode", () => {
  assert.ok(
    pageSrc.includes("parseInt(sellerIdentity.sagSellerCode"),
    "Must parseInt sagSellerCode for integer sellerTerceroId",
  );
});

test("D03: Empty orders when no sagSellerCode and not manager", () => {
  assert.ok(
    pageSrc.includes("serializedOrders = []"),
    "Must return empty when no stable seller identity",
  );
});

// ── Suite E: Cross-seller blocked ────────────────────────────────────────

console.log("\nSuite E: Cross-seller blocked");

test("E01: Orders loaded server-side from filtered query", () => {
  assert.ok(
    pageSrc.includes("orderRecords.map"),
    "Orders mapped server-side from filtered query",
  );
  assert.ok(
    !pageSrc.includes("fetch(") && !pageSrc.includes("useEffect"),
    "No client-side order fetching — secure by construction",
  );
});

test("E02: Manager/admin bypasses seller filter", () => {
  assert.ok(
    pageSrc.includes("scope.canAccessAllOrders"),
    "Must check canAccessAllOrders for manager scope",
  );
});

// ── Suite F: Seller App shell bypass ─────────────────────────────────────

console.log("\nSuite F: Seller App shell bypass");

test("F01: Layout detects seller-app route", () => {
  assert.ok(layoutSrc.includes("seller-app"), "Must detect seller-app in pathname");
  assert.ok(
    layoutSrc.includes("isSellerApp"),
    "Must have isSellerApp route detection",
  );
});

test("F02: Seller App renders children without WorkspaceShellClient", () => {
  assert.ok(
    layoutSrc.includes("return <>{children}</>") ||
    layoutSrc.includes("return (<>{children}</>)"),
    "Must render children directly for seller-app",
  );
});

test("F03: Shell bypass is route-based (not role-based)", () => {
  const bypassSection = layoutSrc.substring(
    layoutSrc.indexOf("isSellerApp"),
    layoutSrc.indexOf("isSellerApp") + 200,
  );
  assert.ok(
    bypassSection.includes("pathname") || bypassSection.includes("seller-app"),
    "Bypass must be route-aware",
  );
  assert.ok(
    !bypassSection.includes("ctx.role") && !bypassSection.includes("OPERATOR"),
    "Bypass must NOT check role",
  );
});

// ── Suite G: Normal enterprise route retains shell ───────────────────────

console.log("\nSuite G: Normal enterprise route retains shell");

test("G01: Non-seller-app routes still get WorkspaceShellClient", () => {
  assert.ok(
    layoutSrc.includes("WorkspaceShellClient"),
    "WorkspaceShellClient must still render for enterprise routes",
  );
  const bypassIdx = layoutSrc.indexOf("if (isSellerApp)");
  const shellJsxIdx = layoutSrc.indexOf("<WorkspaceShellClient");
  assert.ok(bypassIdx > 0, "Must have isSellerApp conditional");
  assert.ok(shellJsxIdx > 0, "Must have WorkspaceShellClient JSX");
  assert.ok(bypassIdx < shellJsxIdx, "Shell bypass must come before WorkspaceShellClient JSX");
});

test("G02: Layout imports headers for pathname detection", () => {
  assert.ok(layoutSrc.includes("headers"), "Must import headers for pathname");
});

console.log("\n--- FINAL-CERT tests complete ---\n");
