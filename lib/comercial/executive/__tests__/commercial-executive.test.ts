/**
 * lib/comercial/executive/__tests__/commercial-executive.test.ts
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01 / B01.1 / B02 / B02.1
 *
 * Tests A-N: Executive PA, low rotation, evidence, authorization, regression.
 * Tests O-AB: B01.1 hardening (MAX resolution, calendar month, entry UX).
 * Tests B02-A through B02-O: Intelligence, reports, priority, regression.
 * Tests B02.1-A through B02.1-J: Semantic hardening (kind ≠ severity).
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Import modules under test ────────────────────────────────────────────────

import { assembleCommercialExecutivePA } from "../commercial-executive-presentation-assembler";
import {
  getLowRotationImportedProducts,
  calendarMonthsAgo,
} from "../commercial-executive-low-rotation";
import { assembleExecutiveInsights } from "../commercial-executive-intelligence";
import { assembleExecutiveReports } from "../commercial-executive-reports";
import type {
  CommercialExecutivePA,
  LowRotationImportItem,
  ExecutiveInsight,
  InsightKind,
} from "../commercial-executive-types";
import type { ImportSupplyIntelligenceItem } from "../../importaciones/import-types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    ventasMes: 50_000_000,
    ventasSemana: 12_000_000,
    ventasHoy: 2_000_000,
    periodoVentas: "Agosto 2026",
    pedidosMes: 45,
    pedidosTotal: 300,
    ticketPromedio: 1_100_000,
    periodoPedidos: "Agosto 2026",
    clientesActivos: 120,
    clientesNuevos: 5,
    vendedoresOperativos: 8,
    recaudosMes: 30_000_000,
    periodoRecaudos: "Agosto 2026",
    cartera: {
      carteraTotal: 200_000_000,
      carteraVencida: 40_000_000,
      pctVencida: 20,
      clientesConMora: 15,
      topMorosoName: "Test Client",
      topMorosoMonto: 5_000_000,
    },
    refsTotales: 500,
    refsCriticas: 10,
    refsAgotadas: 25,
    refsConOp: 0,
    vendorRanking: [],
    geoTable: [],
    customerHighlights: [],
    channels: [],
    insights: [],
    alertas: [],
    decisionsSummary: null,
    loadedAt: "2026-08-11T06:00:00.000Z",
    ...overrides,
  } as any;
}

function makeImportItem(overrides: Record<string, unknown> = {}): ImportSupplyIntelligenceItem {
  const base: Record<string, unknown> = {
    productId: "p1",
    reference: "REF001",
    description: "Test import ref",
    remaining: 50,
    totalStock: 50,
    soldGross: 100,
    returns: 5,
    soldNet: 95,
    salesTotal6m: 30,
    sales6mGross: 30,
    salesDetal6m: 20,
    salesMayorista6m: 10,
    revenue6m: 1_500_000,
    pricePV3: 50000,
    pricePV4: 40000,
    dominantChannel: "detal",
    channelConfidence: 0.8,
    repurchaseStatus: "VIGILAR",
    repurchaseMotivo: "stock_suficiente",
    entryDate: "2025-10-15",
    entryDateQuality: "CONFIRMED",
    entryDateSource: "SAG_RECEIPT",
    lastEntryDate: "2025-10-15",
    daysSinceLastEntry: 300,
    percentSold: 65,
    batchCount: 2,
    totalImported: 200,
    totalImportedQuality: "CONFIRMED",
    stockDataQuality: "CONFIRMED",
    salesDataQuality: "SYNCED",
    imageUrl: null,
    costo: 25000,
    capitalInmovilizado: 1_250_000,
    coberturaPromedioDias: 300,
    ritmoPromedioVentas: 5,
    agingStatus: "LOW_ROTATION",
    lifecycleState: "ACTIVE",
    saludComercial: "CRITICA",
    saludComercialRazon: "test",
    recompraClassification: "VIGILAR",
    recompraReason: "test",
    rotacionClassification: "NORMAL",
    envejecimientoClassification: "8_12M",
    bajaRotacionClassification: null,
    prioridad: "MEDIA",
    prioridadRazon: "test",
    repurchaseActionRationale: null,
    repurchaseRecommendedAction: null,
    createdAtSag: null,
    lastModifiedSag: null,
    lastPurchaseSag: null,
    lastSaleSag: "2026-06-01",
    lastInboundDate: "2025-10-15",
    lastInboundSource: "SAG_RECEIPT_C1_C2",
    daysSinceLastInbound: 300,
    sizeClass: "MEDIANO",
  };
  return Object.assign(base, overrides) as any;
}

// ── Test A: Assembler is deterministic/client-safe ───────────────────────────

describe("A — Assembler determinism", () => {
  test("same input produces identical output", () => {
    const snapshot = makeSnapshot();
    const intel = { items: [makeImportItem()], kpis: { comprarAhora: 1, revisarRecompra: 2, noRecomprar: 0, inventarioLento: 1, totalRefs: 1 } };
    const asOf = new Date("2026-08-11T06:00:00Z");

    const pa1 = assembleCommercialExecutivePA({ snapshot, importIntelligence: intel, asOf });
    const pa2 = assembleCommercialExecutivePA({ snapshot, importIntelligence: intel, asOf });

    expect(JSON.stringify(pa1)).toBe(JSON.stringify(pa2));
  });

  test("assembler produces client-safe types (no Prisma, no functions)", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-presentation-assembler.ts");
    expect(src).not.toContain("import { prisma");
    expect(src).not.toContain('from "@/lib/prisma"');
    expect(src).not.toContain("import React");
  });
});

// ── Test B: Desktop Commercial operational experience unchanged ──────────────

describe("B — Desktop regression", () => {
  test("Desktop control page still exists unchanged", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/control/page.tsx");
    expect(src).toContain("loadControlComercial");
    expect(src).toContain("ControlClient");
  });

  test("Desktop importaciones page still exists unchanged", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/importaciones/page.tsx");
    expect(src).toContain("buildImportSupplyIntelligence");
    expect(src).toContain("ImportacionesClient");
  });
});

// ── Test C: Narrow ORG_ADMIN/MANAGER gets executive presentation ─────────────

describe("C — Executive route exists", () => {
  test("Executive page.tsx exists and uses requireOrgAccess", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    expect(src).toContain("requireOrgAccess");
    expect(src).toContain("assembleCommercialExecutivePA");
    expect(src).toContain("CommercialExecutiveClient");
  });

  test("Executive client exists with Resumen", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain("Resumen ejecutivo");
    expect(src).toContain("CommercialExecutivePA");
  });
});

// ── Test D: Viewport does not alter authorization ────────────────────────────

describe("D — Authorization invariance", () => {
  test("Executive page uses same requireOrgAccess as desktop", () => {
    const execSrc = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    const controlSrc = readFile("app/(app)/[orgSlug]/comercial/control/page.tsx");

    // Both use requireOrgAccess from same module
    expect(execSrc).toContain('from "@/lib/auth/org-access"');
    expect(controlSrc).toContain('from "@/lib/auth/org-access"');

    // Executive does NOT use allowProvisionedSeller (it's not seller app)
    expect(execSrc).not.toContain("allowProvisionedSeller");
  });
});

// ── Test E: Low rotation uses 8 calendar months, NOT fixed 240 days ──────────

describe("E — 8 calendar months", () => {
  test("calendarMonthsAgo produces correct boundary", () => {
    const asOf = new Date("2026-08-11");
    const cutoff = calendarMonthsAgo(asOf, 8);

    // 8 months before Aug 2026 = Dec 2025
    expect(cutoff.getFullYear()).toBe(2025);
    expect(cutoff.getMonth()).toBe(11); // December = 11
    expect(cutoff.getDate()).toBe(11);
  });

  test("240-day boundary differs from 8-month boundary", () => {
    const asOf = new Date("2026-08-11");
    const calendarCutoff = calendarMonthsAgo(asOf, 8);
    const fixedCutoff = new Date(asOf.getTime() - 240 * 24 * 60 * 60 * 1000);

    // They should differ — proving this is NOT a fixed 240-day threshold
    expect(calendarCutoff.getTime()).not.toBe(fixedCutoff.getTime());
  });

  test("item at exactly 8 calendar months is LOW_ROTATION", () => {
    const asOf = new Date("2026-08-11T00:00:00Z");
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-12-10",
      lastPurchaseSag: null,
    });

    const results = getLowRotationImportedProducts([item], { asOf, monthsWithoutActivity: 8 });
    expect(results[0].rotationStatus).toBe("LOW_ROTATION");
  });

  test("item within 8 calendar months is NORMAL", () => {
    const asOf = new Date("2026-08-11T00:00:00Z");
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-12-12",
      lastPurchaseSag: null,
    });

    const results = getLowRotationImportedProducts([item], { asOf, monthsWithoutActivity: 8 });
    expect(results[0].rotationStatus).toBe("NORMAL");
  });
});

// ── Test F: Stock must be > 0 ────────────────────────────────────────────────

describe("F — Stock > 0 required", () => {
  test("zero stock item is excluded from low rotation list", () => {
    const item = makeImportItem({
      remaining: 0,
      lastInboundDate: "2025-01-01",
      lastInboundSource: "SAG_RECEIPT_C1_C2",
    });

    const results = getLowRotationImportedProducts([item]);
    expect(results.length).toBe(0); // filtered out because remaining <= 0
  });
});

// ── Test G: SAG_RECEIPT_C1_C2 evidence works ────────────────────────────────

describe("G — SAG_RECEIPT_C1_C2 evidence", () => {
  test("receipt evidence produces correct source label", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-06-01",
      lastPurchaseSag: null,
    });

    const results = getLowRotationImportedProducts([item]);
    expect(results[0].lastImportActivitySource).toBe("SAG_RECEIPT_C1_C2");
    expect(results[0].rotationStatus).toBe("LOW_ROTATION");
  });
});

// ── Test H: SAG_LAST_PURCHASE fallback is explicitly labeled ────────────────

describe("H — SAG_LAST_PURCHASE fallback", () => {
  test("last purchase evidence is labeled SAG_LAST_PURCHASE when no receipt", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: null,
      lastPurchaseSag: "2025-06-01",
    });

    const results = getLowRotationImportedProducts([item]);
    expect(results[0].lastImportActivitySource).toBe("SAG_LAST_PURCHASE");
    expect(results[0].lastImportActivitySource).not.toBe("SAG_RECEIPT_C1_C2");
  });
});

// ── Test I: UNAVAILABLE → SIN_FECHA_DE_ACTIVIDAD_IMPORTACION ────────────────

describe("I — UNAVAILABLE classification", () => {
  test("no dates produces SIN_FECHA_DE_ACTIVIDAD_IMPORTACION", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: null,
      lastPurchaseSag: null,
    });

    const results = getLowRotationImportedProducts([item]);
    expect(results[0].rotationStatus).toBe("SIN_FECHA_DE_ACTIVIDAD_IMPORTACION");
  });
});

// ── Test J: Unavailable never silently becomes normal/low-rotation ───────────

describe("J — Unavailable never becomes normal/low-rotation", () => {
  test("no dates is never LOW_ROTATION", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: null,
      lastPurchaseSag: null,
    });

    const results = getLowRotationImportedProducts([item]);
    expect(results[0].rotationStatus).not.toBe("LOW_ROTATION");
    expect(results[0].rotationStatus).not.toBe("NORMAL");
    expect(results[0].rotationStatus).toBe("SIN_FECHA_DE_ACTIVIDAD_IMPORTACION");
  });
});

// ── Test K: No business math in React ────────────────────────────────────────

describe("K — No business math in React", () => {
  test("executive-client.tsx has no business calculations", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");

    // Must not contain business calculations
    expect(src).not.toContain("evaluateInventoryAging");
    expect(src).not.toContain("evaluateRepurchase");
    expect(src).not.toContain("evaluateLowRotation");
    expect(src).not.toContain("buildImportSupplyIntelligence");
    expect(src).not.toContain("loadControlComercial");
    expect(src).not.toContain("import { prisma");
    expect(src).not.toContain('from "@/lib/prisma"');

    // Must not import decision engines
    expect(src).not.toContain("import-decision-engine");
    expect(src).not.toContain("import-intelligence-service");
  });
});

// ── Test L: Source/asOf freshness preserved ──────────────────────────────────

describe("L — Source freshness", () => {
  test("PA includes asOf and loadedAt timestamps", () => {
    const snapshot = makeSnapshot();
    const asOf = new Date("2026-08-11T06:00:00Z");

    const pa = assembleCommercialExecutivePA({ snapshot, importIntelligence: null, asOf });

    expect(pa.asOf).toBe("2026-08-11T06:00:00.000Z");
    expect(pa.loadedAt).toBe(snapshot.loadedAt);
    expect(pa.source).toBe("PRODUCTION");
  });

  test("each section preserves asOf", () => {
    const snapshot = makeSnapshot();
    const asOf = new Date("2026-08-11T06:00:00Z");
    const pa = assembleCommercialExecutivePA({ snapshot, importIntelligence: null, asOf });

    expect(pa.ventas?.asOf).toBe("2026-08-11T06:00:00.000Z");
    expect(pa.cartera?.asOf).toBe("2026-08-11T06:00:00.000Z");
    expect(pa.importaciones.asOf).toBe("2026-08-11T06:00:00.000Z");
  });
});

// ── Test M: Existing Importaciones domain regression ─────────────────────────

describe("M — Importaciones regression", () => {
  test("import-intelligence-service.ts still exports buildImportSupplyIntelligence", () => {
    const src = readFile("lib/comercial/importaciones/import-intelligence-service.ts");
    expect(src).toContain("export async function buildImportSupplyIntelligence");
  });

  test("import-types.ts still exports ImportSupplyIntelligenceItem", () => {
    const src = readFile("lib/comercial/importaciones/import-types.ts");
    expect(src).toContain("export interface ImportSupplyIntelligenceItem");
  });

  test("executive low-rotation consumes ImportSupplyIntelligenceItem, not new queries", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-low-rotation.ts");
    expect(src).toContain("ImportSupplyIntelligenceItem");
    expect(src).not.toContain("import { prisma");
    expect(src).not.toContain('from "@/lib/prisma"');
  });
});

// ── Test N: Existing Stores PA regression ────────────────────────────────────

describe("N — Stores PA regression", () => {
  test("store-intelligence-presentation-assembler.ts unchanged", () => {
    const src = readFile("lib/comercial/tiendas/store-intelligence-presentation-assembler.ts");
    expect(src).toContain("StoreIntelligencePresentation");
    expect(src).toContain("IntelTone");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B01.1 HARDENING TESTS (O-AB)
// Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01.1
// ═══════════════════════════════════════════════════════════════════════════════

// ── Test O: MAX(receipt, purchase) — receipt wins when more recent ───────────

describe("O — MAX resolution: receipt wins", () => {
  test("receipt 2026-03-15 beats purchase 2025-11-01", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2026-03-15",
      lastPurchaseSag: "2025-11-01",
    });

    const results = getLowRotationImportedProducts([item], {
      asOf: new Date("2026-08-11T00:00:00Z"),
      monthsWithoutActivity: 8,
    });

    expect(results[0].lastImportActivityDate).toBe("2026-03-15");
    expect(results[0].lastImportActivitySource).toBe("SAG_RECEIPT_C1_C2");
  });
});

// ── Test P: MAX(receipt, purchase) — purchase wins when more recent ──────────

describe("P — MAX resolution: purchase wins", () => {
  test("purchase 2026-05-20 beats receipt 2025-10-15", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-10-15",
      lastPurchaseSag: "2026-05-20",
    });

    const results = getLowRotationImportedProducts([item], {
      asOf: new Date("2026-08-11T00:00:00Z"),
      monthsWithoutActivity: 8,
    });

    expect(results[0].lastImportActivityDate).toBe("2026-05-20");
    expect(results[0].lastImportActivitySource).toBe("SAG_LAST_PURCHASE");
  });
});

// ── Test Q: Both raw evidence dates preserved ──────────────────────────────

describe("Q — Raw evidence preserved", () => {
  test("both lastReceiptDate and lastPurchaseDate present in output", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-10-15",
      lastPurchaseSag: "2026-05-20",
    });

    const results = getLowRotationImportedProducts([item]);

    expect(results[0].lastReceiptDate).toBe("2025-10-15");
    expect(results[0].lastPurchaseDate).toBe("2026-05-20");
  });

  test("null dates preserved as null", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: null,
      lastPurchaseSag: "2026-01-10",
    });

    const results = getLowRotationImportedProducts([item]);

    expect(results[0].lastReceiptDate).toBeNull();
    expect(results[0].lastPurchaseDate).toBe("2026-01-10");
  });
});

// ── Test R: Purchase-only item is NOT SIN_FECHA ─────────────────────────────

describe("R — Purchase-only is not UNAVAILABLE", () => {
  test("item with only lastPurchaseSag gets classified, not SIN_FECHA", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: null,
      lastPurchaseSag: "2026-06-01",
    });

    const results = getLowRotationImportedProducts([item], {
      asOf: new Date("2026-08-11T00:00:00Z"),
      monthsWithoutActivity: 8,
    });

    expect(results[0].rotationStatus).toBe("NORMAL");
    expect(results[0].lastImportActivitySource).toBe("SAG_LAST_PURCHASE");
  });
});

// ── Test S: MAX changes classification outcome ──────────────────────────────

describe("S — MAX changes classification", () => {
  test("old receipt makes LOW_ROTATION but recent purchase saves to NORMAL", () => {
    const asOf = new Date("2026-08-11T00:00:00Z");

    // Receipt alone would be LOW_ROTATION (10 months ago)
    const receiptOnly = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-10-01",
      lastPurchaseSag: null,
    });
    const r1 = getLowRotationImportedProducts([receiptOnly], { asOf, monthsWithoutActivity: 8 });
    expect(r1[0].rotationStatus).toBe("LOW_ROTATION");

    // But a recent purchase overrides via MAX
    const withPurchase = makeImportItem({
      remaining: 50,
      lastEntryDate: "2025-10-01",
      lastPurchaseSag: "2026-07-01",
    });
    const r2 = getLowRotationImportedProducts([withPurchase], { asOf, monthsWithoutActivity: 8 });
    expect(r2[0].rotationStatus).toBe("NORMAL");
    expect(r2[0].lastImportActivitySource).toBe("SAG_LAST_PURCHASE");
  });
});

// ── Test T: calendarMonthsAgo end-of-month clamping ─────────────────────────

describe("T — Calendar month end-of-month clamping", () => {
  test("Oct 31 - 8mo = Feb 28 (non-leap year)", () => {
    // 2026-10-31 minus 8 months = 2026-02-28 (2026 is not a leap year)
    const cutoff = calendarMonthsAgo(new Date("2026-10-31T00:00:00Z"), 8);
    expect(cutoff.getUTCFullYear()).toBe(2026);
    expect(cutoff.getUTCMonth()).toBe(1); // February
    expect(cutoff.getUTCDate()).toBe(28);
  });

  test("Oct 31 - 8mo = Feb 29 (leap year 2028)", () => {
    // 2028-10-31 minus 8 months = 2028-02-29 (2028 is a leap year)
    const cutoff = calendarMonthsAgo(new Date("2028-10-31T00:00:00Z"), 8);
    expect(cutoff.getUTCFullYear()).toBe(2028);
    expect(cutoff.getUTCMonth()).toBe(1); // February
    expect(cutoff.getUTCDate()).toBe(29);
  });

  test("Mar 31 - 1mo = Feb 28 (non-leap)", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-03-31T00:00:00Z"), 1);
    expect(cutoff.getUTCFullYear()).toBe(2026);
    expect(cutoff.getUTCMonth()).toBe(1);
    expect(cutoff.getUTCDate()).toBe(28);
  });

  test("May 31 - 1mo = Apr 30", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-05-31T00:00:00Z"), 1);
    expect(cutoff.getUTCFullYear()).toBe(2026);
    expect(cutoff.getUTCMonth()).toBe(3); // April
    expect(cutoff.getUTCDate()).toBe(30);
  });
});

// ── Test U: calendarMonthsAgo UTC safety ────────────────────────────────────

describe("U — Calendar month UTC safety", () => {
  test("UTC date at midnight stays in correct month", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-08-11T00:00:00Z"), 8);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(11); // December
    expect(cutoff.getUTCDate()).toBe(11);
  });

  test("UTC date at 23:59:59 stays in correct month", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-08-11T23:59:59Z"), 8);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(11);
    expect(cutoff.getUTCDate()).toBe(11);
  });
});

// ── Test V: calendarMonthsAgo normal months unchanged ───────────────────────

describe("V — Calendar month normal months", () => {
  test("Aug 15 - 8mo = Dec 15 (no clamping needed)", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-08-15T00:00:00Z"), 8);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(11);
    expect(cutoff.getUTCDate()).toBe(15);
  });

  test("Jan 1 - 1mo = Dec 1 (year boundary)", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-01-01T00:00:00Z"), 1);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(11);
    expect(cutoff.getUTCDate()).toBe(1);
  });
});

// ── Test W: Commercial entry page exists ─────────────────────────────────────

describe("W — Commercial entry page", () => {
  test("/comercial/page.tsx exists with viewport routing", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    expect(src).toContain("requireOrgAccess");
    expect(src).toContain("user-agent");
    expect(src).toContain("redirect");
    expect(src).toContain("/comercial/executive");
    expect(src).toContain("/comercial/control");
  });

  test("authorization happens before viewport detection", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    const authPos = src.indexOf("requireOrgAccess");
    const uaPos = src.indexOf("user-agent");
    expect(authPos).toBeLessThan(uaPos);
  });
});

// ── Test X: Entry page never grants access via viewport ─────────────────────

describe("X — Viewport never grants access", () => {
  test("entry page uses same auth as executive and control", () => {
    const entry = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    const exec = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    const control = readFile("app/(app)/[orgSlug]/comercial/control/page.tsx");

    // All three use requireOrgAccess from same module
    expect(entry).toContain('from "@/lib/auth/org-access"');
    expect(exec).toContain('from "@/lib/auth/org-access"');
    expect(control).toContain('from "@/lib/auth/org-access"');
  });

  test("entry page does not use allowProvisionedSeller", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    expect(src).not.toContain("allowProvisionedSeller");
  });
});

// ── Test Y: Same dates — receipt wins tie ───────────────────────────────────

describe("Y — Same date tie-break", () => {
  test("when receipt and purchase are same date, receipt wins", () => {
    const item = makeImportItem({
      remaining: 50,
      lastEntryDate: "2026-03-15",
      lastPurchaseSag: "2026-03-15",
    });

    const results = getLowRotationImportedProducts([item]);
    expect(results[0].lastImportActivitySource).toBe("SAG_RECEIPT_C1_C2");
    expect(results[0].lastImportActivityDate).toBe("2026-03-15");
  });
});

// ── Test Z: Low rotation module uses MAX, not fallback ─────────────────────

describe("Z — Code uses MAX, not fallback", () => {
  test("low-rotation module has resolveMaxActivityDate, not mapSource", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-low-rotation.ts");
    expect(src).toContain("resolveMaxActivityDate");
    expect(src).not.toContain("mapSource");
    expect(src).toContain("MAX");
  });
});

// ── Test AA: calendarMonthsAgo cross-year boundary ─────────────────────────

describe("AA — Calendar month cross-year", () => {
  test("Feb 28 - 12mo = Feb 28 prev year", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-02-28T00:00:00Z"), 12);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(1);
    expect(cutoff.getUTCDate()).toBe(28);
  });

  test("Jan 31 - 2mo = Nov 30 prev year", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-01-31T00:00:00Z"), 2);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(10); // November
    expect(cutoff.getUTCDate()).toBe(30);
  });
});

// ── Test AB: Existing desktop routes unaffected ─────────────────────────────

describe("AB — Desktop routes unaffected", () => {
  test("control and executive pages still independent server components", () => {
    const control = readFile("app/(app)/[orgSlug]/comercial/control/page.tsx");
    const exec = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");

    // Both render their own content (not redirects)
    expect(control).toContain("ControlClient");
    expect(exec).toContain("CommercialExecutiveClient");
    expect(control).not.toContain("redirect");
    expect(exec).not.toContain("redirect");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B02 TESTS (B02-A through B02-O)
// Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B02
// ═══════════════════════════════════════════════════════════════════════════════

function makeIntel() {
  return {
    items: [makeImportItem()],
    kpis: { comprarAhora: 3, revisarRecompra: 2, noRecomprar: 0, inventarioLento: 1, totalRefs: 1 },
  };
}

// ── B02-A: ExecutiveInsight contract client-safe ─────────────────────────────

describe("B02-A — ExecutiveInsight contract", () => {
  test("insight has all required fields", () => {
    const snapshot = makeSnapshot({ refsAgotadas: 25 });
    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    expect(insights.length).toBeGreaterThan(0);
    const first = insights[0];
    expect(first.id).toBeDefined();
    expect(first.domain).toBeDefined();
    expect(first.severity).toBeDefined();
    expect(first.what).toBeDefined();
    expect(first.why).toBeDefined();
    expect(first.evidence).toBeDefined();
    expect(first.asOf).toBeDefined();
    expect(first.truthStatus).toBeDefined();
  });

  test("types file is client-safe (no Prisma, no React)", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-types.ts");
    expect(src).toContain("ExecutiveInsight");
    expect(src).not.toContain("import { prisma");
    expect(src).not.toContain("import React");
  });
});

// ── B02-B: Existing deterministic signals mapped ────────────────────────────

describe("B02-B — Deterministic signals mapped", () => {
  test("snapshot insights become executive insights", () => {
    const snapshot = makeSnapshot({
      insights: [
        { id: "ins-1", text: "Los top 3 vendedores concentran 92% del valor CRM.", severity: "warning" },
      ],
    });

    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const mapped = insights.find(i => i.what.includes("vendedores concentran"));
    expect(mapped).toBeDefined();
    expect(mapped!.severity).toBe("warning");
  });

  test("intelligence module is pure (no Prisma, no LLM)", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-intelligence.ts");
    expect(src).not.toContain("import { prisma");
    expect(src).not.toContain("openai");
    expect(src).not.toContain("anthropic");
    expect(src).not.toContain("generateText");
  });
});

// ── B02-C: Priority deterministic ──────────────────────────────────────────

describe("B02-C — Priority deterministic", () => {
  test("insights sorted critical → warning → info", () => {
    const snapshot = makeSnapshot({
      refsAgotadas: 25,
      refsCriticas: 10,
      insights: [
        { id: "ins-1", text: "Test info insight", severity: "neutral" },
      ],
    });

    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    // Verify order: critical first, then warning, then info
    const severities = insights.map(i => i.severity);
    const critIdx = severities.indexOf("critical");
    const warnIdx = severities.indexOf("warning");
    const infoIdx = severities.indexOf("info");

    if (critIdx >= 0 && warnIdx >= 0) expect(critIdx).toBeLessThan(warnIdx);
    if (warnIdx >= 0 && infoIdx >= 0) expect(warnIdx).toBeLessThan(infoIdx);
  });

  test("same input produces same order (deterministic)", () => {
    const snapshot = makeSnapshot({ refsAgotadas: 25, refsCriticas: 10 });
    const args = {
      snapshot, importIntelligence: null, lowRotationItems: [] as LowRotationImportItem[],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    };

    const r1 = assembleExecutiveInsights(args);
    const r2 = assembleExecutiveInsights(args);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ── B02-D: No LLM used for severity/ranking ────────────────────────────────

describe("B02-D — No LLM for severity", () => {
  test("intelligence assembler has no AI imports", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-intelligence.ts");
    expect(src).not.toContain("import { generateText");
    expect(src).not.toContain("import { streamText");
    expect(src).not.toContain("@ai-sdk");
    expect(src).not.toContain("import { OpenAI");
    expect(src).not.toContain("import Anthropic");
  });
});

// ── B02-E: Low rotation intelligence reproduces B01 truth ──────────────────

describe("B02-E — Low rotation intelligence", () => {
  test("low rotation generates insight with correct count", () => {
    const lowRotItems: LowRotationImportItem[] = [
      { reference: "R1", description: "d", currentInventory: 50, lastImportActivityDate: "2025-10-01", lastImportActivitySource: "SAG_RECEIPT_C1_C2", monthsSinceLastActivity: 10, inventoryValue: 500000, lastSaleDate: null, sales90d: 0, sales180d: 0, rotationStatus: "LOW_ROTATION", costo: 10000, lastReceiptDate: "2025-10-01", lastPurchaseDate: null },
      { reference: "R2", description: "d", currentInventory: 30, lastImportActivityDate: "2025-09-01", lastImportActivitySource: "SAG_LAST_PURCHASE", monthsSinceLastActivity: 11, inventoryValue: 300000, lastSaleDate: null, sales90d: 0, sales180d: 0, rotationStatus: "LOW_ROTATION", costo: 10000, lastReceiptDate: null, lastPurchaseDate: "2025-09-01" },
    ];

    const insights = assembleExecutiveInsights({
      snapshot: makeSnapshot(),
      importIntelligence: { items: [makeImportItem()], kpis: { comprarAhora: 0, revisarRecompra: 0, noRecomprar: 0, inventarioLento: 2, totalRefs: 1 } },
      lowRotationItems: lowRotItems,
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const lrInsight = insights.find(i => i.what.includes("8 meses"));
    expect(lrInsight).toBeDefined();
    expect(lrInsight!.what).toContain("2 referencias");
  });
});

// ── B02-F: UNAVAILABLE stays separate ──────────────────────────────────────

describe("B02-F — UNAVAILABLE separate", () => {
  test("SIN_FECHA items generate separate insight, not mixed with low rotation", () => {
    const items: LowRotationImportItem[] = [
      { reference: "R1", description: "d", currentInventory: 50, lastImportActivityDate: null, lastImportActivitySource: "UNAVAILABLE", monthsSinceLastActivity: null, inventoryValue: null, lastSaleDate: null, sales90d: 0, sales180d: 0, rotationStatus: "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION", costo: null, lastReceiptDate: null, lastPurchaseDate: null },
    ];

    const insights = assembleExecutiveInsights({
      snapshot: makeSnapshot(),
      importIntelligence: { items: [makeImportItem()], kpis: { comprarAhora: 0, revisarRecompra: 0, noRecomprar: 0, inventarioLento: 0, totalRefs: 1 } },
      lowRotationItems: items,
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const sinFechaInsight = insights.find(i => i.what.includes("sin fecha"));
    expect(sinFechaInsight).toBeDefined();
    expect(sinFechaInsight!.what).not.toContain("8 meses");
  });
});

// ── B02-G: Reports use canonical facts ─────────────────────────────────────

describe("B02-G — Reports use canonical facts", () => {
  test("report assembler is pure (no Prisma)", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-reports.ts");
    expect(src).not.toContain("import { prisma");
    expect(src).toContain("ControlComercialSnapshot");
  });

  test("reports generated from snapshot", () => {
    const snapshot = makeSnapshot();
    const reports = assembleExecutiveReports(snapshot, "castillitos");

    expect(reports.length).toBe(6);
    expect(reports.map(r => r.id)).toContain("resumen-ejecutivo");
    expect(reports.map(r => r.id)).toContain("importaciones");
  });

  test("report availability reflects snapshot data", () => {
    const emptySnapshot = makeSnapshot({ ventasMes: 0, pedidosMes: 0 });
    const reports = assembleExecutiveReports(emptySnapshot, "castillitos");

    const ventasReport = reports.find(r => r.id === "ventas-ritmo");
    expect(ventasReport?.available).toBe(false);

    const resumenReport = reports.find(r => r.id === "resumen-ejecutivo");
    expect(resumenReport?.available).toBe(true);
  });
});

// ── B02-H: No duplicate business math in React ────────────────────────────

describe("B02-H — No business math in React", () => {
  test("executive client has no business calculations (B02 scope)", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");

    expect(src).not.toContain("evaluateInventoryAging");
    expect(src).not.toContain("evaluateRepurchase");
    expect(src).not.toContain("buildImportSupplyIntelligence");
    expect(src).not.toContain("assembleExecutiveInsights");
    expect(src).not.toContain("assembleExecutiveReports");
    expect(src).not.toContain("import { prisma");
  });
});

// ── B02-I: Desktop Commercial unchanged ────────────────────────────────────

describe("B02-I — Desktop unchanged", () => {
  test("control page still exists with same contract", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/control/page.tsx");
    expect(src).toContain("loadControlComercial");
    expect(src).toContain("ControlClient");
  });

  test("importaciones page unchanged", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/importaciones/page.tsx");
    expect(src).toContain("buildImportSupplyIntelligence");
  });
});

// ── B02-J: Seller confinement unchanged ────────────────────────────────────

describe("B02-J — Seller confinement unchanged", () => {
  test("seller confinement gate still in org-access", () => {
    const src = readFile("lib/auth/org-access.ts");
    expect(src).toContain("ACCESS_DENIED_SELLER_CONFINED");
    expect(src).toContain("SELLER_CONFINED_ROLES");
  });
});

// ── B02-K: Authorization unaffected by viewport ────────────────────────────

describe("B02-K — Authorization invariance", () => {
  test("executive page uses requireOrgAccess without special flags", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    expect(src).toContain("requireOrgAccess");
    expect(src).not.toContain("allowProvisionedSeller");
  });
});

// ── B02-L: Mobile uses same Executive PA ───────────────────────────────────

describe("B02-L — Mobile uses Executive PA", () => {
  test("PA now includes insights and reports", () => {
    const snapshot = makeSnapshot({ refsAgotadas: 5 });
    const asOf = new Date("2026-08-11T06:00:00Z");

    const pa = assembleCommercialExecutivePA({
      snapshot, importIntelligence: null, orgSlug: "castillitos", asOf,
    });

    expect(pa.insights).toBeDefined();
    expect(Array.isArray(pa.insights)).toBe(true);
    expect(pa.reports).toBeDefined();
    expect(Array.isArray(pa.reports)).toBe(true);
  });
});

// ── B02-M: Tablet uses same Executive PA ───────────────────────────────────

describe("B02-M — Tablet uses same PA", () => {
  test("PA is viewport-agnostic (no width/density fields)", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-types.ts");
    expect(src).not.toContain("screenWidth");
    expect(src).not.toContain("density");
    // PA types have no viewport-dependent fields
    expect(src).not.toContain("isTablet");
    expect(src).not.toContain("isMobile");
  });
});

// ── B02-N: source/asOf/truthStatus preserved ───────────────────────────────

describe("B02-N — Source/asOf/truthStatus preserved", () => {
  test("every insight has asOf and truthStatus", () => {
    const snapshot = makeSnapshot({ refsAgotadas: 25 });
    const asOf = "2026-08-11T06:00:00.000Z";

    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf,
    });

    for (const ins of insights) {
      expect(ins.asOf).toBe(asOf);
      expect(["CONFIRMED", "PARTIAL", "ESTIMATED"]).toContain(ins.truthStatus);
    }
  });

  test("PA preserves source and loadedAt", () => {
    const pa = assembleCommercialExecutivePA({
      snapshot: makeSnapshot(), importIntelligence: null, orgSlug: "castillitos",
      asOf: new Date("2026-08-11T06:00:00Z"),
    });

    expect(pa.source).toBe("PRODUCTION");
    expect(pa.loadedAt).toBeDefined();
    expect(pa.asOf).toBe("2026-08-11T06:00:00.000Z");
  });
});

// ── B02-O: B01/B01.1 regression green ──────────────────────────────────────

describe("B02-O — B01/B01.1 regression", () => {
  test("calendarMonthsAgo still works (B01.1)", () => {
    const cutoff = calendarMonthsAgo(new Date("2026-08-11T00:00:00Z"), 8);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(11);
    expect(cutoff.getUTCDate()).toBe(11);
  });

  test("getLowRotationImportedProducts still works (B01)", () => {
    const item = makeImportItem({
      remaining: 50, lastEntryDate: "2025-10-01", lastPurchaseSag: null,
    });

    const results = getLowRotationImportedProducts([item], {
      asOf: new Date("2026-08-11T00:00:00Z"),
      monthsWithoutActivity: 8,
    });
    expect(results[0].rotationStatus).toBe("LOW_ROTATION");
    expect(results[0].lastReceiptDate).toBe("2025-10-01");
    expect(results[0].lastPurchaseDate).toBeNull();
  });

  test("assembler still produces Resumen sections (B01)", () => {
    const pa = assembleCommercialExecutivePA({
      snapshot: makeSnapshot(), importIntelligence: null, orgSlug: "castillitos",
      asOf: new Date("2026-08-11T06:00:00Z"),
    });

    expect(pa.ventas).not.toBeNull();
    expect(pa.pedidos).not.toBeNull();
    expect(pa.cartera).not.toBeNull();
    expect(pa.importaciones).toBeDefined();
  });

  test("executive client still has Resumen content (B01)", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain("Resumen ejecutivo");
    expect(src).toContain("CommercialExecutivePA");
    expect(src).toContain("Inteligencia");
    expect(src).toContain("Informes");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B02.1 — SEMANTIC HARDENING: kind ≠ severity
// ══════════════════════════════════════════════════════════════════════════════

// ── B02.1-A: InsightKind type exists ──────────────────────────────────────────

describe("B02.1-A — InsightKind type contract", () => {
  test("InsightKind is RISK | OPPORTUNITY | OBSERVATION", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-types.ts");
    expect(src).toContain('InsightKind');
    expect(src).toContain('"RISK"');
    expect(src).toContain('"OPPORTUNITY"');
    expect(src).toContain('"OBSERVATION"');
  });

  test("ExecutiveInsight has kind field", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-types.ts");
    expect(src).toContain("kind: InsightKind");
  });

  test("ExecutiveInsight retains severity field", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-types.ts");
    expect(src).toContain("severity: InsightSeverity");
  });
});

// ── B02.1-B: Every insight has a kind ─────────────────────────────────────────

describe("B02.1-B — Every insight has a kind", () => {
  test("all insights from assembler have kind field", () => {
    const snapshot = makeSnapshot({
      refsAgotadas: 25,
      refsCriticas: 10,
      insights: [
        { id: "ins-1", text: "Top 3 vendedores concentran 92%.", severity: "warning" },
      ],
      alertas: [
        { id: "alert-cartera-1", module: "cartera", title: "Mora alta", detail: "15 clientes", severity: "warning", action: null },
      ],
    });

    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(["RISK", "OPPORTUNITY", "OBSERVATION"]).toContain(i.kind);
    }
  });
});

// ── B02.1-C: Kind is NOT derived from severity ───────────────────────────────

describe("B02.1-C — Kind independent of severity", () => {
  test("warning-severity cartera is RISK not OPPORTUNITY", () => {
    const snapshot = makeSnapshot({
      cartera: {
        carteraTotal: 200_000_000,
        carteraVencida: 40_000_000,
        pctVencida: 20,
        clientesConMora: 15,
        topMorosoName: "X",
        topMorosoMonto: 5_000_000,
      },
    });

    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const carteraInsight = insights.find(i => i.domain === "cartera");
    expect(carteraInsight).toBeDefined();
    expect(carteraInsight!.severity).toBe("warning");
    expect(carteraInsight!.kind).toBe("RISK");
  });

  test("info-severity sinFecha is OBSERVATION not OPPORTUNITY", () => {
    const lowRotItems: LowRotationImportItem[] = [{
      reference: "REF001", description: "Test", currentInventory: 10,
      lastImportActivityDate: null, lastImportActivitySource: "UNAVAILABLE",
      monthsSinceLastActivity: null, inventoryValue: null,
      lastSaleDate: null, sales90d: 0, sales180d: 0,
      rotationStatus: "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION",
      costo: null, lastReceiptDate: null, lastPurchaseDate: null,
    }];

    const insights = assembleExecutiveInsights({
      snapshot: makeSnapshot(), importIntelligence: null,
      lowRotationItems: lowRotItems,
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const sinFecha = insights.find(i => i.what.includes("sin fecha"));
    expect(sinFecha).toBeDefined();
    expect(sinFecha!.severity).toBe("info");
    expect(sinFecha!.kind).toBe("OBSERVATION");
  });
});

// ── B02.1-D: Source-to-kind mapping ──────────────────────────────────────────

describe("B02.1-D — Source-to-kind mapping", () => {
  test("refsAgotadas → RISK", () => {
    const insights = assembleExecutiveInsights({
      snapshot: makeSnapshot({ refsAgotadas: 5 }),
      importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });
    const inv = insights.find(i => i.what.includes("agotadas"));
    expect(inv!.kind).toBe("RISK");
  });

  test("recompra urgente → RISK", () => {
    const intel = {
      items: [], kpis: { comprarAhora: 3, vigilar: 0, noRecomprar: 0, sinDatos: 0, total: 3 },
    } as any;
    const insights = assembleExecutiveInsights({
      snapshot: makeSnapshot(), importIntelligence: intel, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });
    const recompra = insights.find(i => i.what.includes("recompra inmediata"));
    expect(recompra!.kind).toBe("RISK");
  });

  test("snapshot.alertas → RISK", () => {
    const snapshot = makeSnapshot({
      alertas: [
        { id: "alert-test", module: "ventas", title: "Venta baja", detail: "detalles", severity: "warning", action: null },
      ],
    });
    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });
    const alerta = insights.find(i => i.what === "Venta baja");
    expect(alerta!.kind).toBe("RISK");
  });

  test("snapshot.insights (concentration) → OBSERVATION", () => {
    const snapshot = makeSnapshot({
      insights: [
        { id: "ins-1", text: "Top 3 vendedores concentran 92%.", severity: "warning" },
      ],
    });
    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });
    const conc = insights.find(i => i.what.includes("concentran"));
    expect(conc!.kind).toBe("OBSERVATION");
  });
});

// ── B02.1-E: No OPPORTUNITY invented ─────────────────────────────────────────

describe("B02.1-E — No OPPORTUNITY invented", () => {
  test("no insight has kind OPPORTUNITY from current sources", () => {
    const snapshot = makeSnapshot({
      refsAgotadas: 25, refsCriticas: 10,
      cartera: {
        carteraTotal: 200_000_000, carteraVencida: 40_000_000,
        pctVencida: 20, clientesConMora: 15,
        topMorosoName: "X", topMorosoMonto: 5_000_000,
      },
      insights: [
        { id: "i1", text: "Top 3 vendedores concentran 92%.", severity: "warning" },
      ],
      alertas: [
        { id: "a1", module: "ventas", title: "Alerta", detail: "d", severity: "critical", action: null },
      ],
    });
    const intel = {
      items: [makeImportItem()], kpis: { comprarAhora: 3, vigilar: 0, noRecomprar: 0, sinDatos: 0, total: 3 },
    } as any;
    const lowRotItems: LowRotationImportItem[] = [{
      reference: "REF001", description: "Test", currentInventory: 10,
      lastImportActivityDate: "2025-06-01", lastImportActivitySource: "SAG_RECEIPT_C1_C2",
      monthsSinceLastActivity: 26, inventoryValue: 500_000,
      lastSaleDate: null, sales90d: 0, sales180d: 0,
      rotationStatus: "LOW_ROTATION",
      costo: 10000, lastReceiptDate: "2025-06-01", lastPurchaseDate: null,
    }];

    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: intel, lowRotationItems: lowRotItems,
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const opportunities = insights.filter(i => i.kind === "OPPORTUNITY");
    expect(opportunities.length).toBe(0);
  });
});

// ── B02.1-F: Grouping order in sorted output ────────────────────────────────

describe("B02.1-F — Sort groups by kind then severity", () => {
  test("RISK before OBSERVATION in sorted output", () => {
    const snapshot = makeSnapshot({
      refsAgotadas: 5,
      insights: [
        { id: "i1", text: "Top 3 vendedores concentran 92%.", severity: "warning" },
      ],
    });
    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const riskIdx = insights.findIndex(i => i.kind === "RISK");
    const obsIdx = insights.findIndex(i => i.kind === "OBSERVATION");
    expect(riskIdx).toBeLessThan(obsIdx);
  });

  test("within RISK group, critical before warning", () => {
    const snapshot = makeSnapshot({
      refsAgotadas: 25,
      refsCriticas: 10,
      cartera: {
        carteraTotal: 200_000_000, carteraVencida: 80_000_000,
        pctVencida: 40, clientesConMora: 25,
        topMorosoName: "X", topMorosoMonto: 10_000_000,
      },
    });
    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    const risks = insights.filter(i => i.kind === "RISK");
    expect(risks.length).toBeGreaterThanOrEqual(2);
    const critIdx = risks.findIndex(i => i.severity === "critical");
    const warnIdx = risks.findIndex(i => i.severity === "warning");
    if (critIdx >= 0 && warnIdx >= 0) {
      expect(critIdx).toBeLessThan(warnIdx);
    }
  });
});

// ── B02.1-G: Client groups by kind ──────────────────────────────────────────

describe("B02.1-G — Client groups by kind not severity", () => {
  test("client uses KIND_CONFIG not SEVERITY_CONFIG for grouping", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain("KIND_CONFIG");
    expect(src).not.toContain("SEVERITY_CONFIG");
  });

  test("client groups iterate over RISK/OPPORTUNITY/OBSERVATION", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain('"RISK"');
    expect(src).toContain('"OPPORTUNITY"');
    expect(src).toContain('"OBSERVATION"');
  });

  test("client imports InsightKind type", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain("InsightKind");
  });
});

// ── B02.1-H: Group labels correct ────────────────────────────────────────────

describe("B02.1-H — Group labels", () => {
  test("RISK label is Requiere atencion", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain('RISK: { label: "Requiere atencion"');
  });

  test("OPPORTUNITY label is Oportunidades", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain('OPPORTUNITY: { label: "Oportunidades"');
  });

  test("OBSERVATION label is Seguimiento", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain('OBSERVATION: { label: "Seguimiento"');
  });
});

// ── B02.1-I: Intelligence assembler is still pure ────────────────────────────

describe("B02.1-I — Intelligence purity preserved", () => {
  test("no AI SDK imports in intelligence module", () => {
    const src = readFile("lib/comercial/executive/commercial-executive-intelligence.ts");
    expect(src).not.toContain('import { OpenAI');
    expect(src).not.toContain('import Anthropic');
    expect(src).not.toContain("import { prisma");
  });

  test("deterministic: same input same output", () => {
    const args = {
      snapshot: makeSnapshot({ refsAgotadas: 5 }),
      importIntelligence: null,
      lowRotationItems: [] as LowRotationImportItem[],
      orgSlug: "castillitos",
      asOf: "2026-08-11T06:00:00.000Z",
    };
    const r1 = assembleExecutiveInsights(args);
    const r2 = assembleExecutiveInsights(args);
    expect(r1.map(i => i.kind)).toEqual(r2.map(i => i.kind));
    expect(r1.map(i => i.severity)).toEqual(r2.map(i => i.severity));
  });
});

// ── B02.1-J: Severity preserved on every insight ─────────────────────────────

describe("B02.1-J — Severity still present", () => {
  test("all insights retain severity field", () => {
    const snapshot = makeSnapshot({
      refsAgotadas: 25, refsCriticas: 10,
      insights: [{ id: "i1", text: "Concentration fact.", severity: "info" }],
    });
    const insights = assembleExecutiveInsights({
      snapshot, importIntelligence: null, lowRotationItems: [],
      orgSlug: "castillitos", asOf: "2026-08-11T06:00:00.000Z",
    });

    for (const i of insights) {
      expect(["critical", "warning", "info"]).toContain(i.severity);
    }
  });
});
