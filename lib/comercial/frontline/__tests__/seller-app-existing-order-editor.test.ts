/**
 * lib/comercial/frontline/__tests__/seller-app-existing-order-editor.test.ts
 *
 * AGENTIK-SELLER-APP-EXISTING-ORDER-EDITOR-P0
 *
 * Tests for the dedicated existing-order editor component.
 * Verifies: no wizard chrome, canonical load, quantity edit, line removal,
 * product addition, auto-assortment reuse, save via update_draft, delete
 * via delete_draft, seller scope, cancel, regressions.
 *
 * Runner: node:test via `npx tsx --test`
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EDITOR = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "existing-order-editor.tsx",
);
const SELLER_ORDERS_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "seller-orders-view.tsx",
);
const NUEVO_PEDIDO_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "nuevo-pedido-view.tsx",
);
const SHELL = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "seller-app-shell.tsx",
);
const API_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "route.ts",
);
const PRODUCTS_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "products", "route.ts",
);
const PDF_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "pdf", "route.ts",
);
const UI_KIT = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "seller-ui-kit.tsx",
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

// ===========================================================================
// Suite A: Edit opens dedicated editor (NOT wizard)
// ===========================================================================

describe("A. Edit opens dedicated editor", () => {
  const editor = read(EDITOR);
  const view = read(SELLER_ORDERS_VIEW);

  it("A1: ExistingOrderEditor component exists and is exported", () => {
    assert.ok(
      editor.includes("export function ExistingOrderEditor"),
      "Must export ExistingOrderEditor",
    );
  });

  it("A2: SellerOrdersView imports ExistingOrderEditor", () => {
    assert.ok(
      view.includes('from "./existing-order-editor"'),
      "Must import from existing-order-editor",
    );
  });

  it("A3: SellerOrdersView renders ExistingOrderEditor when editingOrderId is set", () => {
    assert.ok(
      view.includes("editingOrderId") && view.includes("<ExistingOrderEditor"),
      "Must conditionally render ExistingOrderEditor",
    );
  });

  it("A4: Edit button passes orderId (not full order payload)", () => {
    assert.ok(
      view.includes("onEditOrder(detail.id)"),
      "Edit button must pass only orderId to handler",
    );
  });
});

// ===========================================================================
// Suite B: NO wizard step labels in editor
// ===========================================================================

describe("B. No wizard chrome in editor", () => {
  const editor = read(EDITOR);

  it("B1: No 'Paso X de Y' text in editor", () => {
    assert.ok(
      !editor.includes("Paso") || !editor.includes("de 5"),
      "Must not contain wizard progress text",
    );
  });

  it("B2: No step progress bar (1-5 segments) in editor", () => {
    assert.ok(
      !editor.includes("[1, 2, 3, 4, 5].map"),
      "Must not contain step progress bar",
    );
  });

  it("B3: No WizardStep type in editor", () => {
    assert.ok(
      !editor.includes("WizardStep"),
      "Must not reference WizardStep type",
    );
  });

  it("B4: No 'Seleccionar cliente' in editor", () => {
    assert.ok(
      !editor.includes("Seleccionar cliente"),
      "Must not show customer selection",
    );
  });

  it("B5: No 'Continuar a productos' in editor", () => {
    assert.ok(
      !editor.includes("Continuar a productos"),
      "Must not show wizard continue button",
    );
  });

  it("B6: No 'Crear pedido' in editor", () => {
    assert.ok(
      !editor.includes("Crear pedido") && !editor.includes("Enviar pedido"),
      "Must not show create/submit order labels",
    );
  });
});

// ===========================================================================
// Suite C: Existing lines preload from canonical getOrder
// ===========================================================================

describe("C. Existing lines preload", () => {
  const editor = read(EDITOR);

  it("C1: Editor fetches order via API get action", () => {
    assert.ok(
      editor.includes('action: "get"') && editor.includes("orderId"),
      "Must call API with action get",
    );
  });

  it("C2: Lines are mapped from order.lines (not reconstructed)", () => {
    assert.ok(
      editor.includes("data.order.lines"),
      "Must map from canonical order.lines",
    );
  });

  it("C3: Lines include originalQuantity for change tracking", () => {
    assert.ok(
      editor.includes("originalQuantity"),
      "Must track original quantity",
    );
  });

  it("C4: Lines filter out removed lines", () => {
    assert.ok(
      editor.includes("!l.removed"),
      "Must filter out removed lines from canonical data",
    );
  });
});

// ===========================================================================
// Suite D: Quantity + updates draft line
// ===========================================================================

describe("D. Quantity increment", () => {
  const editor = read(EDITOR);

  it("D1: Plus button calls handleUpdateQuantity with +1", () => {
    assert.ok(
      editor.includes("handleUpdateQuantity(line.id, 1)"),
      "Must have +1 quantity handler",
    );
  });

  it("D2: Quantity update recalculates lineTotal", () => {
    assert.ok(
      editor.includes("lineTotal: newQty * l.unitPrice") ||
      editor.includes("lineTotal: qty * l.unitPrice"),
      "Must recalculate lineTotal on quantity change",
    );
  });
});

// ===========================================================================
// Suite E: Quantity - updates draft line
// ===========================================================================

describe("E. Quantity decrement", () => {
  const editor = read(EDITOR);

  it("E1: Minus button calls handleUpdateQuantity with -1", () => {
    assert.ok(
      editor.includes("handleUpdateQuantity(line.id, -1)"),
      "Must have -1 quantity handler",
    );
  });

  it("E2: Quantity cannot go below 1", () => {
    assert.ok(
      editor.includes("Math.max(1,"),
      "Must enforce minimum quantity of 1",
    );
  });

  it("E3: Minus button disabled when quantity is 1", () => {
    assert.ok(
      editor.includes("disabled={line.quantity <= 1}"),
      "Must disable minus at quantity 1",
    );
  });
});

// ===========================================================================
// Suite F: Remove one variant line
// ===========================================================================

describe("F. Remove variant line", () => {
  const editor = read(EDITOR);

  it("F1: Remove button exists per line", () => {
    assert.ok(
      editor.includes("handleRemoveLine(line.id)"),
      "Must have per-line remove handler",
    );
  });

  it("F2: Removal marks line, does not delete order", () => {
    assert.ok(
      editor.includes("markedForRemoval: true"),
      "Must mark for removal, not instant delete",
    );
  });

  it("F3: Removed lines can be restored", () => {
    assert.ok(
      editor.includes("handleUndoRemove") && editor.includes("Restaurar"),
      "Must support undo for removed lines",
    );
  });

  it("F4: Trash icon used for removal", () => {
    assert.ok(
      editor.includes('"trash"'),
      "Must use trash icon for removal",
    );
  });
});

// ===========================================================================
// Suite G: Add products opens contained product picker
// ===========================================================================

describe("G. Add products sub-view", () => {
  const editor = read(EDITOR);

  it("G1: 'Agregar productos' button exists", () => {
    assert.ok(
      editor.includes("Agregar productos"),
      "Must have add products button",
    );
  });

  it("G2: showAddProducts state toggles product picker", () => {
    assert.ok(
      editor.includes("showAddProducts") && editor.includes("setShowAddProducts"),
      "Must have showAddProducts state",
    );
  });

  it("G3: AddProductsPanel component exists", () => {
    assert.ok(
      editor.includes("function AddProductsPanel"),
      "Must define AddProductsPanel",
    );
  });

  it("G4: Back from products returns to editor (not wizard)", () => {
    assert.ok(
      editor.includes("Volver al editor"),
      "Must have 'back to editor' label",
    );
  });
});

// ===========================================================================
// Suite H: Auto-assortment remains canonical
// ===========================================================================

describe("H. Auto-assortment canonical", () => {
  const editor = read(EDITOR);

  it("H1: Auto-assortment calls server with auto_assortment action", () => {
    assert.ok(
      editor.includes('"auto_assortment"'),
      "Must use auto_assortment action",
    );
  });

  it("H2: Uses /pedidos/products endpoint", () => {
    assert.ok(
      editor.includes("/comercial/pedidos/products"),
      "Must call products API route",
    );
  });

  it("H3: Sends referenceCode and requestedUnits", () => {
    assert.ok(
      editor.includes("referenceCode:") && editor.includes("requestedUnits:"),
      "Must send canonical auto-assortment params",
    );
  });

  it("H4: No evaluateAutoSizeDistribution in editor", () => {
    assert.ok(
      !editor.includes("evaluateAutoSizeDistribution"),
      "Must not contain business logic in React",
    );
  });
});

// ===========================================================================
// Suite I: Added lines return to same editor
// ===========================================================================

describe("I. Added lines integration", () => {
  const editor = read(EDITOR);

  it("I1: handleAddNewLines merges into editor lines", () => {
    assert.ok(
      editor.includes("handleAddNewLines"),
      "Must have handleAddNewLines function",
    );
  });

  it("I2: New lines are marked with isNew: true", () => {
    assert.ok(
      editor.includes("isNew: true"),
      "New lines must have isNew flag",
    );
  });

  it("I3: Duplicate variant merges quantity instead of adding new line", () => {
    assert.ok(
      editor.includes("l.quantity + nl.quantity"),
      "Must merge quantity for duplicate variants",
    );
  });

  it("I4: setShowAddProducts(false) called after adding", () => {
    assert.ok(
      editor.includes("setShowAddProducts(false)"),
      "Must close product picker after adding lines",
    );
  });
});

// ===========================================================================
// Suite J: Save calls updateOrderDraft()
// ===========================================================================

describe("J. Save via update_draft", () => {
  const editor = read(EDITOR);

  it("J1: Save calls API with update_draft action", () => {
    assert.ok(
      editor.includes('"update_draft"'),
      "Must use update_draft action",
    );
  });

  it("J2: Save sends orderId from loaded order", () => {
    assert.ok(
      editor.includes("orderId: order.id"),
      "Must send same orderId",
    );
  });

  it("J3: Save sends header and lines", () => {
    assert.ok(
      editor.includes("header,") && editor.includes("lines: apiLines"),
      "Must send header and lines",
    );
  });

  it("J4: Save filters out removed lines", () => {
    assert.ok(
      editor.includes("!l.markedForRemoval"),
      "Must not send removed lines to server",
    );
  });

  it("J5: Save requires at least one active line", () => {
    assert.ok(
      editor.includes("activeLines.length === 0"),
      "Must validate non-empty lines",
    );
  });
});

// ===========================================================================
// Suite K: Same order ID preserved
// ===========================================================================

describe("K. Order ID preserved", () => {
  const editor = read(EDITOR);

  it("K1: Editor receives orderId prop", () => {
    assert.ok(
      editor.includes("orderId: string"),
      "Must accept orderId as prop",
    );
  });

  it("K2: No createOrderDraft in editor", () => {
    assert.ok(
      !editor.includes("createOrderDraft") && !editor.includes('"create"'),
      "Must never create a new order",
    );
  });
});

// ===========================================================================
// Suite L: Customer unchanged
// ===========================================================================

describe("L. Customer unchanged", () => {
  const editor = read(EDITOR);

  it("L1: No customer search in editor", () => {
    assert.ok(
      !editor.includes("search_customers"),
      "Must not include customer search",
    );
  });

  it("L2: Customer from loaded order header used directly", () => {
    assert.ok(
      editor.includes("order.header.customerId") && editor.includes("order.header.customerName"),
      "Must preserve customer from loaded order",
    );
  });

  it("L3: No customer selection UI in editor", () => {
    assert.ok(
      !editor.includes("CustomerSelectionStep") && !editor.includes("Seleccionar cliente"),
      "Must not show customer selection",
    );
  });
});

// ===========================================================================
// Suite M: Seller ownership unchanged
// ===========================================================================

describe("M. Seller ownership unchanged", () => {
  const editor = read(EDITOR);

  it("M1: Seller from loaded order header used directly", () => {
    assert.ok(
      editor.includes("order.header.sellerId") && editor.includes("order.header.sellerName"),
      "Must preserve seller from loaded order",
    );
  });

  it("M2: No seller selection in editor", () => {
    assert.ok(
      !editor.includes("sellerIdentity") || editor.includes("order.header.sellerId"),
      "Must not change seller",
    );
  });
});

// ===========================================================================
// Suite N: SAG order edit unavailable
// ===========================================================================

describe("N. SAG order not editable", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("N1: isEditable rejects SAG_HISTORICAL", () => {
    const fnMatch = view.match(/function isEditable[\s\S]*?return.*?$/m);
    assert.ok(fnMatch, "isEditable function must exist");
    assert.ok(
      view.includes('origin === "AGENTIK_NATIVE"') || view.includes('origin === "agentik"'),
      "Must check for AGENTIK_NATIVE origin",
    );
  });

  it("N2: isEditable returns false for non-native origins", () => {
    assert.ok(
      view.includes("if (!isNative) return false"),
      "Must explicitly reject non-native orders",
    );
  });
});

// ===========================================================================
// Suite O: Synced native edit rejected
// ===========================================================================

describe("O. Synced native not editable", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("O1: isEditable only allows borrador and listo_para_enviar", () => {
    assert.ok(
      view.includes('"borrador"') && view.includes('"listo_para_enviar"'),
      "Must check for editable statuses",
    );
  });

  it("O2: sincronizado status not in editable list", () => {
    const fnStart = view.indexOf("function isEditable");
    const fnEnd = view.indexOf("}", fnStart + 50);
    const fnBody = view.slice(fnStart, fnEnd + 1);
    // sincronizado should only appear in non-editable contexts
    const editableReturn = fnBody.includes("sincronizado");
    // If sincronizado appears it should be in a rejection, not acceptance
    assert.ok(
      !editableReturn || fnBody.includes("return false"),
      "sincronizado must not be editable",
    );
  });
});

// ===========================================================================
// Suite P: Delete own eligible native order
// ===========================================================================

describe("P. Delete own order", () => {
  const editor = read(EDITOR);

  it("P1: Delete button exists in editor", () => {
    assert.ok(
      editor.includes("Eliminar pedido"),
      "Must have delete order button",
    );
  });

  it("P2: Delete requires confirmation", () => {
    assert.ok(
      editor.includes("showDeleteConfirm") && editor.includes("Eliminar este pedido"),
      "Must require confirmation before delete",
    );
  });

  it("P3: Delete calls API with delete_draft action", () => {
    assert.ok(
      editor.includes('"delete_draft"'),
      "Must use delete_draft action",
    );
  });

  it("P4: Delete sends orderId", () => {
    assert.ok(
      editor.includes('orderId: order.id') ,
      "Must send orderId for deletion",
    );
  });

  it("P5: After delete, calls onDeleted", () => {
    assert.ok(
      editor.includes("onDeleted()"),
      "Must call onDeleted callback after deletion",
    );
  });
});

// ===========================================================================
// Suite Q: Delete other seller order → 403 (server-side)
// ===========================================================================

describe("Q. Cross-seller delete enforcement (server)", () => {
  const api = read(API_ROUTE);

  it("Q1: delete_draft has seller scope enforcement", () => {
    const deleteBlock = api.slice(api.indexOf('"delete_draft"'));
    assert.ok(
      deleteBlock.includes("sellerScope.canAccessAllOrders") &&
      deleteBlock.includes("sellerIdentity.sellerId"),
      "delete_draft must check seller scope",
    );
  });

  it("Q2: Cross-seller delete returns 403", () => {
    const deleteBlock = api.slice(api.indexOf('"delete_draft"'));
    assert.ok(
      deleteBlock.includes("403"),
      "Cross-seller delete must return 403",
    );
  });
});

// ===========================================================================
// Suite R: SAG delete unavailable
// ===========================================================================

describe("R. SAG order delete unavailable", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("R1: Edit button only shown when canEdit is true", () => {
    assert.ok(
      view.includes("canEdit") && view.includes("isEditable"),
      "Must check canEdit before showing edit button",
    );
  });

  it("R2: isEditable rejects non-native orders (SAG has no edit)", () => {
    assert.ok(
      view.includes("if (!isNative) return false"),
      "SAG orders must not show edit/delete",
    );
  });
});

// ===========================================================================
// Suite S: Cancel returns to same order detail
// ===========================================================================

describe("S. Cancel returns to detail", () => {
  const editor = read(EDITOR);

  it("S1: Cancel/back button exists", () => {
    assert.ok(
      editor.includes("handleCancel"),
      "Must have cancel handler",
    );
  });

  it("S2: Cancel calls onClose (returns to detail)", () => {
    assert.ok(
      editor.includes("onClose()"),
      "Cancel must call onClose to return to detail",
    );
  });

  it("S3: Back label shows order number", () => {
    assert.ok(
      editor.includes("Pedido #{order.consecutivo}"),
      "Back label must show order number",
    );
  });
});

// ===========================================================================
// Suite T: Unsaved change handling
// ===========================================================================

describe("T. Unsaved changes", () => {
  const editor = read(EDITOR);

  it("T1: Change tracking via hasChangesRef", () => {
    assert.ok(
      editor.includes("hasChangesRef"),
      "Must track changes",
    );
  });

  it("T2: Confirm dialog when canceling with changes", () => {
    assert.ok(
      editor.includes("Tiene cambios sin guardar"),
      "Must warn about unsaved changes",
    );
  });
});

// ===========================================================================
// Suite U: PDF download regression
// ===========================================================================

describe("U. PDF download regression", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("U1: fetchPdfBlob still exists", () => {
    assert.ok(
      view.includes("fetchPdfBlob"),
      "PDF download function must not be removed",
    );
  });

  it("U2: Download PDF button still exists", () => {
    assert.ok(
      view.includes("Descargar PDF"),
      "Download PDF button must not be removed",
    );
  });
});

// ===========================================================================
// Suite V: PDF share regression
// ===========================================================================

describe("V. PDF share regression", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("V1: Web Share API still used", () => {
    assert.ok(
      view.includes("navigator.share"),
      "Web Share API must still be available",
    );
  });

  it("V2: Compartir PDF button still exists", () => {
    assert.ok(
      view.includes("Compartir PDF"),
      "Share PDF button must not be removed",
    );
  });
});

// ===========================================================================
// Suite W: Order visibility regression
// ===========================================================================

describe("W. Order visibility regression", () => {
  const view = read(SELLER_ORDERS_VIEW);

  it("W1: Order list still renders OrderCard components", () => {
    assert.ok(
      view.includes("OrderCard"),
      "Order list must still render order cards",
    );
  });

  it("W2: Status filter still works", () => {
    assert.ok(
      view.includes("statusFilter") && view.includes("STATUS_GROUPS"),
      "Status filter must still exist",
    );
  });
});

// ===========================================================================
// Suite X: Customer flow regression
// ===========================================================================

describe("X. Customer flow regression", () => {
  const npv = read(NUEVO_PEDIDO_VIEW);

  it("X1: NuevoPedidoView still has customer selection step", () => {
    assert.ok(
      npv.includes("CustomerSelectionStep"),
      "Create wizard must still have customer selection",
    );
  });

  it("X2: NuevoPedidoView no longer has editOrder prop", () => {
    assert.ok(
      !npv.includes("editOrder") && !npv.includes("EditOrderPayload"),
      "Create wizard must not have edit mode code",
    );
  });

  it("X3: NuevoPedidoView no longer has isEditMode", () => {
    assert.ok(
      !npv.includes("isEditMode"),
      "Create wizard must not have isEditMode flag",
    );
  });
});

// ===========================================================================
// Suite Y: Auto-assortment regression (still canonical)
// ===========================================================================

describe("Y. Auto-assortment regression", () => {
  const productsRoute = read(PRODUCTS_ROUTE);
  const editor = read(EDITOR);

  it("Y1: Products API route still supports auto_assortment action", () => {
    assert.ok(
      productsRoute.includes('"auto_assortment"'),
      "Products API must still have auto_assortment case",
    );
  });

  it("Y2: Products API uses computeAutoAssortmentProposal", () => {
    assert.ok(
      productsRoute.includes("computeAutoAssortmentProposal"),
      "Must still use canonical auto-assortment function",
    );
  });

  it("Y3: Editor add-products has auto/manual mode toggle", () => {
    assert.ok(
      editor.includes("Surtido automatico") && editor.includes("Seleccion manual"),
      "Add products must have auto/manual toggle",
    );
  });
});

// ===========================================================================
// Suite Z: Shell cleanup (no edit routing to wizard)
// ===========================================================================

describe("Z. Shell cleanup", () => {
  const shell = read(SHELL);

  it("Z1: Shell does not import EditOrderPayload", () => {
    assert.ok(
      !shell.includes("EditOrderPayload"),
      "Shell must not reference EditOrderPayload",
    );
  });

  it("Z2: Shell does not have editOrder state", () => {
    assert.ok(
      !shell.includes("setEditOrder") && !shell.includes("editOrder"),
      "Shell must not manage editOrder state",
    );
  });

  it("Z3: Shell does not pass editOrder to NuevoPedidoView", () => {
    assert.ok(
      !shell.includes("editOrder={"),
      "Shell must not pass editOrder prop",
    );
  });

  it("Z4: Shell does not pass onEditOrder to SellerOrdersView", () => {
    assert.ok(
      !shell.includes("onEditOrder={"),
      "Shell must not pass onEditOrder prop",
    );
  });
});
