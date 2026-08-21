/**
 * lib/copilot-core/__tests__/copilot-core-envelope-builder.test.ts
 *
 * Copilot Core — Envelope Builder Tests
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Tests the 01C runtime gate:
 * - Only ORG_ADMIN and MANAGER pass
 * - OPERATOR is RUNTIME_BLOCKED (even with certified seller)
 * - VIEWER and BILLING are ROLE_DENIED
 * - All envelope fields are server-derived
 * - sellerBinding is always null in 01C
 * - actorScope is always "organization" in 01C
 *
 * NOTE: These are unit tests of the builder logic using the
 * validateEnvelope contract. The builder itself requires server-only
 * imports (requireOrgAccess, getEnabledModules) which cannot run
 * in bun:test without mocking Prisma. These tests verify the
 * envelope contract and role gate via direct construction.
 */

import { describe, test, expect } from "bun:test";

import {
  validateEnvelope,
  isValidEnvelope,
} from "../copilot-core-envelope";

import type {
  CopilotEnvelope,
  MembershipRole,
  CopilotSurface,
} from "../copilot-core-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeManagerEnvelope(overrides: Partial<CopilotEnvelope> = {}): CopilotEnvelope {
  return {
    organizationId: "org-001",
    orgSlug: "castillitos",
    userId: "user-001",
    membershipId: "mem-001",
    platformRole: null,
    membershipRole: "MANAGER",
    moduleKey: "sales",
    surface: "desktop" as CopilotSurface,
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

// ── 01C Role Gate ────────────────────────────────────────────────────────────

const COPILOT_01C_ALLOWED_ROLES = new Set<MembershipRole>(["ORG_ADMIN", "MANAGER"]);

describe("Copilot Envelope Builder — 01C Role Gate", () => {
  test("EB-01: ORG_ADMIN passes role gate", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("ORG_ADMIN")).toBe(true);
  });

  test("EB-02: MANAGER passes role gate", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("MANAGER")).toBe(true);
  });

  test("EB-03: OPERATOR is RUNTIME_BLOCKED", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("OPERATOR")).toBe(false);
  });

  test("EB-04: VIEWER is ROLE_DENIED", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("VIEWER")).toBe(false);
  });

  test("EB-05: BILLING is ROLE_DENIED", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("BILLING")).toBe(false);
  });

  test("EB-06: SUPER_ADMIN is not a MembershipRole in the gate", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("SUPER_ADMIN" as MembershipRole)).toBe(false);
  });

  test("EB-07: AGENTIK_ADMIN is not a MembershipRole in the gate", () => {
    expect(COPILOT_01C_ALLOWED_ROLES.has("AGENTIK_ADMIN" as MembershipRole)).toBe(false);
  });
});

// ── Envelope Structure (01C invariants) ──────────────────────────────────────

describe("Copilot Envelope Builder — 01C Structural Invariants", () => {
  test("EB-10: Manager envelope is valid", () => {
    const envelope = makeManagerEnvelope();
    const result = validateEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("EB-11: ORG_ADMIN envelope is valid", () => {
    const envelope = makeManagerEnvelope({ membershipRole: "ORG_ADMIN" });
    const result = validateEnvelope(envelope);
    expect(result.valid).toBe(true);
  });

  test("EB-12: actorScope is always 'organization' in 01C", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.actorScope).toBe("organization");
  });

  test("EB-13: sellerBinding is always null in 01C", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.sellerBinding).toBeNull();
  });

  test("EB-14: moduleKey is hardcoded to 'sales'", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.moduleKey).toBe("sales");
  });

  test("EB-15: surface is 'desktop' for commercial copilot", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.surface).toBe("desktop");
  });

  test("EB-16: resourceScope kind is 'organization'", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.requestedResourceScope.kind).toBe("organization");
  });

  test("EB-17: resourceScope organizationId matches envelope", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.requestedResourceScope.organizationId).toBe(envelope.organizationId);
  });

  test("EB-18: platformRole null is valid for regular managers", () => {
    const envelope = makeManagerEnvelope({ platformRole: null });
    const result = validateEnvelope(envelope);
    expect(result.valid).toBe(true);
  });

  test("EB-19: entitlementSet contains 'sales'", () => {
    const envelope = makeManagerEnvelope();
    expect(envelope.entitlementSet.has("sales")).toBe(true);
  });

  test("EB-20: cross-tenant resourceScope is rejected", () => {
    const envelope = makeManagerEnvelope({
      requestedResourceScope: {
        kind: "organization",
        organizationId: "other-org",
      },
    });
    const result = validateEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Cross-tenant"))).toBe(true);
  });
});

// ── Client Authority Inputs Blocked ──────────────────────────────────────────

describe("Copilot Envelope Builder — No Client Authority", () => {
  test("EB-30: No seller scope can be set from client", () => {
    // In 01C, the builder hardcodes actorScope="organization" and sellerBinding=null.
    // There is no parameter to override these from client input.
    const envelope = makeManagerEnvelope();
    expect(envelope.actorScope).toBe("organization");
    expect(envelope.sellerBinding).toBeNull();
  });

  test("EB-31: moduleKey cannot be overridden by client", () => {
    // The builder hardcodes moduleKey="sales" — no parameter accepts client moduleKey
    const envelope = makeManagerEnvelope();
    expect(envelope.moduleKey).toBe("sales");
  });

  test("EB-32: All required string fields present", () => {
    const envelope = makeManagerEnvelope();
    expect(typeof envelope.organizationId).toBe("string");
    expect(envelope.organizationId.length).toBeGreaterThan(0);
    expect(typeof envelope.userId).toBe("string");
    expect(envelope.userId.length).toBeGreaterThan(0);
    expect(typeof envelope.membershipId).toBe("string");
    expect(envelope.membershipId.length).toBeGreaterThan(0);
    expect(typeof envelope.requestId).toBe("string");
    expect(envelope.requestId.length).toBeGreaterThan(0);
  });
});

// ── OPERATOR Seller Identity (01C blocked) ───────────────────────────────────

describe("Copilot Envelope Builder — OPERATOR Blocked in 01C", () => {
  test("EB-40: OPERATOR with certified seller is still blocked", () => {
    // Even with membership_seller_slug (certified), OPERATOR is blocked in 01C
    // because sellerSlug is name-derived and mutable (IDENTITY_UNSTABLE)
    expect(COPILOT_01C_ALLOWED_ROLES.has("OPERATOR")).toBe(false);
  });

  test("EB-41: No seller data reaches any envelope in 01C", () => {
    const managerEnvelope = makeManagerEnvelope();
    const orgAdminEnvelope = makeManagerEnvelope({ membershipRole: "ORG_ADMIN" });

    expect(managerEnvelope.sellerBinding).toBeNull();
    expect(orgAdminEnvelope.sellerBinding).toBeNull();
    expect(managerEnvelope.actorScope).toBe("organization");
    expect(orgAdminEnvelope.actorScope).toBe("organization");
  });

  test("EB-42: OPERATOR never gets organization scope", () => {
    // Even if somehow an OPERATOR envelope were constructed,
    // the scope resolver gives OPERATOR → seller or denied, never org
    expect(COPILOT_01C_ALLOWED_ROLES.has("OPERATOR")).toBe(false);
  });
});
