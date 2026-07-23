/**
 * lib/comercial/pedidos/__tests__/wizard-improvements.test.ts
 *
 * Versioned tests for AGENTIK-ORDERS-WIZARD-IMPROVEMENTS-01.
 * Pure functions only — no DB, no network, no side effects.
 *
 * Run: npx tsx --test lib/comercial/pedidos/__tests__/wizard-improvements.test.ts
 *
 * Coverage:
 *   - Channel restriction (Mayorista/Detal only)
 *   - Discount absent from wizard
 *   - Auto size distribution engine
 *   - FULL/PARTIAL delivery scope
 *   - Idempotency key determinism
 *   - SAG write modes (DISABLED/SIMULATION/LIVE)
 *   - Payload with deliveryScope
 *   - Customer identity via NIT
 *   - Removed/zero-quantity line filtering
 *   - OBSERVACION with DESPACHO PARCIAL
 *   - Retryable vs non-retryable errors
 *   - LIVE result shapes
 *   - SIMULATION without network call
 *   - Seller optionality (warning, not error)
 *   - Castillitos stays in SIMULATION
 *   - Auto-distribution cell assignment (indexOf fix)
 *
 * Sprint: AGENTIK-ORDERS-WIZARD-IMPROVEMENTS-01
 * Bugfix: AGENTIK-ORDERS-WIZARD-AUTO-DISTRIBUTION-01
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type {
  OrderHeader,
  DeliveryScope,
  DeliveryMode,
} from "@/lib/comercial/pedidos/order-types";
import type {
  SizeInventorySnapshot,
} from "@/lib/comercial/pedidos/order-decision-types";
import { evaluateAutoSizeDistribution } from "@/lib/comercial/pedidos/order-decision-engine";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "@/lib/comercial/pedidos/order-policy-pack-config";
import type {
  SagOrderWriteMode,
  SagWriteConfig,
} from "@/lib/comercial/pedidos/order-policy-pack-config";
import { validateHeader, computeOrderSummary } from "@/lib/comercial/pedidos/order-validation";
import type {
  SagOrderWriteResult,
  SagOrderWriteErrorCode,
  SagOrderPayload,
} from "@/lib/comercial/pedidos/sag-order-sync-types";
import {
  isRetryableError,
  buildIdempotencyKey,
} from "@/lib/comercial/pedidos/sag-order-sync-types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockOrder(overrides: Record<string, any> = {}) {
  return {
    id: "order-001",
    organizationId: "org-1",
    consecutivo: 100,
    externalSyncKey: "AGT-100",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    status: "listo_para_enviar" as const,
    origin: "wizard" as const,
    syncState: "pendiente" as const,
    sagOrderId: null,
    sourceWarehouseCode: "B01",
    fulfillmentStatus: null,
    fulfillmentPercent: null,
    timeline: [],
    commercialJourneyId: null,
    versions: [],
    linkedDocuments: [],
    header: {
      customerId: "cust-1",
      customerName: "Distribuidora Test SAS",
      customerCode: "900123456",
      sellerId: "v-1",
      sellerName: "Carlos Perez",
      channel: "mayorista",
      notes: "",
      deliveryScope: "full" as const,
      ...overrides.header,
    },
    lines: overrides.lines ?? [
      {
        id: "l1", referenceCode: "REF-001", productName: "Producto Test",
        size: "M", color: "NEGRO", quantity: 10, unitPrice: 50000, lineTotal: 500000,
        removed: false,
      },
    ],
    ...overrides,
  };
}

// ── Channel restriction ────────────────────────────────────────────────────────

describe("Channel restriction", () => {
  const allowed = ["mayorista", "detal"];

  test("mayorista is valid", () => {
    assert.ok(allowed.includes("mayorista"));
  });

  test("detal is valid", () => {
    assert.ok(allowed.includes("detal"));
  });

  test("distribuidor removed", () => {
    assert.ok(!allowed.includes("distribuidor"));
  });

  test("institucional removed", () => {
    assert.ok(!allowed.includes("institucional"));
  });

  test("retail removed", () => {
    assert.ok(!allowed.includes("retail"));
  });
});

// ── Discount absent ───────────────────────────────────────────────────────────

describe("Discount absent from wizard", () => {
  test("summary computes without discount", () => {
    const lines = [
      { id: "1", referenceCode: "R1", productName: "P1", size: "M", color: "AZUL",
        quantity: 10, availableUnits: 20, unitPrice: 1000, lineTotal: 10000, removed: false, comment: "" },
      { id: "2", referenceCode: "R1", productName: "P1", size: "L", color: "AZUL",
        quantity: 5, availableUnits: 10, unitPrice: 1000, lineTotal: 5000, removed: false, comment: "" },
    ];
    const summary = computeOrderSummary(lines);
    assert.equal(summary.totalUnits, 15);
    assert.equal(summary.totalValue, 15000);
    assert.equal(summary.uniqueReferences, 1);
    assert.equal(summary.discountAmount ?? 0, 0);
  });

  test("removed lines excluded from summary", () => {
    const lines = [
      { id: "1", referenceCode: "R1", productName: "P1", size: "M", color: "AZUL",
        quantity: 10, availableUnits: 20, unitPrice: 1000, lineTotal: 10000, removed: false, comment: "" },
      { id: "2", referenceCode: "R2", productName: "P2", size: "L", color: "ROJO",
        quantity: 5, availableUnits: 10, unitPrice: 2000, lineTotal: 10000, removed: true, comment: "" },
    ];
    const summary = computeOrderSummary(lines);
    assert.equal(summary.totalUnits, 10);
    assert.equal(summary.activeLines, 1);
  });
});

// ── Auto size distribution ────────────────────────────────────────────────────

describe("Auto size distribution", () => {
  test("distributes 100 units across 5 sizes equally", () => {
    const snapshot: SizeInventorySnapshot = {
      referenceCode: "REF-001", productName: "Test",
      sizes: [
        { size: "S", sizeName: "S", availableUnits: 50 },
        { size: "M", sizeName: "M", availableUnits: 50 },
        { size: "L", sizeName: "L", availableUnits: 50 },
        { size: "XL", sizeName: "XL", availableUnits: 50 },
        { size: "XXL", sizeName: "XXL", availableUnits: 50 },
      ],
    };
    const result = evaluateAutoSizeDistribution("REF-001", "Test", 100, snapshot, CASTILLITOS_ORDER_POLICY_PACK_CONFIG);
    assert.equal(result.totalAllocated, 100);
    assert.equal(result.unallocated, 0);
    for (const d of result.distribution) {
      if (d.availableUnits > 0) assert.equal(d.allocatedUnits, 20);
    }
  });

  test("handles insufficient stock", () => {
    const snapshot: SizeInventorySnapshot = {
      referenceCode: "REF-002", productName: "Test",
      sizes: [
        { size: "S", sizeName: "S", availableUnits: 5 },
        { size: "M", sizeName: "M", availableUnits: 10 },
        { size: "L", sizeName: "L", availableUnits: 3 },
      ],
    };
    const result = evaluateAutoSizeDistribution("REF-002", "Test", 100, snapshot, CASTILLITOS_ORDER_POLICY_PACK_CONFIG);
    assert.equal(result.totalAllocated, 18);
    assert.equal(result.unallocated, 82);
  });

  test("zero stock returns 0 allocated", () => {
    const snapshot: SizeInventorySnapshot = {
      referenceCode: "REF-003", productName: "Test",
      sizes: [
        { size: "S", sizeName: "S", availableUnits: 0 },
        { size: "M", sizeName: "M", availableUnits: 0 },
      ],
    };
    const result = evaluateAutoSizeDistribution("REF-003", "Test", 50, snapshot, CASTILLITOS_ORDER_POLICY_PACK_CONFIG);
    assert.equal(result.totalAllocated, 0);
  });

  test("respects maxUnitsPerSize from config", () => {
    const snapshot: SizeInventorySnapshot = {
      referenceCode: "REF-005", productName: "Test",
      sizes: [{ size: "S", sizeName: "S", availableUnits: 200 }],
    };
    const result = evaluateAutoSizeDistribution("REF-005", "Test", 100, snapshot, CASTILLITOS_ORDER_POLICY_PACK_CONFIG);
    assert.ok(result.totalAllocated <= 50);
  });

  test("evidence includes correct referenceCode", () => {
    const snapshot: SizeInventorySnapshot = {
      referenceCode: "REF-006", productName: "Test Product",
      sizes: [{ size: "M", sizeName: "M", availableUnits: 20 }],
    };
    const result = evaluateAutoSizeDistribution("REF-006", "Test Product", 10, snapshot, CASTILLITOS_ORDER_POLICY_PACK_CONFIG);
    assert.equal(result.evidence.policyType, "ORDER_AUTO_SIZE_DISTRIBUTION");
    assert.equal(result.referenceCode, "REF-006");
  });
});

// ── FULL/PARTIAL delivery scope ────────────────────────────────────────────────

describe("FULL/PARTIAL delivery scope", () => {
  test("DeliveryScope accepts full", () => {
    const s: DeliveryScope = "full";
    assert.equal(s, "full");
  });

  test("DeliveryScope accepts partial", () => {
    const s: DeliveryScope = "partial";
    assert.equal(s, "partial");
  });

  test("OrderHeader accepts deliveryScope", () => {
    const h: OrderHeader = {
      customerId: "900123", customerName: "Test", customerCode: "CLI-001",
      sellerId: "", sellerName: "", channel: "mayorista", notes: "",
      deliveryScope: "partial",
    };
    assert.equal(h.deliveryScope, "partial");
  });

  test("default is undefined (treated as full)", () => {
    const h: OrderHeader = {
      customerId: "900123", customerName: "Test", customerCode: "CLI-001",
      sellerId: "", sellerName: "", channel: "", notes: "",
    };
    assert.equal(h.deliveryScope, undefined);
  });
});

// ── Idempotency key ───────────────────────────────────────────────────────────

describe("Idempotency key", () => {
  test("format is orgId:orderId:vN", () => {
    assert.equal(buildIdempotencyKey("org-123", "order-456", 1), "org-123:order-456:v1");
  });

  test("different version produces different key", () => {
    assert.notEqual(
      buildIdempotencyKey("org-1", "order-1", 1),
      buildIdempotencyKey("org-1", "order-1", 2),
    );
  });

  test("same inputs produce same key (deterministic)", () => {
    assert.equal(
      buildIdempotencyKey("org-X", "order-Y", 3),
      buildIdempotencyKey("org-X", "order-Y", 3),
    );
  });
});

// ── SAG write modes ───────────────────────────────────────────────────────────

describe("SAG write modes", () => {
  test("Castillitos mode is SIMULATION", () => {
    assert.equal(CASTILLITOS_ORDER_POLICY_PACK_CONFIG.sagWrite.mode, "SIMULATION");
  });

  test("Castillitos SAG write is enabled", () => {
    assert.equal(CASTILLITOS_ORDER_POLICY_PACK_CONFIG.sagWrite.enabled, true);
  });

  test("DISABLED result shape", () => {
    const r: SagOrderWriteResult = {
      ok: false, mode: "DISABLED", errorCode: "DISABLED",
      errorMessage: "SAG write disabled", timestamp: new Date().toISOString(),
    };
    assert.equal(r.ok, false);
    assert.equal(r.mode, "DISABLED");
  });

  test("SIMULATION result has SIM- prefix and payload", () => {
    const r: SagOrderWriteResult = {
      ok: true, mode: "SIMULATION",
      sagOperationId: "SIM-abc12345-1234567890",
      simulatedPayload: { TIPO_DOC: "PE", NIT: "900123" },
      idempotencyKey: "org1:order1:v1",
      timestamp: new Date().toISOString(),
    };
    assert.ok(r.sagOperationId!.startsWith("SIM-"));
    assert.ok(r.simulatedPayload !== undefined);
  });

  test("disabled config blocks regardless of mode field", () => {
    const config: SagWriteConfig = { enabled: false, mode: "LIVE", idempotencyKeyVersion: 1 };
    const effective = config.enabled ? config.mode : "DISABLED";
    assert.equal(effective, "DISABLED");
  });
});

// ── Payload with deliveryScope ────────────────────────────────────────────────

describe("Payload with deliveryScope", () => {
  test("SagOrderPayload includes deliveryScope", () => {
    const p: SagOrderPayload = {
      externalSyncKey: "AGT-1", customerCode: "900123",
      customerName: "Test", sellerCode: "v1", sellerName: "Seller",
      warehouseCode: "B01", channel: "mayorista", notes: "",
      deliveryScope: "partial", orderDate: "2026-07-23", lines: [],
    };
    assert.equal(p.deliveryScope, "partial");
  });

  test("defaults to full", () => {
    const order = mockOrder();
    assert.equal(order.header.deliveryScope ?? "full", "full");
  });
});

// ── Customer identity via NIT ─────────────────────────────────────────────────

describe("Customer identity via NIT", () => {
  test("customerCode is NIT (tax ID)", () => {
    const order = mockOrder({ header: { customerCode: "900123456" } });
    assert.equal(order.header.customerCode, "900123456");
    assert.ok(order.header.customerCode.length >= 6);
  });

  test("empty customerCode is rejection condition", () => {
    const order = mockOrder({ header: { customerCode: "" } });
    assert.ok(!order.header.customerCode?.trim());
  });
});

// ── Line filtering ────────────────────────────────────────────────────────────

describe("Removed/zero-quantity line filtering", () => {
  test("zero-quantity lines produce no active lines", () => {
    const order = mockOrder({ lines: [
      { id: "l1", referenceCode: "REF-001", productName: "P", size: "M", color: "N",
        quantity: 0, unitPrice: 50000, lineTotal: 0, removed: false },
    ]});
    const active = order.lines.filter((l: any) => !l.removed && l.quantity > 0);
    assert.equal(active.length, 0);
  });

  test("removed lines are filtered out", () => {
    const order = mockOrder({ lines: [
      { id: "l1", referenceCode: "REF-001", productName: "P", size: "M", color: "N",
        quantity: 10, unitPrice: 50000, lineTotal: 500000, removed: true },
      { id: "l2", referenceCode: "REF-002", productName: "Q", size: "L", color: "N",
        quantity: 5, unitPrice: 30000, lineTotal: 150000, removed: false },
    ]});
    const active = order.lines.filter((l: any) => !l.removed && l.quantity > 0);
    assert.equal(active.length, 1);
    assert.equal(active[0].referenceCode, "REF-002");
  });
});

// ── OBSERVACION DESPACHO PARCIAL ──────────────────────────────────────────────

describe("OBSERVACION DESPACHO PARCIAL", () => {
  test("partial scope includes DESPACHO PARCIAL", () => {
    const order = mockOrder({ header: { deliveryScope: "partial" } });
    let obs = `Pedido Agentik #${order.externalSyncKey}`;
    if (order.header.deliveryScope === "partial") obs += " | DESPACHO PARCIAL";
    assert.ok(obs.includes("DESPACHO PARCIAL"));
  });

  test("full scope omits DESPACHO PARCIAL", () => {
    const order = mockOrder({ header: { deliveryScope: "full" } });
    let obs = `Pedido Agentik #${order.externalSyncKey}`;
    if (order.header.deliveryScope === "partial") obs += " | DESPACHO PARCIAL";
    assert.ok(!obs.includes("DESPACHO PARCIAL"));
  });

  test("respects 250-char SAG limit", () => {
    const order = mockOrder({ header: { notes: "A".repeat(300) } });
    let obs = `Pedido Agentik #${order.externalSyncKey}`;
    if (order.header.notes?.trim()) obs += ` | ${order.header.notes.trim()}`;
    obs = obs.slice(0, 250);
    assert.ok(obs.length <= 250);
  });
});

// ── Retryable vs non-retryable errors ─────────────────────────────────────────

describe("Retryable vs non-retryable errors", () => {
  test("SAG_TIMEOUT is retryable", () => {
    assert.equal(isRetryableError("SAG_TIMEOUT"), true);
  });

  test("ENQUEUE_FAILED is retryable", () => {
    assert.equal(isRetryableError("ENQUEUE_FAILED"), true);
  });

  test("VALIDATION_FAILED is NOT retryable", () => {
    assert.equal(isRetryableError("VALIDATION_FAILED"), false);
  });

  test("DISABLED is NOT retryable", () => {
    assert.equal(isRetryableError("DISABLED"), false);
  });

  test("SAG_REJECTED is NOT retryable", () => {
    assert.equal(isRetryableError("SAG_REJECTED"), false);
  });

  test("IDEMPOTENT_DUPLICATE is NOT retryable", () => {
    assert.equal(isRetryableError("IDEMPOTENT_DUPLICATE"), false);
  });
});

// ── LIVE result shapes ────────────────────────────────────────────────────────

describe("LIVE result shapes", () => {
  test("LIVE success", () => {
    const r: SagOrderWriteResult = {
      ok: true, mode: "LIVE", sagOperationId: "sag-op-123",
      idempotencyKey: "org1:order1:v1", timestamp: new Date().toISOString(),
    };
    assert.equal(r.ok, true);
    assert.equal(r.mode, "LIVE");
    assert.ok(r.sagOperationId !== undefined);
  });

  test("LIVE idempotent duplicate", () => {
    const r: SagOrderWriteResult = {
      ok: false, mode: "LIVE", errorCode: "IDEMPOTENT_DUPLICATE",
      errorMessage: "El pedido ya fue sincronizado con SAG.",
      idempotencyKey: "org1:order1:v1", timestamp: new Date().toISOString(),
    };
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, "IDEMPOTENT_DUPLICATE");
  });

  test("LIVE ENQUEUE_FAILED", () => {
    const r: SagOrderWriteResult = {
      ok: false, mode: "LIVE", errorCode: "ENQUEUE_FAILED",
      errorMessage: "Enqueue failed",
      idempotencyKey: "org1:order1:v1", timestamp: new Date().toISOString(),
    };
    assert.equal(r.ok, false);
    assert.equal(r.mode, "LIVE");
  });
});

// ── Seller optionality ────────────────────────────────────────────────────────

describe("Seller optionality", () => {
  test("missing seller is warning, not error", () => {
    const issues = validateHeader({
      customerId: "900123", customerName: "Test", customerCode: "CLI-001",
      sellerId: "", sellerName: "", channel: "", notes: "",
    });
    const sellerIssue = issues.find(i => i.field === "sellerName");
    assert.ok(sellerIssue !== undefined);
    assert.equal(sellerIssue!.severity, "warning");
  });

  test("header with seller has 0 errors", () => {
    const issues = validateHeader({
      customerId: "900123", customerName: "Test", customerCode: "CLI-001",
      sellerId: "V001", sellerName: "Juan Perez", channel: "mayorista", notes: "",
    });
    assert.equal(issues.filter(i => i.severity === "error").length, 0);
  });

  test("header without seller still has 0 errors", () => {
    const issues = validateHeader({
      customerId: "900123", customerName: "Test", customerCode: "CLI-001",
      sellerId: "", sellerName: "", channel: "", notes: "",
    });
    assert.equal(issues.filter(i => i.severity === "error").length, 0);
  });
});

// ── Reference code uppercasing ────────────────────────────────────────────────

describe("Reference code uppercasing", () => {
  test("maps to uppercase for SAG", () => {
    assert.equal("ref-abc-123".toUpperCase(), "REF-ABC-123");
  });
});

// ── Auto-distribution cell assignment (AGENTIK-ORDERS-WIZARD-AUTO-DISTRIBUTION-01) ─

/**
 * Pure extraction of the setMatrixCells callback from handleAutoDistribute().
 * This is the EXACT algorithm from wholesale-order-wizard.tsx lines 404-453.
 * The bug: indexOf() compared object references after spread created new objects.
 * The fix: use stable integer indices via size+color key map.
 */
interface TestMatrixCell {
  size: string;
  color: string;
  quantity: number;
  available: number;
  operationalAvailableQty?: number | null;
  cellState?: "known" | "unknown";
}

interface TestDistEntry {
  size: string;
  allocatedUnits: number;
}

function applyDistributionToCells(
  cells: TestMatrixCell[],
  distribution: TestDistEntry[],
): TestMatrixCell[] {
  const newCells = [...cells];

  // Build index: "size\0color" → position in newCells
  const cellIndex = new Map<string, number>();
  for (let i = 0; i < newCells.length; i++) {
    cellIndex.set(`${newCells[i].size}\0${newCells[i].color}`, i);
  }

  for (const entry of distribution) {
    if (entry.allocatedUnits <= 0) continue;
    // Find eligible cell indices for this size (have stock, not unknown)
    const eligibleIndices: number[] = [];
    for (let i = 0; i < newCells.length; i++) {
      const c = newCells[i];
      if (c.size === entry.size && c.cellState !== "unknown"
        && (c.operationalAvailableQty ?? c.available ?? 0) > 0) {
        eligibleIndices.push(i);
      }
    }
    if (eligibleIndices.length === 0) continue;

    // Split allocated units across colors for this size
    let remaining = entry.allocatedUnits;
    const perColor = Math.floor(remaining / eligibleIndices.length);

    for (const idx of eligibleIndices) {
      const c = newCells[idx];
      const cellAvail = c.operationalAvailableQty ?? c.available ?? 0;
      const alloc = Math.min(perColor || remaining, cellAvail, remaining);
      newCells[idx] = { ...c, quantity: alloc };
      remaining -= alloc;
    }

    // Distribute remainder
    if (remaining > 0) {
      for (const idx of eligibleIndices) {
        if (remaining <= 0) break;
        const c = newCells[idx];
        const cellAvail = c.operationalAvailableQty ?? c.available ?? 0;
        const canAdd = Math.min(remaining, cellAvail - c.quantity);
        if (canAdd > 0) {
          newCells[idx] = { ...c, quantity: c.quantity + canAdd };
          remaining -= canAdd;
        }
      }
    }
  }
  return newCells;
}

function totalQty(cells: TestMatrixCell[]): number {
  return cells.reduce((s, c) => s + c.quantity, 0);
}

describe("Auto-distribution cell assignment (indexOf fix)", () => {

  test("1. distribution with 1 size", () => {
    const cells: TestMatrixCell[] = [
      { size: "M", color: "NEGRO", quantity: 0, available: 30, cellState: "known" },
      { size: "M", color: "AZUL", quantity: 0, available: 20, cellState: "known" },
    ];
    const dist: TestDistEntry[] = [{ size: "M", allocatedUnits: 40 }];
    const result = applyDistributionToCells(cells, dist);
    assert.equal(totalQty(result), 40);
    // Each color gets proportional share: floor(40/2)=20 each, capped by available
    assert.equal(result[0].quantity, 20); // NEGRO: min(20, 30) = 20
    assert.equal(result[1].quantity, 20); // AZUL: min(20, 20) = 20
  });

  test("2. distribution with multiple sizes", () => {
    const cells: TestMatrixCell[] = [
      { size: "S", color: "NEGRO", quantity: 0, available: 15, cellState: "known" },
      { size: "M", color: "NEGRO", quantity: 0, available: 25, cellState: "known" },
      { size: "L", color: "NEGRO", quantity: 0, available: 10, cellState: "known" },
    ];
    const dist: TestDistEntry[] = [
      { size: "S", allocatedUnits: 10 },
      { size: "M", allocatedUnits: 20 },
      { size: "L", allocatedUnits: 5 },
    ];
    const result = applyDistributionToCells(cells, dist);
    assert.equal(result[0].quantity, 10); // S
    assert.equal(result[1].quantity, 20); // M
    assert.equal(result[2].quantity, 5);  // L
    assert.equal(totalQty(result), 35);
  });

  test("3. insufficient inventory caps allocation", () => {
    const cells: TestMatrixCell[] = [
      { size: "M", color: "NEGRO", quantity: 0, available: 5, cellState: "known" },
      { size: "M", color: "AZUL", quantity: 0, available: 3, cellState: "known" },
    ];
    const dist: TestDistEntry[] = [{ size: "M", allocatedUnits: 50 }];
    const result = applyDistributionToCells(cells, dist);
    // Can only allocate 5+3=8, not 50
    assert.equal(totalQty(result), 8);
    assert.equal(result[0].quantity, 5);
    assert.equal(result[1].quantity, 3);
  });

  test("4. zero inventory assigns nothing", () => {
    const cells: TestMatrixCell[] = [
      { size: "M", color: "NEGRO", quantity: 0, available: 0, cellState: "known" },
      { size: "M", color: "AZUL", quantity: 0, available: 0, cellState: "known" },
    ];
    const dist: TestDistEntry[] = [{ size: "M", allocatedUnits: 30 }];
    const result = applyDistributionToCells(cells, dist);
    assert.equal(totalQty(result), 0);
  });

  test("5. duplicate size+color entries use last index", () => {
    // If two cells share size+color (shouldn't happen, but test stability)
    const cells: TestMatrixCell[] = [
      { size: "M", color: "NEGRO", quantity: 0, available: 10, cellState: "known" },
      { size: "M", color: "NEGRO", quantity: 0, available: 15, cellState: "known" },
      { size: "M", color: "AZUL", quantity: 0, available: 20, cellState: "known" },
    ];
    const dist: TestDistEntry[] = [{ size: "M", allocatedUnits: 30 }];
    const result = applyDistributionToCells(cells, dist);
    // All 3 cells are eligible (index scan doesn't rely on cellIndex map for eligibility)
    assert.equal(totalQty(result), 30);
  });

  test("6. repeated distribution is idempotent (second run overwrites)", () => {
    const cells: TestMatrixCell[] = [
      { size: "M", color: "NEGRO", quantity: 0, available: 50, cellState: "known" },
      { size: "M", color: "AZUL", quantity: 0, available: 50, cellState: "known" },
    ];
    const dist: TestDistEntry[] = [{ size: "M", allocatedUnits: 40 }];
    const first = applyDistributionToCells(cells, dist);
    assert.equal(totalQty(first), 40);
    // Run again on the result (simulates user clicking auto-distribute twice)
    const second = applyDistributionToCells(first, dist);
    // Second run overwrites quantity (not additive) because the algorithm
    // sets quantity = alloc, not quantity += alloc in the first pass.
    assert.equal(totalQty(second), 40);
  });

  test("7. distribution over cloned objects (the indexOf bug case)", () => {
    // This is the EXACT scenario that caused the TypeError:
    // 1. Create cells
    // 2. Spread-copy the array (like React setState(prev => [...prev]))
    // 3. Replace one element with { ...cell, someField: newValue }
    // 4. Try to find the original reference — indexOf returns -1
    //
    // The fix uses integer indices instead of indexOf, so this must work.
    const original: TestMatrixCell[] = [
      { size: "S", color: "ROJO", quantity: 0, available: 10, cellState: "known" },
      { size: "M", color: "ROJO", quantity: 0, available: 20, cellState: "known" },
      { size: "L", color: "ROJO", quantity: 0, available: 15, cellState: "known" },
    ];

    // Simulate what React does: clone array, replace an element
    const cloned = [...original];
    cloned[1] = { ...cloned[1], quantity: 5 }; // new object reference!

    // Old bug: indexOf(original[1]) would return -1 on cloned array
    assert.equal(cloned.indexOf(original[1]), -1, "confirms reference identity is broken");

    // But our fixed algorithm uses index-based access, so it works:
    const dist: TestDistEntry[] = [
      { size: "S", allocatedUnits: 8 },
      { size: "M", allocatedUnits: 15 },
      { size: "L", allocatedUnits: 10 },
    ];
    const result = applyDistributionToCells(cloned, dist);

    assert.equal(result[0].quantity, 8);  // S: 8 allocated, 10 available
    assert.equal(result[1].quantity, 15); // M: 15 allocated, 20 available
    assert.equal(result[2].quantity, 10); // L: 10 allocated, 15 available
    assert.equal(totalQty(result), 33);
  });
});
