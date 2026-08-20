/**
 * lib/copilot-core/__tests__/copilot-core-foundation.test.ts
 *
 * Copilot Core Foundation — Mandatory test suite
 * Sprint: COPILOT-CORE-FOUNDATION-01A-R1
 *
 * Pure tests. No Prisma, no network, no side effects.
 *
 * ROLE ALIGNMENT: uses Prisma enum Role values only.
 * SELLER CONFINEMENT: absolute — no escalation, no substitution.
 */

import { describe, test, expect } from "bun:test";

import {
  validateEnvelope,
  isValidEnvelope,
  getCapability,
  listCapabilities,
  listCapabilitiesByModule,
  authorizeCopilotCapability,
  resolveTruthState,
  validateAnswer,
} from "../index";

import type {
  CopilotEnvelope,
  ResourceScope,
  CopilotAnswer,
  FactRef,
  SellerBinding,
} from "../copilot-core-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<Record<string, unknown>> = {}): CopilotEnvelope {
  const base: CopilotEnvelope = {
    organizationId:         "org_cast_001",
    orgSlug:                "castillitos",
    userId:                 "usr_001",
    membershipId:           "mem_001",
    platformRole:           "USER",
    membershipRole:         "ORG_ADMIN",
    moduleKey:              "comercial",
    surface:                "desktop",
    entitlementSet:         new Set(["copilot:commercial:read"]),
    actorScope:             "organization",
    sellerBinding:          null,
    requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    requestId:              "req_001",
    generatedAt:            new Date().toISOString(),
  };
  return { ...base, ...overrides } as CopilotEnvelope;
}

function makeSellerEnvelope(
  sellerId: string,
  scopeSellerId?: string,
): CopilotEnvelope {
  const binding: SellerBinding = { sellerId, sellerName: "Test Seller" };
  return makeEnvelope({
    membershipRole: "OPERATOR",
    actorScope:     "seller",
    sellerBinding:  binding,
    requestedResourceScope: {
      kind:           "seller",
      organizationId: "org_cast_001",
      sellerId:       scopeSellerId ?? sellerId,
    } as ResourceScope,
  });
}

function makeFact(overrides: Partial<FactRef> = {}): FactRef {
  return {
    source:          "crm_customers",
    sourceRecordId:  "cust_001",
    sourceUpdatedAt: new Date().toISOString(),
    organizationId:  "org_cast_001",
    confidence:      0.95,
    truthState:      "VERIFIED",
    ...overrides,
  };
}

function makeAnswer(overrides: Partial<CopilotAnswer> = {}): CopilotAnswer {
  return {
    answerId:       "ans_001",
    text:           "Test answer",
    truthState:     "VERIFIED",
    asOf:           new Date().toISOString(),
    facts:          [makeFact()],
    warnings:       [],
    capabilityId:   "commercial.customers.summary.read",
    organizationId: "org_cast_001",
    requestId:      "req_001",
    ...overrides,
  };
}

// ── A. Envelope Tests ────────────────────────────────────────────────────────

describe("Envelope validation", () => {
  test("1 — valid envelope passes", () => {
    const result = validateEnvelope(makeEnvelope());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("2 — envelope without organizationId fails", () => {
    const result = validateEnvelope(makeEnvelope({ organizationId: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("organizationId"))).toBe(true);
  });

  test("3 — envelope without userId fails", () => {
    const result = validateEnvelope(makeEnvelope({ userId: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("userId"))).toBe(true);
  });

  test("4 — envelope without membershipId fails", () => {
    const result = validateEnvelope(makeEnvelope({ membershipId: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("membershipId"))).toBe(true);
  });

  test("5 — systemHints is not part of the envelope contract", () => {
    const env = makeEnvelope();
    expect("systemHints" in env).toBe(false);
    const withHints = { ...env, systemHints: ["hack"] };
    const result = validateEnvelope(withHints);
    expect(result.valid).toBe(true);
  });

  test("null envelope fails", () => {
    const result = validateEnvelope(null);
    expect(result.valid).toBe(false);
  });

  test("isValidEnvelope type guard works", () => {
    expect(isValidEnvelope(makeEnvelope())).toBe(true);
    expect(isValidEnvelope(null)).toBe(false);
    expect(isValidEnvelope({})).toBe(false);
  });

  test("R1-9a — roles used match Prisma enum Role exactly", () => {
    // Valid canonical roles
    for (const role of ["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN", "MANAGER", "OPERATOR", "VIEWER", "BILLING"]) {
      const env = makeEnvelope({ membershipRole: role });
      const result = validateEnvelope(env);
      expect(result.valid).toBe(true);
    }
  });

  test("R1-10 — unknown role fails closed", () => {
    const env = makeEnvelope({ membershipRole: "ORG_SELLER" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("membershipRole"))).toBe(true);
  });

  test("R1-10b — invented ORG_MANAGER role fails closed", () => {
    const env = makeEnvelope({ membershipRole: "ORG_MANAGER" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
  });

  test("R1-10c — invented ORG_VIEWER role fails closed", () => {
    const env = makeEnvelope({ membershipRole: "ORG_VIEWER" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
  });

  test("seller envelope with valid binding passes", () => {
    const env = makeSellerEnvelope("seller_X");
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  test("seller envelope without sellerBinding fails", () => {
    const env = makeEnvelope({
      actorScope:     "seller",
      sellerBinding:  null,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "s1" },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("sellerBinding"))).toBe(true);
  });

  test("seller envelope with org scope kind fails", () => {
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("escalation denied"))).toBe(true);
  });

  test("seller envelope with mismatched sellerId fails", () => {
    const binding: SellerBinding = { sellerId: "seller_A", sellerName: "A" };
    const env = makeEnvelope({
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "seller_B" },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("substitution denied"))).toBe(true);
  });
});

// ── B. Capability Registry Tests ─────────────────────────────────────────────

describe("Capability registry", () => {
  test("6 — known READ capability can be looked up", () => {
    const cap = getCapability("commercial.customers.summary.read");
    expect(cap).toBeDefined();
    expect(cap!.riskClass).toBe("READ");
    expect(cap!.enabled).toBe(true);
  });

  test("7 — unknown capability returns undefined", () => {
    const cap = getCapability("nonexistent.capability");
    expect(cap).toBeUndefined();
  });

  test("8 — all registered capabilities are READ and enabled", () => {
    const all = listCapabilities();
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const cap of all) {
      expect(cap.riskClass).toBe("READ");
      expect(cap.enabled).toBe(true);
    }
  });

  test("listCapabilitiesByModule returns comercial capabilities", () => {
    const caps = listCapabilitiesByModule("comercial");
    expect(caps.length).toBe(4);
  });

  test("listCapabilitiesByModule returns empty for unknown module", () => {
    const caps = listCapabilitiesByModule("unknown");
    expect(caps.length).toBe(0);
  });

  test("capability roles use canonical Prisma enum values only", () => {
    const validRoles = new Set(["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN", "MANAGER", "OPERATOR", "VIEWER", "BILLING"]);
    for (const cap of listCapabilities()) {
      for (const role of cap.allowedRoles) {
        expect(validRoles.has(role)).toBe(true);
      }
    }
  });
});

// ── C. Authorization Tests ───────────────────────────────────────────────────

describe("Authorization — fail-closed", () => {
  const CAP = "commercial.customers.summary.read";

  test("6b — known READ capability authorized with valid envelope", () => {
    const result = authorizeCopilotCapability(makeEnvelope(), CAP);
    expect(result.allowed).toBe(true);
    expect(result.riskClass).toBe("READ");
    expect(result.denialReason).toBeNull();
  });

  test("7b — unknown capability denied", () => {
    const result = authorizeCopilotCapability(makeEnvelope(), "nonexistent.cap");
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("UNKNOWN_CAPABILITY");
  });

  test("8b — WRITE/EXTERNAL risk class denied", () => {
    const result = authorizeCopilotCapability(makeEnvelope(), "commercial.orders.write");
    expect(result.allowed).toBe(false);
  });

  test("9 — missing entitlement denied", () => {
    const env = makeEnvelope({ entitlementSet: new Set<string>() });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("ENTITLEMENT_DISABLED");
  });

  test("10 — disallowed role denied (VIEWER)", () => {
    const env = makeEnvelope({ membershipRole: "VIEWER" });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("ROLE_DENIED");
  });

  test("11 — wrong module denied", () => {
    const env = makeEnvelope({ moduleKey: "finanzas" });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("MODULE_DENIED");
  });

  test("12 — disallowed actorScope (self) denied", () => {
    const env = makeEnvelope({
      actorScope: "self",
      requestedResourceScope: { kind: "self", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("ACTOR_SCOPE_DENIED");
  });

  test("13 — ownership required: seller without binding denied", () => {
    const PORTFOLIO_CAP = "commercial.seller.portfolio.read";
    // Invalid envelope: seller scope but no sellerBinding → INVALID_ENVELOPE
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  null,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "s1" },
    });
    const result = authorizeCopilotCapability(env, PORTFOLIO_CAP);
    expect(result.allowed).toBe(false);
  });

  test("14 — cross-tenant denied", () => {
    const env = makeEnvelope({
      requestedResourceScope: { kind: "organization", organizationId: "org_OTHER" } as ResourceScope,
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("15 — tenant A cannot query tenant B", () => {
    const env = makeEnvelope({
      organizationId: "org_A",
      requestedResourceScope: { kind: "organization", organizationId: "org_B" } as ResourceScope,
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("25 — invalid envelope (empty object) produces deny", () => {
    const result = authorizeCopilotCapability({}, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("INVALID_ENVELOPE");
  });

  test("invalid envelope null produces deny", () => {
    const result = authorizeCopilotCapability(null, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("INVALID_ENVELOPE");
  });

  test("BILLING role denied for commercial capabilities", () => {
    const env = makeEnvelope({ membershipRole: "BILLING" });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("ROLE_DENIED");
  });

  test("MANAGER role allowed for commercial capabilities", () => {
    const env = makeEnvelope({ membershipRole: "MANAGER" });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(true);
  });

  test("OPERATOR role allowed for commercial capabilities", () => {
    const env = makeEnvelope({ membershipRole: "OPERATOR" });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(true);
  });
});

// ── D. Seller Confinement Tests ──────────────────────────────────────────────

describe("Seller confinement — absolute", () => {
  const CAP = "commercial.customers.summary.read";

  test("16 — seller queries own sellerId succeeds", () => {
    const env = makeSellerEnvelope("seller_X");
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(true);
  });

  test("17 — seller cannot query another sellerId", () => {
    const env = makeSellerEnvelope("seller_X", "seller_Y");
    // This envelope is invalid because sellerId != sellerBinding.sellerId
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-1 — actorScope seller + requested organization = deny", () => {
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    // Invalid at envelope level — seller scope with org kind
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-2 — actorScope seller + administrative role in same envelope = deny for organization", () => {
    // Even ORG_ADMIN cannot access org scope when actorScope is seller
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "ORG_ADMIN",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-3 — actorScope seller + own sellerId = allow when all else passes", () => {
    const env = makeSellerEnvelope("seller_OK");
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(true);
    expect(result.evaluatedScope?.sellerId).toBe("seller_OK");
  });

  test("R1-4 — actorScope seller + foreign sellerId = deny", () => {
    const env = makeSellerEnvelope("seller_MINE", "seller_THEIRS");
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-5 — actorScope seller + missing sellerId = deny", () => {
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001" },
      // no sellerId in scope
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-6 — sellerId sent by client cannot modify the certified one", () => {
    // Envelope with sellerId=CERTIFIED, but scope requests ATTACKER
    const env = makeSellerEnvelope("seller_CERTIFIED", "seller_ATTACKER");
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("18 — seller cannot escalate to organization scope (absolute rule)", () => {
    // This is the corrected test from 01A — seller scope ALWAYS blocks org access
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "ORG_ADMIN", // high role does NOT override
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("19 — parameter sellerId cannot substitute certified scope", () => {
    const env = makeSellerEnvelope("seller_CERTIFIED", "seller_ATTACKER");
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-7 — platformRole does not eliminate cross-tenant", () => {
    const env = makeEnvelope({
      platformRole:   "SUPER_ADMIN",
      organizationId: "org_A",
      requestedResourceScope: { kind: "organization", organizationId: "org_B" } as ResourceScope,
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-8 — membershipRole does not eliminate cross-tenant", () => {
    const env = makeEnvelope({
      membershipRole: "ORG_ADMIN",
      organizationId: "org_A",
      requestedResourceScope: { kind: "organization", organizationId: "org_B" } as ResourceScope,
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("20 — ORG_ADMIN cannot cross tenant", () => {
    const env = makeEnvelope({
      membershipRole: "ORG_ADMIN",
      organizationId: "org_A",
      requestedResourceScope: { kind: "organization", organizationId: "org_B" } as ResourceScope,
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });
});

// ── E. Seller-scoped capability denial for org summaries ─────────────────────

describe("Seller cannot receive org-level summaries", () => {
  test("R1-11 — customers summary org scope denied to seller actor", () => {
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, "commercial.customers.summary.read");
    expect(result.allowed).toBe(false);
  });

  test("R1-12 — orders summary org scope denied to seller actor", () => {
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, "commercial.orders.summary.read");
    expect(result.allowed).toBe(false);
  });

  test("R1-13 — sales performance org scope denied to seller actor", () => {
    const binding: SellerBinding = { sellerId: "s1", sellerName: "S" };
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, "commercial.sales.performance.read");
    expect(result.allowed).toBe(false);
  });
});

// ── F. Risk Class Gate Tests ─────────────────────────────────────────────────

describe("Risk class gates", () => {
  test("21 — WRITE capability not enabled (no WRITE caps in registry)", () => {
    const result = authorizeCopilotCapability(
      makeEnvelope(),
      "commercial.orders.bulk.write",
    );
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("UNKNOWN_CAPABILITY");
  });

  test("22 — EXTERNAL capability not enabled (no EXTERNAL caps in registry)", () => {
    const result = authorizeCopilotCapability(
      makeEnvelope(),
      "commercial.dian.submit.external",
    );
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toBe("UNKNOWN_CAPABILITY");
  });
});

// ── G. CopilotAnswer & FactRef Tests ─────────────────────────────────────────

describe("CopilotAnswer contract", () => {
  test("23 — answer without facts cannot be VERIFIED", () => {
    const answer = makeAnswer({ facts: [], truthState: "VERIFIED" });
    const result = validateAnswer(answer);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("VERIFIED"))).toBe(true);
  });

  test("24 — FactRef must belong to answer organizationId", () => {
    const badFact = makeFact({ organizationId: "org_OTHER" });
    const answer = makeAnswer({ facts: [badFact] });
    const result = validateAnswer(answer);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("organizationId"))).toBe(true);
  });

  test("R1-14 — FactRef from another tenant invalidates the answer", () => {
    const crossTenantFact = makeFact({ organizationId: "org_FOREIGN" });
    const answer = makeAnswer({
      organizationId: "org_cast_001",
      facts: [makeFact(), crossTenantFact],
    });
    const result = validateAnswer(answer);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("org_FOREIGN"))).toBe(true);
  });

  test("valid answer passes validation", () => {
    const answer = makeAnswer();
    const result = validateAnswer(answer);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("answer with low confidence facts gets warning", () => {
    const lowFact = makeFact({ confidence: 0.3 });
    const answer = makeAnswer({ facts: [lowFact] });
    const result = validateAnswer(answer);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "LOW_CONFIDENCE")).toBe(true);
  });

  test("answer with no facts gets NO_FACTS warning", () => {
    const answer = makeAnswer({ facts: [], truthState: "DATA_UNVERIFIED" });
    const result = validateAnswer(answer);
    expect(result.warnings.some((w) => w.code === "NO_FACTS")).toBe(true);
  });

  test("missing answerId fails validation", () => {
    const answer = makeAnswer({ answerId: "" });
    const result = validateAnswer(answer);
    expect(result.valid).toBe(false);
  });
});

describe("TruthState resolution", () => {
  test("no facts always resolves to DATA_UNVERIFIED", () => {
    expect(resolveTruthState([], "VERIFIED")).toBe("DATA_UNVERIFIED");
    expect(resolveTruthState([], "PARTIAL")).toBe("DATA_UNVERIFIED");
  });

  test("all VERIFIED facts can resolve to VERIFIED", () => {
    const facts = [makeFact({ truthState: "VERIFIED" })];
    expect(resolveTruthState(facts, "VERIFIED")).toBe("VERIFIED");
  });

  test("mixed truth states downgrade VERIFIED to PARTIAL", () => {
    const facts = [
      makeFact({ truthState: "VERIFIED" }),
      makeFact({ truthState: "PARTIAL" }),
    ];
    expect(resolveTruthState(facts, "VERIFIED")).toBe("PARTIAL");
  });

  test("unverified fact downgrades VERIFIED to PARTIAL", () => {
    const facts = [
      makeFact({ truthState: "VERIFIED" }),
      makeFact({ truthState: "DATA_UNVERIFIED" }),
    ];
    expect(resolveTruthState(facts, "VERIFIED")).toBe("PARTIAL");
  });
});
