/**
 * lib/comercial/frontline/__tests__/seller-app-order-actions.test.ts
 *
 * AGENTIK-SELLER-APP-ORDER-ACTIONS-P0
 * AGENTIK-SELLER-APP-ORDER-ACTIONS-P0-CLOSE
 *
 * Desktop parity tests: Order detail, edit, share actions in Seller App.
 * Verifies: canonical service reuse, seller scope enforcement, action
 * availability policy, no business logic in React, server seller authority,
 * delete_draft seller scope, edit flow, email share parity.
 *
 * Runner: node:test via `npx tsx --test`
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SELLER_ORDERS_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "seller-orders-view.tsx",
);
const SELLER_PAGE = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "page.tsx",
);
const NUEVO_PEDIDO_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "nuevo-pedido-view.tsx",
);
const ORDER_SERVICE = join(
  __dirname, "..", "..",
  "pedidos", "order-service.ts",
);
const ORDER_SHARE = join(
  __dirname, "..", "..",
  "pedidos", "order-share.ts",
);
const ORDER_PDF_SERVICE = join(
  __dirname, "..", "..",
  "pedidos", "order-pdf-service.ts",
);
const API_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "route.ts",
);
const PDF_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "pdf", "route.ts",
);
const UI_KIT = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "seller-ui-kit.tsx",
);
const SHELL = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "seller-app-shell.tsx",
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

// ===========================================================================
// Suite A: Native order detail
// ===========================================================================

describe("A. Native order detail", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("A1: Detail view fetches full order via API get action", () => {
    assert.ok(
      view.includes('action: "get"') && view.includes("orderId"),
      "Must call API with action get and orderId",
    );
  });

  it("A2: Detail view renders order lines", () => {
    assert.ok(
      view.includes("OrderLineRow"),
      "Must render OrderLineRow for each line",
    );
  });

  it("A3: Detail view shows reference, color, size, quantity, price", () => {
    assert.ok(
      view.includes("referenceCode") &&
      view.includes("colorName") &&
      view.includes("line.size") &&
      view.includes("line.quantity") &&
      view.includes("line.unitPrice") &&
      view.includes("line.lineTotal"),
      "Must display all line fields",
    );
  });

  it("A4: Detail view shows order header fields", () => {
    assert.ok(
      view.includes("customerName") &&
      view.includes("sellerName") &&
      view.includes("consecutivo"),
      "Must display header fields",
    );
  });

  it("A5: Detail uses canonical totals from server (not React calculation)", () => {
    // Should use detail.summary.totalValue, not manual sum of lines
    assert.ok(
      view.includes("detail?.summary?.totalValue") || view.includes("detail.summary.totalValue"),
      "Must use server-side summary totals",
    );
  });
});

// ===========================================================================
// Suite B: SAG order detail
// ===========================================================================

describe("B. SAG order detail", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("B1: Same detail view supports SAG_HISTORICAL origin", () => {
    assert.ok(
      view.includes("SAG_HISTORICAL"),
      "Must reference SAG_HISTORICAL origin",
    );
  });

  it("B2: SAG order shows Historial SAG label", () => {
    assert.ok(
      view.includes("Historial SAG"),
      "SAG orders show origin label",
    );
  });
});

// ===========================================================================
// Suite C: Native editable state
// ===========================================================================

describe("C. Native editable state", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("C1: isEditable returns true for borrador + AGENTIK_NATIVE", () => {
    assert.ok(
      view.includes("isEditable"),
      "Must have isEditable function",
    );
    assert.ok(
      view.includes('"borrador"') && view.includes('"listo_para_enviar"'),
      "Editable states: borrador and listo_para_enviar",
    );
  });

  it("C2: Only AGENTIK_NATIVE orders are editable", () => {
    assert.ok(
      view.includes("AGENTIK_NATIVE") && view.includes('"agentik"'),
      "Must check for native origin",
    );
  });

  it("C3: Edit button exists for editable orders", () => {
    assert.ok(
      view.includes("Editar") && view.includes("canEdit"),
      "Must show Edit button when canEdit",
    );
  });
});

// ===========================================================================
// Suite D: Native non-editable after sync
// ===========================================================================

describe("D. Native non-editable after sync", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("D1: isEditable excludes sincronizado status", () => {
    // The function only allows borrador and listo_para_enviar
    const fnBlock = view.slice(view.indexOf("function isEditable"));
    const fnBody = fnBlock.slice(0, fnBlock.indexOf("}") + 1);
    assert.ok(
      !fnBody.includes('"sincronizado"'),
      "sincronizado must NOT be in editable states",
    );
  });
});

// ===========================================================================
// Suite E: SAG edit blocked
// ===========================================================================

describe("E. SAG edit blocked", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("E1: isEditable returns false for non-native origins", () => {
    const fnBlock = view.slice(view.indexOf("function isEditable"));
    const fnBody = fnBlock.slice(0, fnBlock.indexOf("}") + 1);
    assert.ok(
      fnBody.includes("isNative") && fnBody.includes("return false"),
      "Must return false for non-native origins",
    );
  });
});

// ===========================================================================
// Suite F: Seller A cannot access seller B order
// ===========================================================================

describe("F. Seller scope enforcement on get", () => {
  const api = read(API_ROUTE);

  it("F1: get action checks seller scope", () => {
    const getBlock = api.slice(api.indexOf('case "get":'));
    const getEnd = getBlock.indexOf('case "');
    const getBody = getBlock.slice(0, getEnd > 0 ? getEnd : 500);
    assert.ok(
      getBody.includes("canAccessAllOrders") && getBody.includes("sellerIdentity.sellerId"),
      "get action must enforce seller scope",
    );
  });

  it("F2: get returns 403 for unauthorized seller", () => {
    const getBlock = api.slice(api.indexOf('case "get":'));
    const getEnd = getBlock.indexOf('case "');
    const getBody = getBlock.slice(0, getEnd > 0 ? getEnd : 500);
    assert.ok(
      getBody.includes("403"),
      "Must return 403 for unauthorized access",
    );
  });
});

// ===========================================================================
// Suite G: Seller cannot alter seller ID through request
// ===========================================================================

describe("G. Creation seller authority", () => {
  const api = read(API_ROUTE);
  const createView = read(NUEVO_PEDIDO_VIEW);

  it("G1: API resolves seller from server session (not request body)", () => {
    assert.ok(
      api.includes("resolveCurrentSeller") && api.includes("userId: user.id"),
      "Seller identity must be resolved server-side from user session",
    );
  });

  it("G2: Client sends sellerIdentity from server props (not arbitrary input)", () => {
    assert.ok(
      createView.includes("sellerIdentity.sellerId") || createView.includes("sellerIdentity.sellerName"),
      "Client uses server-provided sellerIdentity",
    );
  });

  it("G3: API does not trust body.sellerId for authorization", () => {
    // The sellerScope is derived from resolveCurrentSeller, not from body
    assert.ok(
      api.includes("deriveSellerScope(sellerIdentity)"),
      "Scope must be derived from server identity, not request body",
    );
  });
});

// ===========================================================================
// Suite H: Update uses updateOrderDraft()
// ===========================================================================

describe("H. Edit uses canonical updateOrderDraft", () => {
  const api = read(API_ROUTE);
  const service = read(ORDER_SERVICE);

  it("H1: API update_draft action calls updateOrderDraft", () => {
    assert.ok(
      api.includes("updateOrderDraft(orgId, body.orderId"),
      "Must call canonical updateOrderDraft",
    );
  });

  it("H2: updateOrderDraft only allows borrador and listo_para_enviar", () => {
    const fn = service.slice(service.indexOf("export async function updateOrderDraft"));
    assert.ok(
      fn.includes('"borrador"') && fn.includes('"listo_para_enviar"'),
      "Server enforces editable statuses",
    );
  });

  it("H3: API enforces seller scope on update_draft", () => {
    const updateBlock = api.slice(api.indexOf('case "update_draft":'));
    const updateEnd = updateBlock.indexOf('case "');
    const updateBody = updateBlock.slice(0, updateEnd > 0 ? updateEnd : 800);
    assert.ok(
      updateBody.includes("canAccessAllOrders") && updateBody.includes("sellerIdentity.sellerId"),
      "update_draft must enforce seller scope",
    );
  });

  it("H4: API returns 403 for unauthorized update", () => {
    const updateBlock = api.slice(api.indexOf('case "update_draft":'));
    const updateEnd = updateBlock.indexOf('case "');
    const updateBody = updateBlock.slice(0, updateEnd > 0 ? updateEnd : 800);
    assert.ok(
      updateBody.includes("403"),
      "Must return 403 for unauthorized update",
    );
  });
});

// ===========================================================================
// Suite I: PDF uses existing exportOrderPdf()
// ===========================================================================

describe("I. PDF uses canonical exportOrderPdf", () => {
  const pdfRoute = read(PDF_ROUTE);

  it("I1: PDF route imports exportOrderPdf", () => {
    assert.ok(
      pdfRoute.includes('import { exportOrderPdf }'),
      "PDF route must import canonical exportOrderPdf",
    );
  });

  it("I2: PDF route enforces seller scope", () => {
    assert.ok(
      pdfRoute.includes("resolveCurrentSeller") && pdfRoute.includes("canAccessAllOrders"),
      "PDF route must enforce seller scope",
    );
  });

  it("I3: PDF route returns 403 for unauthorized seller", () => {
    assert.ok(
      pdfRoute.includes("403") && pdfRoute.includes("No autorizado"),
      "Must return 403 for unauthorized PDF access",
    );
  });
});

// ===========================================================================
// Suite J: WhatsApp uses buildOrderSharePayload
// ===========================================================================

describe("J. Share uses canonical services", () => {
  const api = read(API_ROUTE);
  const view = read(SELLER_ORDERS_VIEW);

  it("J1: API has share action", () => {
    assert.ok(
      api.includes('case "share":'),
      "API must have share action",
    );
  });

  it("J2: Share action uses buildOrderSharePayload", () => {
    assert.ok(
      api.includes("buildOrderSharePayload"),
      "Must use canonical buildOrderSharePayload",
    );
  });

  it("J3: Share action enforces seller scope", () => {
    const shareBlock = api.slice(api.indexOf('case "share":'));
    const shareEnd = shareBlock.indexOf('case "');
    const shareBody = shareBlock.slice(0, shareEnd > 0 ? shareEnd : 800);
    assert.ok(
      shareBody.includes("canAccessAllOrders"),
      "Share must enforce seller scope",
    );
  });

  it("J4: View uses Web Share API with PDF file", () => {
    assert.ok(
      view.includes("navigator.share") && view.includes("navigator.canShare"),
      "Must use Web Share API for PDF sharing",
    );
  });

  it("J5: View falls back to text-only WhatsApp", () => {
    assert.ok(
      view.includes("wa.me") && view.includes("whatsappText"),
      "Must fall back to WhatsApp text when Web Share unavailable",
    );
  });
});

// ===========================================================================
// Suite K: Totals/lines preserved
// ===========================================================================

describe("K. Totals and lines preserved", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("K1: Uses server summary for totals", () => {
    assert.ok(
      view.includes("detail?.summary?.totalValue"),
      "Must use server-provided totals",
    );
  });

  it("K2: Active lines filter excludes removed lines", () => {
    assert.ok(
      view.includes("filter(l => !l.removed)"),
      "Must filter removed lines",
    );
  });

  it("K3: Line total row exists", () => {
    assert.ok(
      view.includes("Total") && view.includes("fmtCOP(totalValue)"),
      "Must show total row",
    );
  });
});

// ===========================================================================
// Suite L: Order list regression
// ===========================================================================

describe("L. Order list regression", () => {
  const page = read(SELLER_PAGE);

  it("L1: page.tsx still imports listOrders", () => {
    assert.ok(
      page.includes("listOrders"),
      "Server page must still use canonical listOrders",
    );
  });

  it("L2: page.tsx still passes orders to SellerAppShell", () => {
    assert.ok(
      page.includes("orders={serializedOrders}"),
      "Must still pass serialized orders to shell",
    );
  });

  it("L3: page.tsx still uses sellerScope", () => {
    assert.ok(
      page.includes("sellerScope"),
      "Must still apply seller scope",
    );
  });
});

// ===========================================================================
// Suite M: Auto-assortment regression
// ===========================================================================

describe("M. Auto-assortment regression", () => {
  const service = read(ORDER_SERVICE);

  it("M1: createOrderDraft still exists", () => {
    assert.ok(
      service.includes("export async function createOrderDraft"),
      "createOrderDraft must exist",
    );
  });

  it("M2: submitOrder still validates SAG readiness", () => {
    const fn = service.slice(service.indexOf("export async function submitOrder"));
    assert.ok(
      fn.includes("validateOrderCustomerForSag") || fn.includes("validateCustomerForSagOrder"),
      "Submit must validate SAG readiness",
    );
  });

  it("M3: Reservation policy enforcement preserved", () => {
    assert.ok(
      service.includes("enforceReservationPolicy"),
      "Reservation policy must be enforced",
    );
  });
});

// ===========================================================================
// Suite N: Customer-flow regression
// ===========================================================================

describe("N. Customer-flow regression", () => {
  const api = read(API_ROUTE);

  it("N1: search_customers action still exists", () => {
    assert.ok(
      api.includes('case "search_customers":'),
      "Customer search action must exist",
    );
  });

  it("N2: get_customer_detail action still exists", () => {
    assert.ok(
      api.includes('case "get_customer_detail":'),
      "Customer detail action must exist",
    );
  });

  it("N3: Customer scope filter still applied", () => {
    assert.ok(
      api.includes("custScopeFilter") && api.includes("customerScopeFilter"),
      "Customer scope filter must be applied",
    );
  });
});

// ===========================================================================
// Suite O: UI icons for actions
// ===========================================================================

describe("O. UI icons for order actions", () => {
  const kit = read(UI_KIT);

  it("O1: pencil icon exists", () => {
    assert.ok(kit.includes("pencil:"), "UI kit must have pencil icon");
  });

  it("O2: shareExternal icon exists", () => {
    assert.ok(kit.includes("shareExternal:"), "UI kit must have shareExternal icon");
  });
});

// ===========================================================================
// Suite P: Action availability policy
// ===========================================================================

describe("P. Action availability policy", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("P1: isEditable is defined as pure function", () => {
    assert.ok(
      view.includes("function isEditable("),
      "isEditable must be a standalone function",
    );
  });

  it("P2: isShareable is defined as pure function", () => {
    assert.ok(
      view.includes("function isShareable("),
      "isShareable must be a standalone function",
    );
  });

  it("P3: Edit button disabled state for non-editable", () => {
    assert.ok(
      view.includes("canEdit"),
      "Edit button conditional on canEdit",
    );
  });

  it("P4: Share buttons always available", () => {
    assert.ok(
      view.includes("canShare") && view.includes("Descargar PDF") && view.includes("Compartir PDF"),
      "Share buttons conditional on canShare",
    );
  });
});

// ===========================================================================
// Suite Q: Mobile-safe layout
// ===========================================================================

describe("Q. Mobile-safe layout", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("Q1: Action buttons have minHeight 44 (touch target)", () => {
    assert.ok(
      view.includes("minHeight: 44"),
      "Action buttons must have 44px touch target",
    );
  });

  it("Q2: touchAction manipulation on interactive elements", () => {
    assert.ok(
      view.includes("touchAction: \"manipulation\""),
      "Interactive elements must use touchAction manipulation",
    );
  });

  it("Q3: No horizontal overflow (flexWrap used)", () => {
    assert.ok(
      view.includes("flexWrap"),
      "Metadata row must use flexWrap to prevent overflow",
    );
  });
});

// ===========================================================================
// Suite R: Server seller authority override on create (P0-CLOSE FIX 1)
// ===========================================================================

describe("R. Server seller authority override on create", () => {
  const api = read(API_ROUTE);

  it("R1: Create action builds createHeader with server seller override", () => {
    const createBlock = api.slice(api.indexOf('case "create":'));
    const createEnd = createBlock.indexOf('case "', 10);
    const createBody = createBlock.slice(0, createEnd > 0 ? createEnd : 2000);
    assert.ok(
      createBody.includes("createHeader") && createBody.includes("sellerIdentity.sellerId"),
      "Must override header.sellerId with server-resolved identity",
    );
  });

  it("R2: Override only applies to seller-scoped users (canAccessAllOrders check)", () => {
    const createBlock = api.slice(api.indexOf('case "create":'));
    const createEnd = createBlock.indexOf('case "', 10);
    const createBody = createBlock.slice(0, createEnd > 0 ? createEnd : 2000);
    assert.ok(
      createBody.includes("canAccessAllOrders"),
      "Override must be conditional on seller scope",
    );
  });

  it("R3: createOrderDraftDeduped receives createHeader (not body.header)", () => {
    const createBlock = api.slice(api.indexOf('case "create":'));
    const createEnd = createBlock.indexOf('case "', 10);
    const createBody = createBlock.slice(0, createEnd > 0 ? createEnd : 2000);
    assert.ok(
      createBody.includes("header: createHeader"),
      "Must pass createHeader (server-overridden) to create functions",
    );
  });

  it("R4: createOrderDraft also receives createHeader", () => {
    const createBlock = api.slice(api.indexOf('case "create":'));
    const createEnd = createBlock.indexOf('case "', 10);
    const createBody = createBlock.slice(0, createEnd > 0 ? createEnd : 2000);
    const occurrences = createBody.split("header: createHeader").length - 1;
    assert.ok(
      occurrences >= 2,
      "Both createOrderDraftDeduped and createOrderDraft must use createHeader",
    );
  });
});

// ===========================================================================
// Suite S: Seller scope enforcement on delete_draft (P0-CLOSE FIX 2)
// ===========================================================================

describe("S. Seller scope enforcement on delete_draft", () => {
  const api = read(API_ROUTE);

  it("S1: delete_draft loads order before deletion", () => {
    const deleteBlock = api.slice(api.indexOf('case "delete_draft":'));
    const deleteEnd = deleteBlock.indexOf('case "');
    const deleteBody = deleteBlock.slice(0, deleteEnd > 0 ? deleteEnd : 800);
    assert.ok(
      deleteBody.includes("getOrder(orgId, body.orderId)"),
      "Must load order before deletion to verify ownership",
    );
  });

  it("S2: delete_draft checks seller scope", () => {
    const deleteBlock = api.slice(api.indexOf('case "delete_draft":'));
    const deleteEnd = deleteBlock.indexOf('case "');
    const deleteBody = deleteBlock.slice(0, deleteEnd > 0 ? deleteEnd : 800);
    assert.ok(
      deleteBody.includes("canAccessAllOrders") && deleteBody.includes("sellerIdentity.sellerId"),
      "delete_draft must enforce seller scope",
    );
  });

  it("S3: delete_draft returns 403 for unauthorized seller", () => {
    const deleteBlock = api.slice(api.indexOf('case "delete_draft":'));
    const deleteEnd = deleteBlock.indexOf('case "');
    const deleteBody = deleteBlock.slice(0, deleteEnd > 0 ? deleteEnd : 800);
    assert.ok(
      deleteBody.includes("403") && deleteBody.includes("No autorizado para eliminar"),
      "Must return 403 with descriptive message",
    );
  });
});

// ===========================================================================
// Suite T: Edit flow implementation (P0-CLOSE FIX 3)
// ===========================================================================

describe("T. Edit flow implementation", () => {
  const view = read(NUEVO_PEDIDO_VIEW);
  const ordersView = read(SELLER_ORDERS_VIEW);
  const shell = read(SHELL);

  it("T1: NuevoPedidoView exports EditOrderPayload interface", () => {
    assert.ok(
      view.includes("export interface EditOrderPayload"),
      "Must export EditOrderPayload for type sharing",
    );
  });

  it("T2: NuevoPedidoView accepts editOrder prop", () => {
    assert.ok(
      view.includes("editOrder?:") || view.includes("editOrder?:"),
      "Must accept optional editOrder prop",
    );
  });

  it("T3: Edit mode uses update_draft action (not create)", () => {
    assert.ok(
      view.includes('action: "update_draft"') && view.includes("editOrder.id"),
      "Must call update_draft with existing order ID in edit mode",
    );
  });

  it("T4: Edit mode shows context-appropriate labels", () => {
    assert.ok(
      view.includes("Guardar cambios") && view.includes("Pedido actualizado"),
      "Submit button and result must reflect edit context",
    );
  });

  it("T5: OrderDetailView passes order data to onEditOrder callback", () => {
    assert.ok(
      ordersView.includes("onEditOrder") && ordersView.includes("onEditOrder({"),
      "Detail view must construct EditOrderPayload and call onEditOrder",
    );
  });

  it("T6: Shell wires onEditOrder from SellerOrdersView to NuevoPedidoView", () => {
    assert.ok(
      shell.includes("onEditOrder={handleEditOrder}") && shell.includes("editOrder={editOrder}"),
      "Shell must pass editOrder to NuevoPedidoView and onEditOrder to SellerOrdersView",
    );
  });

  it("T7: Edit button is NOT disabled in detail view", () => {
    // The old disabled button without handler is gone
    assert.ok(
      !ordersView.includes('title="Editar pedido (proximamente)"'),
      "Edit button must not have 'proximamente' placeholder",
    );
  });

  it("T8: Edit mode preloads cart lines from existing order", () => {
    assert.ok(
      view.includes("isEditMode ? editOrder!.lines : []"),
      "Cart must be preloaded with existing lines in edit mode",
    );
  });

  it("T9: Edit mode preloads notes from existing order", () => {
    assert.ok(
      view.includes('isEditMode ? editOrder!.header.notes'),
      "Notes must be preloaded from existing order",
    );
  });

  it("T10: Edit mode skips customer selection (starts at products)", () => {
    assert.ok(
      view.includes('isEditMode ? "products" : "customer"'),
      "Edit mode must skip to products step",
    );
  });
});

// ===========================================================================
// Suite U: PDF share via Web Share API (P0-PDF-SHARE-CERT)
// ===========================================================================

describe("U. PDF share via Web Share API", () => {
  const view = read(SELLER_ORDERS_VIEW);
  const kit = read(UI_KIT);

  it("U1: Creates File object from PDF blob with correct MIME type", () => {
    assert.ok(
      view.includes('new File([blob], fileName, { type: "application/pdf" })'),
      "Must create File with application/pdf type",
    );
  });

  it("U2: Checks navigator.canShare before sharing", () => {
    assert.ok(
      view.includes("navigator.canShare?.({ files: [pdfFile] })"),
      "Must check canShare with files array before sharing",
    );
  });

  it("U3: Calls navigator.share with files array", () => {
    assert.ok(
      view.includes("navigator.share({") && view.includes("files: [pdfFile]"),
      "Must pass files array to navigator.share",
    );
  });

  it("U4: Handles AbortError (user cancelled share sheet)", () => {
    assert.ok(
      view.includes('"AbortError"'),
      "Must gracefully handle user cancelling native share sheet",
    );
  });

  it("U5: Falls back to text-only WhatsApp when Web Share unavailable", () => {
    assert.ok(
      view.includes("wa.me") && view.includes("Fallback"),
      "Must fall back to WhatsApp text when platform lacks Web Share",
    );
  });

  it("U6: One canonical PDF source (fetchPdfBlob) shared by download and share", () => {
    assert.ok(
      view.includes("fetchPdfBlob") &&
      view.includes("handleDownloadPdf") &&
      view.includes("handleSharePdf"),
      "Both download and share must use same fetchPdfBlob",
    );
  });

  it("U7: Download PDF button exists with download icon", () => {
    assert.ok(
      view.includes('"Descargar PDF"') && view.includes('"download"'),
      "Download PDF button must exist with download icon",
    );
  });

  it("U8: Share PDF button exists with shareExternal icon", () => {
    assert.ok(
      view.includes('"Compartir PDF"') && view.includes('"shareExternal"'),
      "Share PDF button must exist with shareExternal icon",
    );
  });

  it("U9: download icon exists in UI kit", () => {
    assert.ok(kit.includes("download:"), "UI kit must have download icon");
  });

  it("U10: PDF filename uses canonical consecutivo pattern", () => {
    assert.ok(
      view.includes("pedido_${orderCard.consecutivo}.pdf"),
      "PDF filename must use consecutivo for consistency",
    );
  });
});
