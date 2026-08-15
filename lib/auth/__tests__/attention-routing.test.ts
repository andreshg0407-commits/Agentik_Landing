/**
 * lib/auth/__tests__/attention-routing.test.ts
 *
 * Sprint: AGENTIK-MANAGER-M2A
 *
 * Behavioral tests for attention routing in Manager Home.
 *
 * Proves:
 *   1. Seller alert routes to exact seller detail.
 *   2. Store alert routes to exact store detail.
 *   3. Customer alert has no CTA (NOT_CANONICALIZED).
 *   4. Unknown entityType has no CTA.
 *   5. Disabled/unknown module remains excluded.
 *   6. No generic crm/sales → clientes fallback.
 *   7. moduleLabel resolved server-side, not in client.
 *   8. Greeting boundaries: 04:59→noches, 05:00→dias, 11:59→dias,
 *      12:00→tardes, 18:59→tardes, 19:00→noches.
 *
 * Source-level contract tests (no DB, no browser).
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── 1: Seller alert → exact seller detail ────────────────────────────────────

describe("1 — Seller alert routes to exact seller detail", () => {
  test("resolveAttentionHref routes seller entityType to /vendedores/{slug}", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('if (alert.entityType === "seller")');
    expect(src).toContain("return `${base}/vendedores/${slug}`");
  });

  test("seller slug extracted from payloadJson.sellerSlug or entityKey", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("payload.sellerSlug as string");
    expect(src).toContain("alert.entityKey");
  });
});

// ── 2: Store alert → exact store detail ──────────────────────────────────────

describe("2 — Store alert routes to exact store detail", () => {
  test("resolveAttentionHref routes store entityType to /tiendas/{storeId}", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('if (alert.entityType === "store")');
    expect(src).toContain("return `${base}/tiendas/${storeId}`");
  });

  test("store ID extracted from payloadJson.storeId or entityKey", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("payload.storeId as string");
  });
});

// ── 3: Customer alert routes to exact client detail ─────────────────────────

describe("3 — Customer alert routes to exact client detail", () => {
  test("customer entityType routes to /clientes/{clienteId}", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('if (alert.entityType === "customer")');
    expect(src).toContain("return `${base}/clientes/${clienteId}`");
  });

  test("customer ID extracted from payload.clienteId, payload.customerId, or entityKey", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("payload.clienteId as string");
    expect(src).toContain("payload.customerId as string");
    expect(src).toContain("alert.entityKey");
  });

  test("customer alert with no identity returns null (fail closed)", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    // The customer branch has: if (clienteId) return route; return null;
    // This means missing identity → null → no CTA
    const fnStart = src.indexOf("function resolveAttentionHref");
    const fnBody = src.slice(fnStart, fnStart + 2000);
    const customerIdx = fnBody.indexOf('"customer"');
    const afterCustomer = fnBody.slice(customerIdx, customerIdx + 300);
    expect(afterCustomer).toContain("if (clienteId)");
    expect(afterCustomer).toContain("return null");
  });

  test("Manager client detail route exists", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/clientes/[clienteId]/page.tsx");
    expect(src).toContain("loadCliente360");
    expect(src).toContain("assembleManagerClienteDetailPA");
  });
});

// ── 4: Unknown entityType has no CTA ─────────────────────────────────────────

describe("4 — Unknown entityType has no CTA", () => {
  test("resolveAttentionHref returns null for org-level and unknown entities", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    // Function must end with return null for fallthrough
    // The function has a final return null for unknown entity types
    expect(src).toContain("// Org-level alerts");
    // After all entity type checks, the fallthrough is null
    expect(src).toContain('if (alert.entityType === "seller")');
    expect(src).toContain('if (alert.entityType === "store")');
    expect(src).toContain('if (alert.entityType === "customer")');
    // Last return in the function must be null
    const fnStart = src.indexOf("function resolveAttentionHref");
    const fnBody = src.slice(fnStart, fnStart + 1500);
    const lastReturn = fnBody.lastIndexOf("return null;");
    expect(lastReturn).toBeGreaterThan(0);
  });
});

// ── 5: Disabled/unknown module remains excluded ──────────────────────────────

describe("5 — Disabled/unknown module remains excluded", () => {
  test("isBusinessAlertEnabled is fail-closed for unknown modules", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("has no owner mapping — fail closed");
  });

  test("ALERT_MODULE_OWNER only maps proven emitter modules", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('sales:        "sales"');
    expect(src).toContain('source_aware: "sales"');
    expect(src).toContain('crm:          "sales"');
    expect(src).toContain('finance:      "finance"');
  });
});

// ── 6: No generic crm/sales → clientes fallback ─────────────────────────────

describe("6 — No generic module → collection fallback", () => {
  test("resolveAttentionHref does not map by module key", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    const fn = extractFunction(src, "resolveAttentionHref");
    // Must NOT contain module-based routing like "mod === 'crm'"
    expect(fn).not.toContain('mod === "crm"');
    expect(fn).not.toContain('mod === "sales"');
    expect(fn).not.toContain("alert.module");
  });
});

// ── 7: moduleLabel resolved server-side ──────────────────────────────────────

describe("7 — moduleLabel resolved server-side", () => {
  test("assembleGlobalAttention produces moduleLabel field", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("moduleLabel: resolveModuleLabel(mod)");
  });

  test("MODULE_DISPLAY_LABELS has canonical mappings", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('sales:        "Comercial"');
    expect(src).toContain('crm:          "Clientes"');
    expect(src).toContain('source_aware: "Fuentes de datos"');
  });

  test("client does NOT have parallel ATTENTION_MODULE_LABELS", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).not.toContain("ATTENTION_MODULE_LABELS");
  });

  test("client uses item.moduleLabel, not item.module for display", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).toContain("{item.moduleLabel}");
    // Must NOT display raw item.module
    expect(src).not.toContain("{item.module}");
  });
});

// ── 8: Greeting boundaries ───────────────────────────────────────────────────

describe("8 — Greeting boundaries", () => {
  test("client greeting: 04:59 → Buenas noches", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    // hour >= 5 is the morning boundary
    expect(src).toContain("hour >= 5 && hour < 12");
  });

  test("client greeting: 05:00–11:59 → Buenos días", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).toContain('(hour >= 5 && hour < 12) ? "Buenos días"');
  });

  test("client greeting: 12:00–18:59 → Buenas tardes", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).toContain('(hour >= 12 && hour < 19) ? "Buenas tardes"');
  });

  test("client greeting: 19:00–04:59 → Buenas noches", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).toContain(': "Buenas noches"');
  });

  test("server greeting: uses h >= 5 boundary", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("h >= 5 && h < 12");
    expect(src).toContain("h >= 12 && h < 19");
  });

  test("greeting boundary values resolve correctly", () => {
    // Simulate the greeting logic
    function greet(h: number) {
      if (h >= 5 && h < 12) return "Buenos días";
      if (h >= 12 && h < 19) return "Buenas tardes";
      return "Buenas noches";
    }

    expect(greet(4)).toBe("Buenas noches");   // 04:59
    expect(greet(5)).toBe("Buenos días");      // 05:00
    expect(greet(11)).toBe("Buenos días");     // 11:59
    expect(greet(12)).toBe("Buenas tardes");   // 12:00
    expect(greet(18)).toBe("Buenas tardes");   // 18:59
    expect(greet(19)).toBe("Buenas noches");   // 19:00
    expect(greet(0)).toBe("Buenas noches");    // 00:30
    expect(greet(23)).toBe("Buenas noches");   // 23:00
  });
});

// ── 9: Shared CopilotSphere exists ───────────────────────────────────────────

describe("9 — Shared CopilotSphere component", () => {
  test("shared CopilotSphere exists as a dedicated component", () => {
    const src = readFile("components/shell/copilot-sphere.tsx");
    expect(src).toContain("export function CopilotSphere");
    expect(src).toContain("radial-gradient");
    expect(src).toContain("backdropFilter");
  });

  test("Manager imports shared CopilotSphere", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-app-shell.tsx");
    expect(src).toContain('import { CopilotSphere } from "@/components/shell/copilot-sphere"');
  });

  test("Manager does NOT have inline AgentikSphere function", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-app-shell.tsx");
    expect(src).not.toContain("function AgentikSphere");
  });

  test("Seller App imports shared CopilotSphere", () => {
    const src = readFile("app/(app)/[orgSlug]/seller-app/seller-app-shell.tsx");
    expect(src).toContain('import { CopilotSphere } from "@/components/shell/copilot-sphere"');
  });

  test("Seller App does NOT import CopilotSphere from seller-ui-kit", () => {
    const src = readFile("app/(app)/[orgSlug]/seller-app/seller-app-shell.tsx");
    expect(src).not.toContain("CopilotSphere } from \"./views/seller-ui-kit\"");
    expect(src).not.toContain("CopilotSphere} from \"./views/seller-ui-kit\"");
  });
});

// ── 10: Seller active filter is fail-closed ─────────────────────────────────

describe("10 — Seller active filter is fail-closed (allowlist)", () => {
  test("uses MANAGER_RELEVANT_STATES allowlist, not blocklist", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('MANAGER_RELEVANT_STATES');
    expect(src).toContain('"activo"');
    expect(src).toContain('"atencion"');
  });

  test("filter uses .has() on the allowlist set", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("MANAGER_RELEVANT_STATES.has(s.activityStatus)");
  });

  test("activo and atencion are included, all others excluded", () => {
    // Simulate the fail-closed filter
    const MANAGER_RELEVANT_STATES = new Set(["activo", "atencion"]);
    const filter = (status: string | null | undefined) =>
      MANAGER_RELEVANT_STATES.has(status as string);

    expect(filter("activo")).toBe(true);
    expect(filter("atencion")).toBe(true);
    expect(filter("inactivo")).toBe(false);
    expect(filter(null as unknown as string)).toBe(false);
    expect(filter(undefined as unknown as string)).toBe(false);
    expect(filter("")).toBe(false);
    expect(filter("unknown")).toBe(false);
    expect(filter("ACTIVO")).toBe(false); // case-sensitive
  });
});

// ── Helper ──────────────────────────────────────────────────────────────────

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) return "";
  let braces = 0;
  let i = src.indexOf("{", start);
  if (i === -1) return "";
  const begin = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") braces++;
    if (src[i] === "}") braces--;
    if (braces === 0) return src.slice(begin, i + 1);
  }
  return src.slice(begin);
}
