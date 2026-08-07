/**
 * lib/comercial/frontline/__tests__/frontline-core.test.ts
 *
 * AGENTIK-COMMERCIAL-FRONTLINE-CORE-01 — Structural Tests
 *
 * Validates contracts, tenant isolation, seller scope, type safety,
 * no React business calculations, no arbitrary SQL.
 *
 * Runner: node:test via `npx tsx --test`
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = join(__dirname, "..");

function readSrc(file: string) {
  return readFileSync(join(BASE, file), "utf-8");
}

// ── Suite 1: Tenant Isolation ───────────────────────────────────────────────

describe("1. Tenant isolation", () => {
  it("T01: resolveCurrentSeller requires organizationId", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(src.includes("organizationId"), "Missing organizationId parameter");
  });

  it("T02: getCustomerPurchaseHistory requires orgId", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes("orgId: string"), "Missing orgId parameter");
  });

  it("T03: getCustomerCommercialContext requires orgId", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(src.includes("orgId: string"), "Missing orgId parameter");
  });

  it("T04: getSellerAttention requires orgId", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("orgId: string"), "Missing orgId parameter");
  });

  it("T05: getCustomerReceivables requires orgId", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.match(
      src,
      /getCustomerReceivables\(\s*orgId: string/,
      "getCustomerReceivables must require orgId as first arg",
    );
  });
});

// ── Suite 2: Seller-User Deterministic Mapping ──────────────────────────────

describe("2. Seller-user deterministic mapping", () => {
  it("T06: resolveCurrentSeller requires userId", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(src.includes("userId: string"), "Missing userId parameter");
  });

  it("T07: ResolvedSellerIdentity includes mappingSource", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("mappingSource: SellerMappingSource"), "Missing mappingSource");
  });

  it("T08: SellerMappingSource has 4 variants", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("membership_seller_slug"), "Missing membership_seller_slug");
    assert.ok(src.includes("email_crm_match"), "Missing email_crm_match");
    assert.ok(src.includes("admin_scope"), "Missing admin_scope");
    assert.ok(src.includes("unmapped"), "Missing unmapped");
  });

  it("T09: mapping does NOT use display name guessing", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(!src.includes("user.name"), "Must not map by display name");
  });

  it("T10: resolveCurrentSeller checks Membership.permissionsJson.sellerSlug", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(src.includes("sellerSlug"), "Must check permissionsJson.sellerSlug");
    assert.ok(src.includes("permissionsJson"), "Must read permissionsJson");
  });

  it("T11: returns isSellerScoped and isManagerOrAbove flags", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("isSellerScoped: boolean"), "Missing isSellerScoped");
    assert.ok(src.includes("isManagerOrAbove: boolean"), "Missing isManagerOrAbove");
  });
});

// ── Suite 3: Seller Scope ───────────────────────────────────────────────────

describe("3. Seller scope", () => {
  it("T12: deriveSellerScope exists and returns SellerScope", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(src.includes("deriveSellerScope"), "Missing deriveSellerScope");
  });

  it("T13: SellerScope has canAccessAll* flags", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("canAccessAllSellers: boolean"), "Missing canAccessAllSellers");
    assert.ok(src.includes("canAccessAllCustomers: boolean"), "Missing canAccessAllCustomers");
    assert.ok(src.includes("canAccessAllOrders: boolean"), "Missing canAccessAllOrders");
    assert.ok(src.includes("canAccessAllPortfolios: boolean"), "Missing canAccessAllPortfolios");
    assert.ok(src.includes("canAccessAllAlerts: boolean"), "Missing canAccessAllAlerts");
  });

  it("T14: scope filter helpers exist", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(src.includes("sellerScopeFilter"), "Missing sellerScopeFilter");
    assert.ok(src.includes("customerScopeFilter"), "Missing customerScopeFilter");
    assert.ok(src.includes("orderScopeFilter"), "Missing orderScopeFilter");
    assert.ok(src.includes("portfolioScopeFilter"), "Missing portfolioScopeFilter");
  });

  it("T15: scope helpers are server-side (no React)", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(!src.includes("import React"), "Must not import React");
    assert.ok(!src.includes("useState"), "Must not use useState");
    assert.ok(!src.includes("useEffect"), "Must not use useEffect");
    assert.ok(src.includes('import "server-only"'), "Must be server-only");
  });
});

// ── Suite 4: Customer Identity ──────────────────────────────────────────────

describe("4. Customer identity", () => {
  it("T16: purchase history uses CustomerOrderLine as source", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes("CustomerOrderLine"), "Must reference CustomerOrderLine as source");
  });

  it("T17: customer link via customerNit", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes("customerNit"), "Must join via customerNit");
  });

  it("T18: does not query SaleRecord (productCode is NULL)", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    // Check for actual Prisma queries to SaleRecord, not doc comments
    assert.ok(!src.includes("db.saleRecord"), "Must not query saleRecord");
    assert.ok(!src.includes("findMany({ where: { saleRecord"), "Must not query SaleRecord");
  });

  it("T19: does not query vw_agentik_ventas", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    // Check for actual SQL usage, not doc comments
    assert.ok(!src.includes("FROM vw_agentik_ventas"), "Must not query vw_agentik_ventas");
    assert.ok(!src.includes("$queryRaw"), "Must not use raw SQL");
  });
});

// ── Suite 5: Sales History Date Handling ────────────────────────────────────

describe("5. Historical/current sales crossing", () => {
  it("T20: supports deterministic date ranges via fromDate/toDate", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes("fromDate"), "Must support fromDate");
    assert.ok(src.includes("toDate"), "Must support toDate");
  });

  it("T21: default range is 12 months for top products", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(
      src.includes("getFullYear() - 1"),
      "Default date range should be 12 months",
    );
  });

  it("T22: single source — no overlap routing", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    // Verify no HISTORICAL/CURRENT routing - single source
    assert.ok(!src.includes("HISTORICAL"), "No historical routing needed");
    assert.ok(!src.includes("CURRENT_DB"), "No current DB routing needed");
  });
});

// ── Suite 6: Top Products Rankings ──────────────────────────────────────────

describe("6. Top products rankings", () => {
  it("T23: supports UNITS ranking", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes('"UNITS"'), "Must support UNITS ranking");
  });

  it("T24: supports SALES_VALUE ranking", () => {
    const typesSrc = readSrc("frontline-types.ts");
    assert.ok(typesSrc.includes('"SALES_VALUE"'), "Must define SALES_VALUE ranking in types");
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes("totalSalesValue"), "Must sort by totalSalesValue for SALES_VALUE ranking");
  });

  it("T25: CustomerTopProduct includes all required fields", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("referenceCode: string"), "Missing referenceCode");
    assert.ok(src.includes("description: string"), "Missing description");
    assert.ok(src.includes("totalUnits: number"), "Missing totalUnits");
    assert.ok(src.includes("totalSalesValue: number"), "Missing totalSalesValue");
    assert.ok(src.includes("purchaseCount: number"), "Missing purchaseCount");
    assert.ok(src.includes("lastPurchaseDate: string | null"), "Missing lastPurchaseDate");
  });
});

// ── Suite 7: Receivables Composition ────────────────────────────────────────

describe("7. Receivables composition", () => {
  it("T26: CustomerReceivablesContext has required fields", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("totalReceivable: number"), "Missing totalReceivable");
    assert.ok(src.includes("overdueAmount: number"), "Missing overdueAmount");
    assert.ok(src.includes("overdueDocumentCount: number"), "Missing overdueDocumentCount");
    assert.ok(src.includes("oldestOverdueDate: string | null"), "Missing oldestOverdueDate");
    assert.ok(src.includes("maxDaysOverdue: number"), "Missing maxDaysOverdue");
    assert.ok(src.includes("currency: string"), "Missing currency");
    assert.ok(src.includes("asOf: string"), "Missing asOf");
  });

  it("T27: receivables reuse existing CustomerReceivable model", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(src.includes("customerReceivable"), "Must query customerReceivable model");
  });

  it("T28: no new cartera engine created", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(!src.includes("class CarteraEngine"), "Must not create new engine");
    assert.ok(!src.includes("CarteraCalculator"), "Must not create new calculator");
  });
});

// ── Suite 8: Customer Commercial Context ────────────────────────────────────

describe("8. Customer context", () => {
  it("T29: CustomerCommercialContext composes seller", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(
      src.includes("seller:"),
      "Must include seller in context",
    );
  });

  it("T30: context composes receivables", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(
      src.includes("receivables: CustomerReceivablesContext | null"),
      "Must include receivables",
    );
  });

  it("T31: context composes top products", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("topProductsByUnits"), "Missing topProductsByUnits");
    assert.ok(src.includes("topProductsBySalesValue"), "Missing topProductsBySalesValue");
  });

  it("T32: context uses parallel loading", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(src.includes("Promise.all"), "Must use Promise.all for parallel loading");
  });

  it("T33: context reuses canonical-customer-service", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(
      src.includes("canonical-customer-service"),
      "Must import from canonical-customer-service",
    );
  });
});

// ── Suite 9: Maletas Attention Reuse ────────────────────────────────────────

describe("9. Maletas attention reuse", () => {
  it("T34: reuses emitPortfolioAttentionSignals", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(
      src.includes("emitPortfolioAttentionSignals"),
      "Must reuse existing portfolio signals",
    );
  });

  it("T35: maps PORTFOLIO_WITHDRAWAL_REQUIRED to SAMPLE_WITHDRAWAL_REQUIRED", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("SAMPLE_WITHDRAWAL_REQUIRED"), "Must map withdrawal signal");
    assert.ok(src.includes("PORTFOLIO_SUPPLY_REQUIRED"), "Must map supply signal");
  });

  it("T36: does not recalculate Maletas rules", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(!src.includes("loadVendorSampleData"), "Must not directly load vendor data");
    assert.ok(!src.includes("maletas-functional-evaluation"), "Must not import evaluation");
  });

  it("T37: preserves evidence from portfolio signals", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("evidence: item.evidence"), "Must preserve original evidence");
  });
});

// ── Suite 10: Order Attention Mapping ───────────────────────────────────────

describe("10. Order attention mapping", () => {
  it("T38: maps PENDIENTE orders to ORDER_PENDING_SYNC", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("ORDER_PENDING_SYNC"), "Must map pending orders");
  });

  it("T39: maps CONFIRMADO orders to ORDER_CONFIRMED", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("ORDER_CONFIRMED"), "Must map confirmed orders");
  });

  it("T40: uses existing CustomerOrderStatus — no new state machine", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("PENDIENTE"), "Must use existing PENDIENTE status");
    assert.ok(src.includes("CONFIRMADO"), "Must use existing CONFIRMADO status");
    assert.ok(!src.includes("class OrderStateMachine"), "Must not create new state machine");
  });
});

// ── Suite 11: Deduplication ─────────────────────────────────────────────────

describe("11. Deduplication", () => {
  it("T41: FrontlineAttentionItem has deduplicationKey", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("deduplicationKey: string"), "Missing deduplicationKey");
  });

  it("T42: attention service deduplicates items", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("deduplicationKey"), "Must use deduplication keys");
    assert.ok(src.includes("seen.has"), "Must check for duplicates");
  });
});

// ── Suite 12: No React Business Calculations ────────────────────────────────

describe("12. No React business calculations", () => {
  it("T43: seller-user-mapping is server-only", () => {
    const src = readSrc("seller-user-mapping.ts");
    assert.ok(src.includes('import "server-only"'), "Must be server-only");
  });

  it("T44: customer-purchase-intelligence is server-only", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(src.includes('import "server-only"'), "Must be server-only");
  });

  it("T45: customer-commercial-context is server-only", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(src.includes('import "server-only"'), "Must be server-only");
  });

  it("T46: frontline-attention-service is server-only", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes('import "server-only"'), "Must be server-only");
  });

  it("T47: frontline-types is NOT server-only (client-safe)", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(!src.includes('import "server-only"'), "Types must be client-safe");
  });
});

// ── Suite 13: No Arbitrary SQL ──────────────────────────────────────────────

describe("13. No arbitrary SQL", () => {
  it("T48: purchase intelligence uses Prisma queries", () => {
    const src = readSrc("customer-purchase-intelligence.ts");
    assert.ok(!src.includes("$queryRaw"), "Must not use raw SQL for main queries");
    assert.ok(!src.includes("$queryRawUnsafe"), "Must not use raw unsafe SQL");
  });

  it("T49: commercial context uses Prisma queries", () => {
    const src = readSrc("customer-commercial-context.ts");
    assert.ok(!src.includes("$queryRaw"), "Must not use raw SQL");
    assert.ok(!src.includes("$queryRawUnsafe"), "Must not use raw unsafe SQL");
  });
});

// ── Suite 14: Deep Links ────────────────────────────────────────────────────

describe("14. Deep links", () => {
  it("T50: portfolio attention has deepLink", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("deepLink"), "Must include deepLink in attention items");
  });

  it("T51: deepLinks point to existing routes", () => {
    const src = readSrc("frontline-attention-service.ts");
    assert.ok(src.includes("comercial/maletas"), "Maletas route");
    assert.ok(src.includes("comercial/pedidos"), "Pedidos route");
    assert.ok(src.includes("comercial/clientes"), "Clientes route");
  });
});

// ── Suite 15: Provenance ────────────────────────────────────────────────────

describe("15. Provenance", () => {
  it("T52: FrontlineProvenance has source and asOf", () => {
    const src = readSrc("frontline-types.ts");
    assert.ok(src.includes("source: string"), "Missing source");
    assert.ok(src.includes("asOf: string"), "Missing asOf");
  });

  it("T53: all result types include provenance", () => {
    const src = readSrc("frontline-types.ts");
    // Check key result types
    const types = ["CustomerPurchaseHistoryResult", "CustomerTopProductsResult",
      "CustomerCommercialContext", "FrontlineAttentionResult"];
    for (const t of types) {
      assert.ok(src.includes(`${t}`), `Missing type ${t}`);
    }
    // All should have provenance
    assert.ok(
      (src.match(/provenance: FrontlineProvenance/g) || []).length >= 4,
      "At least 4 types should have provenance",
    );
  });
});

// ── Suite 16: Copilot Readiness ─────────────────────────────────────────────

describe("16. Copilot readiness", () => {
  it("T54: server barrel exports all required capabilities", () => {
    const src = readSrc("server.ts");
    assert.ok(src.includes("resolveCurrentSeller"), "Missing resolveCurrentSeller");
    assert.ok(src.includes("getCustomerPurchaseHistory"), "Missing getCustomerPurchaseHistory");
    assert.ok(src.includes("getCustomerTopProducts"), "Missing getCustomerTopProducts");
    assert.ok(src.includes("getCustomerReceivables"), "Missing getCustomerReceivables");
    assert.ok(src.includes("getCustomerCommercialContext"), "Missing getCustomerCommercialContext");
    assert.ok(src.includes("getSellerAttention"), "Missing getSellerAttention");
  });

  it("T55: client barrel exports types only", () => {
    const src = readSrc("index.ts");
    assert.ok(src.includes("export type"), "Must export types");
    assert.ok(!src.includes('import "server-only"'), "Index must not be server-only");
  });
});

// ── Suite 17: No LLM / AI Dependency ────────────────────────────────────────

describe("17. No LLM dependency", () => {
  const files = [
    "seller-user-mapping.ts",
    "customer-purchase-intelligence.ts",
    "customer-commercial-context.ts",
    "frontline-attention-service.ts",
  ];

  for (const file of files) {
    it(`T${56 + files.indexOf(file)}: ${file} has no AI imports`, () => {
      const src = readSrc(file);
      assert.ok(!src.includes("openai"), "Must not import openai");
      assert.ok(!src.includes("anthropic"), "Must not import anthropic");
      assert.ok(!src.includes("@ai-sdk"), "Must not import ai-sdk");
      assert.ok(!src.includes("generateText"), "Must not use generateText");
    });
  }
});

// ── Suite 18: Barrel Structure ──────────────────────────────────────────────

describe("18. Barrel structure", () => {
  it("T60: index.ts has no runtime code", () => {
    const src = readSrc("index.ts");
    assert.ok(!src.includes("async function"), "Index must not have async functions");
    assert.ok(!src.includes("prisma"), "Index must not import prisma");
  });

  it("T61: server.ts re-exports all server modules", () => {
    const src = readSrc("server.ts");
    assert.ok(src.includes("seller-user-mapping"), "Missing seller-user-mapping export");
    assert.ok(src.includes("customer-purchase-intelligence"), "Missing purchase intelligence export");
    assert.ok(src.includes("customer-commercial-context"), "Missing commercial context export");
    assert.ok(src.includes("frontline-attention-service"), "Missing attention service export");
  });
});
