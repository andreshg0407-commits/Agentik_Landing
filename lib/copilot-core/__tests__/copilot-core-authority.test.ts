/**
 * lib/copilot-core/__tests__/copilot-core-authority.test.ts
 *
 * Copilot Core Foundation — Authority & Scope Resolution Tests
 * Sprint: COPILOT-CORE-FOUNDATION-01B1
 *
 * Tests for resolveCopilotActorScope() — pure function that determines
 * actorScope, sellerBinding, and resourceScope from server-derived input.
 *
 * RULES TESTED:
 *   - Only CERTIFIED seller sources produce actorScope="seller"
 *   - email_crm_match NEVER grants seller access
 *   - name_match NEVER grants seller access
 *   - MANAGER/ORG_ADMIN → organization scope
 *   - OPERATOR with CERTIFIED seller → seller scope
 *   - OPERATOR without CERTIFIED seller → self scope
 *   - VIEWER/BILLING → deny for commercial, self for non-commercial
 *   - Suspended membership → deny
 *   - Suspended organization → deny
 *   - Unknown module → MODULE_DENIED
 */

import { describe, test, expect } from "bun:test";

import { resolveCopilotActorScope } from "../copilot-core-scope-resolver";

import type {
  AuthorityInput,
  ResolvedSellerInput,
} from "../copilot-core-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<AuthorityInput> = {}): AuthorityInput {
  return {
    platformRole:           null,
    membershipRole:         "ORG_ADMIN",
    membershipStatus:       "ACTIVE",
    organizationStatus:     "ACTIVE",
    enabledModules:         new Set(["sales", "copilot"]),
    resolvedSellerIdentity: null,
    requestedModuleKey:     "sales",
    ...overrides,
  };
}

function makeSeller(overrides: Partial<ResolvedSellerInput> = {}): ResolvedSellerInput {
  return {
    sellerSlug:     "juan-perez",
    sellerName:     "Juan Perez",
    source:         "membership_seller_slug",
    confidence:     1.0,
    organizationId: "org_cast_001",
    ...overrides,
  };
}

// ── A. Organization Scope (MANAGER/ORG_ADMIN) ────────────────────────────────

describe("Organization scope resolution", () => {
  test("A1 — ORG_ADMIN gets organization scope", () => {
    const result = resolveCopilotActorScope(makeInput({ membershipRole: "ORG_ADMIN" }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("organization");
    expect(result.sellerBinding).toBeNull();
    expect(result.resourceScope?.kind).toBe("organization");
    expect(result.denialReason).toBeNull();
  });

  test("A2 — MANAGER gets organization scope", () => {
    const result = resolveCopilotActorScope(makeInput({ membershipRole: "MANAGER" }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("organization");
  });

  test("A3 — SUPER_ADMIN gets organization scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      platformRole:   "SUPER_ADMIN",
      membershipRole: "SUPER_ADMIN",
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("organization");
  });

  test("A4 — AGENTIK_ADMIN gets organization scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      platformRole:   "AGENTIK_ADMIN",
      membershipRole: "AGENTIK_ADMIN",
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("organization");
  });

  test("A5 — ORG_ADMIN with CERTIFIED seller still gets organization scope (not seller)", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "ORG_ADMIN",
      resolvedSellerIdentity: makeSeller(),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("organization");
    expect(result.sellerBinding).toBeNull();
    expect(result.warnings.some((w) => w.code === "SELLER_IDENTITY_AVAILABLE")).toBe(true);
  });

  test("A6 — MANAGER with CERTIFIED seller still gets organization scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "MANAGER",
      resolvedSellerIdentity: makeSeller(),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("organization");
    expect(result.sellerBinding).toBeNull();
  });
});

// ── B. Seller Scope (OPERATOR with CERTIFIED source) ─────────────────────────

describe("Seller scope resolution", () => {
  test("B1 — OPERATOR with CERTIFIED seller gets seller scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller(),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("seller");
    expect(result.sellerBinding).not.toBeNull();
    expect(result.sellerBinding!.sellerId).toBe("juan-perez");
    expect(result.sellerBinding!.source).toBe("membership_seller_slug");
    expect(result.sellerBinding!.confidence).toBe(1.0);
    expect(result.resourceScope?.kind).toBe("seller");
    expect(result.resourceScope?.sellerId).toBe("juan-perez");
  });

  test("B2 — OPERATOR with email_crm_match NEVER gets seller scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ source: "email_crm_match", confidence: 0.8 }),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
    expect(result.sellerBinding).toBeNull();
    expect(result.warnings.some((w) => w.code === "SELLER_IDENTITY_UNVERIFIED")).toBe(true);
  });

  test("B3 — OPERATOR with name_match NEVER gets seller scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ source: "name_match", confidence: 0.5 }),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
    expect(result.sellerBinding).toBeNull();
  });

  test("B4 — OPERATOR with unmapped gets self scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ source: "unmapped", confidence: 0 }),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
  });

  test("B5 — OPERATOR with ambiguous gets self scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ source: "ambiguous", confidence: 0 }),
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
  });

  test("B6 — OPERATOR without any seller identity gets self scope", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: null,
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
    expect(result.warnings.some((w) => w.code === "NO_SELLER_IDENTITY")).toBe(true);
  });
});

// ── C. Denied Roles for Commercial ───────────────────────────────────────────

describe("Denied roles for commercial module", () => {
  test("C1 — VIEWER denied for sales module", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:     "VIEWER",
      requestedModuleKey: "sales",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("ROLE_DENIED");
  });

  test("C2 — BILLING denied for sales module", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:     "BILLING",
      requestedModuleKey: "sales",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("ROLE_DENIED");
  });

  test("C3 — VIEWER gets self scope for non-commercial module", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:     "VIEWER",
      requestedModuleKey: "copilot",
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
  });

  test("C4 — BILLING gets self scope for non-commercial module", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:     "BILLING",
      requestedModuleKey: "copilot",
    }));
    expect(result.resolved).toBe(true);
    expect(result.actorScope).toBe("self");
  });
});

// ── D. Membership & Organization Status ──────────────────────────────────────

describe("Status checks", () => {
  test("D1 — suspended membership denied", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipStatus: "SUSPENDED",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("INVALID_ENVELOPE");
  });

  test("D2 — removed membership denied", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipStatus: "REMOVED",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("INVALID_ENVELOPE");
  });

  test("D3 — suspended organization denied", () => {
    const result = resolveCopilotActorScope(makeInput({
      organizationStatus: "SUSPENDED",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("INVALID_ENVELOPE");
  });
});

// ── E. Module Gating ─────────────────────────────────────────────────────────

describe("Module gating", () => {
  test("E1 — unknown module fails closed", () => {
    const result = resolveCopilotActorScope(makeInput({
      requestedModuleKey: "unknown_module",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("MODULE_DENIED");
  });

  test("E2 — disabled module fails closed", () => {
    const result = resolveCopilotActorScope(makeInput({
      enabledModules:     new Set(["copilot"]),  // sales NOT enabled
      requestedModuleKey: "sales",
    }));
    expect(result.resolved).toBe(false);
    expect(result.denialReason).toBe("MODULE_DENIED");
  });

  test("E3 — enabled module passes", () => {
    const result = resolveCopilotActorScope(makeInput({
      enabledModules:     new Set(["sales", "copilot"]),
      requestedModuleKey: "sales",
    }));
    expect(result.resolved).toBe(true);
  });
});

// ── F. Seller Binding Contract ───────────────────────────────────────────────

describe("Seller binding contract", () => {
  test("F1 — binding preserves organizationId from seller identity", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ organizationId: "org_xyz" }),
    }));
    expect(result.sellerBinding?.organizationId).toBe("org_xyz");
  });

  test("F2 — binding sellerId equals sellerSlug", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ sellerSlug: "maria-garcia" }),
    }));
    expect(result.sellerBinding?.sellerId).toBe("maria-garcia");
    expect(result.sellerBinding?.sellerSlug).toBe("maria-garcia");
  });

  test("F3 — resourceScope sellerId matches binding sellerId", () => {
    const result = resolveCopilotActorScope(makeInput({
      membershipRole:         "OPERATOR",
      resolvedSellerIdentity: makeSeller({ sellerSlug: "carlos-lopez" }),
    }));
    expect(result.resourceScope?.sellerId).toBe("carlos-lopez");
    expect(result.sellerBinding?.sellerId).toBe("carlos-lopez");
  });
});
