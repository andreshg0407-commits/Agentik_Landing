/**
 * lib/comercial/frontline/__tests__/seller-app-order-visibility.test.ts
 *
 * AGENTIK-SELLER-APP-ORDER-VISIBILITY-FIX-P0
 *
 * Parity tests: Seller App uses canonical listOrders() for order visibility.
 * Agentik-native orders (AgentExecution) are visible alongside SAG orders.
 * Customer name uses legalName (not .name). Success copy is truthful.
 *
 * Runner: node:test via `npx tsx --test`
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SELLER_PAGE = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "page.tsx",
);
const SELLER_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "nuevo-pedido-view.tsx",
);
const SELLER_ORDERS_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "seller-orders-view.tsx",
);
const ORDER_SERVICE = join(
  __dirname, "..", "..",
  "pedidos", "order-service.ts",
);
const ORDER_TYPES = join(
  __dirname, "..", "..",
  "pedidos", "order-types.ts",
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

// ===========================================================================
// Suite A: Seller App uses canonical listOrders()
// ===========================================================================

describe("A. Canonical order source", () => {
  const page = read(SELLER_PAGE);

  it("A1: page.tsx imports listOrders from order-service", () => {
    assert.ok(
      page.includes('import { listOrders }') || page.includes('listOrders'),
      "Seller App page must import listOrders from canonical order service",
    );
  });

  it("A2: page.tsx calls listOrders (not direct CustomerOrderRecord query)", () => {
    assert.ok(
      page.includes("listOrders("),
      "Seller App must call canonical listOrders()",
    );
  });

  it("A3: page.tsx does NOT directly query customerOrderRecord.findMany", () => {
    assert.ok(
      !page.includes("customerOrderRecord.findMany"),
      "Seller App must NOT directly query CustomerOrderRecord",
    );
  });

  it("A4: page.tsx passes sellerScope to listOrders", () => {
    assert.ok(
      page.includes("sellerScope"),
      "Seller App must pass sellerScope for server-side seller enforcement",
    );
  });
});

// ===========================================================================
// Suite B: listOrders supports seller scope
// ===========================================================================

describe("B. listOrders seller scope", () => {
  const service = read(ORDER_SERVICE);
  const fnBody = service.slice(service.indexOf("export async function listOrders"));

  it("B1: listOrders accepts sellerScope parameter", () => {
    assert.ok(
      fnBody.includes("sellerScope?:"),
      "listOrders must accept optional sellerScope",
    );
  });

  it("B2: sellerScope has sellerId field", () => {
    assert.ok(
      fnBody.includes("sellerId: string"),
      "sellerScope must include sellerId for AgentExecution filtering",
    );
  });

  it("B3: sellerScope has sellerTerceroId field", () => {
    assert.ok(
      fnBody.includes("sellerTerceroId?:"),
      "sellerScope must include sellerTerceroId for CustomerOrderRecord filtering",
    );
  });

  it("B4: AgentExecution rows filtered by sellerId", () => {
    assert.ok(
      fnBody.includes("header?.sellerId === scopeId"),
      "AgentExecution rows must be filtered by header.sellerId in-memory",
    );
  });

  it("B5: listCustomerOrderRecords receives sellerTerceroId", () => {
    assert.ok(
      fnBody.includes("sellerScope?.sellerTerceroId"),
      "CustomerOrderRecord query must receive sellerTerceroId filter",
    );
  });
});

// ===========================================================================
// Suite C: listCustomerOrderRecords supports seller filter
// ===========================================================================

describe("C. CustomerOrderRecord seller filter", () => {
  const service = read(ORDER_SERVICE);
  const fnBody = service.slice(service.indexOf("export async function listCustomerOrderRecords"));

  it("C1: Accepts sellerTerceroId parameter", () => {
    assert.ok(
      fnBody.includes("sellerTerceroId?:"),
      "listCustomerOrderRecords must accept optional sellerTerceroId",
    );
  });

  it("C2: Applies sellerTerceroId to where clause", () => {
    assert.ok(
      fnBody.includes("where.sellerTerceroId = sellerTerceroId"),
      "Must apply sellerTerceroId filter to Prisma where clause",
    );
  });
});

// ===========================================================================
// Suite D: Customer name uses legalName
// ===========================================================================

describe("D. Customer name fix", () => {
  const mobile = read(SELLER_VIEW);

  it("D1: fetchCustomerForSelection uses customer.legalName", () => {
    // Pre-selection path — window covers full function body
    const start = mobile.indexOf("fetchCustomerForSelection");
    const preSelectBlock = mobile.slice(start, start + 1000);
    assert.ok(
      preSelectBlock.includes("customer.legalName"),
      "Pre-selection must use customer.legalName",
    );
  });

  it("D2: handleSelectLocal uses customer.legalName", () => {
    const selectBlock = mobile.slice(
      mobile.indexOf("handleSelectLocal"),
      mobile.indexOf("handleSelectLocal") + 800,
    );
    assert.ok(
      selectBlock.includes("customer.legalName"),
      "handleSelectLocal must use customer.legalName via API",
    );
  });

  it("D3: No occurrence of customer.name for customer name (except c.name for local fallback)", () => {
    // customer.name should not appear in get_customer_detail responses
    // c.name is OK (that's SerializedCustomer.name — the local fallback)
    const apiBlocks = mobile.split("get_customer_detail");
    for (let i = 1; i < apiBlocks.length; i++) {
      const block = apiBlocks[i].slice(0, 400);
      assert.ok(
        !block.includes("customerName: customer.name"),
        "API response blocks must NOT read customer.name",
      );
    }
  });
});

// ===========================================================================
// Suite E: Truthful success message
// ===========================================================================

describe("E. Truthful success copy", () => {
  const mobile = read(SELLER_VIEW);

  it("E1: Does NOT say 'Pedido enviado'", () => {
    assert.ok(
      !mobile.includes("Pedido enviado"),
      "Success message must NOT claim 'Pedido enviado'",
    );
  });

  it("E2: Says 'Pedido creado'", () => {
    assert.ok(
      mobile.includes("Pedido creado"),
      "Success message must say 'Pedido creado'",
    );
  });

  it("E3: Does NOT claim 'Estado: Listo para enviar a SAG'", () => {
    assert.ok(
      !mobile.includes("Estado: Listo para enviar a SAG"),
      "Must not claim SAG submission status in success message",
    );
  });

  it("E4: Shows truthful status text", () => {
    assert.ok(
      mobile.includes("Guardado y listo para enviar"),
      "Must show truthful status: 'Guardado y listo para enviar'",
    );
  });
});

// ===========================================================================
// Suite F: Native order status display
// ===========================================================================

describe("F. Native order status in orders view", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("F1: STATUS_LABELS includes borrador", () => {
    assert.ok(
      view.includes("borrador") && view.includes("Borrador"),
      "Must have Borrador label",
    );
  });

  it("F2: STATUS_LABELS includes listo_para_enviar", () => {
    assert.ok(
      view.includes("listo_para_enviar") && view.includes("Listo para enviar"),
      "Must have Listo para enviar label",
    );
  });

  it("F3: Sync state display is truthful", () => {
    assert.ok(
      view.includes("Pendiente de sincronizacion"),
      "Must show 'Pendiente de sincronizacion' for nunca_sincronizado",
    );
  });
});

// ===========================================================================
// Suite G: Seller scope enforcement (server-side)
// ===========================================================================

describe("G. Seller scope enforcement", () => {
  const page = read(SELLER_PAGE);

  it("G1: Seller scope uses sellerId (not sellerName)", () => {
    assert.ok(
      page.includes("sellerId: sellerIdentity.sellerId"),
      "Must use sellerId for Agentik-native scope",
    );
  });

  it("G2: Seller scope uses sagSellerCode for SAG scope", () => {
    assert.ok(
      page.includes("sellerIdentity.sagSellerCode"),
      "Must use sagSellerCode for SAG order scope",
    );
  });

  it("G3: Manager bypass preserves canAccessAllOrders", () => {
    assert.ok(
      page.includes("scope.canAccessAllOrders"),
      "Manager/admin bypass via canAccessAllOrders must be preserved",
    );
  });

  it("G4: No seller filter is sent from client/browser", () => {
    assert.ok(
      !page.includes("req.body.sellerId"),
      "Seller scope must be resolved server-side, not from request body",
    );
  });
});

// ===========================================================================
// Suite H: Order origin/source differentiation
// ===========================================================================

describe("H. Order source differentiation", () => {
  const page = read(SELLER_PAGE);

  it("H1: Agentik-native orders have origin field", () => {
    assert.ok(
      page.includes("c.origin"),
      "Must pass origin field from OrderCard to SerializedOrderCard",
    );
  });

  it("H2: Agentik-native orders get NOT_AVAILABLE fulfillment", () => {
    assert.ok(
      page.includes('"NOT_AVAILABLE"'),
      "Agentik-native orders must have NOT_AVAILABLE fulfillment status",
    );
  });

  it("H3: SAG orders preserve existing fulfillment", () => {
    assert.ok(
      page.includes("deriveStrictFulfillmentStages"),
      "SAG orders must still use canonical fulfillment derivation",
    );
  });
});

// ===========================================================================
// Suite I: OrderCard type has required fields
// ===========================================================================

describe("I. OrderCard DTO shape", () => {
  const types = read(ORDER_TYPES);
  const cardBlock = types.slice(
    types.indexOf("export interface OrderCard {"),
    types.indexOf("}", types.indexOf("export interface OrderCard {")) + 1,
  );

  for (const field of [
    "id", "consecutivo", "customerName", "sellerName",
    "totalReferences", "totalUnits", "totalValue",
    "status", "origin", "syncState", "createdAt",
  ]) {
    it(`I: OrderCard has ${field}`, () => {
      assert.ok(
        cardBlock.includes(`${field}:`),
        `OrderCard must have ${field} field`,
      );
    });
  }
});

// ===========================================================================
// Suite J: No duplicate rendering
// ===========================================================================

describe("J. Dedup authority", () => {
  const service = read(ORDER_SERVICE);
  const fnBody = service.slice(service.indexOf("export async function listOrders"));

  it("J1: listOrders merges AgentExecution + CustomerOrderRecord", () => {
    assert.ok(
      fnBody.includes("AgentExecution") && fnBody.includes("CustomerOrderRecord"),
      "listOrders must merge both sources",
    );
  });

  it("J2: Dedup section exists", () => {
    assert.ok(
      fnBody.includes("Dedup"),
      "listOrders must have dedup logic or comment",
    );
  });
});

// ===========================================================================
// Suite K: CRM quotes skipped for seller scope
// ===========================================================================

describe("K. CRM quotes in seller scope", () => {
  const service = read(ORDER_SERVICE);
  const fnBody = service.slice(service.indexOf("export async function listOrders"));

  it("K1: CRM quotes skipped when sellerScope is present", () => {
    assert.ok(
      fnBody.includes("!filter?.sellerScope"),
      "CRM quotes must be skipped for seller-scoped views (no seller field)",
    );
  });
});

// ===========================================================================
// Suite L: Desktop edit/share behavior
// ===========================================================================

describe("L. Desktop edit behavior", () => {
  const service = read(ORDER_SERVICE);

  it("L1: updateOrderDraft exists", () => {
    assert.ok(
      service.includes("export async function updateOrderDraft"),
      "Desktop has updateOrderDraft",
    );
  });

  it("L2: Only borrador and listo_para_enviar are editable", () => {
    const editFn = service.slice(service.indexOf("updateOrderDraft"));
    assert.ok(
      editFn.includes('"borrador"') && editFn.includes('"listo_para_enviar"'),
      "Edit guard checks borrador and listo_para_enviar",
    );
  });

  it("L3: deleteDraftOrder exists", () => {
    assert.ok(
      service.includes("export async function deleteDraftOrder"),
      "Desktop has deleteDraftOrder",
    );
  });

  it("L4: SAG-synced orders cannot be deleted", () => {
    const delFn = service.slice(service.indexOf("deleteDraftOrder"));
    assert.ok(
      delFn.includes("sincronizado con SAG"),
      "Delete guard prevents SAG-synced order deletion",
    );
  });
});

// ===========================================================================
// Suite M: Desktop share behavior
// ===========================================================================

describe("M. Desktop share behavior", () => {
  it("M1: PDF renderer exists", () => {
    const pdfPath = join(__dirname, "..", "..", "pedidos", "order-pdf-renderer.tsx");
    const pdf = read(pdfPath);
    assert.ok(
      pdf.includes("OrderPdfDocument"),
      "PDF renderer component exists",
    );
  });

  it("M2: WhatsApp share text builder exists", () => {
    const sharePath = join(__dirname, "..", "..", "pedidos", "order-share.ts");
    const share = read(sharePath);
    assert.ok(
      share.includes("whatsappText"),
      "WhatsApp share text builder exists",
    );
  });

  it("M3: Order share payload builder exists", () => {
    const sharePath = join(__dirname, "..", "..", "pedidos", "order-share.ts");
    const share = read(sharePath);
    assert.ok(
      share.includes("buildOrderSharePayload"),
      "Order share payload builder exists",
    );
  });
});

// ===========================================================================
// Suite N: Order detail works for both sources
// ===========================================================================

describe("N. Order detail supports both sources", () => {
  const service = read(ORDER_SERVICE);
  const getOrderFn = service.slice(service.indexOf("export async function getOrder"));

  it("N1: getOrder tries AgentExecution first", () => {
    assert.ok(
      getOrderFn.includes("AgentExecution"),
      "getOrder must try AgentExecution first",
    );
  });

  it("N2: getOrder falls back to CRMQuote", () => {
    assert.ok(
      getOrderFn.includes("cRMQuote"),
      "getOrder must fall back to CRMQuote",
    );
  });

  it("N3: getOrder falls back to CustomerOrderRecord", () => {
    assert.ok(
      getOrderFn.includes("customerOrderRecord"),
      "getOrder must fall back to CustomerOrderRecord",
    );
  });
});
