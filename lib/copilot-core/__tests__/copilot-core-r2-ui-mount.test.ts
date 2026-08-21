/**
 * lib/copilot-core/__tests__/copilot-core-r2-ui-mount.test.ts
 *
 * Copilot Core — R2 UI Mount Integration Tests
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C-R2
 *
 * 10 tests covering:
 * - R2-01: Direct route page.tsx exists and exports default
 * - R2-02: Client component exists and exports CopilotRuntimeClient
 * - R2-03: Client component is marked "use client"
 * - R2-04: Server page uses requireOrgAccess (not requireTenant)
 * - R2-05: Server page has production hard block
 * - R2-06: Server page passes all 4 required props
 * - R2-07: Client component renders explicit blocked states (never hides)
 * - R2-08: Client component calls real chat API endpoint
 * - R2-09: Client component calls real reports API endpoint
 * - R2-10: Nav config includes "Copilot Preview" entry in agentik domain
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const COPILOT_PAGE = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/page.tsx");
const COPILOT_CLIENT = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/copilot-runtime-client.tsx");
const NAV_CONFIG = path.join(ROOT, "components/shell/module-nav-config.ts");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("R2 UI Mount — Route & Component", () => {
  test("R2-01: Direct route page.tsx exists and exports default", () => {
    expect(fs.existsSync(COPILOT_PAGE)).toBe(true);
    const src = readFile(COPILOT_PAGE);
    expect(src).toContain("export default async function");
  });

  test("R2-02: Client component exists and exports CopilotRuntimeClient", () => {
    expect(fs.existsSync(COPILOT_CLIENT)).toBe(true);
    const src = readFile(COPILOT_CLIENT);
    expect(src).toContain("export function CopilotRuntimeClient");
  });

  test("R2-03: Client component is marked 'use client'", () => {
    const src = readFile(COPILOT_CLIENT);
    expect(src.startsWith('"use client"')).toBe(true);
  });
});

describe("R2 UI Mount — Server Page Guards", () => {
  test("R2-04: Server page uses requireOrgAccess (not requireTenant)", () => {
    const src = readFile(COPILOT_PAGE);
    expect(src).toContain("requireOrgAccess");
    expect(src).not.toContain("requireTenant");
  });

  test("R2-05: Server page has production hard block before any processing", () => {
    const src = readFile(COPILOT_PAGE);
    // Find the actual code check, not comments
    const prodBlockIdx = src.indexOf('process.env.VERCEL_ENV === "production"');
    const authIdx = src.indexOf('await requireOrgAccess(');
    expect(prodBlockIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    // Production block must come before auth
    expect(prodBlockIdx).toBeLessThan(authIdx);
  });

  test("R2-06: Server page passes all 4 required props to client", () => {
    const src = readFile(COPILOT_PAGE);
    expect(src).toContain("orgSlug={orgSlug}");
    expect(src).toContain("state={state}");
    expect(src).toContain("membershipRole={");
    expect(src).toContain("previewEnabled={previewEnabled}");
  });
});

describe("R2 UI Mount — Client Component Contract", () => {
  test("R2-07: Client renders explicit blocked states (never hides silently)", () => {
    const src = readFile(COPILOT_CLIENT);
    // All three blocked states must have explicit messages
    expect(src).toContain("flag_disabled");
    expect(src).toContain("module_disabled");
    expect(src).toContain("role_blocked");
    // Must show a title/description for each
    expect(src).toContain("Copilot no habilitado");
    expect(src).toContain("Módulo no disponible");
    expect(src).toContain("Acceso restringido");
  });

  test("R2-08: Client calls real chat API endpoint", () => {
    const src = readFile(COPILOT_CLIENT);
    expect(src).toContain("/api/orgs/${orgSlug}/copilot/chat");
    expect(src).toContain("method: \"POST\"");
    expect(src).toContain("Content-Type");
  });

  test("R2-09: Client calls real reports API endpoint", () => {
    const src = readFile(COPILOT_CLIENT);
    expect(src).toContain("/api/orgs/${orgSlug}/copilot/reports");
    expect(src).toContain("reportType");
  });
});

describe("R2 UI Mount — Navigation", () => {
  test("R2-10: Nav config includes Copilot Preview entry in agentik domain", () => {
    const src = readFile(NAV_CONFIG);
    expect(src).toContain("Copilot Preview");
    expect(src).toContain("agentik/copilot");
    // Must be in agentik domain (pathKeys includes it)
    const agentikSection = src.slice(
      src.indexOf('id:        "agentik"'),
      src.indexOf("Configuracion"),
    );
    expect(agentikSection).toContain("Copilot Preview");
    expect(agentikSection).toContain("agentik/copilot");
  });
});
