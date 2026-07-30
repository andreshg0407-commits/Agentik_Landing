/**
 * lib/comercial/tiendas/__tests__/store-unit-coverage-engine.test.ts
 *
 * AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01 — certification tests.
 *
 * Certifies that store coverage applies the measurement law of
 * AGENTIK-DERROTERO-MEASUREMENT-SEMANTICS-01:
 *
 *   TIENDAS (STORE) → UNITS. La regla se satisface con el TOTAL de unidades
 *   de la estructura; el número de referencias es IRRELEVANTE.
 *
 * Canonical case (the old per-reference semantics got this wrong):
 *   5 refs × 2 uds con regla 8/10/12 → 10 unidades → SALUDABLE, deficit 0.
 *   (La semántica anterior reportaba 40 unidades de faltante.)
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-unit-coverage-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateUnitStructureCoverage,
  evaluateSpecialRules,
  matchesSpecialPattern,
  type SpecialRuleConfig,
} from "../store-unit-coverage-engine";

const RULE_8_10_12 = { minUnits: 8, idealUnits: 10, maxUnits: 12 };

// ═════════════════════════════════════════════════════════════════════════════
// 1. La ley de unidades aplicada a cobertura
// ═════════════════════════════════════════════════════════════════════════════

describe("cobertura por unidades (ley STORE=UNITS)", () => {
  it("CASO CANÓNICO: 5 refs × 2 uds = 10 unidades → SALUDABLE, deficit 0", () => {
    const r = evaluateUnitStructureCoverage([2, 2, 2, 2, 2], RULE_8_10_12);
    assert.equal(r.structuralStatus, "CUBIERTA");
    assert.equal(r.quantitativeStatus, "SALUDABLE");
    assert.equal(r.unitRule.totalUnits, 10);
    assert.equal(r.unitRule.status, "WITHIN_RANGE");
    assert.equal(r.unitRule.deficitToMin, 0);
    assert.equal(r.unitRule.deficitToIdeal, 0);
    assert.equal(r.unitRule.measurementUnit, "UNITS");
  });

  it("1 sola referencia con 8 unidades cumple igual (las referencias son irrelevantes)", () => {
    const r = evaluateUnitStructureCoverage([8], RULE_8_10_12);
    assert.equal(r.quantitativeStatus, "SALUDABLE");
    assert.equal(r.unitRule.fulfilled, true);
  });

  it("8 referencias de 1 unidad cumplen igual", () => {
    const r = evaluateUnitStructureCoverage([1, 1, 1, 1, 1, 1, 1, 1], RULE_8_10_12);
    assert.equal(r.quantitativeStatus, "SALUDABLE");
    assert.equal(r.unitRule.totalUnits, 8);
  });

  it("3 refs × 2 = 6 unidades → BAJO MÍNIMO con déficits en unidades", () => {
    const r = evaluateUnitStructureCoverage([2, 2, 2], RULE_8_10_12);
    assert.equal(r.structuralStatus, "CUBIERTA");
    assert.equal(r.quantitativeStatus, "CON_REFERENCIAS_BAJO_MINIMO");
    assert.equal(r.unitRule.status, "BELOW_MINIMUM");
    assert.equal(r.unitRule.deficitToMin, 2);    // 8 - 6
    assert.equal(r.unitRule.deficitToIdeal, 4);  // 10 - 6
  });

  it("exceso sobre máximo NO es falla de cobertura; se expone en excessOverMax", () => {
    const r = evaluateUnitStructureCoverage([15], RULE_8_10_12);
    assert.equal(r.quantitativeStatus, "SALUDABLE");
    assert.equal(r.unitRule.status, "OVER_MAXIMUM");
    assert.equal(r.unitRule.excessOverMax, 3);
    assert.equal(r.unitRule.fulfilled, true);
  });

  it("sin referencias con stock → SIN_COBERTURA / SIN_REFERENCIAS", () => {
    const empty = evaluateUnitStructureCoverage([], RULE_8_10_12);
    assert.equal(empty.structuralStatus, "SIN_COBERTURA");
    assert.equal(empty.quantitativeStatus, "SIN_REFERENCIAS");

    const zeros = evaluateUnitStructureCoverage([0, 0], RULE_8_10_12);
    assert.equal(zeros.structuralStatus, "SIN_COBERTURA");
  });

  it("estilo ACCESORIOS: target actúa como min e ideal sin tope", () => {
    const acc = { minUnits: 6, idealUnits: 6, maxUnits: Number.MAX_SAFE_INTEGER };
    const below = evaluateUnitStructureCoverage([2, 2], acc);
    assert.equal(below.quantitativeStatus, "CON_REFERENCIAS_BAJO_MINIMO");
    assert.equal(below.unitRule.deficitToMin, 2);

    const ok = evaluateUnitStructureCoverage([4, 3], acc);
    assert.equal(ok.quantitativeStatus, "SALUDABLE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Reglas especiales por tienda
// ═════════════════════════════════════════════════════════════════════════════

const SPECIAL: SpecialRuleConfig = {
  referencePatterns: ["BANERA", "CUNA_COLECHO", "CORRAL"],
  idealByStore: { san_diego: 3, caldas: 3 },
  defaultIdeal: 0,
};

function item(referenceCode: string, productName: string, currentUnits: number) {
  return { referenceCode, productName, currentUnits };
}

describe("reglas especiales por tienda", () => {
  it("San Diego con 2 bañeras (ideal 3) → FALTANTE gap 1", () => {
    const r = evaluateSpecialRules("san_diego", [item("B-100", "BANERA AZUL", 2)], SPECIAL);
    const banera = r.find(x => x.pattern === "BANERA")!;
    assert.equal(banera.status, "FALTANTE");
    assert.equal(banera.gapUnits, 1);
    assert.equal(banera.severity, "medium");
  });

  it("San Diego con 3 corrales exactos → CUMPLIDA", () => {
    const r = evaluateSpecialRules("san_diego", [item("CR-1", "CORRAL GRIS", 3)], SPECIAL);
    assert.equal(r.find(x => x.pattern === "CORRAL")!.status, "CUMPLIDA");
  });

  it("Caldas con 5 bañeras (ideal 3) → EXCEDENTE gap 2", () => {
    const r = evaluateSpecialRules("caldas", [item("B-1", "BANERA ROSA", 5)], SPECIAL);
    const banera = r.find(x => x.pattern === "BANERA")!;
    assert.equal(banera.status, "EXCEDENTE");
    assert.equal(banera.gapUnits, 2);
  });

  it("Centro (ideal por defecto 0) con unidades → NO_AUTORIZADA severidad alta", () => {
    const r = evaluateSpecialRules("centro", [item("B-1", "BANERA BLANCA", 2)], SPECIAL);
    const banera = r.find(x => x.pattern === "BANERA")!;
    assert.equal(banera.status, "NO_AUTORIZADA");
    assert.equal(banera.severity, "high");
    assert.equal(banera.gapUnits, 2);
  });

  it("Centro sin unidades especiales → todas CUMPLIDA (ideal 0, presencia 0)", () => {
    const r = evaluateSpecialRules("centro", [item("C-1", "PIJAMA NIÑA", 10)], SPECIAL);
    assert.ok(r.every(x => x.status === "CUMPLIDA" && x.severity === "none"));
  });

  it("patrón CUNA_COLECHO matchea nombre 'CUNA COLECHO' (guion bajo ↔ espacio)", () => {
    assert.equal(matchesSpecialPattern("CUNA COLECHO PREMIUM", "CUNA_COLECHO"), true);
    assert.equal(matchesSpecialPattern("CUNA_COLECHO X", "CUNA_COLECHO"), true);
    assert.equal(matchesSpecialPattern("CUNA TRADICIONAL", "CUNA_COLECHO"), false);

    const r = evaluateSpecialRules("san_diego", [item("CC-9", "Cuna Colecho Deluxe", 3)], SPECIAL);
    assert.equal(r.find(x => x.pattern === "CUNA_COLECHO")!.status, "CUMPLIDA");
  });

  it("ordena por severidad: NO_AUTORIZADA primero", () => {
    const r = evaluateSpecialRules("centro", [
      item("B-1", "BANERA", 1),
      item("CR-1", "CORRAL", 0),   // sin stock → no matchea presencia
    ], SPECIAL);
    assert.equal(r[0].status, "NO_AUTORIZADA");
    assert.equal(r[0].pattern, "BANERA");
  });

  it("suma unidades entre referencias del mismo patrón", () => {
    const r = evaluateSpecialRules("caldas", [
      item("B-1", "BANERA ROSA", 1),
      item("B-2", "BANERA AZUL", 2),
    ], SPECIAL);
    const banera = r.find(x => x.pattern === "BANERA")!;
    assert.equal(banera.totalUnits, 3);
    assert.equal(banera.matchedReferenceCount, 2);
    assert.equal(banera.status, "CUMPLIDA");
  });
});
