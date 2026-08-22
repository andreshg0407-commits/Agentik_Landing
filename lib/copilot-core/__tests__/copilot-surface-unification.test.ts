/**
 * lib/copilot-core/__tests__/copilot-surface-unification.test.ts
 *
 * COPILOT-SURFACE-UNIFICATION-01 — Phase 1 Desktop Tests
 *
 * 9 tests covering:
 *   SU-01: Single chat consumer component exists
 *   SU-02: Chat consumer calls real chat API endpoint
 *   SU-03: Chat consumer calls real reports API endpoint
 *   SU-04: Chat consumer shows demo mode banner
 *   SU-05: Chat consumer accepts page context props
 *   SU-06: Shell imports and renders CopilotChatConsumer
 *   SU-07: Shell has drawer width constant
 *   SU-08: QA route still exists but nav entry removed
 *   SU-09: No duplicate runtime — consumer reuses 01C API routes
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const CHAT_CONSUMER = path.join(ROOT, "components/copilot/copilot-chat-consumer.tsx");
const SHELL_CLIENT = path.join(ROOT, "components/shell/workspace-shell-client.tsx");
const NAV_CONFIG = path.join(ROOT, "components/shell/module-nav-config.ts");
const QA_PAGE = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/page.tsx");
const QA_CLIENT = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/copilot-runtime-client.tsx");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("Surface Unification — Shared Consumer", () => {
  test("SU-01: Chat consumer component exists and exports CopilotChatConsumer", () => {
    expect(fs.existsSync(CHAT_CONSUMER)).toBe(true);
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("export function CopilotChatConsumer");
    expect(src.startsWith('"use client"')).toBe(true);
  });

  test("SU-02: Chat consumer calls real chat API endpoint", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("/api/orgs/${context.orgSlug}/copilot/chat");
    expect(src).toContain('method: "POST"');
    expect(src).toContain("Content-Type");
  });

  test("SU-03: Chat consumer calls real reports API endpoint", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("/api/orgs/${context.orgSlug}/copilot/reports");
    expect(src).toContain("reportType");
  });

  test("SU-04: Chat consumer shows demo mode banner", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("Modo demostración");
    expect(src).toContain("sin modelo de IA conectado");
    expect(src).toContain("determinísticas");
  });

  test("SU-05: Chat consumer accepts page context props (orgSlug, module, route, role)", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("CopilotPageContext");
    expect(src).toContain("orgSlug: string");
    expect(src).toContain("module: string | null");
    expect(src).toContain("route: string");
    expect(src).toContain("membershipRole: string");
  });
});

describe("Surface Unification — Desktop Rail Drawer", () => {
  test("SU-06: Shell imports and renders CopilotChatConsumer", () => {
    const src = readFile(SHELL_CLIENT);
    expect(src).toContain("CopilotChatConsumer");
    expect(src).toContain("copilotOpen");
    expect(src).toContain("setCopilotOpen");
  });

  test("SU-07: Shell has drawer width constant wider than rail", () => {
    const src = readFile(SHELL_CLIENT);
    // DRAWER_W must exist and be larger than RAIL_W (264)
    expect(src).toContain("DRAWER_W");
    const drawerMatch = src.match(/DRAWER_W\s*=\s*(\d+)/);
    expect(drawerMatch).not.toBeNull();
    const drawerW = parseInt(drawerMatch![1], 10);
    expect(drawerW).toBeGreaterThan(264);
  });
});

describe("Surface Unification — Navigation & QA", () => {
  test("SU-08: QA route exists but nav entry removed from sidebar", () => {
    // QA page still exists
    expect(fs.existsSync(QA_PAGE)).toBe(true);
    expect(fs.existsSync(QA_CLIENT)).toBe(true);
    // Nav config does NOT have clickable Copilot Preview item
    const navSrc = readFile(NAV_CONFIG);
    expect(navSrc).not.toContain('label: "Copilot Preview"');
  });

  test("SU-09: No duplicate runtime — consumer reuses 01C API routes", () => {
    const src = readFile(CHAT_CONSUMER);
    // Must use the SAME API routes as the QA page client
    expect(src).toContain("/api/orgs/");
    expect(src).toContain("/copilot/chat");
    expect(src).toContain("/copilot/reports");
    // Must NOT import any gateway, adapter, or runtime directly
    expect(src).not.toContain("copilot-core-gateway");
    expect(src).not.toContain("copilot-core-chat-runtime");
    expect(src).not.toContain("copilot-core-envelope");
  });
});
