/**
 * IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2R1
 *
 * SAG B24 inventory authority correction tests.
 *
 * Verifies:
 *   1. SAG B24 inventory service exists and queries vw_agentik_inventario
 *   2. StockTruthState type exported (SAG_B24_CERTIFIED | SOURCE_DOWN)
 *   3. Intelligence service imports and calls SAG B24
 *   4. ImportSupplyIntelligenceItem has sagB24Existencia/Reservado/Disponible/stockTruthState
 *   5. Client filters "Mas de 8 meses" by sagB24Existencia > 0
 *   6. Client KPI existenciaFisicaB24 uses sagB24Existencia
 *   7. Client KPI masde8MesesProvisionales requires sagB24Existencia > 0
 *   8. MenorRotacionView filters by sagB24Existencia > 0
 *   9. SAG query uses BODEGA LIKE '24 -%'
 *  10. Fail-closed: SOURCE_DOWN when SAG fails, null stock values
 *
 * Sprint: IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2R1
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// ── Source files ──────────────────────────────────────────────────────────

const SAG_B24_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-sag-b24-inventory.ts"
);
const sagB24Src = fs.readFileSync(SAG_B24_PATH, "utf-8");

const INTEL_SERVICE_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-intelligence-service.ts"
);
const intelSrc = fs.readFileSync(INTEL_SERVICE_PATH, "utf-8");

const TYPES_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-types.ts"
);
const typesSrc = fs.readFileSync(TYPES_PATH, "utf-8");

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx"
);
const clientSrc = fs.readFileSync(CLIENT_PATH, "utf-8");

// ═════════════════════════════════════════════════════════════════════════
// TEST GROUPS
// ═════════════════════════════════════════════════════════════════════════

describe("05A2R1 — SAG B24 Inventory Authority", () => {
  // ── T1: SAG B24 service exists and queries vw_agentik_inventario ──

  test("T1: SAG B24 service file exists", () => {
    expect(fs.existsSync(SAG_B24_PATH)).toBe(true);
  });

  test("T1: SAG B24 service queries vw_agentik_inventario", () => {
    expect(sagB24Src).toContain("vw_agentik_inventario");
  });

  test("T1: SAG B24 service imports consultaSagJson", () => {
    expect(sagB24Src).toContain("consultaSagJson");
  });

  test("T1: SAG B24 service imports getSagConnection", () => {
    expect(sagB24Src).toContain("getSagConnection");
  });

  test("T1: SAG B24 service uses CURRENT source", () => {
    expect(sagB24Src).toContain('getSagConnection("CURRENT")');
  });

  // ── T2: StockTruthState type ──

  test("T2: StockTruthState exported from SAG B24 service", () => {
    expect(sagB24Src).toMatch(/export\s+type\s+StockTruthState/);
  });

  test("T2: StockTruthState includes SAG_B24_CERTIFIED", () => {
    expect(sagB24Src).toContain("SAG_B24_CERTIFIED");
  });

  test("T2: StockTruthState includes SOURCE_DOWN", () => {
    expect(sagB24Src).toContain("SOURCE_DOWN");
  });

  // ── T3: Intelligence service integrates SAG B24 ──

  test("T3: Intelligence service imports loadSagB24Inventory", () => {
    expect(intelSrc).toContain("loadSagB24Inventory");
  });

  test("T3: Intelligence service imports from import-sag-b24-inventory", () => {
    expect(intelSrc).toContain("import-sag-b24-inventory");
  });

  test("T3: Intelligence service overlays SAG stock onto references", () => {
    expect(intelSrc).toContain("sagB24Result.stockTruthState");
  });

  // ── T4: ImportSupplyIntelligenceItem has SAG B24 fields ──

  test("T4: ImportSupplyIntelligenceItem has sagB24Existencia", () => {
    expect(typesSrc).toContain("sagB24Existencia:");
  });

  test("T4: ImportSupplyIntelligenceItem has sagB24Reservado", () => {
    expect(typesSrc).toContain("sagB24Reservado:");
  });

  test("T4: ImportSupplyIntelligenceItem has sagB24Disponible", () => {
    expect(typesSrc).toContain("sagB24Disponible:");
  });

  test("T4: ImportSupplyIntelligenceItem has stockTruthState", () => {
    expect(typesSrc).toContain("stockTruthState:");
  });

  // ── T5: Client "Mas de 8 meses" requires sagB24Existencia > 0 ──

  test("T5: Masde8MesesView checks sagB24Existencia", () => {
    expect(clientSrc).toContain("sagB24Existencia");
  });

  test("T5: Masde8MesesView requires sagB24Existencia > 0 for inclusion", () => {
    // The filter must require non-null AND > 0
    expect(clientSrc).toContain("sagExist === null || sagExist <= 0");
  });

  // ── T6: existenciaFisicaB24 KPI uses sagB24Existencia ──

  test("T6: derivarKpis uses sagB24Existencia for existencia count", () => {
    // The KPI should check sagB24Existencia, not just remaining
    const kpiSection = clientSrc.slice(
      clientSrc.indexOf("function derivarKpis"),
      clientSrc.indexOf("function derivarKpis") + 1200
    );
    expect(kpiSection).toContain("sagExist");
    expect(kpiSection).toContain("existenciaFisicaB24++");
  });

  // ── T7: masde8MesesProvisionales KPI requires sagB24Existencia > 0 ──

  test("T7: masde8MesesProvisionales requires SAG B24 stock > 0", () => {
    const kpiSection = clientSrc.slice(
      clientSrc.indexOf("function derivarKpis"),
      clientSrc.indexOf("function derivarKpis") + 1200
    );
    // Must check sagExist > 0 before counting masde8MesesProvisionales
    expect(kpiSection).toContain("sagExist > 0");
    expect(kpiSection).toContain("masde8MesesProvisionales++");
  });

  // ── T8: MenorRotacionView filters by sagB24Existencia > 0 ──

  test("T8: MenorRotacionView uses sagB24Existencia for filtering", () => {
    expect(clientSrc).toContain("sagB24Existencia > 0");
  });

  test("T8: MenorRotacionView does NOT filter by old stockDataQuality for main filter", () => {
    // The main filter should use sagB24Existencia, not the old pattern
    const menorSection = clientSrc.slice(
      clientSrc.indexOf("Items with SAG B24"),
      clientSrc.indexOf("Items with SAG B24") + 300
    );
    expect(menorSection).not.toContain("stockDataQuality");
  });

  // ── T9: SAG query uses BODEGA LIKE '24 -%' ──

  test("T9: SAG query targets warehouse 24", () => {
    expect(sagB24Src).toContain("BODEGA LIKE '24 -%'");
  });

  test("T9: SAG query selects required columns", () => {
    expect(sagB24Src).toContain("CODIGO_PRODUCTO");
    expect(sagB24Src).toContain("EXISTENCIA");
    expect(sagB24Src).toContain("RESERVADO");
    expect(sagB24Src).toContain("DISPONIBLE");
    expect(sagB24Src).toContain("FECHA_ULTIMO_MOVIMIENTO");
  });

  // ── T10: Fail-closed: SOURCE_DOWN on SAG failure ──

  test("T10: SAG B24 service has try/catch for fail-closed", () => {
    expect(sagB24Src).toContain("catch");
    expect(sagB24Src).toContain("SOURCE_DOWN");
  });

  test("T10: Intelligence service outputs stockTruthState per item", () => {
    expect(intelSrc).toContain("stockTruthState: sagB24Result.stockTruthState");
  });

  test("T10: sagB24Existencia is null when SOURCE_DOWN", () => {
    // When not certified, values should be null
    expect(intelSrc).toContain("isCertified ? (sagStock?.existencia ?? 0) : null");
  });

  test("T10: SAG B24 service returns empty map on failure", () => {
    expect(sagB24Src).toContain("stockMap: new Map()");
  });

  // ── T11: Client references SAG authority in footer text ──

  test("T11: MenorRotacionView footer references SAG vw_agentik_inventario", () => {
    expect(clientSrc).toContain("SAG vw_agentik_inventario");
  });

  test("T11: Masde8MesesView footer references SAG authority", () => {
    expect(clientSrc).toContain("autoridad SAG vw_agentik_inventario");
  });

  // ── T12: PIL contamination eliminated (Section A) ──

  test("T12: Intelligence service sets remaining from SAG B24, not PIL", () => {
    expect(intelSrc).toContain("sagStock.existencia");
    expect(intelSrc).toContain("(ref as any).remaining = b24Exist");
  });

  test("T12: When SOURCE_DOWN, remaining=0 and stockDataQuality=NO_PIL_RECORD", () => {
    expect(intelSrc).toContain("(ref as any).remaining = 0");
    expect(intelSrc).toContain('"NO_PIL_RECORD"');
  });

  test("T12: Intelligence service does not keep PIL totalStock when SAG is certified", () => {
    // When certified, totalStock = b24Exist, not ref.totalStock from PIL
    expect(intelSrc).toContain("(ref as any).totalStock = b24Exist");
  });

  // ── T13: Sales coverage metadata (Section B) ──

  test("T13: ImportSalesCoverage type exported from import-types", () => {
    expect(typesSrc).toContain("export interface ImportSalesCoverage");
  });

  test("T13: salesAsOf field exists", () => {
    expect(typesSrc).toContain("salesAsOf:");
  });

  test("T13: coverage6m/8m/12m fields exist", () => {
    expect(typesSrc).toContain("coverage6m:");
    expect(typesSrc).toContain("coverage8m:");
    expect(typesSrc).toContain("coverage12m:");
  });

  test("T13: freshnessLagDays field exists", () => {
    expect(typesSrc).toContain("freshnessLagDays:");
  });

  test("T13: Intelligence result includes salesCoverage", () => {
    expect(intelSrc).toContain("salesCoverage");
    expect(intelSrc).toContain("return { items, kpis, salesCoverage }");
  });

  test("T13: Client receives and displays salesCoverage", () => {
    expect(clientSrc).toContain("salesCoverage");
    expect(clientSrc).toContain("Cobertura de ventas");
  });

  // ── T14: Reconciliation script exists (Section C) ──

  test("T14: Sales reconciliation script exists", () => {
    const scriptPath = path.resolve(__dirname, "../../../scripts/reconcile-imports-05a2r1-sales.ts");
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  test("T14: Script queries vw_agentik_ventas", () => {
    const scriptPath = path.resolve(__dirname, "../../../scripts/reconcile-imports-05a2r1-sales.ts");
    const src = fs.readFileSync(scriptPath, "utf-8");
    expect(src).toContain("vw_agentik_ventas");
    expect(src).toContain("34852-3");
    expect(src).toContain("34852-2");
    expect(src).toContain("3747-5");
    expect(src).toContain("3747-17");
    expect(src).toContain("34831-8");
  });
});
