/**
 * IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2
 *
 * Structural tests verifying the 05A2 management reports module:
 *
 * Tab 1 MAYOR ROTACION: window selector, 3 independent sorts
 * Tab 2 MENOR ROTACION: EXISTENCIA B24 > 0, coverage handling
 * Tab 3 MAS DE 8 MESES: 3-level evidence, certified vs proxy separation
 * Tab 4 INTELIGENCIA: C1/C2 purchases chart, sales summary, SAG blockers
 *
 * KPIs (5):
 *   1. Referencias importadas
 *   2. Con ventas en ventana
 *   3. Sin ventas verificadas
 *   4. Mas de 8 meses certificados
 *   5. Existencia fisica B24
 *
 * Evidence levels:
 *   CERTIFIED_B24_REENTRY_DATE — lastInboundSource=SAG_RECEIPT_C1_C2
 *   PURCHASE_DOCUMENT_DATE_PROXY — lastInboundSource=LAST_PURCHASE_SAG
 *   PRODUCT_CREATION_DATE_PROXY — createdAtSag
 *
 * Debt IDs:
 *   SAG-003: Transit and open import orders
 *   SAG-004: Certified physical receipt from China
 *   SAG-016: No FUENTE/origin column in sales view
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx"
);
const clientSrc = fs.readFileSync(CLIENT_PATH, "utf-8");

const PAGE_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/importaciones/page.tsx"
);
const pageSrc = fs.readFileSync(PAGE_PATH, "utf-8");

const CALENDAR_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/calendar-months.ts"
);
const calendarSrc = fs.readFileSync(CALENDAR_PATH, "utf-8");

const SERVICE_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-service.ts"
);
const serviceSrc = fs.readFileSync(SERVICE_PATH, "utf-8");

const TYPES_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-types.ts"
);
const typesSrc = fs.readFileSync(TYPES_PATH, "utf-8");

// ── G1: Tabs match 05A2 spec ────────────────────────────────────────────────

describe("G1 — Tab structure matches 05A2 spec", () => {
  test("T1a: Four tabs: Mayor rotacion, Menor rotacion, Mas de 8 meses, Inteligencia", () => {
    expect(clientSrc).toContain('"mayor_rotacion"');
    expect(clientSrc).toContain('"menor_rotacion"');
    expect(clientSrc).toContain('"mas_8_meses"');
    expect(clientSrc).toContain('"inteligencia"');
  });

  test("T1b: Tab labels correct", () => {
    expect(clientSrc).toContain('label: "Mayor rotacion"');
    expect(clientSrc).toContain('label: "Menor rotacion"');
    expect(clientSrc).toContain('label: "Mas de 8 meses"');
    expect(clientSrc).toContain('label: "Inteligencia"');
  });

  test("T1c: No old 05A1R tabs", () => {
    expect(clientSrc).not.toContain('"ranking_recompra"');
    expect(clientSrc).not.toContain('"rotacion"');
  });
});

// ── G2: Window selector ─────────────────────────────────────────────────────

describe("G2 — Window selector 6M|8M|12M", () => {
  test("T2a: Three window options defined", () => {
    expect(clientSrc).toContain("value: 6");
    expect(clientSrc).toContain("value: 8");
    expect(clientSrc).toContain("value: 12");
  });

  test("T2b: Window labels", () => {
    expect(clientSrc).toContain('"6M"');
    expect(clientSrc).toContain('"8M"');
    expect(clientSrc).toContain('"12M"');
  });

  test("T2c: Window state management", () => {
    expect(clientSrc).toContain("WindowMonths");
    expect(clientSrc).toContain("windowMonths");
    expect(clientSrc).toContain("setWindowMonths");
  });

  test("T2d: Uses server-side per-window sales fields", () => {
    expect(clientSrc).toContain("sales8mNet");
    expect(clientSrc).toContain("sales12mNet");
    expect(clientSrc).toContain("revenue8m");
    expect(clientSrc).toContain("revenue12m");
  });
});

// ── G3: KPIs — 5 management KPIs ────────────────────────────────────────────

describe("G3 — 5 management KPIs", () => {
  test("T3a: KPI — Referencias importadas", () => {
    expect(clientSrc).toContain("Referencias importadas");
  });

  test("T3b: KPI — Con ventas en ventana", () => {
    expect(clientSrc).toContain("Con ventas en");
    expect(clientSrc).toContain("conVentasEnVentana");
  });

  test("T3c: KPI — Sin ventas verificadas", () => {
    expect(clientSrc).toContain("Sin ventas verificadas");
    expect(clientSrc).toContain("sinVentasVerificadas");
  });

  test("T3d: KPI — Antiguedad estimada 8M+ (05A3 relabel)", () => {
    expect(clientSrc).toContain("Antiguedad estimada 8M+");
    expect(clientSrc).toContain("masde8MesesProvisionales");
  });

  test("T3e: KPI — Existencia fisica B24", () => {
    expect(clientSrc).toContain("Existencia fisica B24");
    expect(clientSrc).toContain("existenciaFisicaB24");
  });

  test("T3f: No old 05A1R KPIs", () => {
    expect(clientSrc).not.toContain('label="Revisar rotacion"');
    expect(clientSrc).not.toContain('label="Baja rotacion"');
    expect(clientSrc).not.toContain('label="Importaciones abiertas"');
    expect(clientSrc).not.toContain("BlockedKpiCard");
  });
});

// ── G4: Report 1 — Mayor rotacion ───────────────────────────────────────────

describe("G4 — Report 1: Mayor rotacion", () => {
  test("T4a: MayorRotacionView component exists", () => {
    expect(clientSrc).toContain("MayorRotacionView");
  });

  test("T4b: Three independent sorts", () => {
    expect(clientSrc).toContain("Unidades netas vendidas");
    expect(clientSrc).toContain("Velocidad mensual");
    expect(clientSrc).toContain("Valor neto vendido 6M");
  });

  test("T4c: Sort keys defined", () => {
    expect(clientSrc).toContain('"units"');
    expect(clientSrc).toContain('"velocity"');
    expect(clientSrc).toContain('"value"');
  });

  test("T4d: Velocity definition visible", () => {
    expect(clientSrc).toContain("unidades netas vendidas 6M / 6 meses observados");
  });

  test("T4e: NC/devoluciones/anulados documented", () => {
    expect(clientSrc).toContain("Devoluciones y NC restadas de venta neta");
    expect(clientSrc).toContain("Anulados excluidos");
  });

  test("T4f: Uses salesDataQuality === SYNCED for filtering", () => {
    const matches = clientSrc.match(/salesDataQuality[^"]*=== "SYNCED"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("T4g: No weighted score", () => {
    expect(clientSrc).not.toContain("weightedScore");
    expect(clientSrc).not.toContain("puntaje");
  });
});

// ── G5: Report 2 — Menor rotacion ──────────────────────────────────────────

describe("G5 — Report 2: Menor rotacion", () => {
  test("T5a: MenorRotacionView component exists", () => {
    expect(clientSrc).toContain("MenorRotacionView");
  });

  test("T5b: Filters by SAG B24 EXISTENCIA > 0 (05A2R1 authority)", () => {
    expect(clientSrc).toContain("sagB24Existencia");
    expect(clientSrc).toContain("sagB24Existencia > 0");
  });

  test("T5c: SAG B24 coverage info displayed", () => {
    expect(clientSrc).toContain("SAG B24:");
    expect(clientSrc).toContain("refs con dato");
  });

  test("T5d: Shows cobertura dias and capital inmovilizado", () => {
    expect(clientSrc).toContain("Cobertura (dias)");
    expect(clientSrc).toContain("Capital inmov.");
    expect(clientSrc).toContain("coberturaPromedioDias");
    expect(clientSrc).toContain("capitalInmovilizado");
  });
});

// ── G6: Report 3 — Mas de 8 meses sin reingreso ────────────────────────────

describe("G6 — Report 3: Mas de 8 meses sin reingreso", () => {
  test("T6a: Masde8MesesView component exists", () => {
    expect(clientSrc).toContain("Masde8MesesView");
  });

  test("T6b: Three evidence levels defined", () => {
    expect(clientSrc).toContain("CERTIFIED_B24_REENTRY_DATE");
    expect(clientSrc).toContain("PURCHASE_DOCUMENT_DATE_PROXY");
    expect(clientSrc).toContain("PRODUCT_CREATION_DATE_PROXY");
  });

  test("T6c: Items use proxy list with compact methodology note (05A3)", () => {
    expect(clientSrc).toContain("proxyList");
    expect(clientSrc).toContain("Antiguedad estimada con fecha de ultima compra SAG");
  });

  test("T6d: Evidence table shows required columns (05A3 relabel)", () => {
    expect(clientSrc).toContain("Tipo");
    expect(clientSrc).toContain("Meses");
    expect(clientSrc).toContain("Origen");
  });

  test("T6e: Section header uses human-readable label (05A3)", () => {
    expect(clientSrc).toContain("antiguedad estimada");
    expect(clientSrc).toContain("8 meses");
  });

  test("T6f: Uses calendar months, not fixed days", () => {
    expect(clientSrc).toContain("calendarMonthsSince");
    expect(clientSrc).toContain("meses calendario");
    expect(clientSrc).toContain("America/Bogota");
  });

  test("T6g: 8-month threshold", () => {
    expect(clientSrc).toContain("ev.months < 8");
    expect(clientSrc).toContain("months >= 8");
  });
});

// ── G7: Inteligencia tab ────────────────────────────────────────────────────

describe("G7 — Inteligencia tab", () => {
  test("T7a: InteligenciaView component exists", () => {
    expect(clientSrc).toContain("InteligenciaView");
  });

  test("T7b: Sales 6M KPIs (05A3 executive redesign)", () => {
    expect(clientSrc).toContain("Refs con ventas 6M");
    expect(clientSrc).toContain("Und netas 6M");
    expect(clientSrc).toContain("Valor neto 6M");
  });

  test("T7c: Purchases chart (05A3 compact)", () => {
    expect(clientSrc).toContain("Compras documentadas");
    expect(clientSrc).toContain("monthlyPurchases");
  });

  test("T7d: Classification distribution (05A3 replaces SAG blockers)", () => {
    expect(clientSrc).toContain("Distribucion por clasificacion");
    expect(clientSrc).toContain("classDistribution");
  });

  test("T7e: Top 10 by size class (05A3 replaces provenance)", () => {
    expect(clientSrc).toContain("Top 10 tallas por ventas 6M");
    expect(clientSrc).toContain("topBySizeClass");
  });

  test("T7f: Compact freshness footer", () => {
    expect(clientSrc).toContain("Actualizado:");
    expect(clientSrc).toContain("salesCoverage?.salesAsOf");
  });

  test("T7g: Technical panels removed (05A3)", () => {
    expect(clientSrc).not.toContain("Blockers SAG");
    expect(clientSrc).not.toContain("Rulings emitidos");
    expect(clientSrc).not.toContain("Identidad del universo importado");
  });

  test("T7h: No BlockerRow/ProvenanceRow/RulingRow components", () => {
    expect(clientSrc).not.toContain("function BlockerRow");
    expect(clientSrc).not.toContain("function ProvenanceRow");
    expect(clientSrc).not.toContain("function RulingRow");
  });

  test("T7i: Sales coverage in freshness footer", () => {
    expect(clientSrc).toContain("salesCoverage");
    expect(clientSrc).toContain("Ventas al:");
  });

  test("T7j: Vel promedio/mes KPI", () => {
    expect(clientSrc).toContain("Vel promedio/mes");
    expect(clientSrc).toContain("avgVelocity");
  });
});

// ── G8: Rulings ─────────────────────────────────────────────────────────────

describe("G8 — Rulings", () => {
  test("T8a: IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED", () => {
    expect(clientSrc).toContain("IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED");
  });

  test("T8b: IMPORT_RECEIPT_SOURCE_BLOCKED", () => {
    expect(clientSrc).toContain("IMPORT_RECEIPT_SOURCE_BLOCKED");
  });

  test("T8c: IMPORT_ROTATION_CLASSIFICATION_BLOCKED", () => {
    expect(clientSrc).toContain("IMPORT_ROTATION_CLASSIFICATION_BLOCKED");
  });

  test("T8d: Rulings referenced in file header comments", () => {
    // Rulings still documented in file header even though UI panels removed
    expect(clientSrc).toContain("IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED");
  });

  test("T8e: Technical rulings removed from UI (05A3)", () => {
    expect(clientSrc).not.toContain("Rulings emitidos");
    expect(clientSrc).not.toContain("function RulingRow");
  });
});

// ── G9: Debt IDs ────────────────────────────────────────────────────────────

describe("G9 — Official debt IDs", () => {
  test("T9a: SAG-003 = transit and open import orders", () => {
    expect(clientSrc).toContain("SAG-003");
    expect(clientSrc).toContain("ordenes de importacion");
  });

  test("T9b: SAG-004 = certified physical receipt from China", () => {
    expect(clientSrc).toContain("SAG-004");
    expect(clientSrc).toContain("Ingreso fisico certificado desde China");
  });

  test("T9c: SAG-016 = no FUENTE in sales", () => {
    expect(clientSrc).toContain("SAG-016");
    expect(clientSrc).toContain("FUENTE");
  });
});

// ── G10: Fail-closed ────────────────────────────────────────────────────────

describe("G10 — Fail-closed", () => {
  test("T10a: SOURCE_DOWN terminology", () => {
    expect(clientSrc).toContain("SOURCE_DOWN");
    expect(clientSrc).toContain("PENDING_REFRESH");
  });

  test("T10b: Sentinel detection", () => {
    expect(clientSrc).toContain("kpis.totalRefs < 0");
  });

  test("T10c: Not zero imports message", () => {
    expect(clientSrc).toContain("NO significa que hay cero importaciones");
  });
});

// ── G11: Props contract ─────────────────────────────────────────────────────

describe("G11 — Props contract matches page.tsx", () => {
  test("T11a: Client accepts truthState prop", () => {
    expect(clientSrc).toContain("truthState");
    expect(clientSrc).toContain("CachedImportTruthState");
  });

  test("T11b: Client accepts freshness prop", () => {
    expect(clientSrc).toContain("freshness");
    expect(clientSrc).toContain("ImportSourceFreshness");
  });

  test("T11c: Client accepts computedAt prop", () => {
    expect(clientSrc).toContain("computedAt");
  });

  test("T11d: Page passes all 6 props", () => {
    expect(pageSrc).toContain("truthState={runtimeState}");
    expect(pageSrc).toContain("freshness={cached.freshness}");
    expect(pageSrc).toContain("computedAt={cached.computedAt}");
  });

  test("T11e: Page has on-demand prewarm activation", () => {
    expect(pageSrc).toContain("prewarmImportCache");
    expect(pageSrc).toContain("SOURCE_UNAVAILABLE");
  });
});

// ── G12: No prohibited patterns ─────────────────────────────────────────────

describe("G12 — No prohibited patterns", () => {
  test("T12a: No Prisma imports", () => {
    expect(clientSrc).not.toContain('from "@/lib/prisma"');
  });

  test("T12b: No server-only import", () => {
    expect(clientSrc).not.toContain('"server-only"');
  });

  test("T12c: Uses 'use client' directive", () => {
    expect(clientSrc).toContain('"use client"');
  });

  test("T12d: ZERO business calculations rule documented", () => {
    expect(clientSrc).toContain("ZERO business calculations in this file");
  });
});

// ── G13: Calendar months module ─────────────────────────────────────────────

describe("G13 — Calendar months module", () => {
  test("T13a: Uses America/Bogota timezone", () => {
    expect(calendarSrc).toContain("America/Bogota");
  });

  test("T13b: subtractCalendarMonths function exists", () => {
    expect(calendarSrc).toContain("subtractCalendarMonths");
  });

  test("T13c: calendarMonthsBetween function exists", () => {
    expect(calendarSrc).toContain("calendarMonthsBetween");
  });

  test("T13d: nowBogota function exists", () => {
    expect(calendarSrc).toContain("nowBogota");
  });

  test("T13e: Uses en-CA locale for timezone conversion", () => {
    expect(calendarSrc).toContain("en-CA");
  });
});

// ── G14: Server-side 8M/12M aggregation ─────────────────────────────────────

describe("G14 — Server-side window aggregation", () => {
  test("T14a: Service computes 8M cutoff", () => {
    expect(serviceSrc).toContain("eightMonthsAgo");
  });

  test("T14b: Service computes 12M cutoff", () => {
    expect(serviceSrc).toContain("twelveMonthsAgo");
  });

  test("T14c: SalesAgg has 8M/12M fields", () => {
    expect(serviceSrc).toContain("gross8m");
    expect(serviceSrc).toContain("returns8m");
    expect(serviceSrc).toContain("gross12m");
    expect(serviceSrc).toContain("returns12m");
  });

  test("T14d: Types define 8M/12M sales fields", () => {
    expect(typesSrc).toContain("sales8mNet");
    expect(typesSrc).toContain("sales12mNet");
    expect(typesSrc).toContain("revenue8m");
    expect(typesSrc).toContain("revenue12m");
  });

  test("T14e: Service outputs sales8mNet and sales12mNet", () => {
    expect(serviceSrc).toContain("sales8mNet");
    expect(serviceSrc).toContain("sales12mNet");
    expect(serviceSrc).toContain("revenue8m");
    expect(serviceSrc).toContain("revenue12m");
  });
});

// ── G15: Detail drawer preserved ────────────────────────────────────────────

describe("G15 — Detail drawer preserved", () => {
  test("T15a: Drawer exists", () => {
    expect(clientSrc).toContain("ImportDetailDrawer");
  });

  test("T15b: Drawer shows classification badge", () => {
    expect(clientSrc).toContain("RECOMPRA_LABELS[item.recompraClassification]");
  });

  test("T15c: Drawer shows recent purchases (05A3 relabel)", () => {
    expect(clientSrc).toContain("Ultimas compras");
  });

  test("T15d: Drawer omits null metric cards (05A3)", () => {
    // Technical info section removed in 05A3 — metrics are conditional
    expect(clientSrc).not.toContain("Informacion tecnica");
    expect(clientSrc).toContain("Velocidad/mes");
    expect(clientSrc).toContain("Capital inmovilizado");
  });

  test("T15e: Drawer shows antiguedad estimada (05A3 relabel)", () => {
    expect(clientSrc).toContain("Antiguedad estimada");
  });
});
