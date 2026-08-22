/**
 * lib/copilot-core/__tests__/copilot-surface-unification.test.ts
 *
 * COPILOT-DESKTOP-RAIL-UX-01R1 — Surface Unification R1 Tests
 *
 * 21 tests covering:
 *   Phase 1 contract (SU-01 through SU-09):
 *   SU-01: Single chat consumer component exists
 *   SU-02: Chat consumer calls real chat API endpoint
 *   SU-03: Chat consumer calls real reports API endpoint
 *   SU-04: Chat consumer shows demo mode banner
 *   SU-05: Chat consumer accepts page context with agent info
 *   SU-06: Shell imports and renders CopilotChatConsumer
 *   SU-07: Shell has drawer width constant
 *   SU-08: QA route still exists but nav entry removed
 *   SU-09: No duplicate runtime — consumer reuses 01C API routes
 *
 *   R1 tests (R1-01 through R1-12):
 *   R1-01: Maletas resolves david (not pablo)
 *   R1-02: Gestión resolves pablo
 *   R1-03: Module change changes agent
 *   R1-04: Agent visible when chat open (consumer header)
 *   R1-05: Button is called "Iniciar chat"
 *   R1-06: Input visible (viewport-based — sticky rail)
 *   R1-07: Messages have scroll (overflowY auto)
 *   R1-08: Open/close preserves module (no navigation)
 *   R1-09: Report renders in chat first (keyword as message)
 *   R1-10: Download is secondary (Descargar CSV)
 *   R1-11: No irrelevant reports for non-commercial agent
 *   R1-12: Alerts from real data — no placeholder text
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const CHAT_CONSUMER = path.join(ROOT, "components/copilot/copilot-chat-consumer.tsx");
const CHAT_MESSAGE = path.join(ROOT, "components/copilot/copilot-chat-message.tsx");
const SHELL_CLIENT = path.join(ROOT, "components/shell/workspace-shell-client.tsx");
const NAV_CONFIG = path.join(ROOT, "components/shell/module-nav-config.ts");
const QA_PAGE = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/page.tsx");
const QA_CLIENT = path.join(ROOT, "app/(app)/[orgSlug]/agentik/copilot/copilot-runtime-client.tsx");
const AGENT_RESOLVER = path.join(ROOT, "lib/agentik-agents/agent-resolver.ts");
const AGENT_REGISTRY = path.join(ROOT, "lib/agentik-agents/agent-registry.ts");
const REPORT_GENERATOR = path.join(ROOT, "lib/copilot-core/copilot-core-report-generator.ts");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ── Phase 1 Contract ────────────────────────────────────────────────────────

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

  test("SU-05: Chat consumer accepts page context with agent info", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("CopilotPageContext");
    expect(src).toContain("CopilotAgentInfo");
    expect(src).toContain("orgSlug: string");
    expect(src).toContain("module: string | null");
    expect(src).toContain("route: string");
    expect(src).toContain("membershipRole: string");
    expect(src).toContain("agent: CopilotAgentInfo");
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
    expect(src).toContain("DRAWER_W");
    const drawerMatch = src.match(/DRAWER_W\s*=\s*(\d+)/);
    expect(drawerMatch).not.toBeNull();
    const drawerW = parseInt(drawerMatch![1], 10);
    expect(drawerW).toBeGreaterThan(264);
  });
});

describe("Surface Unification — Navigation & QA", () => {
  test("SU-08: QA route exists but nav entry removed from sidebar", () => {
    expect(fs.existsSync(QA_PAGE)).toBe(true);
    expect(fs.existsSync(QA_CLIENT)).toBe(true);
    const navSrc = readFile(NAV_CONFIG);
    expect(navSrc).not.toContain('label: "Copilot Preview"');
  });

  test("SU-09: No duplicate runtime — consumer reuses 01C API routes", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("/api/orgs/");
    expect(src).toContain("/copilot/chat");
    expect(src).toContain("/copilot/reports");
    expect(src).not.toContain("copilot-core-gateway");
    expect(src).not.toContain("copilot-core-chat-runtime");
    expect(src).not.toContain("copilot-core-envelope");
  });
});

// ── R1 Tests — Contextual Agent + Viewport Chat + Reports ──────────────────

describe("R1 — Contextual Agent Resolution", () => {
  test("R1-01: Maletas resolves david, not pablo", () => {
    const src = readFile(AGENT_RESOLVER);
    // /comercial pattern maps to david agent
    const comercialRule = src.match(/pattern:\s*\/\\\/comercial\/.*?agentId:\s*"(\w+)"/s);
    expect(comercialRule).not.toBeNull();
    expect(comercialRule![1]).toBe("david");
    // david exists in registry
    const reg = readFile(AGENT_REGISTRY);
    expect(reg).toContain('"david"');
    expect(reg).toContain('displayName: "David · Comercial"');
  });

  test("R1-02: Gestión resolves pablo", () => {
    const src = readFile(AGENT_RESOLVER);
    // /agentik pattern maps to pablo
    const agentikRule = src.match(/\/\\\/agentik\/[^"]*?agentId:\s*"(\w+)"/s);
    expect(agentikRule).not.toBeNull();
    expect(agentikRule![1]).toBe("pablo");
  });

  test("R1-03: Module change changes agent — shell uses resolveAgentForRoute", () => {
    const src = readFile(SHELL_CLIENT);
    expect(src).toContain("resolveAgentForRoute");
    expect(src).toContain("agentResult.agent");
    // Agent is resolved from pathname, not hardcoded
    expect(src).toContain("resolveAgentForRoute({ pathname })");
  });
});

describe("R1 — Agent Identity in Drawer", () => {
  test("R1-04: Agent visible when chat open — consumer shows agent displayName", () => {
    const src = readFile(CHAT_CONSUMER);
    expect(src).toContain("agent.displayName");
    expect(src).toContain("agent.title");
    expect(src).toContain("agent.name.slice(0, 1)");
    // Agent identity in header, NOT generic "Copilot"
    expect(src).not.toContain('>Copilot<');
  });

  test("R1-05: Button is called 'Iniciar chat'", () => {
    const src = readFile(SHELL_CLIENT);
    expect(src).toContain("Iniciar chat");
    // No more "C" branded button
    expect(src).not.toContain(">C</span>");
  });
});

describe("R1 — Viewport & Scroll", () => {
  test("R1-06: Rail is viewport-sticky (position sticky, 100dvh)", () => {
    const src = readFile(SHELL_CLIENT);
    // Right rail must use sticky + 100dvh for viewport independence
    expect(src).toContain('"sticky"');
    expect(src).toContain('"100dvh"');
  });

  test("R1-07: Messages have scroll — only message area scrolls", () => {
    const src = readFile(CHAT_CONSUMER);
    // Messages area has overflowY auto and flex 1
    const messagesArea = src.includes('overflowY: "auto"');
    expect(messagesArea).toBe(true);
    // Header and input are flexShrink 0 (fixed)
    expect(src).toContain("flexShrink: 0");
  });

  test("R1-08: Open/close preserves module — no router navigation", () => {
    const src = readFile(SHELL_CLIENT);
    // setCopilotOpen only toggles state, no router.push
    expect(src).toContain("setCopilotOpen(true)");
    expect(src).toContain("setCopilotOpen(false)");
    // No router.push or window.location in copilot toggle
    expect(src).not.toContain("router.push");
    expect(src).not.toContain("window.location");
  });
});

describe("R1 — Report Flow", () => {
  test("R1-09: Report renders in chat first — chip sends keyword as message", () => {
    const src = readFile(CHAT_CONSUMER);
    // Report chips trigger handleReportQuery which calls handleSend with keyword
    expect(src).toContain("handleReportQuery");
    expect(src).toContain("handleSend(chip.keyword)");
    // Capability ID and facts stored from response
    expect(src).toContain("capabilityId: data.answer.capabilityId");
    expect(src).toContain("facts: data.answer.facts");
  });

  test("R1-10: Download is secondary — Descargar CSV button on messages", () => {
    const msgSrc = readFile(CHAT_MESSAGE);
    expect(msgSrc).toContain("Descargar CSV");
    expect(msgSrc).toContain("onDownload");
    // Consumer passes download handler
    const conSrc = readFile(CHAT_CONSUMER);
    expect(conSrc).toContain("onDownload={handleDownloadReport}");
  });

  test("R1-11: No irrelevant reports — domain filtering", () => {
    const src = readFile(CHAT_CONSUMER);
    // Report chips filtered by agent domain
    expect(src).toContain("DOMAIN_REPORTS");
    expect(src).toContain('sales: COMMERCIAL_REPORTS');
    // Only domain-matching reports shown
    expect(src).toContain("DOMAIN_REPORTS[agent.domain]");
  });

  test("R1-12: Reports have enhanced CSV with detailed sections", () => {
    const src = readFile(REPORT_GENERATOR);
    // Enhanced CSV headers (Spanish)
    expect(src).toContain("Informe de Clientes");
    expect(src).toContain("Informe de Pedidos");
    expect(src).toContain("Informe de Desempeño Comercial");
    // Derived metrics
    expect(src).toContain("Porcentaje");
    expect(src).toContain("Origen,Cantidad");
    expect(src).toContain("Pedidos por Vendedor");
    // PII note
    expect(src).toContain("Datos agregados sin información personal identificable");
  });
});
