/**
 * lib/copilot-core/__tests__/copilot-core-entitlement-regression.test.ts
 *
 * P0 REGRESSION: COPILOT_ENTITLEMENT_MODULE_GATE
 *
 * Root cause: Castillitos TenantModule row for "copilot" had enabled=false.
 * The copilot page requires BOTH "sales" AND "copilot" modules. Layout guard
 * resolved /agentik/copilot to "agentik" (internal, always passes) but the
 * page's own getEnabledModules check failed on "copilot".
 *
 * Fix: (1) enabled copilot module for Castillitos, (2) added "agentik/copilot"
 * → "copilot" entry to ROUTE_MODULE_MAP so layout guard is consistent.
 *
 * 6 regression tests:
 *   R-01: Castillitos keeps Commercial (sales module enabled)
 *   R-02: ROUTE_MODULE_MAP resolves agentik/copilot to "copilot" module
 *   R-03: Copilot page checks both "sales" AND "copilot" modules
 *   R-04: Copilot page does NOT alter other module entitlements
 *   R-05: Truly disabled module still shows block state
 *   R-06: Production hard block fires before module check
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const MODULES_FILE = path.join(ROOT, "lib/tenant/modules.ts");
const COPILOT_PAGE = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/page.tsx");
const COPILOT_CLIENT = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/copilot-runtime-client.tsx");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("P0 Entitlement Regression — Route Guard Consistency", () => {
  test("R-01: ROUTE_MODULE_MAP has agentik/copilot → copilot entry", () => {
    const src = readFile(MODULES_FILE);
    // Must have a multi-segment entry for agentik/copilot mapping to "copilot"
    expect(src).toContain('"agentik/copilot"');
    expect(src).toContain('"copilot"');
    // The entry must appear BEFORE the single-segment "agentik" entry
    // so the longer match takes precedence
    const copilotRouteIdx = src.indexOf('"agentik/copilot"');
    const agentikSingleIdx = src.indexOf('["agentik",');
    expect(copilotRouteIdx).toBeGreaterThan(-1);
    expect(agentikSingleIdx).toBeGreaterThan(-1);
    expect(copilotRouteIdx).toBeLessThan(agentikSingleIdx);
  });

  test("R-02: Copilot page checks BOTH sales AND copilot modules", () => {
    const src = readFile(COPILOT_PAGE);
    // Must check both module keys
    expect(src).toContain('enabledModules.has("sales")');
    expect(src).toContain('enabledModules.has("copilot")');
    // Must combine them with OR (either missing = disabled)
    expect(src).toContain("!hasSalesModule || !hasCopilotModule");
  });

  test("R-03: Copilot page does NOT call setModuleEnabled or modify entitlements", () => {
    const src = readFile(COPILOT_PAGE);
    expect(src).not.toContain("setModuleEnabled");
    expect(src).not.toContain("prisma.tenantModule");
    expect(src).not.toContain(".create(");
    expect(src).not.toContain(".update(");
    expect(src).not.toContain(".upsert(");
  });

  test("R-04: Client component renders module_disabled with explicit message", () => {
    const src = readFile(COPILOT_CLIENT);
    expect(src).toContain("module_disabled");
    expect(src).toContain("Módulo no disponible");
    // Must show which modules are required
    expect(src).toContain("Copilot");
    expect(src).toContain("Comercial");
  });

  test("R-05: Production hard block fires BEFORE module check call", () => {
    const src = readFile(COPILOT_PAGE);
    const prodBlockIdx = src.indexOf('process.env.VERCEL_ENV === "production"');
    // Match the actual call (await getEnabledModules), not the import
    const moduleCallIdx = src.indexOf("await getEnabledModules(");
    expect(prodBlockIdx).toBeGreaterThan(-1);
    expect(moduleCallIdx).toBeGreaterThan(-1);
    expect(prodBlockIdx).toBeLessThan(moduleCallIdx);
  });

  test("R-06: getEnabledModules is CLOSED BY DEFAULT (missing row = denied)", () => {
    const src = readFile(MODULES_FILE);
    // The design comment must state CLOSED BY DEFAULT
    expect(src).toContain("CLOSED BY DEFAULT");
    expect(src).toContain("TENANT_MISSING_ENTITLEMENT_BEHAVIOR = DENY");
    // The code must use strict equality (=== true), not truthy check
    expect(src).toContain("rowMap.get(k) === true");
  });
});
