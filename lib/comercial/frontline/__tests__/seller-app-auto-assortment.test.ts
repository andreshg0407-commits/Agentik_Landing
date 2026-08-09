/**
 * lib/comercial/frontline/__tests__/seller-app-auto-assortment.test.ts
 *
 * AGENTIK-SELLER-APP-ORDER-AUTO-ASSORTMENT-P0-CLOSE
 *
 * Parity tests: Seller App auto-assortment uses server boundary.
 * React has ZERO engine imports, ZERO allocation math.
 * Server owns: inventory lookup, engine call, color splitting, proposal DTO.
 *
 * Runner: node:test via `npx tsx --test`
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SELLER_VIEW = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "seller-app", "views", "nuevo-pedido-view.tsx",
);
const DESKTOP_WIZARD = join(
  __dirname, "..", "..", "..", "..",
  "app", "(app)", "[orgSlug]", "comercial", "pedidos", "wholesale-order-wizard.tsx",
);
const DECISION_ENGINE = join(
  __dirname, "..", "..",
  "pedidos", "order-decision-engine.ts",
);
const PRODUCT_SEARCH = join(
  __dirname, "..", "..",
  "pedidos", "order-product-search.ts",
);
const PRODUCTS_ROUTE = join(
  __dirname, "..", "..", "..", "..",
  "app", "api", "orgs", "[orgSlug]", "comercial", "pedidos", "products", "route.ts",
);
const POLICY_CONFIG = join(
  __dirname, "..", "..",
  "pedidos", "order-policy-pack-config.ts",
);
const DECISION_TYPES = join(
  __dirname, "..", "..",
  "pedidos", "order-decision-types.ts",
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

// ===========================================================================
// Suite A: Server action uses evaluateAutoSizeDistribution
// ===========================================================================

describe("A. Server boundary calls canonical engine", () => {
  const service = read(PRODUCT_SEARCH);
  const route = read(PRODUCTS_ROUTE);

  it("A1: order-product-search imports evaluateAutoSizeDistribution", () => {
    assert.ok(
      service.includes('import { evaluateAutoSizeDistribution }'),
      "Server service must import the canonical engine",
    );
  });

  it("A2: order-product-search imports CASTILLITOS_ORDER_POLICY_PACK_CONFIG", () => {
    assert.ok(
      service.includes('import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG }'),
      "Server service must import policy pack config",
    );
  });

  it("A3: computeAutoAssortmentProposal function exists", () => {
    assert.ok(
      service.includes("export async function computeAutoAssortmentProposal"),
      "Server must export computeAutoAssortmentProposal",
    );
  });

  it("A4: Server calls evaluateAutoSizeDistribution", () => {
    const fnBody = service.slice(service.indexOf("computeAutoAssortmentProposal"));
    assert.ok(
      fnBody.includes("evaluateAutoSizeDistribution("),
      "computeAutoAssortmentProposal must call the canonical engine",
    );
  });

  it("A5: Products API route exposes auto_assortment action", () => {
    assert.ok(
      route.includes('"auto_assortment"'),
      "Products route must have auto_assortment case",
    );
  });

  it("A6: Route imports computeAutoAssortmentProposal", () => {
    assert.ok(
      route.includes("computeAutoAssortmentProposal"),
      "Route must import computeAutoAssortmentProposal from service",
    );
  });
});

// ===========================================================================
// Suite B: Seller App contains NO direct import/call to engine
// ===========================================================================

describe("B. Seller App has no engine imports", () => {
  const mobile = read(SELLER_VIEW);

  it("B1: No import of evaluateAutoSizeDistribution", () => {
    assert.ok(
      !mobile.includes("evaluateAutoSizeDistribution"),
      "Seller App must NOT import evaluateAutoSizeDistribution",
    );
  });

  it("B2: No import of CASTILLITOS_ORDER_POLICY_PACK_CONFIG", () => {
    assert.ok(
      !mobile.includes("CASTILLITOS_ORDER_POLICY_PACK_CONFIG"),
      "Seller App must NOT import policy pack config",
    );
  });

  it("B3: No import of SizeInventorySnapshot", () => {
    assert.ok(
      !mobile.includes("SizeInventorySnapshot"),
      "Seller App must NOT import SizeInventorySnapshot",
    );
  });

  it("B4: No import from order-decision-engine", () => {
    assert.ok(
      !mobile.includes("order-decision-engine"),
      "Seller App must NOT reference order-decision-engine",
    );
  });

  it("B5: No import from order-policy-pack-config", () => {
    assert.ok(
      !mobile.includes("order-policy-pack-config"),
      "Seller App must NOT reference order-policy-pack-config",
    );
  });

  it("B6: No import from order-decision-types", () => {
    assert.ok(
      !mobile.includes("order-decision-types"),
      "Seller App must NOT reference order-decision-types",
    );
  });
});

// ===========================================================================
// Suite C: Seller App contains no allocation/remainder math
// ===========================================================================

describe("C. No allocation math in React", () => {
  const mobile = read(SELLER_VIEW);

  it("C1: No Math.floor(remaining) pattern", () => {
    assert.ok(
      !mobile.includes("Math.floor(remaining"),
      "React must NOT contain floor-division allocation logic",
    );
  });

  it("C2: No sizeMap aggregation", () => {
    assert.ok(
      !mobile.includes("sizeMap.set("),
      "React must NOT aggregate per-size inventory",
    );
  });

  it("C3: No perColor variable", () => {
    assert.ok(
      !mobile.includes("perColor"),
      "React must NOT contain per-color splitting variable",
    );
  });

  it("C4: No SizeInventorySnapshot construction", () => {
    assert.ok(
      !mobile.includes("snapshot:"),
      "React must NOT build SizeInventorySnapshot objects",
    );
  });
});

// ===========================================================================
// Suite D: Same canonical input produces same result
// ===========================================================================

describe("D. Canonical engine parity", () => {
  const engine = read(DECISION_ENGINE);
  const service = read(PRODUCT_SEARCH);

  it("D1: Engine is pure (no Prisma, no fetch)", () => {
    assert.ok(!engine.includes('from "@/lib/prisma"'), "Engine must have no Prisma");
    assert.ok(!engine.includes("fetch("), "Engine must have no fetch");
  });

  it("D2: Server service uses same engine function", () => {
    assert.ok(
      service.includes('import { evaluateAutoSizeDistribution } from "./order-decision-engine"'),
      "Service must import from same canonical engine file",
    );
  });

  it("D3: Server service uses same config", () => {
    assert.ok(
      service.includes('import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "./order-policy-pack-config"'),
      "Service must import same config as desktop",
    );
  });
});

// ===========================================================================
// Suite E: Normal case — server builds snapshot and calls engine
// ===========================================================================

describe("E. Server snapshot construction", () => {
  const service = read(PRODUCT_SEARCH);
  const fnBody = service.slice(service.indexOf("computeAutoAssortmentProposal"));

  it("E1: Loads variants via getProductVariants (server-authoritative)", () => {
    assert.ok(
      fnBody.includes("getProductVariants(orgId, referenceCode)"),
      "Must load canonical variants from Prisma, not from client",
    );
  });

  it("E2: Aggregates per-size availability across colors", () => {
    assert.ok(
      fnBody.includes("sizeMap"),
      "Must aggregate availability per size (across colors)",
    );
  });

  it("E3: Builds SizeInventorySnapshot from aggregated sizes", () => {
    assert.ok(
      fnBody.includes("const snapshot: SizeInventorySnapshot"),
      "Must build canonical snapshot type",
    );
  });
});

// ===========================================================================
// Suite F: Insufficient stock handling
// ===========================================================================

describe("F. Insufficient stock", () => {
  const service = read(PRODUCT_SEARCH);
  const fnBody = service.slice(service.indexOf("computeAutoAssortmentProposal"));

  it("F1: Returns fulfillable: false when insufficient", () => {
    assert.ok(
      fnBody.includes("fulfillable: totalAllocated === requestedUnits"),
      "fulfillable flag must compare allocated vs requested",
    );
  });

  it("F2: Returns unallocatedUnits", () => {
    assert.ok(
      fnBody.includes("unallocatedUnits: requestedUnits - totalAllocated"),
      "Must compute unallocated units",
    );
  });

  it("F3: Handles zero inventory case", () => {
    assert.ok(
      fnBody.includes("Sin inventario disponible"),
      "Must handle zero inventory edge case",
    );
  });
});

// ===========================================================================
// Suite G: Missing size
// ===========================================================================

describe("G. Missing size handling", () => {
  const service = read(PRODUCT_SEARCH);
  const fnBody = service.slice(service.indexOf("computeAutoAssortmentProposal"));

  it("G1: Filters to variants with stock > 0", () => {
    assert.ok(
      fnBody.includes("availableUnits > 0"),
      "Must filter to variants with positive stock",
    );
  });

  it("G2: Skips sizes with zero eligible variants", () => {
    assert.ok(
      fnBody.includes("sizeVariants.length === 0"),
      "Must skip sizes with no eligible variants",
    );
  });
});

// ===========================================================================
// Suite H: Color behavior exact parity
// ===========================================================================

describe("H. Color splitting on server", () => {
  const service = read(PRODUCT_SEARCH);
  const fnBody = service.slice(service.indexOf("computeAutoAssortmentProposal"));

  it("H1: Server splits per-size allocation across eligible colors", () => {
    assert.ok(
      fnBody.includes("sizeVariants"),
      "Server must find variants per size for color distribution",
    );
  });

  it("H2: Server uses floor division for per-color split", () => {
    assert.ok(
      fnBody.includes("Math.floor(remaining / sizeVariants.length)"),
      "Server must use floor division across colors",
    );
  });

  it("H3: Server distributes remainder after floor", () => {
    // After the floor phase, remaining > 0 triggers remainder distribution
    const remainderSection = fnBody.slice(fnBody.indexOf("Phase 2: distribute remainder"));
    assert.ok(
      remainderSection.includes("remaining > 0"),
      "Server must distribute remainder among colors",
    );
  });

  it("H4: Server returns per-variant lines (not per-size)", () => {
    assert.ok(
      fnBody.includes("variantId: sv.variantId"),
      "Proposal lines must include variantId for each size×color allocation",
    );
  });
});

// ===========================================================================
// Suite I: Manual mode remains
// ===========================================================================

describe("I. Manual mode preserved", () => {
  const mobile = read(SELLER_VIEW);

  it("I1: Mode toggle exists", () => {
    assert.ok(
      mobile.includes('"auto" | "manual"'),
      "Mode state must support auto and manual",
    );
  });

  it("I2: Manual mode renders variant chips", () => {
    assert.ok(
      mobile.includes('mode === "manual"'),
      "Manual mode must be conditionally rendered",
    );
  });

  it("I3: Auto is default mode", () => {
    assert.ok(
      mobile.includes('useState<"auto" | "manual">("auto")'),
      "Auto must be default mode",
    );
  });

  it("I4: Manual mode label", () => {
    assert.ok(
      mobile.includes("Seleccion manual"),
      "Manual toggle must show label",
    );
  });

  it("I5: Auto mode label", () => {
    assert.ok(
      mobile.includes("Surtido automatico"),
      "Auto toggle must show label",
    );
  });
});

// ===========================================================================
// Suite J: Cart lines equal canonical proposal lines
// ===========================================================================

describe("J. Cart integration from server proposal", () => {
  const mobile = read(SELLER_VIEW);

  it("J1: Uses server proposal lines directly", () => {
    assert.ok(
      mobile.includes("proposal.lines"),
      "Cart creation must iterate server proposal lines",
    );
  });

  it("J2: Maps proposal line to variant by variantId", () => {
    assert.ok(
      mobile.includes("variants.find(vr => vr.variantId === pl.variantId)"),
      "Must map proposal variantId to local variant reference",
    );
  });

  it("J3: Uses allocatedUnits from proposal (not client calculation)", () => {
    assert.ok(
      mobile.includes("qty: pl.allocatedUnits"),
      "Cart line qty must come from server proposal allocatedUnits",
    );
  });

  it("J4: Batch add delegates to onAddVariant per line", () => {
    assert.ok(
      mobile.includes("for (const line of lines) onAddVariant(line.variant, line.qty)"),
      "onAddBatch must call onAddVariant for each canonical line",
    );
  });
});

// ===========================================================================
// Suite K: Inventory authority — server-side
// ===========================================================================

describe("K. Server inventory authority", () => {
  const service = read(PRODUCT_SEARCH);
  const fnBody = service.slice(service.indexOf("computeAutoAssortmentProposal"));
  const mobile = read(SELLER_VIEW);

  it("K1: Server loads inventory from Prisma (not client)", () => {
    assert.ok(
      fnBody.includes("getProductVariants(orgId"),
      "Server must load variants from canonical Prisma source",
    );
  });

  it("K2: Client sends only referenceCode and requestedUnits", () => {
    assert.ok(
      mobile.includes("referenceCode: product.referenceCode"),
      "Client sends referenceCode",
    );
    assert.ok(
      mobile.includes("requestedUnits: autoQty"),
      "Client sends requestedUnits",
    );
    // Client must NOT send inventory data
    assert.ok(
      !mobile.includes("availableUnits: v.availability"),
      "Client must NOT send client-side availability to auto_assortment",
    );
  });

  it("K3: Route validates input", () => {
    const route = read(PRODUCTS_ROUTE);
    assert.ok(
      route.includes("referenceCode and requestedUnits required"),
      "Route must validate required inputs",
    );
  });
});

// ===========================================================================
// Suite L: Desktop unchanged
// ===========================================================================

describe("L. Desktop wizard unchanged", () => {
  const desktop = read(DESKTOP_WIZARD);

  it("L1: Desktop still calls evaluateAutoSizeDistribution directly", () => {
    assert.ok(
      desktop.includes("evaluateAutoSizeDistribution("),
      "Desktop must still call engine directly (client-side OK for desktop matrix)",
    );
  });

  it("L2: Desktop still has Distribuir por tallas button", () => {
    assert.ok(
      desktop.includes("Distribuir por tallas"),
      "Desktop UI unchanged",
    );
  });

  it("L3: Desktop still uses same config", () => {
    assert.ok(
      desktop.includes("CASTILLITOS_ORDER_POLICY_PACK_CONFIG"),
      "Desktop still uses same policy pack",
    );
  });
});

// ===========================================================================
// Suite M: Proposal DTO shape
// ===========================================================================

describe("M. Proposal DTO shape", () => {
  const service = read(PRODUCT_SEARCH);

  it("M1: AutoAssortmentProposal type exported", () => {
    assert.ok(
      service.includes("export interface AutoAssortmentProposal"),
      "Proposal DTO type must be exported",
    );
  });

  it("M2: Proposal has required fields", () => {
    const typeBlock = service.slice(
      service.indexOf("interface AutoAssortmentProposal {"),
      service.indexOf("}", service.indexOf("interface AutoAssortmentProposal {")) + 1,
    );
    for (const field of ["referenceCode", "requestedUnits", "allocatedUnits", "unallocatedUnits", "fulfillable", "lines", "explanation"]) {
      assert.ok(
        typeBlock.includes(`${field}:`),
        `Proposal must have ${field} field`,
      );
    }
  });

  it("M3: ProposalLine has variantId, size, color, allocatedUnits, availableUnits", () => {
    const typeBlock = service.slice(
      service.indexOf("interface AutoAssortmentProposalLine {"),
      service.indexOf("}", service.indexOf("interface AutoAssortmentProposalLine {")) + 1,
    );
    for (const field of ["variantId", "size", "color", "allocatedUnits", "availableUnits"]) {
      assert.ok(
        typeBlock.includes(`${field}:`),
        `ProposalLine must have ${field} field`,
      );
    }
  });
});
