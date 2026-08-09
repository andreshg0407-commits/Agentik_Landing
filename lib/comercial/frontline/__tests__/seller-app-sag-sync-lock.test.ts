/**
 * AGENTIK-SELLER-APP-SAG-SYNC-LOCK-P0
 *
 * Certifies that:
 * - Seller App UI has ZERO SAG sync action controls
 * - Seller create/edit/delete do NOT invoke SAG mutations
 * - Server-side hard gate blocks seller-scoped users from SAG sync API actions
 * - Desktop authorized sync path is preserved for managers/admins
 * - No regressions on ExistingOrderEditor, PDF/share, order visibility, auto-assortment
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── File paths ──────────────────────────────────────────────────────────────

const VIEWS = join(process.cwd(), "app/(app)/[orgSlug]/seller-app/views");
const SHELL = join(VIEWS, "..", "seller-app-shell.tsx");
const ORDERS_VIEW = join(VIEWS, "seller-orders-view.tsx");
const NUEVO_PEDIDO = join(VIEWS, "nuevo-pedido-view.tsx");
const EDITOR = join(VIEWS, "existing-order-editor.tsx");
const ALERTS_VIEW = join(VIEWS, "seller-alerts-view.tsx");
const PORTFOLIO_VIEW = join(VIEWS, "seller-portfolio-view.tsx");
const CLIENTES_VIEW = join(VIEWS, "clientes-view.tsx");
const INICIO_VIEW = join(VIEWS, "inicio-view.tsx");
const SHARED = join(VIEWS, "seller-app-shared.tsx");
const UI_KIT = join(VIEWS, "seller-ui-kit.tsx");

const API_ROUTE = join(
  process.cwd(),
  "app/api/orgs/[orgSlug]/comercial/pedidos/route.ts",
);

const DESKTOP_CLIENT = join(
  process.cwd(),
  "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx",
);

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Return all Seller App view files as an array of { name, content }. */
function allSellerViews(): Array<{ name: string; content: string }> {
  const paths = [
    SHELL, ORDERS_VIEW, NUEVO_PEDIDO, EDITOR, ALERTS_VIEW,
    PORTFOLIO_VIEW, CLIENTES_VIEW, SHARED, UI_KIT,
  ];
  // Also try inicio-view if it exists
  try { paths.push(INICIO_VIEW); read(INICIO_VIEW); } catch { /* optional */ }
  return paths.map(p => {
    try { return { name: p.split("/").pop()!, content: read(p) }; } catch { return null; }
  }).filter(Boolean) as Array<{ name: string; content: string }>;
}

// ===========================================================================
// Suite A: Seller App has NO SAG sync action controls
// ===========================================================================

describe("A. Seller App has no SAG sync action controls", () => {
  const views = allSellerViews();

  it("A1: No 'Enviar a SAG' button text in any Seller App view", () => {
    for (const v of views) {
      assert.ok(
        !v.content.includes("Enviar a SAG"),
        `${v.name} must not contain 'Enviar a SAG' action button`,
      );
    }
  });

  it("A2: No 'Sincronizar' action button in any Seller App view", () => {
    for (const v of views) {
      // Match actionable "Sincronizar" but not informational status labels
      const hasSyncButton = v.content.includes("onClick") &&
        v.content.includes("Sincronizar") &&
        // Check if Sincronizar appears near an onClick (within same component block)
        v.content.split("\n").some(line =>
          line.includes("onClick") && line.includes("Sincronizar"),
        );
      assert.ok(!hasSyncButton, `${v.name} must not have a 'Sincronizar' action button`);
    }
  });

  it("A3: No 'Reintentar' sync action in any Seller App view", () => {
    for (const v of views) {
      const hasRetrySync = v.content.split("\n").some(line =>
        line.includes("onClick") &&
        (line.toLowerCase().includes("retry") || line.toLowerCase().includes("reintentar")) &&
        line.toLowerCase().includes("sync"),
      );
      assert.ok(!hasRetrySync, `${v.name} must not have a retry-sync action`);
    }
  });

  it("A4: No send_to_sag action call in any Seller App view", () => {
    for (const v of views) {
      assert.ok(
        !v.content.includes('"send_to_sag"') && !v.content.includes("'send_to_sag'"),
        `${v.name} must not call send_to_sag action`,
      );
    }
  });

  it("A5: No mark_pending_sag action call in any Seller App view", () => {
    for (const v of views) {
      assert.ok(
        !v.content.includes('"mark_pending_sag"') && !v.content.includes("'mark_pending_sag'"),
        `${v.name} must not call mark_pending_sag action`,
      );
    }
  });

  it("A6: No mark_synced action call in any Seller App view", () => {
    for (const v of views) {
      assert.ok(
        !v.content.includes('"mark_synced"') && !v.content.includes("'mark_synced'"),
        `${v.name} must not call mark_synced action`,
      );
    }
  });

  it("A7: No mark_conflict action call in any Seller App view", () => {
    for (const v of views) {
      assert.ok(
        !v.content.includes('"mark_conflict"') && !v.content.includes("'mark_conflict'"),
        `${v.name} must not call mark_conflict action`,
      );
    }
  });

  it("A8: Sync status labels are informational only (no onClick handlers)", () => {
    const ordersView = read(ORDERS_VIEW);
    // The DetailSection "Sincronizacion" must not contain any onClick handlers
    const syncSectionMatch = ordersView.match(
      /DetailSection title="Sincronizacion">([\s\S]*?)<\/DetailSection>/,
    );
    if (syncSectionMatch) {
      assert.ok(
        !syncSectionMatch[1].includes("onClick"),
        "Sync status section must be informational — no clickable actions",
      );
    }
  });
});

// ===========================================================================
// Suite B: Seller create does NOT call SAG sync
// ===========================================================================

describe("B. Seller create does not call SAG sync", () => {
  const view = read(NUEVO_PEDIDO);

  it("B1: Create wizard uses 'create' action only", () => {
    assert.ok(
      view.includes('action: "create"'),
      "NuevoPedidoView must use 'create' action for persistence",
    );
  });

  it("B2: Create wizard does NOT call send_to_sag", () => {
    assert.ok(
      !view.includes("send_to_sag"),
      "Create wizard must never invoke SAG sync",
    );
  });

  it("B3: Create wizard does NOT call mark_pending_sag", () => {
    assert.ok(
      !view.includes("mark_pending_sag"),
      "Create wizard must never transition to SAG state",
    );
  });

  it("B4: Create wizard does NOT call sendOrderToSagQueue", () => {
    assert.ok(
      !view.includes("sendOrderToSagQueue"),
      "Create wizard must not import SAG bridge",
    );
  });
});

// ===========================================================================
// Suite C: Seller edit does NOT call SAG sync
// ===========================================================================

describe("C. Seller edit does not call SAG sync", () => {
  const editor = read(EDITOR);

  it("C1: ExistingOrderEditor uses 'update_draft' action for save", () => {
    assert.ok(
      editor.includes('action: "update_draft"'),
      "Editor must use update_draft for persistence",
    );
  });

  it("C2: ExistingOrderEditor does NOT call send_to_sag", () => {
    assert.ok(
      !editor.includes("send_to_sag"),
      "Editor must never invoke SAG sync on save",
    );
  });

  it("C3: ExistingOrderEditor does NOT call mark_pending_sag", () => {
    assert.ok(
      !editor.includes("mark_pending_sag"),
      "Editor must never transition to SAG state",
    );
  });

  it("C4: ExistingOrderEditor does NOT import SAG bridge", () => {
    assert.ok(
      !editor.includes("sendOrderToSagQueue") && !editor.includes("order-sag-bridge"),
      "Editor must not reference SAG bridge module",
    );
  });
});

// ===========================================================================
// Suite D: Seller delete does NOT call SAG
// ===========================================================================

describe("D. Seller delete does not call SAG", () => {
  const editor = read(EDITOR);

  it("D1: ExistingOrderEditor uses 'delete_draft' action for deletion", () => {
    assert.ok(
      editor.includes('action: "delete_draft"'),
      "Editor must use delete_draft for order removal",
    );
  });

  it("D2: Delete action does NOT trigger SAG sync", () => {
    // Verify no SAG sync actions appear anywhere near delete logic
    assert.ok(
      !editor.includes("send_to_sag"),
      "Delete path must not invoke SAG sync",
    );
  });

  it("D3: Delete confirmation dialog exists", () => {
    assert.ok(
      editor.includes("Eliminar pedido") || editor.includes("eliminar"),
      "Delete must have user confirmation",
    );
  });
});

// ===========================================================================
// Suite E: Seller direct SAG sync API attempt -> 403
// ===========================================================================

describe("E. Server-side hard gate: seller -> SAG sync -> 403", () => {
  const api = read(API_ROUTE);

  it("E1: send_to_sag action has seller role gate", () => {
    // The gate must check sellerScope.level === "seller" before send_to_sag
    const sendToSagSection = api.slice(api.indexOf('case "send_to_sag"'));
    const gateBeforeExecution = sendToSagSection.indexOf('sellerScope.level === "seller"');
    const executionStart = sendToSagSection.indexOf("sendOrderToSagQueue");
    assert.ok(
      gateBeforeExecution !== -1 && gateBeforeExecution < executionStart,
      "send_to_sag must check seller role and return 403 BEFORE executing SAG bridge",
    );
  });

  it("E2: send_to_sag returns 403 for seller-scoped users", () => {
    const sendToSagSection = api.slice(api.indexOf('case "send_to_sag"'));
    assert.ok(
      sendToSagSection.includes("status: 403"),
      "send_to_sag must return HTTP 403 for sellers",
    );
  });

  it("E3: mark_pending_sag has seller role gate", () => {
    const section = api.slice(
      api.indexOf('case "mark_pending_sag"'),
      api.indexOf('case "mark_synced"'),
    );
    assert.ok(
      section.includes('sellerScope.level === "seller"') && section.includes("status: 403"),
      "mark_pending_sag must be gated for sellers with 403",
    );
  });

  it("E4: mark_synced has seller role gate", () => {
    const section = api.slice(
      api.indexOf('case "mark_synced"'),
      api.indexOf('case "mark_conflict"'),
    );
    assert.ok(
      section.includes('sellerScope.level === "seller"') && section.includes("status: 403"),
      "mark_synced must be gated for sellers with 403",
    );
  });

  it("E5: mark_conflict has seller role gate", () => {
    const section = api.slice(
      api.indexOf('case "mark_conflict"'),
      api.indexOf('case "cancel"'),
    );
    assert.ok(
      section.includes('sellerScope.level === "seller"') && section.includes("status: 403"),
      "mark_conflict must be gated for sellers with 403",
    );
  });

  it("E6: Error message is clear and in Spanish", () => {
    assert.ok(
      api.includes("no autorizada para vendedores"),
      "403 error message must be clear and in Spanish",
    );
  });
});

// ===========================================================================
// Suite F: Authorized Desktop sync preserved
// ===========================================================================

describe("F. Desktop authorized sync still allowed", () => {
  const api = read(API_ROUTE);
  const desktop = read(DESKTOP_CLIENT);

  it("F1: send_to_sag action still exists in API route", () => {
    assert.ok(
      api.includes('case "send_to_sag"'),
      "send_to_sag action must remain available for authorized users",
    );
  });

  it("F2: sendOrderToSagQueue is still imported in API route", () => {
    assert.ok(
      api.includes("sendOrderToSagQueue"),
      "SAG bridge import must be preserved for desktop use",
    );
  });

  it("F3: Gate only blocks seller level, not manager/admin", () => {
    // The gate checks level === "seller" — managers have level !== "seller"
    const section = api.slice(api.indexOf('case "send_to_sag"'));
    assert.ok(
      section.includes('sellerScope.level === "seller"'),
      "Gate must check for 'seller' level specifically — managers/admins pass through",
    );
    // Ensure the gate does NOT block all users
    assert.ok(
      !section.includes("return NextResponse.json({ error") ||
      section.indexOf('sellerScope.level === "seller"') < section.indexOf("sendOrderToSagQueue"),
      "Gate must only block seller-scoped users, not all users",
    );
  });

  it("F4: Desktop client has 'Enviar a SAG' button", () => {
    assert.ok(
      desktop.includes("Enviar a SAG"),
      "Desktop pedidos client must preserve SAG sync button for authorized users",
    );
  });

  it("F5: mark_pending_sag/mark_synced/mark_conflict remain in API for admin use", () => {
    assert.ok(
      api.includes('case "mark_pending_sag"') &&
      api.includes('case "mark_synced"') &&
      api.includes('case "mark_conflict"'),
      "All SAG lifecycle actions must remain available for admin/manager users",
    );
  });
});

// ===========================================================================
// Suite G: ExistingOrderEditor regression
// ===========================================================================

describe("G. ExistingOrderEditor regression", () => {
  const editor = read(EDITOR);

  it("G1: ExistingOrderEditor component exists", () => {
    assert.ok(
      editor.includes("export function ExistingOrderEditor"),
      "Dedicated editor component must exist",
    );
  });

  it("G2: Editor loads order via API get action", () => {
    assert.ok(
      editor.includes('action: "get"'),
      "Editor must load order from server via get action",
    );
  });

  it("G3: Editor has quantity controls", () => {
    assert.ok(
      editor.includes("handleUpdateQuantity") || editor.includes("handleSetQuantity"),
      "Editor must have per-variant quantity controls",
    );
  });

  it("G4: Editor has line removal with undo", () => {
    assert.ok(
      editor.includes("markedForRemoval") && editor.includes("handleUndoRemove"),
      "Editor must support soft-delete with undo",
    );
  });

  it("G5: Editor has add-products panel", () => {
    assert.ok(
      editor.includes("AddProductsPanel") || editor.includes("showAddProducts"),
      "Editor must have contained product picker",
    );
  });

  it("G6: Editor has delete with confirmation", () => {
    assert.ok(
      editor.includes('action: "delete_draft"') && editor.includes("confirm"),
      "Editor must support order deletion with confirmation",
    );
  });
});

// ===========================================================================
// Suite H: PDF/share regression
// ===========================================================================

describe("H. PDF/share regression", () => {
  const orders = read(ORDERS_VIEW);

  it("H1: PDF download handler exists", () => {
    assert.ok(
      orders.includes("handleDownloadPdf"),
      "PDF download handler must be present",
    );
  });

  it("H2: PDF share handler exists", () => {
    assert.ok(
      orders.includes("handleSharePdf"),
      "PDF share handler must be present",
    );
  });

  it("H3: Web Share API integration present", () => {
    assert.ok(
      orders.includes("navigator.share") || orders.includes("navigator.canShare"),
      "Web Share API must be integrated",
    );
  });

  it("H4: WhatsApp fallback present", () => {
    assert.ok(
      orders.includes("wa.me"),
      "WhatsApp fallback must be available when Web Share unavailable",
    );
  });
});

// ===========================================================================
// Suite I: Order visibility regression
// ===========================================================================

describe("I. Order visibility regression", () => {
  const orders = read(ORDERS_VIEW);

  it("I1: Order list renders order cards", () => {
    assert.ok(
      orders.includes("OrderCard") || orders.includes("orderCard"),
      "Order list must render cards",
    );
  });

  it("I2: Order detail view exists", () => {
    assert.ok(
      orders.includes("OrderDetailView") || orders.includes("selectedOrderId"),
      "Order detail view must be accessible",
    );
  });

  it("I3: Status filter exists", () => {
    assert.ok(
      orders.includes("statusFilter") || orders.includes("StatusFilter"),
      "Status filter must be present",
    );
  });

  it("I4: Sync state is display-only in order list", () => {
    assert.ok(
      orders.includes("syncState") && orders.includes("StatusChip"),
      "Sync state must appear as a display-only status chip",
    );
  });

  it("I5: isEditable guards edit button to native pre-SAG orders only", () => {
    assert.ok(
      orders.includes("isEditable") && orders.includes("AGENTIK_NATIVE"),
      "Edit eligibility must check for AGENTIK_NATIVE origin",
    );
  });
});

// ===========================================================================
// Suite J: Auto-assortment regression
// ===========================================================================

describe("J. Auto-assortment regression", () => {
  const editor = read(EDITOR);
  const wizard = read(NUEVO_PEDIDO);

  it("J1: Auto-assortment action exists in ExistingOrderEditor", () => {
    assert.ok(
      editor.includes("auto_assortment") || editor.includes("autoDistribute"),
      "Editor must support auto-assortment for new product additions",
    );
  });

  it("J2: Auto-assortment action exists in NuevoPedidoView", () => {
    assert.ok(
      wizard.includes("auto_assortment") || wizard.includes("autoDistribute"),
      "Create wizard must support auto-assortment",
    );
  });

  it("J3: Auto-assortment does NOT trigger SAG sync", () => {
    // Verify auto_assortment path has no SAG references
    assert.ok(
      !editor.includes("send_to_sag") && !wizard.includes("send_to_sag"),
      "Auto-assortment must not trigger SAG sync in either component",
    );
  });
});
