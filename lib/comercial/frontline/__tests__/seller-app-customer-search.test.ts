/**
 * lib/comercial/frontline/__tests__/seller-app-customer-search.test.ts
 *
 * AGENTIK-SELLER-APP-CUSTOMER-SEARCH-P0
 *
 * Regression tests for the customer search DTO contract between
 * canonical-customer-service (string sagReadiness) and the Seller App UI
 * (object sagReadiness with blockers array).
 *
 * Runner: node:test via `npx tsx --test`
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PEDIDOS_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "route.ts",
);
const NUEVO_PEDIDO_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "nuevo-pedido-view.tsx",
);
const CANONICAL_TYPES = join(
  __dirname, "..", "..", "clientes", "canonical-customer-types.ts",
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: Search DTO — sagReadiness normalization (crash fix)
// ═══════════════════════════════════════════════════════════════════════════════

describe("1. sagReadiness normalization in pedidos route", () => {
  const src = read(PEDIDOS_ROUTE);

  it("T01: READY maps to null (no warning shown)", () => {
    assert.ok(
      src.includes('r.sagReadiness === "READY" ? null'),
      "READY must map to null in search_customers action",
    );
  });

  it("T02: DRAFT_ONLY produces object with blockers array", () => {
    assert.ok(
      src.includes('r.sagReadiness === "DRAFT_ONLY"'),
      "DRAFT_ONLY must be handled explicitly",
    );
    assert.ok(
      src.includes("Cliente sin código SAG"),
      "DRAFT_ONLY must have descriptive blocker reason",
    );
  });

  it("T03: BLOCKED produces object with blockers array", () => {
    assert.ok(
      src.includes('r.sagReadiness === "BLOCKED"'),
      "BLOCKED must be handled explicitly",
    );
    assert.ok(
      src.includes("Cliente bloqueado para pedidos SAG"),
      "BLOCKED must have descriptive blocker reason",
    );
  });

  it("T04: Unknown status produces empty blockers (safe fallback)", () => {
    // The final `: []` branch catches any unexpected status
    assert.ok(
      src.includes(": [],"),
      "Must have empty-array fallback for unknown statuses",
    );
  });

  it("T05: Canonical type is string, not object", () => {
    const types = read(CANONICAL_TYPES);
    assert.ok(
      types.includes('SagReadinessStatus = "READY" | "DRAFT_ONLY" | "BLOCKED"'),
      "Canonical SagReadinessStatus must be a string union",
    );
    // CustomerSearchResult uses the string type
    assert.ok(
      types.includes("sagReadiness: SagReadinessStatus"),
      "CustomerSearchResult.sagReadiness must be SagReadinessStatus (string)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: UI defensive rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("2. UI defensive rendering of sagReadiness", () => {
  const src = read(NUEVO_PEDIDO_VIEW);

  it("T06: blockers access uses ?? [] fallback", () => {
    assert.ok(
      src.includes("blockers ?? []"),
      "Must use ?? [] fallback when accessing blockers to prevent crash",
    );
  });

  it("T07: Falls back to status text when blockers empty", () => {
    assert.ok(
      src.includes("|| c.sagReadiness.status"),
      "Must fall back to status string when blockers array is empty",
    );
  });

  it("T08: Checks sagReadiness is truthy before accessing status", () => {
    assert.ok(
      src.includes("c.sagReadiness && c.sagReadiness.status"),
      "Must guard sagReadiness access with truthiness check",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Seller scope enforcement on search
// ═══════════════════════════════════════════════════════════════════════════════

describe("3. Seller scope enforcement", () => {
  const src = read(PEDIDOS_ROUTE);

  it("T09: search_customers passes sellerScopeFilter", () => {
    // The search_customers case must pass the scope filter
    assert.ok(
      src.includes("sellerScopeFilter: custScopeFilter"),
      "search_customers must pass sellerScopeFilter to searchCustomers()",
    );
  });

  it("T10: customerScopeFilter derived from seller identity", () => {
    assert.ok(
      src.includes("resolveCurrentSeller"),
      "Route must resolve current seller identity",
    );
    assert.ok(
      src.includes("deriveSellerScope"),
      "Route must derive seller scope",
    );
    assert.ok(
      src.includes("customerScopeFilter(sellerScope)"),
      "Route must build customer scope filter from seller scope",
    );
  });

  it("T11: get_customer_detail enforces seller scope", () => {
    // The get_customer_detail case must also use scope filter
    const detailSection = src.slice(src.indexOf("get_customer_detail"));
    assert.ok(
      detailSection.includes("sellerScopeFilter: custScopeFilter"),
      "get_customer_detail must pass sellerScopeFilter",
    );
  });

  it("T12: get_customer_context verifies customer ownership", () => {
    const contextSection = src.slice(src.indexOf("get_customer_context"));
    assert.ok(
      contextSection.includes("sellerScopeFilter: custScopeFilter"),
      "get_customer_context must verify customer via sellerScopeFilter",
    );
    assert.ok(
      contextSection.includes("status: 403"),
      "get_customer_context must return 403 for unauthorized customers",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: Customer context parity with Cliente 360
// ═══════════════════════════════════════════════════════════════════════════════

describe("4. Customer context parity", () => {
  const src = read(PEDIDOS_ROUTE);

  it("T13: get_customer_context calls getCustomerCommercialContext", () => {
    assert.ok(
      src.includes("getCustomerCommercialContext"),
      "Must use shared getCustomerCommercialContext for parity with Cliente 360",
    );
  });

  it("T14: Overdue alert emitted alongside context", () => {
    assert.ok(
      src.includes("emitCustomerOverdueAttention"),
      "Must emit overdue attention alert alongside customer context",
    );
  });

  it("T15: Context response includes both context and overdueAlert", () => {
    assert.ok(
      src.includes("context: uiContext, overdueAlert"),
      "Response must include both normalized context and overdueAlert fields",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Customer context DTO normalization (receivables field mapping)
// ═══════════════════════════════════════════════════════════════════════════════

describe("5. Customer context DTO normalization", () => {
  const src = read(PEDIDOS_ROUTE);
  const contextSection = src.slice(src.indexOf("get_customer_context"));

  it("T16: Normalizes totalReceivable to total", () => {
    assert.ok(
      contextSection.includes("total: ctx.receivables.totalReceivable"),
      "Must map totalReceivable → total for UI contract",
    );
  });

  it("T17: Normalizes overdueAmount to overdue", () => {
    assert.ok(
      contextSection.includes("overdue: ctx.receivables.overdueAmount"),
      "Must map overdueAmount → overdue for UI contract",
    );
  });

  it("T18: Passes maxDaysOverdue through", () => {
    assert.ok(
      contextSection.includes("maxDaysOverdue: ctx.receivables.maxDaysOverdue"),
      "Must pass maxDaysOverdue from canonical to UI",
    );
  });

  it("T19: Builds identity object from flat fields", () => {
    assert.ok(
      contextSection.includes("identity: { name: ctx.customerName"),
      "Must compose identity object from customerName + nitNormalized",
    );
  });

  it("T20: Maps topProductsByUnits with required fields", () => {
    assert.ok(
      contextSection.includes("referenceCode: p.referenceCode"),
      "Must map referenceCode in topProducts",
    );
    assert.ok(
      contextSection.includes("totalUnits: p.totalUnits"),
      "Must map totalUnits in topProducts",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: Search result shape completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe("6. Search result shape completeness", () => {
  const src = read(PEDIDOS_ROUTE);

  const requiredFields = [
    "customerCode", "customerName", "customerId", "city",
    "sagCode", "profileId", "address", "sellerName", "sellerId",
    "sagReadiness",
  ];

  for (const field of requiredFields) {
    it(`T${21 + requiredFields.indexOf(field)}: search result includes ${field}`, () => {
      const searchSection = src.slice(
        src.indexOf("search_customers"),
        src.indexOf("get_customer_detail"),
      );
      assert.ok(
        searchSection.includes(`${field}:`),
        `search_customers result must include ${field}`,
      );
    });
  }
});
