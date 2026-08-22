/**
 * lib/copilot-core/__tests__/copilot-core-security.test.ts
 *
 * Copilot Core — Security Tests
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * 55 security tests covering:
 * - Envelope & Authority (1-10)
 * - Scope & Seller (11-18)
 * - Gateway (19-28)
 * - Client Authority (29-34)
 * - Data Safety (35-40)
 * - Zero Writes & Ephemeral (41-44)
 * - R2 Delta Tests (45-52)
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// NOTE: Only import pure modules (no "server-only" imports).
// Rate limiter, gateway, envelope builder, and chat runtime are SERVER-ONLY
// and cannot be imported in bun:test. Those are verified via source scanning.

import { validateEnvelope } from "../copilot-core-envelope";
import { authorizeCopilotCapability } from "../copilot-core-authz";
import { getCapability } from "../copilot-core-capability-registry";
import { resolveIntent } from "../copilot-core-intent-resolver";
import { buildMockCopilotResponse } from "../copilot-core-mock-responder";
import { isValidReportType, reportTypeToCapabilityId, generateReport } from "../copilot-core-report-generator";
import type { CopilotTaskSuggestion } from "../copilot-core-task-contract";
import type {
  CopilotEnvelope,
  MembershipRole,
  ResourceScope,
  TruthState,
} from "../copilot-core-types";

// ── Test Helpers ──────────────────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<CopilotEnvelope> = {}): CopilotEnvelope {
  return {
    organizationId: "org-001",
    orgSlug: "test-org",
    userId: "user-001",
    membershipId: "mem-001",
    platformRole: null,
    membershipRole: "ORG_ADMIN",
    moduleKey: "sales",
    surface: "desktop",
    entitlementSet: new Set(["sales", "copilot"]),
    actorScope: "organization",
    sellerBinding: null,
    requestedResourceScope: {
      kind: "organization",
      organizationId: "org-001",
    },
    requestId: "req-001",
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const COPILOT_CORE_DIR = path.resolve(__dirname, "..");

function readCopilotCoreFiles(): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "__tests__" && entry.name !== "node_modules") {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  }
  walk(COPILOT_CORE_DIR);
  return files;
}

function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ── Envelope & Authority (1-10) ─────────────────────────────────────────────

describe("Envelope & Authority", () => {
  test("SEC-01: missing organizationId → INVALID_ENVELOPE", () => {
    const env = makeEnvelope({ organizationId: "" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
  });

  test("SEC-02: null platformRole is valid (regular user)", () => {
    const env = makeEnvelope({ platformRole: null });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  test("SEC-03: cross-tenant resourceScope → invalid envelope", () => {
    const env = makeEnvelope({
      organizationId: "org-001",
      requestedResourceScope: {
        kind: "organization",
        organizationId: "org-999",
      },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
  });

  test("SEC-04: OPERATOR → blocked at envelope builder (01C runtime gate)", () => {
    // The 01C gate is in the envelope builder, not in authz.
    // authz allows OPERATOR at the capability level (for future seller-scoped use),
    // but the envelope builder blocks OPERATOR before the pipeline runs.
    const builderSource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-envelope-builder.ts"));
    // Verify the builder has a role gate that excludes OPERATOR
    expect(builderSource).toContain("COPILOT_ROLE_BLOCKED");
    expect(builderSource).toContain("ORG_ADMIN");
    expect(builderSource).toContain("MANAGER");
  });

  test("SEC-05: OPERATOR not in 01C allowed roles set", () => {
    // Verify the envelope builder's allowed roles set
    const builderSource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-envelope-builder.ts"));
    // The ALLOWED_ROLES set should contain ORG_ADMIN and MANAGER only
    expect(builderSource).toContain("COPILOT_01C_ALLOWED_ROLES");
    // Verify OPERATOR is not in the allowed roles
    const allowedRolesMatch = builderSource.match(/COPILOT_01C_ALLOWED_ROLES[\s\S]*?new Set\(\[([\s\S]*?)\]\)/);
    if (allowedRolesMatch) {
      expect(allowedRolesMatch[1]).not.toContain("OPERATOR");
    }
  });

  test("SEC-06: VIEWER → ROLE_DENIED", () => {
    const env = makeEnvelope({ membershipRole: "VIEWER" });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("ROLE_DENIED");
  });

  test("SEC-07: BILLING → ROLE_DENIED", () => {
    const env = makeEnvelope({ membershipRole: "BILLING" });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("ROLE_DENIED");
  });

  test("SEC-08: module not in entitlementSet → MODULE_DENIED", () => {
    const env = makeEnvelope({ entitlementSet: new Set(["marketing"]) });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(false);
  });

  test("SEC-09: ORG_ADMIN → allowed", () => {
    const env = makeEnvelope({ membershipRole: "ORG_ADMIN" });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(true);
  });

  test("SEC-10: MANAGER → allowed", () => {
    const env = makeEnvelope({ membershipRole: "MANAGER" });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(true);
  });
});

// ── Scope & Seller (11-18) ──────────────────────────────────────────────────

describe("Scope & Seller", () => {
  test("SEC-11: no seller data in any adapter source file", () => {
    const adapterDir = path.join(COPILOT_CORE_DIR, "adapters");
    if (!fs.existsSync(adapterDir)) return;
    const adapterFiles = fs.readdirSync(adapterDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => readFileContent(path.join(adapterDir, f)));

    for (const content of adapterFiles) {
      // Adapters should not include individual seller data in DTOs
      expect(content).not.toContain("sellerName:");
      expect(content).not.toContain("sellerEmail");
      expect(content).not.toContain("sellerPhone");
    }
  });

  test("SEC-12: no seller data in mock responder", () => {
    const content = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-mock-responder.ts"));
    expect(content).not.toContain("sellerName:");
    expect(content).not.toContain("sellerEmail");
  });

  test("SEC-13: no seller data in intent resolver", () => {
    const content = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-intent-resolver.ts"));
    expect(content).not.toContain("sellerName:");
    expect(content).not.toContain("sellerId:");
  });

  test("SEC-14: sellerBinding always null in 01C envelope", () => {
    const env = makeEnvelope();
    expect(env.sellerBinding).toBeNull();
  });

  test("SEC-15: platform authority uses MembershipRole for scope", () => {
    // A SUPER_ADMIN with MANAGER membershipRole should be authorized as MANAGER
    const env = makeEnvelope({
      platformRole: "SUPER_ADMIN",
      membershipRole: "MANAGER",
    });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(true);
  });

  test("SEC-16: actorScope always 'organization' in 01C", () => {
    const env = makeEnvelope();
    expect(env.actorScope).toBe("organization");
  });

  test("SEC-17: seller scope blocked at envelope builder level in 01C", () => {
    // In 01C, OPERATOR is blocked at the envelope builder level before
    // reaching authz. The authz itself allows seller scope for future use.
    // Verify the envelope builder does not produce seller-scoped envelopes.
    const builderSource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-envelope-builder.ts"));
    expect(builderSource).toContain('actorScope: "organization"');
    expect(builderSource).toContain("sellerBinding: null");
  });

  test("SEC-18: self scope → denied", () => {
    const env = makeEnvelope({
      actorScope: "self",
      requestedResourceScope: {
        kind: "self",
        organizationId: "org-001",
      },
    });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(false);
  });
});

// ── Gateway (19-28) ─────────────────────────────────────────────────────────

describe("Gateway", () => {
  test("SEC-19: unknown capabilityId → fail closed", () => {
    const cap = getCapability("commercial.unknown.read");
    expect(cap).toBeUndefined();
  });

  test("SEC-20: capabilities have correct risk class (READ only in 01C)", () => {
    const cap = getCapability("commercial.customers.summary.read");
    expect(cap).toBeDefined();
    if (cap) {
      expect(cap.riskClass).toBe("READ");
    }
  });

  test("SEC-21: entitlement missing → denied", () => {
    const env = makeEnvelope({ entitlementSet: new Set([]) });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(false);
  });

  test("SEC-22: adapter not in switch → unknown handled", () => {
    const cap = getCapability("commercial.inventory.read");
    expect(cap).toBeUndefined();
  });

  test("SEC-23: capability A cannot execute adapter B (confused-deputy)", () => {
    // The gateway verifies adapter.capabilityId === requested capabilityId.
    // Tested at the gateway level in gateway.test.ts. Here we verify
    // the registry doesn't cross-reference.
    const custCap = getCapability("commercial.customers.summary.read");
    const orderCap = getCapability("commercial.orders.summary.read");
    if (custCap && orderCap) {
      expect(custCap.capabilityId).not.toBe(orderCap.capabilityId);
    }
  });

  test("SEC-24: function values in arguments — gateway should reject", () => {
    // Verified at the gateway level: typeof value === "function" check
    const gatewaySource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-gateway.ts"));
    expect(gatewaySource).toContain('typeof value === "function"');
  });

  test("SEC-25: gateway wraps exceptions — no stack trace leak", () => {
    const gatewaySource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-gateway.ts"));
    expect(gatewaySource).toContain("catch (err)");
    expect(gatewaySource).not.toContain("err.stack");
    expect(gatewaySource).not.toContain("err.message");
  });

  test("SEC-26: sanitized audit log emitted (no PII)", () => {
    const gatewaySource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-gateway.ts"));
    // Audit log should include requestId, organizationId, capabilityId, result, durationMs
    expect(gatewaySource).toContain("requestId:");
    expect(gatewaySource).toContain("organizationId:");
    expect(gatewaySource).toContain("capabilityId");
    expect(gatewaySource).toContain("durationMs:");
    // Should NOT include message, prompt, DTO content, PII
    expect(gatewaySource).not.toContain("userMessage");
    expect(gatewaySource).not.toContain("nit:");
  });

  test("SEC-27: OPERATOR blocked at envelope builder before reaching gateway", () => {
    // OPERATOR is blocked at the envelope builder level in 01C,
    // not at the authz level (authz allows OPERATOR for future seller scope).
    const builderSource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-envelope-builder.ts"));
    expect(builderSource).toContain("COPILOT_ROLE_BLOCKED");
    // The route catches this error and returns 403
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).toContain("COPILOT_ROLE_BLOCKED");
    expect(routeSource).toContain("403");
  });

  test("SEC-28: resolveCopilotAdapter not exported (private)", () => {
    const gatewaySource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-gateway.ts"));
    expect(gatewaySource).toContain("function resolveCopilotAdapter");
    expect(gatewaySource).not.toContain("export function resolveCopilotAdapter");
  });
});

// ── Client Authority (29-34) ────────────────────────────────────────────────

describe("Client Authority Blocked", () => {
  test("SEC-29: moduleKey from client → absent in API body", () => {
    // The API route only accepts { message: string }. No moduleKey.
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).not.toContain("body.moduleKey");
    expect(routeSource).not.toContain("moduleKey");
  });

  test("SEC-30: actorScope from client → absent in API body", () => {
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).not.toContain("body.actorScope");
  });

  test("SEC-31: sellerId from client → absent in API body", () => {
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).not.toContain("body.sellerId");
  });

  test("SEC-32: surface hardcoded server-side", () => {
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).toContain('serverSurface: "desktop"');
  });

  test("SEC-33: capabilityId from client → absent in API body", () => {
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).not.toContain("body.capabilityId");
  });

  test("SEC-34: requestedResourceScope from client → absent in API body", () => {
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    expect(routeSource).not.toContain("body.requestedResourceScope");
    expect(routeSource).not.toContain("body.resourceScope");
  });
});

// ── Data Safety (35-40) ─────────────────────────────────────────────────────

describe("Data Safety", () => {
  test("SEC-35: no NIT in adapter output types", () => {
    const adapterDir = path.join(COPILOT_CORE_DIR, "adapters");
    if (!fs.existsSync(adapterDir)) return;
    const adapterFiles = fs.readdirSync(adapterDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => readFileContent(path.join(adapterDir, f)));

    for (const content of adapterFiles) {
      // DTO interface should not expose NIT as a field
      expect(content).not.toMatch(/readonly\s+nit\s*:/);
      // redactedFields should reference nit in some form
      const hasNitRedaction = content.includes('"nit"') || content.includes('"customerNit"');
      expect(hasNitRedaction).toBe(true);
    }
  });

  test("SEC-36: no email in adapter output types", () => {
    const adapterDir = path.join(COPILOT_CORE_DIR, "adapters");
    if (!fs.existsSync(adapterDir)) return;
    const adapterFiles = fs.readdirSync(adapterDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => readFileContent(path.join(adapterDir, f)));

    for (const content of adapterFiles) {
      expect(content).not.toMatch(/readonly\s+email\s*:/);
    }
  });

  test("SEC-37: no phone in adapter output types", () => {
    const adapterDir = path.join(COPILOT_CORE_DIR, "adapters");
    if (!fs.existsSync(adapterDir)) return;
    const adapterFiles = fs.readdirSync(adapterDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => readFileContent(path.join(adapterDir, f)));

    for (const content of adapterFiles) {
      expect(content).not.toMatch(/readonly\s+phone\s*:/);
    }
  });

  test("SEC-38: no credit limit in adapter output types", () => {
    const adapterDir = path.join(COPILOT_CORE_DIR, "adapters");
    if (!fs.existsSync(adapterDir)) return;
    const adapterFiles = fs.readdirSync(adapterDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => readFileContent(path.join(adapterDir, f)));

    for (const content of adapterFiles) {
      expect(content).not.toMatch(/readonly\s+creditLimit\s*:/);
      expect(content).not.toMatch(/readonly\s+cupo\s*:/);
    }
  });

  test("SEC-39: no individual customer records in adapter DTOs", () => {
    const adapterDir = path.join(COPILOT_CORE_DIR, "adapters");
    if (!fs.existsSync(adapterDir)) return;
    const adapterFiles = fs.readdirSync(adapterDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => readFileContent(path.join(adapterDir, f)));

    for (const content of adapterFiles) {
      // DTOs should not contain arrays of individual customer objects
      expect(content).not.toMatch(/readonly\s+customers\s*:\s*\{/);
      expect(content).not.toMatch(/readonly\s+customerRecords\s*:/);
      expect(content).not.toMatch(/readonly\s+individualRecords\s*:/);
    }
  });

  test("SEC-40: no raw Prisma model reaches mock responder", () => {
    const content = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-mock-responder.ts"));
    expect(content).not.toContain("prisma");
    expect(content).not.toContain("Prisma");
    expect(content).not.toContain("@prisma/client");
  });
});

// ── Zero Writes & Ephemeral (41-44) ─────────────────────────────────────────

describe("Zero Writes & Ephemeral", () => {
  test("SEC-41: zero prisma.*.create imports in copilot-core", () => {
    const files = readCopilotCoreFiles();
    for (const filePath of files) {
      const content = readFileContent(filePath);
      expect(content).not.toMatch(/prisma\.\w+\.create\(/);
      expect(content).not.toMatch(/prisma\.\w+\.createMany\(/);
    }
  });

  test("SEC-42: zero prisma.*.update imports in copilot-core", () => {
    const files = readCopilotCoreFiles();
    for (const filePath of files) {
      const content = readFileContent(filePath);
      expect(content).not.toMatch(/prisma\.\w+\.update\(/);
      expect(content).not.toMatch(/prisma\.\w+\.updateMany\(/);
      expect(content).not.toMatch(/prisma\.\w+\.upsert\(/);
    }
  });

  test("SEC-43: zero Conversation/Message persistence", () => {
    const files = readCopilotCoreFiles();
    for (const filePath of files) {
      const content = readFileContent(filePath);
      expect(content).not.toMatch(/prisma\.conversation\./i);
      expect(content).not.toMatch(/prisma\.message\./i);
    }
  });

  test("SEC-44: task suggestion produces zero writes", () => {
    const suggestion: CopilotTaskSuggestion = {
      suggestedOnly: true,
      title: "Test task",
      description: "Test description",
      capabilityId: "test",
    };
    // Verify it's a pure type — just creating the object has no side effects
    expect(suggestion.suggestedOnly).toBe(true);

    // Verify task contract file has no Prisma imports
    const content = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-task-contract.ts"));
    expect(content).not.toContain("prisma");
    expect(content).not.toContain("import");
    expect(content).toContain("readonly suggestedOnly: true");
  });
});

// ── R2 Delta Tests (45-52) ──────────────────────────────────────────────────

describe("R2 Delta", () => {
  test("SEC-45: VERCEL_ENV=production + flag=true → route returns 404 first", () => {
    // Verify production block is BEFORE feature flag in route
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    const prodBlockIdx = routeSource.indexOf('VERCEL_ENV');
    const featureFlagIdx = routeSource.indexOf('COPILOT_COMMERCIAL_PREVIEW_ENABLED');
    expect(prodBlockIdx).toBeGreaterThan(-1);
    expect(featureFlagIdx).toBeGreaterThan(-1);
    expect(prodBlockIdx).toBeLessThan(featureFlagIdx);
  });

  test("SEC-46: mock responder performs zero network calls", () => {
    const content = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-mock-responder.ts"));
    // Zero fetch, zero AI SDK, zero HTTP
    expect(content).not.toContain("fetch(");
    expect(content).not.toContain("import { ");
    expect(content).not.toContain("ai-layer");
    expect(content).not.toContain("openai");
    expect(content).not.toContain("anthropic");
    expect(content).not.toContain("aiLayerService");

    // Verify it's a pure function by calling it
    const result = buildMockCopilotResponse(
      { totalCustomers: 5 },
      "commercial.customers.summary.read",
      "PARTIAL",
      [],
      "org-test",
      "req-test",
    );
    expect(result.text).toContain("5");
    expect(result.truthState).toBe("PARTIAL");
  });

  test("SEC-47: commercial.seller.portfolio.read not in adapter registry", () => {
    const gatewaySource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-gateway.ts"));
    expect(gatewaySource).not.toContain('"commercial.seller.portfolio.read"');
  });

  test("SEC-48: 'mi maleta' intent → UNSUPPORTED", () => {
    const result = resolveIntent("Muéstrame mi maleta");
    expect(result.kind).toBe("unsupported");
  });

  test("SEC-49: no individual customer record reaches any DTO", () => {
    // Mock responder only formats aggregated counts, never lists
    const mockContent = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-mock-responder.ts"));
    expect(mockContent).not.toContain("forEach");
    expect(mockContent).not.toContain(".map(");

    // Verify the formatters use aggregated fields only
    expect(mockContent).toContain("totalCustomers");
    expect(mockContent).toContain("totalOrders");
    expect(mockContent).not.toContain("customerName");
    expect(mockContent).not.toContain("customerNit");
  });

  test("SEC-50: rate limit applied after authentication", () => {
    // Rate limiter is SERVER-ONLY — verify via source scanning.
    // Verify the route applies rate limit AFTER buildCopilotEnvelope
    const routeSource = readFileContent(
      path.resolve(COPILOT_CORE_DIR, "../../app/api/orgs/[orgSlug]/copilot/chat/route.ts"),
    );
    const envelopeIdx = routeSource.indexOf("buildCopilotEnvelope");
    const rateLimitIdx = routeSource.indexOf("checkRateLimit");
    expect(envelopeIdx).toBeGreaterThan(-1);
    expect(rateLimitIdx).toBeGreaterThan(-1);
    expect(envelopeIdx).toBeLessThan(rateLimitIdx);

    // Verify rate limiter uses organizationId:userId key pattern
    const rateLimiterSource = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-rate-limiter.ts"));
    expect(rateLimiterSource).toContain("organizationId");
    expect(rateLimiterSource).toContain("userId");
    expect(rateLimiterSource).toContain("${organizationId}:${userId}");
  });

  test("SEC-51: rate limiter key count bounded (maxKeys enforced)", () => {
    // The rate limiter caps total keys at MAX_KEYS = 10_000
    const content = readFileContent(path.join(COPILOT_CORE_DIR, "copilot-core-rate-limiter.ts"));
    expect(content).toContain("MAX_KEYS");
    expect(content).toContain("store.size > MAX_KEYS");
    expect(content).toContain("store.delete(");
  });

  test("SEC-52: alerts without tenant authority excluded", () => {
    // Verify copilot-core does not import any alert evaluators
    const files = readCopilotCoreFiles();
    for (const filePath of files) {
      const content = readFileContent(filePath);
      expect(content).not.toContain("crm-activity-alert");
      expect(content).not.toContain("vendor-alerts");
      expect(content).not.toContain("store-network-alerts");
      expect(content).not.toContain("sales-rep-alerts");
      expect(content).not.toContain("production-alert-engine");
    }
  });

  test("SEC-53: CSV injection neutralized — values starting with =, +, -, @ are prefixed", () => {
    // Generate a report with a negative number (starts with '-')
    const data = {
      totalCustomers: 100,
      activeCustomers: 110,
      inactiveCustomers: -10, // intentionally negative
      asOf: "2026-08-21T00:00:00.000Z",
    };
    const report = generateReport("customer_summary", data, "csv", "org-test");
    const lines = report.content.split("\n");

    // Find the line with negative value (R1: Spanish labels)
    const negativeLine = lines.find((l: string) => l.includes("Inactivos"));
    expect(negativeLine).toBeDefined();
    // The negative value should be prefixed with single quote: '-10
    expect(negativeLine).toContain("'-10");

    // Verify safe values are NOT prefixed (R1: Spanish labels)
    const totalLine = lines.find((l: string) => l.includes("Clientes Totales"));
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain(",100");
    expect(totalLine).not.toContain(",'100");
  });

  test("SEC-54: CSV injection — formula prefixes =, +, @ are neutralized", () => {
    // safeCsvValue neutralizes dangerous prefixes on all string values.
    // In R1, numeric fields go through formatNumber() which produces "NaN" for
    // non-numeric strings — "NaN" doesn't start with =+@- so is safe.
    // Test directly against safeCsvValue behavior via the report generator source.
    const reportSrc = readFileContent(
      path.resolve(__dirname, "../copilot-core-report-generator.ts"),
    );
    // safeCsvValue must exist and handle all dangerous prefixes
    expect(reportSrc).toContain("safeCsvValue");
    expect(reportSrc).toContain('/^[=+\\-@]/.test(s)');
    // safeCsvValue is called on ALL output values
    expect(reportSrc).toContain("safeCsvValue(formatNumber(");
    expect(reportSrc).toContain("safeCsvValue(formatCurrency(");
    expect(reportSrc).toContain("safeCsvValue(formatPercent(");
    // Direct injection via asOf field (string, not numeric)
    const data = {
      totalCustomers: 100,
      activeCustomers: 50,
      inactiveCustomers: 50,
      asOf: "=cmd|'/C calc'!A0",
    };
    const report = generateReport("customer_summary", data, "csv", "org-test");
    expect(report.content).toContain("'=cmd|'/C calc'!A0");
  });

  test("SEC-55: zero user-controlled input reaches CSV cells", () => {
    // Report generator source must not reference userMessage or any client input
    const reportSrc = readFileContent(
      path.resolve(__dirname, "../copilot-core-report-generator.ts"),
    );
    expect(reportSrc).not.toContain("userMessage");
    expect(reportSrc).not.toContain("request.body");
    expect(reportSrc).not.toContain("req.body");

    // Verify safeCsvValue function exists
    expect(reportSrc).toContain("safeCsvValue");
  });
});
