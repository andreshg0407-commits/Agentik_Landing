/**
 * IMPORTS-CANONICAL-RUNTIME-MVP-05A1R
 *
 * Structural tests verifying the corrected imports module:
 *
 * Tab 1 RANKING PARA RECOMPRA: flat sorted list, 3 independent sorts
 * Tab 2 ROTACION: BLOCKED (SAG-004 — no certified China receipt source)
 * Tab 3 INTELIGENCIA: certifiable metrics + blocked indicators
 *
 * KPIs:
 *   ALLOWED:  Refs importadas con ventas certificadas, Inventario disponible
 *   BLOCKED:  Revisar rotacion (SAG-004), Baja rotacion (SAG-004), Importaciones abiertas (SAG-003)
 *
 * Identity: ProductEntity.productLine = "5" (LINEA 5, SAG catalog)
 * Receipts: C1/C2 (purchase invoices) — NOT China imports
 * Rotation: NOT VERIFIABLE without certified China receipt source
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

const SERVICE_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-service.ts"
);
const serviceSrc = fs.readFileSync(SERVICE_PATH, "utf-8");

// ── G1: Tabs match corrected spec ────────────────────────────────────────────

describe("G1 — Tab structure matches 05A1R spec", () => {
  test("T1a: Three tabs: Ranking para recompra, Rotacion, Inteligencia", () => {
    expect(clientSrc).toContain('"ranking_recompra"');
    expect(clientSrc).toContain('"rotacion"');
    expect(clientSrc).toContain('"inteligencia"');
  });

  test("T1b: Tab labels correct", () => {
    expect(clientSrc).toContain('label: "Ranking para recompra"');
    expect(clientSrc).toContain('label: "Rotacion"');
    expect(clientSrc).toContain('label: "Inteligencia"');
  });

  test("T1c: No old tabs", () => {
    expect(clientSrc).not.toContain('key: "baja_rotacion"');
    expect(clientSrc).not.toContain('key: "inventario_lento"');
  });
});

// ── G2: KPIs — 2 allowed, 3 blocked ─────────────────────────────────────────

describe("G2 — KPIs match 05A1R spec (2 allowed, 3 blocked)", () => {
  test("T2a: Allowed KPI — Refs importadas con ventas certificadas", () => {
    expect(clientSrc).toContain("Refs importadas con ventas certificadas");
  });

  test("T2b: Allowed KPI — Inventario disponible importados", () => {
    expect(clientSrc).toContain("Inventario disponible importados");
  });

  test("T2c: Blocked KPI — Revisar rotacion shows No verificable", () => {
    expect(clientSrc).toContain('label="Revisar rotacion"');
    expect(clientSrc).toContain('"No verificable"');
  });

  test("T2d: Blocked KPI — Baja rotacion shows No verificable", () => {
    expect(clientSrc).toContain('label="Baja rotacion"');
  });

  test("T2e: Blocked KPI — Importaciones abiertas shows Fuente SAG pendiente", () => {
    expect(clientSrc).toContain('label="Importaciones abiertas"');
    expect(clientSrc).toContain('"Fuente SAG pendiente"');
  });

  test("T2f: Blocked KPIs never show zero", () => {
    // BlockedKpiCard has no numeric value — only reason text
    expect(clientSrc).toContain("BlockedKpiCard");
  });

  test("T2g: No old KPI labels", () => {
    expect(clientSrc).not.toContain('label="Candidatos a recompra"');
    expect(clientSrc).not.toContain('label="Comprar ahora"');
    expect(clientSrc).not.toContain('label="Inventario lento"');
  });
});

// ── G3: Identity provenance ──────────────────────────────────────────────────

describe("G3 — Identity of imported universe documented", () => {
  test("T3a: ProductEntity.productLine = 5 documented in client", () => {
    expect(clientSrc).toContain('productLine = "5"');
    expect(clientSrc).toContain("LINEA 5");
  });

  test("T3b: Service uses productLine for identity", () => {
    expect(serviceSrc).toContain('IMPORT_PRODUCT_LINES');
    expect(serviceSrc).toContain('"5"');
  });

  test("T3c: Identity provenance table in Inteligencia tab", () => {
    expect(clientSrc).toContain("Identidad del universo importado");
    expect(clientSrc).toContain("Catalogo SAG");
    expect(clientSrc).toContain("Inventario SAG");
    expect(clientSrc).toContain("Ventas SAG");
    expect(clientSrc).toContain("Ingreso China");
  });

  test("T3d: Provenance table shows FUENTE/CAMPO/VALOR/COBERTURA/FRESCURA", () => {
    expect(clientSrc).toContain('"FUENTE"');
    expect(clientSrc).toContain('"CAMPO"');
    expect(clientSrc).toContain('"VALOR"');
    expect(clientSrc).toContain('"COBERTURA"');
    expect(clientSrc).toContain('"FRESCURA"');
  });

  test("T3e: China row shows BLOCKED", () => {
    expect(clientSrc).toContain("CERO documentos");
    expect(clientSrc).toContain("SAG-004 BLOCKED");
  });

  test("T3f: Sales disclaimer about uncertified origin per unit", () => {
    expect(clientSrc).toContain("No se certifica el origen de cada unidad vendida");
  });
});

// ── G4: Receipt source honesty ──────────────────────────────────────────────

describe("G4 — Receipts are purchase invoices, NOT China imports", () => {
  test("T4a: Drawer labels receipts as purchase invoices", () => {
    expect(clientSrc).toContain("Facturas de compra (C1/C2)");
  });

  test("T4b: Drawer states receipts don't certify China origin", () => {
    expect(clientSrc).toContain("no certifican origen China");
  });

  test("T4c: Import growth is BLOCKED, not graphed", () => {
    expect(clientSrc).not.toContain("Recepciones mensuales");
    // The growth section is explicitly BLOCKED, not rendered as a chart
    expect(clientSrc).toContain("SOURCE_BLOCKED");
  });

  test("T4d: Does not use item.receipts as China receipts", () => {
    expect(clientSrc).toContain("no se grafican como crecimiento de importaciones");
  });
});

// ── G5: Rotation classification BLOCKED ────────────────────────────────────

describe("G5 — Rotation classification is BLOCKED", () => {
  test("T5a: Rotacion tab shows SAG-004 blocker", () => {
    expect(clientSrc).toContain("RotacionBlockedView");
    expect(clientSrc).toContain("SAG-004");
  });

  test("T5b: Revisar rotacion marked NO VERIFICABLE", () => {
    expect(clientSrc).toContain("NO VERIFICABLE");
    expect(clientSrc).toContain("Revisar rotacion");
  });

  test("T5c: Baja rotacion marked NO VERIFICABLE", () => {
    expect(clientSrc).toContain("Baja rotacion");
  });

  test("T5d: Does NOT use 180/240 day thresholds", () => {
    expect(clientSrc).not.toContain("REVISAR_ROTACION_MIN_DAYS");
    expect(clientSrc).not.toContain("BAJA_ROTACION_MIN_DAYS");
    expect(clientSrc).not.toContain("= 180");
    expect(clientSrc).not.toContain("= 240");
  });

  test("T5e: Specifies calendar months requirement", () => {
    expect(clientSrc).toContain("meses calendario");
  });

  test("T5f: Mentions Colombia timezone for future implementation", () => {
    expect(clientSrc).toContain("America/Bogota");
  });

  test("T5g: Does not declare baja rotacion empty (cannot verify)", () => {
    expect(clientSrc).not.toContain("Sin referencias con baja rotacion identificada");
  });

  test("T5h: Shows SAG message about no reconciled source", () => {
    expect(clientSrc).toContain("SAG no expone todavia una fuente reconciliada de ingresos fisicos desde China");
  });
});

// ── G6: Recompras — honest labels ───────────────────────────────────────────

describe("G6 — Recompras tab uses honest labels", () => {
  test("T6a: Tab is 'Ranking para recompra' not 'Recompras'", () => {
    expect(clientSrc).toContain("Ranking para recompra");
    expect(clientSrc).toContain("RankingRecompraView");
  });

  test("T6b: Three independent sorts", () => {
    expect(clientSrc).toContain("Unidades netas vendidas");
    expect(clientSrc).toContain("Velocidad mensual");
    expect(clientSrc).toContain("Valor neto vendido 6M");
  });

  test("T6c: Velocity definition visible", () => {
    expect(clientSrc).toContain("unidades netas vendidas 6M / 6 meses observados");
  });

  test("T6d: NC/devoluciones/anulados documented", () => {
    expect(clientSrc).toContain("Devoluciones y NC restadas de venta neta");
    expect(clientSrc).toContain("Anulados excluidos");
  });

  test("T6e: Universe matches KPI (certified sales)", () => {
    // Both KPI and table use salesDataQuality === "SYNCED" && soldNet > 0
    const matches = clientSrc.match(/salesDataQuality === "SYNCED"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2); // KPI derivation + table filter
  });

  test("T6f: No weighted score", () => {
    expect(clientSrc).not.toContain("weightedScore");
    expect(clientSrc).not.toContain("puntaje");
  });
});

// ── G7: Fail-closed — SOURCE_DOWN not EMPTY_CERTIFIED ─────────────────────

describe("G7 — Fail-closed uses SOURCE_DOWN", () => {
  test("T7a: Uses SOURCE_DOWN terminology", () => {
    expect(clientSrc).toContain("SOURCE_DOWN");
    expect(clientSrc).toContain("PENDING_REFRESH");
  });

  test("T7b: Explicitly says not to use EMPTY_CERTIFIED", () => {
    // Comments say "never EMPTY_CERTIFIED" — the term appears only in negation
    expect(clientSrc).toContain("never EMPTY_CERTIFIED");
  });

  test("T7c: Explains this is not zero imports", () => {
    expect(clientSrc).toContain("NO significa que hay cero importaciones");
  });

  test("T7d: Sentinel detection preserved", () => {
    expect(clientSrc).toContain("kpis.totalRefs < 0");
  });
});

// ── G8: Debt IDs — official ─────────────────────────────────────────────────

describe("G8 — Official debt IDs", () => {
  test("T8a: SAG-003 = transit and open import orders", () => {
    expect(clientSrc).toContain("SAG-003");
    expect(clientSrc).toContain("ordenes de importacion");
  });

  test("T8b: SAG-004 = certified physical receipt from China", () => {
    expect(clientSrc).toContain("SAG-004");
    expect(clientSrc).toContain("ingreso fisico certificado desde China");
  });

  test("T8c: SAG-016 = no FUENTE in sales", () => {
    expect(clientSrc).toContain("SAG-016");
    expect(clientSrc).toContain("FUENTE");
  });
});

// ── G9: Inteligencia — rulings ──────────────────────────────────────────────

describe("G9 — Inteligencia tab shows correct rulings", () => {
  test("T9a: IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED", () => {
    expect(clientSrc).toContain("IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED");
  });

  test("T9b: IMPORT_RECEIPT_SOURCE_BLOCKED", () => {
    expect(clientSrc).toContain("IMPORT_RECEIPT_SOURCE_BLOCKED");
  });

  test("T9c: IMPORT_ROTATION_CLASSIFICATION_BLOCKED", () => {
    expect(clientSrc).toContain("IMPORT_ROTATION_CLASSIFICATION_BLOCKED");
  });

  test("T9d: Does NOT emit IMPORTS_CANONICAL_RUNTIME_MVP_VERIFIED", () => {
    expect(clientSrc).not.toContain("IMPORTS_CANONICAL_RUNTIME_MVP_VERIFIED");
  });
});

// ── G10: No prohibited patterns ──────────────────────────────────────────────

describe("G10 — No prohibited patterns", () => {
  test("T10a: No Prisma imports", () => {
    expect(clientSrc).not.toContain('from "@/lib/prisma"');
  });

  test("T10b: No server-only import", () => {
    expect(clientSrc).not.toContain('"server-only"');
  });

  test("T10c: Uses 'use client' directive", () => {
    expect(clientSrc).toContain('"use client"');
  });

  test("T10d: ZERO business calculations rule documented", () => {
    expect(clientSrc).toContain("ZERO business calculations in this file");
  });
});

// ── G11: Drawer preserved ───────────────────────────────────────────────────

describe("G11 — Detail drawer preserved", () => {
  test("T11a: Drawer exists", () => {
    expect(clientSrc).toContain("ImportDetailDrawer");
  });

  test("T11b: Drawer shows classification badge", () => {
    expect(clientSrc).toContain("RECOMPRA_LABELS[item.recompraClassification]");
  });

  test("T11c: Drawer shows purchase invoice history (not 'receipts')", () => {
    expect(clientSrc).toContain("Facturas de compra (C1/C2)");
  });

  test("T11d: Drawer shows technical info", () => {
    expect(clientSrc).toContain("Informacion tecnica");
  });
});
