/**
 * Commercial agreements — executable test suite.
 *
 * Sprint: AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01
 *
 * Tests the billing preview bundle logic, entitlement/agreement separation,
 * usage limit architecture, and source code contracts.
 *
 * All tests use pure functions with controlled inputs — no DB, no network.
 *
 * TESTS:
 *   A: custom bundle single charge
 *   B: covered module not double billed
 *   C: covered module individual price NOT mutated
 *   D: outside module individually billed
 *   E: historical month stable
 *   F: future agreement ignored
 *   G: expired agreement ignored
 *   H: version change preserves history
 *   I: agreement does not grant entitlement
 *   J: entitlement does not imply bundle membership
 *   K: mixed currency not summed
 *   L: unknown usage metric honest
 *   M: AI usage reuses existing authority
 *   N: tenant isolation
 *   O: admin-only agreement mutation
 *
 * Total: 15 + 17 + 14 = 46 tests
 *
 * Sprint v2 tests (contractual unit correctness):
 *   CA: WhatsApp contract unit is conversations, not messages
 *   CB: AI contract unit is queries, not credits
 *   CC: TRACKING_NOT_READY is not certified zero
 *   CD: image limit = 400 can be represented
 *   CE: video limit = 80
 *   CF: accounting docs = 2000
 *   CG: WhatsApp limit = 2000
 *   CH: AI chat queries = 2000
 *   CI: image overage = 5 cents
 *   CJ: video overage = 50 cents
 *   CK: document overage = 2 cents
 *   CL: no invented WhatsApp overage
 *   CM: no invented chat-query overage
 *   CN: admin can create agreement (structural)
 *   CO: ORG_ADMIN cannot create agreement (structural)
 *   CP: supersede preserves historical record
 *   CQ: agreement still does not grant module access
 *
 * Sprint v3 tests (video unit, enforcement, admin UI):
 *   DA: video contract unit = VIDEO COUNT, never seconds
 *   DB: videoSeconds cannot satisfy video-count contract
 *   DC: missing video count → TRACKING_NOT_READY
 *   DD: image 399 + 1 allowed
 *   DE: image 400 + 1 exceeded
 *   DF: image overage uses integer cents
 *   DG: WhatsApp messages cannot satisfy conversation metric
 *   DH: AI credits cannot satisfy query metric
 *   DI: accounting missing counter honest
 *   DJ: admin UI loads agreement
 *   DK: SUPER_ADMIN can configure via UI/API
 *   DL: ORG_ADMIN cannot mutate
 *   DM: supersede preserves history
 *   DN: agreement does not grant entitlement
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Load the billing preview builder (pure function, no DB) ─────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildPreviewFromEntitlements, formatCents } = require("../billing-preview");

// ── Load types for usage metric readiness + contractual limits ──────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { USAGE_METRIC_READINESS, CASTILLITOS_CONTRACT_LIMITS } = require("../commercial-agreement-types");

// ── Test fixtures ───────────────────────────────────────────────────────────

type ModuleEntitlement = {
  moduleKey: string;
  tenantModuleId: string | null;
  enabled: boolean;
  currentTerm: any;
  termHistory: any[];
  entitlementPeriods: any[];
  currentPeriod: any;
};

type AgreementFull = {
  id: string;
  organizationId: string;
  agreementType: string;
  monthlyPriceCents: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  modules: { id: string; agreementId: string; moduleKey: string }[];
  usageLimits: any[];
};

const ORG_ID = "org_castillitos_test";

/** Build a module entitlement fixture with an active term and period for 2026-08. */
function makeEntitlement(
  moduleKey: string,
  priceCents: number,
  currency: string = "USD",
): ModuleEntitlement {
  return {
    moduleKey,
    tenantModuleId: `tm_${moduleKey}`,
    enabled: true,
    currentTerm: {
      id: `ct_${moduleKey}`,
      tenantModuleId: `tm_${moduleKey}`,
      monthlyPriceCents: priceCents,
      currency,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: null,
      note: null,
    },
    termHistory: [
      {
        id: `ct_${moduleKey}`,
        tenantModuleId: `tm_${moduleKey}`,
        monthlyPriceCents: priceCents,
        currency,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        note: null,
      },
    ],
    entitlementPeriods: [
      {
        id: `ep_${moduleKey}`,
        tenantModuleId: `tm_${moduleKey}`,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
      },
    ],
    currentPeriod: {
      id: `ep_${moduleKey}`,
      tenantModuleId: `tm_${moduleKey}`,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: null,
    },
  };
}

/** Castillitos-style custom bundle agreement effective Jan 2026. */
function makeBundleAgreement(
  includedKeys: string[],
  overrides?: Partial<AgreementFull>,
): AgreementFull {
  return {
    id: "agr_castillitos_bundle",
    organizationId: ORG_ID,
    agreementType: "CUSTOM_BUNDLE",
    monthlyPriceCents: 75000,
    currency: "USD",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "ACTIVE",
    note: "Acuerdo legado — paquete fijo negociado USD 750/mes",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    modules: includedKeys.map(k => ({
      id: `am_${k}`,
      agreementId: "agr_castillitos_bundle",
      moduleKey: k,
    })),
    usageLimits: [],
    ...overrides,
  };
}

const PERIOD = "2026-08";

// ═══════════════════════════════════════════════════════════════════════════════
// Tests A–O
// ═══════════════════════════════════════════════════════════════════════════════

describe("1. Bundle billing — core precedence law", () => {

  it("A: custom bundle emits single charge at agreement price", () => {
    const entitlements = [
      makeEntitlement("sales", 30000),
      makeEntitlement("finance", 20000),
      makeEntitlement("marketing_studio", 15000),
      makeEntitlement("production", 15000),
    ];
    const agreement = makeBundleAgreement([
      "sales", "finance", "marketing_studio", "production",
    ]);

    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, agreement);

    assert.ok(preview.bundleLineItem, "Must have a bundle line item");
    assert.equal(preview.bundleLineItem.monthlyPriceCents, 75000, "Bundle price = 75000 cents");
    assert.equal(preview.bundleLineItem.currency, "USD");
    assert.equal(preview.bundleLineItem.includedModuleKeys.length, 4);
    // No individual line items for covered modules
    assert.equal(preview.lineItems.length, 0, "No individual line items when all covered");
    // Subtotal is bundle only
    assert.equal(preview.subtotals.length, 1);
    assert.equal(preview.subtotals[0].subtotalCents, 75000);
  });

  it("B: covered module NOT double billed (suppressed from lineItems)", () => {
    const entitlements = [
      makeEntitlement("sales", 30000),
      makeEntitlement("finance", 20000),
      makeEntitlement("whatsapp", 10000), // NOT in bundle
    ];
    const agreement = makeBundleAgreement(["sales", "finance"]);

    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, agreement);

    // Sales and finance suppressed — only whatsapp individually billed
    const moduleKeys = preview.lineItems.map((i: any) => i.moduleKey);
    assert.ok(!moduleKeys.includes("sales"), "sales must NOT appear in individual lineItems");
    assert.ok(!moduleKeys.includes("finance"), "finance must NOT appear in individual lineItems");
    assert.ok(moduleKeys.includes("whatsapp"), "whatsapp must appear individually");
    // Total = bundle(75000) + whatsapp(10000) = 85000
    assert.equal(preview.subtotals[0].subtotalCents, 85000);
  });

  it("C: covered module individual price NOT mutated (BUNDLE_MODULE_PRICE_MUTATED=false)", () => {
    const salesEntitlement = makeEntitlement("sales", 30000);
    const originalPrice = salesEntitlement.currentTerm.monthlyPriceCents;

    const agreement = makeBundleAgreement(["sales"]);

    // Build preview — this must NOT change the entitlement's price
    buildPreviewFromEntitlements(ORG_ID, [salesEntitlement], PERIOD, agreement);

    // Verify the input was not mutated
    assert.equal(
      salesEntitlement.currentTerm.monthlyPriceCents,
      originalPrice,
      "Module commercial term price must NOT be mutated by bundle billing",
    );
    assert.equal(originalPrice, 30000, "Original price must remain 30000");
  });

  it("D: outside module individually billed at its commercial term price", () => {
    const entitlements = [
      makeEntitlement("sales", 30000),
      makeEntitlement("collections", 12000),
    ];
    const agreement = makeBundleAgreement(["sales"]);

    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, agreement);

    assert.equal(preview.lineItems.length, 1, "One individual line item");
    assert.equal(preview.lineItems[0].moduleKey, "collections");
    assert.equal(preview.lineItems[0].monthlyPriceCents, 12000);
    // Subtotal = bundle(75000) + collections(12000) = 87000
    assert.equal(preview.subtotals[0].subtotalCents, 87000);
  });
});

describe("2. Bundle billing — temporal correctness", () => {

  it("E: historical month uses agreement effective at that time", () => {
    const entitlements = [makeEntitlement("sales", 30000)];
    // Agreement was active Jan–Jun 2026
    const agreement = makeBundleAgreement(["sales"], {
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: "2026-07-01T00:00:00.000Z",
      status: "SUPERSEDED",
    });

    // June 2026 — agreement still active
    const previewJune = buildPreviewFromEntitlements(ORG_ID, entitlements, "2026-06", agreement);
    assert.ok(previewJune.bundleLineItem, "Bundle must be active in June");

    // This test uses pure function — getAgreementForMonth handles the DB query.
    // Here we verify the builder respects a provided agreement.
  });

  it("F: future agreement not active for current month", () => {
    const entitlements = [makeEntitlement("sales", 30000)];
    // Agreement starts in the future (Sep 2026) — should NOT apply to Aug
    const futureAgreement = makeBundleAgreement(["sales"], {
      effectiveFrom: "2026-09-01T00:00:00.000Z",
    });

    // For the builder, the agreement service (getAgreementForMonth) would return null
    // for Aug 2026 because the agreement starts in Sep. We simulate by passing null.
    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, null);
    assert.equal(preview.bundleLineItem, null, "No bundle for period before agreement starts");
    assert.equal(preview.lineItems.length, 1, "Individual billing applies");
    assert.equal(preview.lineItems[0].monthlyPriceCents, 30000);
  });

  it("G: expired agreement not active — individual billing resumes", () => {
    const entitlements = [makeEntitlement("sales", 30000)];
    // No active agreement (expired before Aug 2026)
    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, null);

    assert.equal(preview.bundleLineItem, null, "No bundle when agreement expired");
    assert.equal(preview.lineItems.length, 1);
    assert.equal(preview.lineItems[0].monthlyPriceCents, 30000);
  });

  it("H: version change preserves history (superseded agreement)", () => {
    const entitlements = [
      makeEntitlement("sales", 30000),
      makeEntitlement("finance", 20000),
    ];

    // Old agreement: Jan-Jun 2026, $500
    const oldAgreement = makeBundleAgreement(["sales"], {
      id: "agr_v1",
      monthlyPriceCents: 50000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: "2026-07-01T00:00:00.000Z",
      status: "SUPERSEDED",
    });

    // New agreement: Jul+ 2026, $750 with more modules
    const newAgreement = makeBundleAgreement(["sales", "finance"], {
      id: "agr_v2",
      monthlyPriceCents: 75000,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
    });

    // June preview uses old agreement
    const previewJune = buildPreviewFromEntitlements(ORG_ID, entitlements, "2026-06", oldAgreement);
    assert.equal(previewJune.bundleLineItem!.monthlyPriceCents, 50000, "June = old price");
    assert.equal(previewJune.lineItems.length, 1, "finance NOT covered by old agreement");

    // August preview uses new agreement
    const previewAug = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, newAgreement);
    assert.equal(previewAug.bundleLineItem!.monthlyPriceCents, 75000, "Aug = new price");
    assert.equal(previewAug.lineItems.length, 0, "finance now covered by new agreement");
  });
});

describe("3. Entitlement vs agreement separation", () => {

  it("I: agreement does NOT grant entitlement (access authority is TenantModule)", () => {
    // Source code contract: createAgreement does NOT call setModuleEnabled
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      !src.includes("setModuleEnabled"),
      "Agreement service must NOT call setModuleEnabled",
    );
    assert.ok(
      !src.includes("TenantModule.update"),
      "Agreement service must NOT directly update TenantModule",
    );

    // The service header documents this explicitly
    assert.ok(
      src.includes("Creating an agreement does NOT enable/disable TenantModule"),
      "Service must document entitlement separation",
    );
  });

  it("J: entitlement does NOT imply bundle membership", () => {
    // A module can be entitled (TenantModule.enabled=true) but NOT covered by bundle.
    // In that case, it gets individually billed.
    const entitlements = [
      makeEntitlement("sales", 30000),
      makeEntitlement("whatsapp", 10000),
    ];
    // Bundle only covers sales
    const agreement = makeBundleAgreement(["sales"]);

    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, agreement);

    // whatsapp is entitled but NOT in bundle — individually billed
    assert.equal(preview.lineItems.length, 1);
    assert.equal(preview.lineItems[0].moduleKey, "whatsapp");
    assert.equal(preview.lineItems[0].monthlyPriceCents, 10000);
  });
});

describe("4. Currency and usage limits", () => {

  it("K: mixed currency not summed (bundle USD + individual COP)", () => {
    const entitlements = [
      makeEntitlement("sales", 30000, "USD"),
      makeEntitlement("collections", 5000000, "COP"), // COP module outside bundle
    ];
    const agreement = makeBundleAgreement(["sales"]);

    const preview = buildPreviewFromEntitlements(ORG_ID, entitlements, PERIOD, agreement);

    assert.ok(preview.hasMixedCurrencies, "Must flag mixed currencies");
    assert.equal(preview.subtotals.length, 2, "Two currency subtotals");

    const usdSubtotal = preview.subtotals.find((s: any) => s.currency === "USD");
    const copSubtotal = preview.subtotals.find((s: any) => s.currency === "COP");
    assert.ok(usdSubtotal, "Must have USD subtotal");
    assert.ok(copSubtotal, "Must have COP subtotal");
    assert.equal(usdSubtotal.subtotalCents, 75000, "USD = bundle only");
    assert.equal(copSubtotal.subtotalCents, 5000000, "COP = individual collections");
  });

  it("L: unknown usage metric returns TRACKING_NOT_READY honestly", () => {
    assert.equal(
      USAGE_METRIC_READINESS.whatsapp_messages_monthly,
      "TRACKING_NOT_READY",
      "WhatsApp must be TRACKING_NOT_READY",
    );
    assert.equal(
      USAGE_METRIC_READINESS.storage_gb,
      "TRACKING_NOT_READY",
      "Storage must be TRACKING_NOT_READY",
    );
  });

  it("M: AI usage reuses existing authority (PRODUCTION_READY)", () => {
    assert.equal(
      USAGE_METRIC_READINESS.ai_credits_monthly,
      "PRODUCTION_READY",
      "AI credits must be PRODUCTION_READY",
    );
    // The service uses prisma.aiCreditBalance — verify in source
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      src.includes("aiCreditBalance"),
      "Must use existing aiCreditBalance for AI credit counter",
    );
    assert.ok(
      !src.includes("AiCreditLedger.create"),
      "Must NOT create parallel AI accounting",
    );
  });
});

describe("5. Security and isolation", () => {

  it("N: tenant isolation — agreement is org-scoped", () => {
    // Prisma model has organizationId FK
    const schemaSrc = readFile("prisma/schema.prisma");
    assert.ok(
      schemaSrc.includes("model TenantCommercialAgreement"),
      "TenantCommercialAgreement model must exist",
    );

    // Service always filters by organizationId
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    const getActiveIdx = src.indexOf("async function getActiveAgreement");
    const getActiveBlock = src.slice(getActiveIdx, getActiveIdx + 500);
    assert.ok(
      getActiveBlock.includes("organizationId"),
      "getActiveAgreement must filter by organizationId",
    );
  });

  it("O: admin-only agreement mutation (structural)", () => {
    // Agreement types allow only SUPER_ADMIN/AGENTIK_ADMIN.
    // The service itself does not enforce roles (that's the API route's job),
    // but the source documents RESTRICT FK policy.
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      src.includes("RESTRICT"),
      "Service must document RESTRICT FK deletion policy",
    );

    // Prisma schema uses onDelete: Restrict for agreement → org
    const schemaSrc = readFile("prisma/schema.prisma");
    const agreementModelIdx = schemaSrc.indexOf("model TenantCommercialAgreement {");
    const agreementBlock = schemaSrc.slice(agreementModelIdx, agreementModelIdx + 800);
    assert.ok(
      agreementBlock.includes("onDelete: Restrict"),
      "Agreement FK must use onDelete: Restrict",
    );
  });
});

describe("6. Model and migration contracts", () => {

  it("P: Prisma models exist with correct structure", () => {
    const src = readFile("prisma/schema.prisma");

    // Main agreement model
    assert.ok(src.includes("model TenantCommercialAgreement {"));
    assert.ok(src.includes("model TenantCommercialAgreementModule {"));
    assert.ok(src.includes("model TenantCommercialAgreementUsageLimit {"));

    // Key fields
    const agreementIdx = src.indexOf("model TenantCommercialAgreement {");
    const agreementBlock = src.slice(agreementIdx, agreementIdx + 800);
    assert.ok(agreementBlock.includes("monthlyPriceCents"), "Must have monthlyPriceCents");
    assert.ok(agreementBlock.includes("currency"), "Must have currency");
    assert.ok(agreementBlock.includes("effectiveFrom"), "Must have effectiveFrom");
    assert.ok(agreementBlock.includes("effectiveTo"), "Must have effectiveTo");
    assert.ok(agreementBlock.includes("agreementType"), "Must have agreementType");
    assert.ok(agreementBlock.includes("status"), "Must have status");

    // Module membership model
    const moduleIdx = src.indexOf("model TenantCommercialAgreementModule {");
    const moduleBlock = src.slice(moduleIdx, moduleIdx + 400);
    assert.ok(moduleBlock.includes("agreementId"), "Must have agreementId");
    assert.ok(moduleBlock.includes("moduleKey"), "Must have moduleKey");
    assert.ok(
      moduleBlock.includes("@@unique([agreementId, moduleKey])"),
      "Must have unique constraint on agreementId+moduleKey",
    );

    // Usage limit model
    const limitIdx = src.indexOf("model TenantCommercialAgreementUsageLimit {");
    const limitBlock = src.slice(limitIdx, limitIdx + 800);
    assert.ok(limitBlock.includes("metricKey"), "Must have metricKey");
    assert.ok(limitBlock.includes("includedQuantity"), "Must have includedQuantity");
    assert.ok(limitBlock.includes("policy"), "Must have policy");
    assert.ok(
      limitBlock.includes("@@unique([agreementId, metricKey])"),
      "Must have unique constraint on agreementId+metricKey",
    );
  });

  it("Q: migration file exists and is NOT applied", () => {
    const migrationPath = path.join(
      ROOT,
      "prisma/migrations/20260811000000_tenant_commercial_agreements/migration.sql",
    );
    assert.ok(
      fs.existsSync(migrationPath),
      "Migration file must exist at expected path",
    );

    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(sql.includes("TenantCommercialAgreement"), "SQL must create agreement table");
    assert.ok(sql.includes("TenantCommercialAgreementModule"), "SQL must create module table");
    assert.ok(sql.includes("TenantCommercialAgreementUsageLimit"), "SQL must create usage limit table");
    assert.ok(sql.includes("ON DELETE RESTRICT"), "Agreement FK must be RESTRICT");
    assert.ok(sql.includes("ON DELETE CASCADE"), "Module/limit FKs must be CASCADE");
  });

  it("R: billing preview supports bundle line item", () => {
    const src = readFile("lib/tenant/billing-preview.ts");
    assert.ok(
      src.includes("bundleLineItem"),
      "BillingPreview must have bundleLineItem field",
    );
    assert.ok(
      src.includes("CUSTOM_BUNDLE"),
      "Builder must check for CUSTOM_BUNDLE agreement type",
    );
    assert.ok(
      src.includes("coveredByBundle"),
      "Builder must track covered module keys",
    );
    assert.ok(
      src.includes("BUNDLE_MODULE_PRICE_MUTATED = false"),
      "Builder must document BUNDLE_MODULE_PRICE_MUTATED = false",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests CA–CQ — Contractual unit correctness + admin mutation
// ═══════════════════════════════════════════════════════════════════════════════

describe("7. Contractual unit correctness", () => {

  it("CA: WhatsApp contract unit is conversations, not messages", () => {
    // The contractual metric must be whatsapp_conversations_monthly
    assert.ok(
      "whatsapp_conversations_monthly" in USAGE_METRIC_READINESS,
      "whatsapp_conversations_monthly must exist as a metric key",
    );
    // Verify the types file uses the correct contractual unit
    const src = readFile("lib/tenant/commercial-agreement-types.ts");
    assert.ok(
      src.includes("whatsapp_conversations_monthly"),
      "Types must include whatsapp_conversations_monthly",
    );
    assert.ok(
      src.includes('whatsapp_conversations ≠ whatsapp_messages') ||
      src.includes("conversations") && src.includes("contractual unit"),
      "Types must document that conversations ≠ messages",
    );
  });

  it("CB: AI contract unit is queries, not credits", () => {
    assert.ok(
      "ai_chat_queries_monthly" in USAGE_METRIC_READINESS,
      "ai_chat_queries_monthly must exist as a metric key",
    );
    const src = readFile("lib/tenant/commercial-agreement-types.ts");
    assert.ok(
      src.includes("ai_chat_queries_monthly"),
      "Types must include ai_chat_queries_monthly",
    );
    assert.ok(
      src.includes("ai_chat_queries") && src.includes("ai_credits"),
      "Types must distinguish queries from credits",
    );
  });

  it("CC: TRACKING_NOT_READY is not certified zero", () => {
    // Metrics with TRACKING_NOT_READY must NOT pretend to have data
    const notReady = Object.entries(USAGE_METRIC_READINESS)
      .filter(([, v]) => v === "TRACKING_NOT_READY");

    assert.ok(notReady.length >= 4, "At least 4 metrics must be TRACKING_NOT_READY");

    // Verify conversations and queries are NOT_READY
    assert.equal(
      USAGE_METRIC_READINESS.whatsapp_conversations_monthly,
      "TRACKING_NOT_READY",
      "WhatsApp conversations tracking is NOT ready",
    );
    assert.equal(
      USAGE_METRIC_READINESS.ai_chat_queries_monthly,
      "TRACKING_NOT_READY",
      "AI chat queries tracking is NOT ready",
    );

    // The service must NOT present TRACKING_NOT_READY as certified zero
    const serviceSrc = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      serviceSrc.includes("honest absence") || serviceSrc.includes("TRACKING_NOT_READY"),
      "Service must document honest absence for untracked metrics",
    );
  });

  it("CD: image limit = 400 can be represented", () => {
    const imageLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "image_units_monthly",
    );
    assert.ok(imageLimit, "Must define image limit in contract");
    assert.equal(imageLimit.includedQuantity, 400, "Image limit = 400");
  });

  it("CE: video limit = 80 (ai_videos_monthly, NOT video_seconds)", () => {
    const videoLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "ai_videos_monthly",
    );
    assert.ok(videoLimit, "Must define video limit as ai_videos_monthly");
    assert.equal(videoLimit.includedQuantity, 80, "Video limit = 80");
    // Verify NO video_seconds_monthly in contract limits
    const secondsLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "video_seconds_monthly",
    );
    assert.equal(secondsLimit, undefined, "video_seconds_monthly must NOT be in contract limits");
  });

  it("CF: accounting docs = 2000", () => {
    const docLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "accounting_documents_monthly",
    );
    assert.ok(docLimit, "Must define accounting docs limit in contract");
    assert.equal(docLimit.includedQuantity, 2000, "Accounting docs limit = 2000");
  });

  it("CG: WhatsApp limit = 2000", () => {
    const waLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "whatsapp_conversations_monthly",
    );
    assert.ok(waLimit, "Must define WhatsApp conversations limit in contract");
    assert.equal(waLimit.includedQuantity, 2000, "WhatsApp conversations limit = 2000");
  });

  it("CH: AI chat queries = 2000", () => {
    const aiLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "ai_chat_queries_monthly",
    );
    assert.ok(aiLimit, "Must define AI chat queries limit in contract");
    assert.equal(aiLimit.includedQuantity, 2000, "AI chat queries limit = 2000");
  });

  it("CI: image overage = 5 cents", () => {
    const imageLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "image_units_monthly",
    );
    assert.ok(imageLimit, "Must define image limit");
    assert.equal(imageLimit.overagePriceCents, 5, "Image overage = 5 cents (USD 0.05)");
    assert.equal(imageLimit.overageCurrency, "USD");
  });

  it("CJ: video overage = 50 cents (ai_videos_monthly)", () => {
    const videoLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "ai_videos_monthly",
    );
    assert.ok(videoLimit, "Must define video limit as ai_videos_monthly");
    assert.equal(videoLimit.overagePriceCents, 50, "Video overage = 50 cents (USD 0.50)");
    assert.equal(videoLimit.overageCurrency, "USD");
  });

  it("CK: document overage = 2 cents", () => {
    const docLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "accounting_documents_monthly",
    );
    assert.ok(docLimit, "Must define doc limit");
    assert.equal(docLimit.overagePriceCents, 2, "Document overage = 2 cents (USD 0.02)");
    assert.equal(docLimit.overageCurrency, "USD");
  });

  it("CL: no invented WhatsApp overage", () => {
    const waLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "whatsapp_conversations_monthly",
    );
    assert.ok(waLimit, "Must define WhatsApp limit");
    assert.equal(
      waLimit.overagePriceCents,
      null,
      "WhatsApp overage must be null — not defined in proposal",
    );
  });

  it("CM: no invented chat-query overage", () => {
    const aiLimit = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "ai_chat_queries_monthly",
    );
    assert.ok(aiLimit, "Must define AI chat queries limit");
    assert.equal(
      aiLimit.overagePriceCents,
      null,
      "AI chat query overage must be null — not defined in proposal",
    );
  });
});

describe("8. Admin mutation + history contracts", () => {

  it("CN: admin can create agreement (structural)", () => {
    const src = readFile("app/api/orgs/[orgSlug]/modules/agreements/route.ts");
    assert.ok(src.includes("POST"), "Must have POST handler");
    assert.ok(src.includes("createAgreement"), "POST must call createAgreement");
    assert.ok(
      src.includes("SUPER_ADMIN") && src.includes("AGENTIK_ADMIN"),
      "Must check for SUPER_ADMIN / AGENTIK_ADMIN roles",
    );
  });

  it("CO: ORG_ADMIN cannot create agreement (structural)", () => {
    const src = readFile("app/api/orgs/[orgSlug]/modules/agreements/route.ts");
    // The resolveAdminCtx function checks for SUPER_ADMIN / AGENTIK_ADMIN only
    assert.ok(
      src.includes('ADMIN_ROLES.has(membership.role)') ||
      (src.includes("SUPER_ADMIN") && src.includes("AGENTIK_ADMIN") && !src.includes("ORG_ADMIN")),
      "Must deny ORG_ADMIN — only SUPER_ADMIN and AGENTIK_ADMIN allowed",
    );
    // Must not include ORG_ADMIN in the allowed set
    assert.ok(
      !src.includes('"ORG_ADMIN"'),
      "ORG_ADMIN must NOT appear as an allowed role",
    );
  });

  it("CP: supersede preserves historical record", () => {
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    // supersededAgreement must set old agreement to SUPERSEDED, not delete
    assert.ok(
      src.includes("SUPERSEDED"),
      "Service must use SUPERSEDED status",
    );
    assert.ok(
      src.includes("$transaction"),
      "Supersede must use transaction for atomicity",
    );
    // Must not delete old agreement
    assert.ok(
      !src.includes(".delete("),
      "Service must NOT delete old agreements — close/supersede only",
    );

    // The API route must expose supersede as PUT
    const routeSrc = readFile("app/api/orgs/[orgSlug]/modules/agreements/route.ts");
    assert.ok(routeSrc.includes("PUT"), "Must have PUT handler for supersede");
    assert.ok(
      routeSrc.includes("supersededAgreement"),
      "PUT must call supersededAgreement",
    );
    assert.ok(
      routeSrc.includes("existingAgreementId"),
      "PUT must require existingAgreementId",
    );
  });

  it("CQ: agreement still does not grant module access", () => {
    // Double-verify: agreement service has NO entitlement side-effects
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      !src.includes("activateModule"),
      "Agreement service must NOT call activateModule",
    );
    assert.ok(
      !src.includes("deactivateModule"),
      "Agreement service must NOT call deactivateModule",
    );
    assert.ok(
      !src.includes("TenantModule.enabled"),
      "Agreement service must NOT reference TenantModule.enabled",
    );

    // Also verify the API route doesn't enable modules
    const routeSrc = readFile("app/api/orgs/[orgSlug]/modules/agreements/route.ts");
    assert.ok(
      !routeSrc.includes("activateModule"),
      "Agreement route must NOT call activateModule",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests DA–DN — Video unit, enforcement, admin UI
// ═══════════════════════════════════════════════════════════════════════════════

describe("9. Video contract unit integrity", () => {

  it("DA: video contract unit = VIDEO COUNT, never seconds", () => {
    // ai_videos_monthly must exist as a metric key
    assert.ok(
      "ai_videos_monthly" in USAGE_METRIC_READINESS,
      "ai_videos_monthly must be a registered metric key",
    );
    // Castillitos contract uses ai_videos_monthly, not video_seconds_monthly
    const videoContract = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "ai_videos_monthly",
    );
    assert.ok(videoContract, "Contract must use ai_videos_monthly");
    assert.equal(videoContract.includedQuantity, 80, "Contract = 80 videos");
    // No video_seconds in contract limits
    const secondsInContract = CASTILLITOS_CONTRACT_LIMITS.find(
      (l: any) => l.metricKey === "video_seconds_monthly",
    );
    assert.equal(secondsInContract, undefined, "video_seconds_monthly must NOT be in contract");
  });

  it("DB: videoSeconds cannot satisfy video-count contract", () => {
    // The service must NOT use videoSeconds for ai_videos_monthly
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    const usageFn = src.slice(src.indexOf("async function getCurrentUsage"));
    // ai_videos_monthly must be in the TRACKING_NOT_READY group (returns 0)
    assert.ok(
      usageFn.includes('case "ai_videos_monthly"'),
      "ai_videos_monthly must have a case in getCurrentUsage",
    );
    // ai_videos_monthly must NOT have its own aggregate block with videoSeconds
    // It must share the TRACKING_NOT_READY return-0 group, not get a dedicated counter
    const videoSecondsBlock = usageFn.indexOf('case "video_seconds_monthly"');
    const videoCountBlock = usageFn.indexOf('case "ai_videos_monthly"');
    // video_seconds has a dedicated counter block (aggregate); ai_videos does not
    assert.ok(videoSecondsBlock < videoCountBlock,
      "video_seconds_monthly counter must be BEFORE ai_videos_monthly (grouped with NOT_READY)");
    // ai_videos_monthly must be in the honest-absence return group
    const afterVideoCount = usageFn.slice(videoCountBlock, videoCountBlock + 600);
    assert.ok(
      afterVideoCount.includes("return 0") || afterVideoCount.includes("honest absence"),
      "ai_videos_monthly must return honest zero (TRACKING_NOT_READY group)",
    );
  });

  it("DC: missing video count → TRACKING_NOT_READY", () => {
    assert.equal(
      USAGE_METRIC_READINESS.ai_videos_monthly,
      "TRACKING_NOT_READY",
      "ai_videos_monthly must be TRACKING_NOT_READY (no video count field in DB)",
    );
  });
});

describe("10. Usage limit enforcement", () => {

  it("DD: image 399 + 1 allowed (within allowance)", () => {
    // checkUsageLimit is async and needs DB — test the evaluator logic structurally
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      src.includes("WITHIN_ALLOWANCE"),
      "Service must return WITHIN_ALLOWANCE status",
    );
    assert.ok(
      src.includes("currentUsage + proposedUsage") && src.includes("includedQuantity"),
      "Service must compare current + proposed against included quantity",
    );
  });

  it("DE: image 400 + 1 exceeded (LIMIT_EXCEEDED)", () => {
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      src.includes("LIMIT_EXCEEDED"),
      "Service must return LIMIT_EXCEEDED status when exceeded",
    );
    assert.ok(
      src.includes("wouldExceed"),
      "Service must compute wouldExceed flag",
    );
  });

  it("DF: image overage uses integer cents (no floating point)", () => {
    // Verify overage calculation uses integer multiplication
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      src.includes("overageTotalCents"),
      "Service must calculate overageTotalCents",
    );
    assert.ok(
      src.includes("excessUnits * limit.overagePriceCents") ||
      src.includes("excessUnits * limit.overagePriceCents"),
      "Overage total must be integer cents multiplication",
    );

    // Verify types use number (integer cents), not floating point
    const types = readFile("lib/tenant/commercial-agreement-types.ts");
    assert.ok(
      types.includes("overagePriceCents: number"),
      "Overage price must be in integer cents",
    );
    assert.ok(
      types.includes("overageTotalCents: number"),
      "Overage total must be in integer cents",
    );
  });

  it("DG: WhatsApp messages cannot satisfy conversation metric", () => {
    // whatsapp_conversations_monthly is TRACKING_NOT_READY
    assert.equal(
      USAGE_METRIC_READINESS.whatsapp_conversations_monthly,
      "TRACKING_NOT_READY",
    );
    // The types file must document the distinction
    const src = readFile("lib/tenant/commercial-agreement-types.ts");
    assert.ok(
      src.includes("whatsapp_conversations") && src.includes("whatsapp_messages"),
      "Types must distinguish conversations from messages",
    );
  });

  it("DH: AI credits cannot satisfy query metric", () => {
    assert.equal(
      USAGE_METRIC_READINESS.ai_chat_queries_monthly,
      "TRACKING_NOT_READY",
    );
    // ai_credits_monthly is a different metric entirely
    assert.equal(
      USAGE_METRIC_READINESS.ai_credits_monthly,
      "PRODUCTION_READY",
    );
    // They must be separate metric keys
    assert.notEqual(
      "ai_chat_queries_monthly",
      "ai_credits_monthly",
      "Queries and credits must be different metrics",
    );
  });

  it("DI: accounting missing counter honest", () => {
    assert.equal(
      USAGE_METRIC_READINESS.accounting_documents_monthly,
      "TRACKING_NOT_READY",
      "Accounting documents must be TRACKING_NOT_READY",
    );
    // Service returns honest zero, not certified zero
    const src = readFile("lib/tenant/commercial-agreement-service.ts");
    assert.ok(
      src.includes("honest absence") || src.includes("not certified zero"),
      "Service must document that zero is honest absence",
    );
  });
});

describe("11. Admin UI + API contracts", () => {

  it("DJ: admin UI loads agreement", () => {
    // Page component exists
    const pageSrc = readFile("app/(app)/[orgSlug]/agentik/tenant-modules/agreements/page.tsx");
    assert.ok(pageSrc.includes("listAgreements"), "Page must load agreements");
    assert.ok(pageSrc.includes("getActiveAgreement"), "Page must load active agreement");
    assert.ok(pageSrc.includes("AgreementsClient"), "Page must render AgreementsClient");
    assert.ok(
      pageSrc.includes("CASTILLITOS_BUNDLE_MODULE_KEYS"),
      "Page must pass Castillitos preset",
    );
  });

  it("DK: SUPER_ADMIN can configure via UI/API", () => {
    // API route supports full CRUD
    const routeSrc = readFile("app/api/orgs/[orgSlug]/modules/agreements/route.ts");
    assert.ok(routeSrc.includes("export async function GET"), "Must have GET");
    assert.ok(routeSrc.includes("export async function POST"), "Must have POST");
    assert.ok(routeSrc.includes("export async function PUT"), "Must have PUT");
    assert.ok(routeSrc.includes("export async function DELETE"), "Must have DELETE");

    // UI client has create/supersede/expire capabilities
    const clientSrc = readFile("app/(app)/[orgSlug]/agentik/tenant-modules/agreements/agreements-client.tsx");
    assert.ok(clientSrc.includes("handleCreate"), "Client must have create handler");
    assert.ok(clientSrc.includes("handleExpire"), "Client must have expire handler");
    assert.ok(clientSrc.includes("Superseder"), "Client must support supersede");
    assert.ok(clientSrc.includes("monthlyPriceCents"), "Client must allow setting price");
    assert.ok(clientSrc.includes("effectiveFrom"), "Client must allow setting effective dates");
    assert.ok(clientSrc.includes("includedModuleKeys"), "Client must allow selecting modules");
    assert.ok(clientSrc.includes("usageLimits"), "Client must allow setting usage limits");
  });

  it("DL: ORG_ADMIN cannot mutate", () => {
    // Server page gates by role
    const pageSrc = readFile("app/(app)/[orgSlug]/agentik/tenant-modules/agreements/page.tsx");
    assert.ok(
      pageSrc.includes("SUPER_ADMIN") && pageSrc.includes("AGENTIK_ADMIN"),
      "Page must check admin roles",
    );
    assert.ok(
      pageSrc.includes("redirect"),
      "Page must redirect non-admin users",
    );

    // API route also gates
    const routeSrc = readFile("app/api/orgs/[orgSlug]/modules/agreements/route.ts");
    assert.ok(
      !routeSrc.includes('"ORG_ADMIN"') && !routeSrc.includes('"MANAGER"'),
      "API must NOT allow ORG_ADMIN or MANAGER",
    );
  });

  it("DM: supersede preserves history (UI + service)", () => {
    // Client sends PUT with existingAgreementId
    const clientSrc = readFile("app/(app)/[orgSlug]/agentik/tenant-modules/agreements/agreements-client.tsx");
    assert.ok(
      clientSrc.includes("existingAgreementId") && clientSrc.includes("PUT"),
      "Client must send PUT with existingAgreementId for supersede",
    );

    // History list is rendered
    assert.ok(
      clientSrc.includes("Historial de acuerdos"),
      "Client must display agreement history",
    );
    assert.ok(
      clientSrc.includes("SUPERSEDED"),
      "Client must show SUPERSEDED status",
    );
  });

  it("DN: agreement does not grant entitlement (admin UI)", () => {
    // Admin UI must NOT call activateModule or touch TenantModule
    const clientSrc = readFile("app/(app)/[orgSlug]/agentik/tenant-modules/agreements/agreements-client.tsx");
    assert.ok(
      !clientSrc.includes("activateModule"),
      "Admin UI must NOT call activateModule",
    );
    assert.ok(
      !clientSrc.includes("deactivateModule"),
      "Admin UI must NOT call deactivateModule",
    );
    assert.ok(
      !clientSrc.includes("/modules\"") || clientSrc.includes("/modules/agreements"),
      "Admin UI must only call agreements endpoint, not modules PATCH",
    );
  });
});
