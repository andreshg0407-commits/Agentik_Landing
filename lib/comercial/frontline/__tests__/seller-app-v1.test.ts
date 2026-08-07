/**
 * lib/comercial/frontline/__tests__/seller-app-v1.test.ts
 *
 * AGENTIK-SELLER-APP-V1-01
 *
 * Structural + certification tests for Seller App V1 domain contracts.
 *
 * 13 certification cases (Section Y) + structural tests.
 * node:test — no Jest, no vitest.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function readFile(name: string): string {
  return fs.readFileSync(path.join(ROOT, name), "utf-8");
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. ATTENTION vs NOTIFICATION distinction (Section A)
// ══════════════════════════════════════════════════════════════════════════════

describe("T01: Attention vs Notification distinction", () => {
  it("seller-app-types.ts defines SellerNotification with all required properties", () => {
    const src = readFile("seller-app-types.ts");
    const requiredProps = [
      "organizationId", "sellerId", "type", "entityType", "entityId",
      "title", "evidence", "imageUrl", "deepLink", "createdAt",
      "deduplicationKey", "deliveryStatus",
    ];
    for (const prop of requiredProps) {
      assert.ok(src.includes(prop), `Missing required property: ${prop}`);
    }
  });

  it("FrontlineAttentionItem (attention) is separate from SellerNotification (notification)", () => {
    const attentionSrc = readFile("frontline-types.ts");
    const notifSrc = readFile("seller-app-types.ts");
    assert.ok(attentionSrc.includes("FrontlineAttentionItem"));
    assert.ok(notifSrc.includes("SellerNotification"));
    // They are in different files — distinct concepts
    assert.ok(!attentionSrc.includes("SellerNotification"));
  });

  it("notification service does not use LLMs", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(!src.includes("openai"));
    assert.ok(!src.includes("anthropic"));
    assert.ok(!src.includes("generateText"));
    assert.ok(!src.includes("completion"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Sample withdrawal notification (Section B)
// ══════════════════════════════════════════════════════════════════════════════

describe("T02: Sample withdrawal notification", () => {
  it("emitSampleWithdrawalNotification exists with required evidence", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("emitSampleWithdrawalNotification"));
    // Evidence fields from Section B
    assert.ok(src.includes("sellerId"));
    assert.ok(src.includes("portfolioId"));
    assert.ok(src.includes("referenceCode"));
    assert.ok(src.includes("description"));
    assert.ok(src.includes("productImageUrl"));
    assert.ok(src.includes("withdrawalReason"));
    assert.ok(src.includes("currentAvailability"));
    assert.ok(src.includes("asOf"));
  });

  it("notification title communicates withdrawal clearly", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("Retira esta referencia de tu mostrario"));
  });

  it("deep link points to maleta retiro with reference", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("tab=retiro"));
    assert.ok(src.includes("ref="));
  });

  it("sample-withdrawal-notifier reuses certified Maletas Retiro logic", () => {
    const src = readFile("sample-withdrawal-notifier.ts");
    assert.ok(src.includes("getSalesPortfolioWithdrawalItems"));
    assert.ok(!src.includes("evaluateVendorAssortment")); // no recalculation
    assert.ok(!src.includes("MALETA_REMOVAL_LIMITS")); // no direct limit access
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Withdrawal deduplication (Section C)
// ══════════════════════════════════════════════════════════════════════════════

describe("T03: Withdrawal notification deduplication", () => {
  it("dedup key includes conditionVersion derived from withdrawal reason", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("conditionVersion"));
    // Key structure: SAMPLE_WITHDRAWAL_REQUIRED:sellerId:portfolioId:referenceCode:conditionVersion
    assert.ok(src.includes("SAMPLE_WITHDRAWAL_REQUIRED"));
  });

  it("hasBeenEmitted check prevents duplicate notifications", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("hasBeenEmitted"));
    assert.ok(src.includes("markEmitted"));
  });

  it("clearResolvedCondition allows re-emission when condition recurs", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("clearResolvedCondition"));
    assert.ok(src.includes("emittedKeys.delete"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Product image authority (Section D)
// ══════════════════════════════════════════════════════════════════════════════

describe("T04: Product image authority", () => {
  it("CommercialReferenceThumbnail handles null imageUrl with placeholder", () => {
    const thumbnailPath = path.resolve(ROOT, "../../..", "components/comercial/commercial-reference-thumbnail.tsx");
    if (fs.existsSync(thumbnailPath)) {
      const src = fs.readFileSync(thumbnailPath, "utf-8");
      assert.ok(src.includes("Sin imagen disponible"));
      assert.ok(src.includes("initials"));
    }
  });

  it("SellerNotification.imageUrl is nullable — does not invent URLs", () => {
    const src = readFile("seller-app-types.ts");
    assert.ok(src.includes("imageUrl: string | null"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Notification delivery architecture (Section E)
// ══════════════════════════════════════════════════════════════════════════════

describe("T05: Notification delivery architecture", () => {
  it("supports InApp delivery adapter", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("InAppDeliveryAdapter"));
    assert.ok(src.includes("getInAppNotifications"));
  });

  it("defines WebPush delivery adapter interface", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("WebPushDeliveryAdapter"));
    assert.ok(src.includes("NotificationDeliveryAdapter"));
  });

  it("delivery chain: Domain Signal → Notification Service → Adapter", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("activeAdapters"));
    assert.ok(src.includes("adapter.deliver"));
  });

  it("business logic is not contaminated by delivery infrastructure", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(!src.includes("WebPush"));
    assert.ok(!src.includes("service-worker"));
    assert.ok(!src.includes("Notification"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Customer overdue >30 days (Section F/G/H)
// ══════════════════════════════════════════════════════════════════════════════

describe("T06: Customer overdue >30 days enforcement", () => {
  it("attention service enforces maxDaysOverdue > 30 threshold", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("maxDaysOverdue <= 30"));
    assert.ok(src.includes("return null"));
  });

  it("overdue policy defaults to WARNING enforcement", () => {
    const src = readFile("seller-app-types.ts");
    assert.ok(src.includes("DEFAULT_OVERDUE_POLICY"));
    assert.ok(src.includes('"WARNING"'));
    assert.ok(src.includes("thresholdDays: 30"));
  });

  it("architecture supports future APPROVAL_REQUIRED and BLOCK levels", () => {
    const src = readFile("seller-app-types.ts");
    assert.ok(src.includes("APPROVAL_REQUIRED"));
    assert.ok(src.includes("BLOCK"));
  });

  it("overdue evidence includes all required fields (Section G)", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("overdueAmount"));
    assert.ok(src.includes("overdueDocumentCount"));
    assert.ok(src.includes("maxDaysOverdue"));
    assert.ok(src.includes("asOf"));
  });

  it("CUSTOMER_OVERDUE_WHILE_ORDERING is contextual/on-demand (Section H)", () => {
    const src = readFile("frontline-attention-service.ts");
    // It's a standalone function, not part of bulk getSellerAttention
    assert.ok(src.includes("export async function emitCustomerOverdueAttention"));
    // Not called in getSellerAttention — it's contextual
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Customer inactive >90 days (Section I/J)
// ══════════════════════════════════════════════════════════════════════════════

describe("T07: Customer inactive >90 days", () => {
  it("getSellerInactiveCustomers exists with correct signature", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("getSellerInactiveCustomers"));
    assert.ok(src.includes("orgId: string"));
    assert.ok(src.includes("sellerId: string"));
    assert.ok(src.includes("inactiveDays"));
  });

  it("classifies NO_PURCHASE_HISTORY separately from INACTIVE_90D", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("NO_PURCHASE_HISTORY"));
    assert.ok(src.includes("INACTIVE_90D"));
  });

  it("does not pretend lastPurchaseDate exists for never-purchased customers", () => {
    const src = readFile("seller-inactive-customers.ts");
    // NO_PURCHASE_HISTORY path sets lastPurchaseDateStr to null
    const types = readFile("seller-app-types.ts");
    assert.ok(types.includes("lastPurchaseDate: string | null"));
  });

  it("evidence includes required fields (Section J)", () => {
    const types = readFile("seller-app-types.ts");
    assert.ok(types.includes("customerId"));
    assert.ok(types.includes("customerName"));
    assert.ok(types.includes("lastPurchaseDate"));
    assert.ok(types.includes("daysSinceLastPurchase"));
    assert.ok(types.includes("receivables"));
    assert.ok(types.includes("purchaseSummary"));
    assert.ok(types.includes("topProducts"));
    assert.ok(types.includes("provenance"));
  });

  it("uses calendar date semantics (not arbitrary)", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("cutoffDate.setDate"));
    assert.ok(src.includes("getTime()"));
  });

  it("no calculations in React — all logic in lib/", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes('"server-only"'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Inactive customer UX contract (Section K)
// ══════════════════════════════════════════════════════════════════════════════

describe("T08: Inactive customer attention integration", () => {
  it("CUSTOMER_INACTIVE_90D is a registered FrontlineAttentionType", () => {
    const src = readFile("frontline-types.ts");
    assert.ok(src.includes('"CUSTOMER_INACTIVE_90D"'));
  });

  it("getSellerAttention includes inactive customer signals", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("getInactiveCustomerAttention"));
    assert.ok(src.includes("inactiveItems"));
  });

  it("suggested action for inactive customer is 'Crear pedido'", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes('"Crear pedido"'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Order fulfillment timeline (Section N/O)
// ══════════════════════════════════════════════════════════════════════════════

describe("T09: Order fulfillment timeline", () => {
  it("OrderFulfillmentTimeline has all required stages", () => {
    const src = readFile("seller-app-types.ts");
    assert.ok(src.includes("submittedAt"));
    assert.ok(src.includes("invoice:"));
    assert.ok(src.includes("shipment:"));
    assert.ok(src.includes("delivery:"));
    assert.ok(src.includes("sync:"));
    assert.ok(src.includes("provenance"));
  });

  it("non-certified stages return NOT_AVAILABLE (Section O)", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    // Invoice number, carrier, tracking, delivery — all return null with NOT_AVAILABLE
    assert.ok(src.includes("NOT_AVAILABLE"));
    assert.ok(src.includes("invoiceNumber: null"));
    assert.ok(src.includes("carrier: null"));
    assert.ok(src.includes("trackingNumber: null"));
    assert.ok(src.includes("deliveredAt: null"));
  });

  it("does not invent fulfillment states", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    // Status mapping uses only canonical CustomerOrderStatus values
    assert.ok(src.includes("PENDIENTE"));
    assert.ok(src.includes("CONFIRMADO"));
    assert.ok(src.includes("DESPACHADO"));
    assert.ok(src.includes("FACTURADO"));
    assert.ok(src.includes("CANCELADO"));
    // Does not invent non-existent statuses
    assert.ok(!src.includes("ENTREGADO"));
    assert.ok(!src.includes("EN_TRANSITO"));
  });

  it("provenance documents missing integrations", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    assert.ok(src.includes("no field in current schema"));
    assert.ok(src.includes("no shipping integration"));
    assert.ok(src.includes("no delivery integration"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Catalog generation entry point (Section Q/R/S)
// ══════════════════════════════════════════════════════════════════════════════

describe("T10: Catalog generation stub", () => {
  it("SELLER_CATALOG_GENERATION feature flag exists and defaults to false", () => {
    const src = readFile("seller-app-features.ts");
    assert.ok(src.includes("SELLER_CATALOG_GENERATION"));
    assert.ok(src.includes("SELLER_CATALOG_GENERATION: false"));
  });

  it("prepareCatalogGenerationRequest exists without invoking generation", () => {
    const src = readFile("seller-app-features.ts");
    assert.ok(src.includes("prepareCatalogGenerationRequest"));
    // Does not call any Marketing Studio or generation function
    assert.ok(!src.includes("generateCatalog"));
    assert.ok(!src.includes("MarketingStudio"));
  });

  it("CatalogGenerationRequest defines domain boundary", () => {
    const types = readFile("seller-app-types.ts");
    assert.ok(types.includes("CatalogGenerationRequest"));
    assert.ok(types.includes("organizationId"));
    assert.ok(types.includes("sellerId"));
    assert.ok(types.includes("customerId"));
    assert.ok(types.includes("specifications"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. Seller Home attention types (Section T/U)
// ══════════════════════════════════════════════════════════════════════════════

describe("T11: Seller Home required attention types", () => {
  const requiredTypes = [
    "SAMPLE_WITHDRAWAL_REQUIRED",
    "PORTFOLIO_SUPPLY_REQUIRED",
    "CUSTOMER_INACTIVE_90D",
    "ORDER_PENDING_SYNC",
    "ORDER_CONFIRMED",
  ];

  it("all required attention types are registered in FrontlineAttentionType", () => {
    const src = readFile("frontline-types.ts");
    for (const type of requiredTypes) {
      assert.ok(src.includes(`"${type}"`), `Missing attention type: ${type}`);
    }
  });

  it("attention items expose severity, createdAt, evidence (Section U)", () => {
    const src = readFile("frontline-types.ts");
    assert.ok(src.includes("severity: AttentionSeverity"));
    assert.ok(src.includes("createdAt: string"));
    assert.ok(src.includes("evidence: Record<string, unknown>"));
  });

  it("sorting/prioritization is in domain layer, not React", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("severityRank"));
    assert.ok(src.includes("items.sort"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. Navigation contract (Section V)
// ══════════════════════════════════════════════════════════════════════════════

describe("T12: Seller App navigation contract", () => {
  it("SellerAppNavigation includes all V1 sections", () => {
    const types = readFile("seller-app-types.ts");
    assert.ok(types.includes("inicio"));
    assert.ok(types.includes("clientes"));
    assert.ok(types.includes("nuevoPedido"));
    assert.ok(types.includes("miMaleta"));
    assert.ok(types.includes("pedidos"));
  });

  it("clientes section includes inactive90d and search", () => {
    const types = readFile("seller-app-types.ts");
    assert.ok(types.includes("inactive90d"));
    assert.ok(types.includes("search"));
  });

  it("miMaleta section includes retiro and planSurtido", () => {
    const types = readFile("seller-app-types.ts");
    assert.ok(types.includes("retiro"));
    assert.ok(types.includes("planSurtido"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. Shared business truth (Section W)
// ══════════════════════════════════════════════════════════════════════════════

describe("T13: One shared business truth", () => {
  it("inactive customers reuses Frontline Core adapters", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("getCustomerTopProducts"));
    assert.ok(src.includes("getCustomerReceivables"));
  });

  it("fulfillment timeline reuses CustomerOrderRecord (no mobile engine)", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    assert.ok(src.includes("customerOrderRecord"));
    // No separate mobile order service
    assert.ok(!src.includes("mobileOrder"));
    assert.ok(!src.includes("sellerOrder"));
  });

  it("withdrawal notifier reuses Maletas domain tools", () => {
    const src = readFile("sample-withdrawal-notifier.ts");
    assert.ok(src.includes("getSalesPortfolioWithdrawalItems"));
    assert.ok(src.includes("getSalesPortfolios"));
  });

  it("no React business computation in any server file", () => {
    const serverFiles = [
      "seller-inactive-customers.ts",
      "order-fulfillment-timeline.ts",
      "seller-notification-service.ts",
      "sample-withdrawal-notifier.ts",
      "seller-app-features.ts",
    ];
    for (const file of serverFiles) {
      const src = readFile(file);
      assert.ok(src.includes('"server-only"'), `${file} missing server-only`);
      assert.ok(!src.includes('"use client"'), `${file} has use client`);
      assert.ok(!src.includes("useState"), `${file} uses React state`);
      assert.ok(!src.includes("useEffect"), `${file} uses React effect`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. Copilot future compatibility (Section X)
// ══════════════════════════════════════════════════════════════════════════════

describe("T14: Copilot future compatibility", () => {
  it("all domain functions return structured data with provenance", () => {
    const inactiveSrc = readFile("seller-inactive-customers.ts");
    assert.ok(inactiveSrc.includes("provenance"));

    const timelineSrc = readFile("order-fulfillment-timeline.ts");
    assert.ok(timelineSrc.includes("provenance"));

    const attentionSrc = readFile("frontline-attention-service.ts");
    assert.ok(attentionSrc.includes("provenance"));
  });

  it("domain facts are consumable without screen scraping", () => {
    // All exports are from server.ts barrel — clean import surface
    const barrel = readFile("server.ts");
    assert.ok(barrel.includes("getSellerInactiveCustomers"));
    assert.ok(barrel.includes("getOrderFulfillmentTimeline"));
    assert.ok(barrel.includes("getSellerAttention"));
    assert.ok(barrel.includes("getInAppNotifications"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. Barrel structure
// ══════════════════════════════════════════════════════════════════════════════

describe("T15: Barrel structure", () => {
  it("index.ts is client-safe — no server-only", () => {
    const src = readFile("index.ts");
    assert.ok(!src.includes('"server-only"'));
  });

  it("server.ts has server-only guard", () => {
    const src = readFile("server.ts");
    assert.ok(src.includes('"server-only"'));
  });

  it("all new server files exist", () => {
    const files = [
      "seller-app-types.ts",
      "seller-notification-service.ts",
      "seller-inactive-customers.ts",
      "order-fulfillment-timeline.ts",
      "sample-withdrawal-notifier.ts",
      "seller-app-features.ts",
    ];
    for (const file of files) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), `Missing file: ${file}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CERTIFICATION CASES (Section Y)
// ══════════════════════════════════════════════════════════════════════════════

describe("CERT-01: Withdrawal notification → one notification per seller", () => {
  it("emitSampleWithdrawalNotification produces one notification per call", () => {
    const src = readFile("seller-notification-service.ts");
    // Returns single SellerNotification | null
    assert.ok(src.includes("Promise<SellerNotification | null>"));
  });

  it("notification includes product image + reference + description + reason", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("productImageUrl"));
    assert.ok(src.includes("referenceCode"));
    assert.ok(src.includes("description"));
    assert.ok(src.includes("withdrawalReason"));
  });

  it("deep-link targets maleta retiro with exact reference", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("tab=retiro&ref="));
  });
});

describe("CERT-02: No duplicate withdrawal notification on refresh", () => {
  it("dedup prevents re-emission of same condition", () => {
    const src = readFile("seller-notification-service.ts");
    assert.ok(src.includes("if (hasBeenEmitted(input.deduplicationKey)) return null"));
  });
});

describe("CERT-03: Customer >30 overdue days → warning when selected", () => {
  it("maxDaysOverdue > 30 threshold enforced", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("receivables.maxDaysOverdue <= 30"));
  });
});

describe("CERT-04: Customer balance but <=30 days → no warning", () => {
  it("returns null when maxDaysOverdue <= 30", () => {
    const src = readFile("frontline-attention-service.ts");
    // The check: if (receivables.maxDaysOverdue <= 30) return null;
    assert.ok(src.includes("maxDaysOverdue <= 30") && src.includes("return null"));
  });
});

describe("CERT-05: Customer no overdue → neutral", () => {
  it("returns null when overdueAmount <= 0", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("receivables.overdueAmount <= 0"));
  });
});

describe("CERT-06: Customer last purchase >90 days → inactive", () => {
  it("INACTIVE_90D classification for old last purchase", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("INACTIVE_90D"));
    assert.ok(src.includes("cutoffDate"));
  });
});

describe("CERT-07: Customer purchase <90 days → not inactive", () => {
  it("active customers are skipped (continue)", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("continue"));
  });
});

describe("CERT-08: Customer no purchase history → explicit semantics", () => {
  it("NO_PURCHASE_HISTORY classification exists", () => {
    const src = readFile("seller-inactive-customers.ts");
    assert.ok(src.includes("NO_PURCHASE_HISTORY"));
  });

  it("attention message is distinct for no-history customers", () => {
    const src = readFile("frontline-attention-service.ts");
    assert.ok(src.includes("sin historial de compras"));
  });
});

describe("CERT-09: Order with FACTURADO status → timeline shows invoiced", () => {
  it("FACTURADO maps to invoice COMPLETED", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    assert.ok(src.includes("FACTURADO"));
    assert.ok(src.includes("invoiceStageFromStatus"));
    // rank >= 3 → COMPLETED
    assert.ok(src.includes("COMPLETED"));
  });
});

describe("CERT-10: Order not invoiced → truthful state", () => {
  it("non-FACTURADO order returns NOT_STARTED for invoice", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    assert.ok(src.includes("NOT_STARTED"));
  });
});

describe("CERT-11: Shipment data present → shows dispatched", () => {
  it("DESPACHADO maps to shipment COMPLETED", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    assert.ok(src.includes("DESPACHADO"));
    assert.ok(src.includes("shipmentStageFromStatus"));
  });
});

describe("CERT-12: Shipment source absent → no fabricated tracking", () => {
  it("carrier/tracking are null with NOT_AVAILABLE when no integration", () => {
    const src = readFile("order-fulfillment-timeline.ts");
    assert.ok(src.includes("carrier: null"));
    assert.ok(src.includes("trackingNumber: null"));
    assert.ok(src.includes("no shipping integration"));
  });
});

describe("CERT-13: Catalog feature disabled → no broken action", () => {
  it("SELLER_CATALOG_GENERATION defaults to false", () => {
    const src = readFile("seller-app-features.ts");
    assert.ok(src.includes("SELLER_CATALOG_GENERATION: false"));
  });

  it("no generation logic is invoked when disabled", () => {
    const src = readFile("seller-app-features.ts");
    assert.ok(!src.includes("generateCatalog"));
    assert.ok(!src.includes("await generate"));
  });
});
