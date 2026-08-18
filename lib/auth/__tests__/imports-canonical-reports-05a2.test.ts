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

  test("T3d: KPI — Mas de 8 meses certificados", () => {
    expect(clientSrc).toContain("Mas de 8 meses certificados");
    expect(clientSrc).toContain("masde8MesesCertificados");
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

  test("T5b: Filters by EXISTENCIA B24 > 0", () => {
    expect(clientSrc).toContain("item.remaining > 0");
    expect(clientSrc).toContain('stockDataQuality === "CONFIRMED"');
  });

  test("T5c: Coverage info displayed", () => {
    expect(clientSrc).toContain("Cobertura stock B24");
    expect(clientSrc).toContain("Parcial");
    expect(clientSrc).toContain("refs sin dato B24 excluidas");
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

  test("T6c: Certified vs proxy separation", () => {
    expect(clientSrc).toContain("Certificados");
    expect(clientSrc).toContain("Proxy");
    expect(clientSrc).toContain("certifiedList");
    expect(clientSrc).toContain("proxyList");
  });

  test("T6d: Evidence table shows required columns", () => {
    expect(clientSrc).toContain("Evidencia");
    expect(clientSrc).toContain("Meses");
    expect(clientSrc).toContain("Fuente");
  });

  test("T6e: Proxy items have warning banner", () => {
    expect(clientSrc).toContain("fechas proxy");
    expect(clientSrc).toContain("requieren SAG-004 para verificacion");
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

  test("T7b: Chart 1 — C1/C2 documented purchases", () => {
    expect(clientSrc).toContain("Compras documentadas C1/C2");
    expect(clientSrc).toContain("facturas de compra");
  });

  test("T7c: Chart 2 — import product sales", () => {
    expect(clientSrc).toContain("Ventas de productos importados");
  });

  test("T7d: SAG blockers section", () => {
    expect(clientSrc).toContain("Blockers SAG");
    expect(clientSrc).toContain("SAG-003");
    expect(clientSrc).toContain("SAG-004");
    expect(clientSrc).toContain("SAG-016");
  });

  test("T7e: Identity provenance table", () => {
    expect(clientSrc).toContain("Identidad del universo importado");
    expect(clientSrc).toContain("Catalogo SAG");
    expect(clientSrc).toContain("Inventario SAG");
    expect(clientSrc).toContain("Ventas SAG");
    expect(clientSrc).toContain("Ingreso China");
  });

  test("T7f: Provenance columns", () => {
    expect(clientSrc).toContain('"FUENTE"');
    expect(clientSrc).toContain('"CAMPO"');
    expect(clientSrc).toContain('"VALOR"');
    expect(clientSrc).toContain('"COBERTURA"');
    expect(clientSrc).toContain('"FRESCURA"');
  });

  test("T7g: China row shows BLOCKED", () => {
    expect(clientSrc).toContain("CERO documentos");
    expect(clientSrc).toContain("SAG-004 BLOCKED");
    expect(clientSrc).toContain("SOURCE_BLOCKED");
  });

  test("T7h: Receipt honesty disclaimer", () => {
    expect(clientSrc).toContain("no certifican origen China");
    expect(clientSrc).toContain("no se grafican como crecimiento de importaciones");
  });

  test("T7i: Sales origin disclaimer", () => {
    expect(clientSrc).toContain("No se certifica el origen de cada unidad vendida");
  });

  test("T7j: Inbound date coverage section", () => {
    expect(clientSrc).toContain("Cobertura de fecha de ingreso");
    expect(clientSrc).toContain("C1/C2 (certificado)");
    expect(clientSrc).toContain("d_ultima_compra (proxy)");
    expect(clientSrc).toContain("Sin fecha");
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

  test("T8d: Rulings section in UI", () => {
    expect(clientSrc).toContain("Rulings emitidos");
    expect(clientSrc).toContain("RulingRow");
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

// ── G14: Detail drawer preserved ────────────────────────────────────────────

describe("G14 — Detail drawer preserved", () => {
  test("T14a: Drawer exists", () => {
    expect(clientSrc).toContain("ImportDetailDrawer");
  });

  test("T14b: Drawer shows classification badge", () => {
    expect(clientSrc).toContain("RECOMPRA_LABELS[item.recompraClassification]");
  });

  test("T14c: Drawer shows purchase invoice history (not 'receipts')", () => {
    expect(clientSrc).toContain("Facturas de compra (C1/C2)");
  });

  test("T14d: Drawer shows technical info", () => {
    expect(clientSrc).toContain("Informacion tecnica");
  });

  test("T14e: Drawer shows evidence for inbound date", () => {
    expect(clientSrc).toContain("Ultimo ingreso documentado");
  });
});
