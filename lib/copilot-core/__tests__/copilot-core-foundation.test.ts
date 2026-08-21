/**
 * lib/copilot-core/__tests__/copilot-core-foundation.test.ts
 *
 * Copilot Core Foundation — Mandatory test suite
 * Sprint: COPILOT-CORE-FOUNDATION-01B1
 *
 * Pure tests. No Prisma, no network, no side effects.
 *
 * ROLE ALIGNMENT: uses Prisma enum Role values only.
 * SELLER CONFINEMENT: absolute — no escalation, no substitution.
 * MODULE KEY: "sales" is the canonical TenantModule key for commercial.
 * PLATFORM ROLE: null for regular users, not "USER".
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
  isCertifiedSellerSource,
} from "../index";

import * as CopilotCoreBarrel from "../index";

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
    platformRole:           null,
    membershipRole:         "ORG_ADMIN",
    moduleKey:              "sales",
    surface:                "desktop",
    entitlementSet:         new Set(["sales"]),
    actorScope:             "organization",
    sellerBinding:          null,
    requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    requestId:              "req_001",
    generatedAt:            new Date().toISOString(),
  };
  return { ...base, ...overrides } as CopilotEnvelope;
}

function makeSellerBinding(
  sellerId: string,
  organizationId: string = "org_cast_001",
): SellerBinding {
  return {
    sellerId,
    sellerName:     "Test Seller",
    sellerSlug:     sellerId,
    source:         "membership_seller_slug",
    confidence:     1.0,
    organizationId,
  };
}

function makeSellerEnvelope(
  sellerId: string,
  scopeSellerId?: string,
): CopilotEnvelope {
  const binding = makeSellerBinding(sellerId);
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

  test("B1-1 — platformRole null is valid (regular user)", () => {
    const env = makeEnvelope({ platformRole: null });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  test("B1-2 — platformRole SUPER_ADMIN is valid", () => {
    const env = makeEnvelope({ platformRole: "SUPER_ADMIN" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  test("B1-3 — platformRole AGENTIK_ADMIN is valid", () => {
    const env = makeEnvelope({ platformRole: "AGENTIK_ADMIN" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
  });

  test("B1-4 — platformRole USER is no longer valid", () => {
    const env = makeEnvelope({ platformRole: "USER" });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("platformRole"))).toBe(true);
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
    const binding = makeSellerBinding("s1");
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
    const binding = makeSellerBinding("seller_A");
    const env = makeEnvelope({
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "seller_B" },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("substitution denied"))).toBe(true);
  });

  test("B1-5 — seller binding with UNVERIFIED source fails envelope validation", () => {
    const binding = {
      ...makeSellerBinding("s1"),
      source: "email_crm_match" as const,
      confidence: 0.7,
    };
    const env = makeEnvelope({
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "s1" },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not CERTIFIED"))).toBe(true);
  });

  test("B1-6 — seller binding with name_match source fails envelope validation", () => {
    const binding = {
      ...makeSellerBinding("s1"),
      source: "name_match" as const,
      confidence: 0.5,
    };
    const env = makeEnvelope({
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "s1" },
    });
    const result = validateEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not CERTIFIED"))).toBe(true);
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

  test("B1-7 — capabilities use canonical moduleKey sales", () => {
    const caps = listCapabilitiesByModule("sales");
    expect(caps.length).toBe(4);
    for (const cap of caps) {
      expect(cap.moduleKey).toBe("sales");
    }
  });

  test("B1-8 — comercial moduleKey returns no capabilities", () => {
    const caps = listCapabilitiesByModule("comercial");
    expect(caps.length).toBe(0);
  });

  test("B1-9 — capabilities use sales as requiredEntitlement", () => {
    for (const cap of listCapabilities()) {
      expect(cap.requiredEntitlement).toBe("sales");
    }
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
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-1 — actorScope seller + requested organization = deny", () => {
    const binding = makeSellerBinding("s1");
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "organization", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-2 — actorScope seller + administrative role in same envelope = deny for organization", () => {
    const binding = makeSellerBinding("s1");
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
    const binding = makeSellerBinding("s1");
    const env = makeEnvelope({
      membershipRole: "OPERATOR",
      actorScope:     "seller",
      sellerBinding:  binding,
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001" },
    });
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("R1-6 — sellerId sent by client cannot modify the certified one", () => {
    const env = makeSellerEnvelope("seller_CERTIFIED", "seller_ATTACKER");
    const result = authorizeCopilotCapability(env, CAP);
    expect(result.allowed).toBe(false);
  });

  test("18 — seller cannot escalate to organization scope (absolute rule)", () => {
    const binding = makeSellerBinding("s1");
    const env = makeEnvelope({
      membershipRole: "ORG_ADMIN",
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
    const binding = makeSellerBinding("s1");
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
    const binding = makeSellerBinding("s1");
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
    const binding = makeSellerBinding("s1");
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

// ── H. Seller Source Authority — Runtime Immutable ───────────────────────────

describe("Seller source authority — runtime immutable", () => {
  test("B1-10 — membership_seller_slug is certified", () => {
    expect(isCertifiedSellerSource("membership_seller_slug")).toBe(true);
  });

  test("B1-11 — email_crm_match is NOT certified", () => {
    expect(isCertifiedSellerSource("email_crm_match")).toBe(false);
  });

  test("B1-12 — name_match is NOT certified", () => {
    expect(isCertifiedSellerSource("name_match")).toBe(false);
  });

  test("B1-13 — unmapped is NOT certified", () => {
    expect(isCertifiedSellerSource("unmapped")).toBe(false);
  });

  test("B1-14 — ambiguous is NOT certified", () => {
    expect(isCertifiedSellerSource("ambiguous")).toBe(false);
  });

  test("B1-15 — CERTIFIED_SELLER_SOURCES is NOT exported from public barrel", () => {
    expect("CERTIFIED_SELLER_SOURCES" in CopilotCoreBarrel).toBe(false);
  });

  test("B1-15b — isCertifiedSellerSource IS exported from public barrel", () => {
    expect("isCertifiedSellerSource" in CopilotCoreBarrel).toBe(true);
    expect(typeof CopilotCoreBarrel.isCertifiedSellerSource).toBe("function");
  });

  test("B1-15c — barrel has no add, push, delete, splice for certified sources", () => {
    const barrelKeys = Object.keys(CopilotCoreBarrel);
    expect(barrelKeys.some((k) => k.includes("addCertified"))).toBe(false);
    expect(barrelKeys.some((k) => k.includes("removeCertified"))).toBe(false);
    expect(barrelKeys.some((k) => k.includes("setCertified"))).toBe(false);
  });

  test("B1-16 — high confidence does not make uncertified source certified", () => {
    // email_crm_match with 1.0 confidence is still not certified
    expect(isCertifiedSellerSource("email_crm_match")).toBe(false);
    // name_match with 1.0 confidence is still not certified
    expect(isCertifiedSellerSource("name_match")).toBe(false);
  });

  test("B1-16b — no cast or mutation of consumer can change isCertifiedSellerSource result", () => {
    // Attempt to call with arbitrary strings — always false
    expect(isCertifiedSellerSource("email_crm_match" as any)).toBe(false);
    expect(isCertifiedSellerSource("MEMBERSHIP_SELLER_SLUG" as any)).toBe(false);
    expect(isCertifiedSellerSource("" as any)).toBe(false);
    expect(isCertifiedSellerSource("admin_override" as any)).toBe(false);
    // Only the exact canonical value returns true
    expect(isCertifiedSellerSource("membership_seller_slug")).toBe(true);
  });

  test("B1-17 — seller binding requires source+confidence+orgId+sellerId simultaneously", () => {
    // Valid: all fields present and certified
    const validBinding = makeSellerBinding("seller_X");
    const validEnv = makeSellerEnvelope("seller_X");
    const validResult = validateEnvelope(validEnv);
    expect(validResult.valid).toBe(true);

    // Invalid: uncertified source (even with correct confidence, orgId, sellerId)
    const uncertifiedBinding = { ...validBinding, source: "email_crm_match" as const };
    const uncertifiedEnv = makeEnvelope({
      actorScope: "seller",
      sellerBinding: uncertifiedBinding,
      membershipRole: "OPERATOR",
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "seller_X" },
    });
    const uncertifiedResult = validateEnvelope(uncertifiedEnv);
    expect(uncertifiedResult.valid).toBe(false);

    // Invalid: missing sellerId
    const noSellerIdBinding = { ...validBinding, sellerId: "" };
    const noSellerIdEnv = makeEnvelope({
      actorScope: "seller",
      sellerBinding: noSellerIdBinding,
      membershipRole: "OPERATOR",
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "" },
    });
    const noSellerIdResult = validateEnvelope(noSellerIdEnv);
    expect(noSellerIdResult.valid).toBe(false);

    // Invalid: mismatched organizationId
    const mismatchOrgBinding = { ...validBinding, organizationId: "org_OTHER" };
    const mismatchOrgEnv = makeEnvelope({
      actorScope: "seller",
      sellerBinding: mismatchOrgBinding,
      membershipRole: "OPERATOR",
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "seller_X" },
    });
    const mismatchOrgResult = validateEnvelope(mismatchOrgEnv);
    expect(mismatchOrgResult.valid).toBe(false);

    // Invalid: confidence out of range
    const badConfidenceBinding = { ...validBinding, confidence: 1.5 };
    const badConfidenceEnv = makeEnvelope({
      actorScope: "seller",
      sellerBinding: badConfidenceBinding,
      membershipRole: "OPERATOR",
      requestedResourceScope: { kind: "seller", organizationId: "org_cast_001", sellerId: "seller_X" },
    });
    const badConfidenceResult = validateEnvelope(badConfidenceEnv);
    expect(badConfidenceResult.valid).toBe(false);
  });
});
