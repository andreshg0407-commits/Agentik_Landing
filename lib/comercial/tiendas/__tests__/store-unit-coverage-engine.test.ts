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

// Castillitos confirmed business rule: all 4 stores have explicit ideals.
const SPECIAL: SpecialRuleConfig = {
  referencePatterns: ["BAÑERA", "CUNA_COLECHO", "CORRAL"],
  idealByStore: { san_diego: 3, caldas: 3, centro: 1, gran_plaza: 1 },
  defaultIdeal: 0,
};

// Separate config for testing NO_AUTORIZADA (engine feature, not Castillitos business rule)
const SPECIAL_WITH_UNAUTHORIZED: SpecialRuleConfig = {
  referencePatterns: ["BAÑERA"],
  idealByStore: { san_diego: 3 },
  defaultIdeal: 0,
};

function item(referenceCode: string, productName: string, currentUnits: number) {
  return { referenceCode, productName, currentUnits };
}

describe("reglas especiales por tienda", () => {
  it("San Diego con 2 bañeras (ideal 3) → FALTANTE gap 1", () => {
    const r = evaluateSpecialRules("san_diego", [item("B-100", "BAÑERA AZUL", 2)], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.status, "FALTANTE");
    assert.equal(banera.gapUnits, 1);
    assert.equal(banera.severity, "medium");
  });

  it("San Diego con 3 corrales exactos → CUMPLIDA", () => {
    const r = evaluateSpecialRules("san_diego", [item("CR-1", "CORRAL GRIS", 3)], SPECIAL);
    assert.equal(r.find(x => x.pattern === "CORRAL")!.status, "CUMPLIDA");
  });

  it("Caldas con 5 bañeras (ideal 3) → EXCEDENTE gap 2", () => {
    const r = evaluateSpecialRules("caldas", [item("B-1", "BAÑERA ROSA", 5)], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.status, "EXCEDENTE");
    assert.equal(banera.gapUnits, 2);
  });

  it("Centro con 2 bañeras (ideal 1) → EXCEDENTE gap 1", () => {
    const r = evaluateSpecialRules("centro", [item("B-1", "BAÑERA BLANCA", 2)], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.status, "EXCEDENTE");
    assert.equal(banera.gapUnits, 1);
    assert.equal(banera.severity, "low");
  });

  it("Centro sin stock de un patrón → FALTANTE (ideal 1, presencia 0)", () => {
    const r = evaluateSpecialRules("centro", [item("C-1", "PIJAMA NIÑA", 10)], SPECIAL);
    assert.ok(r.every(x => x.status === "FALTANTE" && x.gapUnits === 1));
  });

  it("patrón CUNA_COLECHO matchea nombre 'CUNA COLECHO' (guion bajo ↔ espacio)", () => {
    assert.equal(matchesSpecialPattern("CUNA COLECHO PREMIUM", "CUNA_COLECHO"), true);
    assert.equal(matchesSpecialPattern("CUNA_COLECHO X", "CUNA_COLECHO"), true);
    assert.equal(matchesSpecialPattern("CUNA TRADICIONAL", "CUNA_COLECHO"), false);

    const r = evaluateSpecialRules("san_diego", [item("CC-9", "Cuna Colecho Deluxe", 3)], SPECIAL);
    assert.equal(r.find(x => x.pattern === "CUNA_COLECHO")!.status, "CUMPLIDA");
  });

  it("NO_AUTORIZADA: engine still supports it for configs with defaultIdeal=0", () => {
    const r = evaluateSpecialRules("unknown_store", [
      item("B-1", "BAÑERA", 1),
    ], SPECIAL_WITH_UNAUTHORIZED);
    assert.equal(r[0].status, "NO_AUTORIZADA");
    assert.equal(r[0].severity, "high");
  });

  it("suma unidades entre referencias del mismo patrón", () => {
    const r = evaluateSpecialRules("caldas", [
      item("B-1", "BAÑERA ROSA", 1),
      item("B-2", "BAÑERA AZUL", 2),
    ], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.totalUnits, 3);
    assert.equal(banera.matchedReferenceCount, 2);
    assert.equal(banera.status, "CUMPLIDA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. AGENTIK-STORES-SPECIAL-PRODUCTS-INVENTORY-01 — S1–S18
// ═════════════════════════════════════════════════════════════════════════════

// ── S1–S4: NFD normalization (D1) ───────────────────────────────────────────

describe("S1–S4: NFD normalization in matchesSpecialPattern", () => {
  it("S1: BAÑERA pattern matches product named BAÑERA (exact with tilde)", () => {
    assert.equal(matchesSpecialPattern("BAÑERA PLEGABLE ROSADA", "BAÑERA"), true);
  });

  it("S2: BAÑERA pattern matches product named BANERA (without tilde — NFD strips diacritics)", () => {
    assert.equal(matchesSpecialPattern("BANERA PLEGABLE", "BAÑERA"), true);
  });

  it("S3: BANERA pattern (without tilde) matches product named BAÑERA (with tilde)", () => {
    assert.equal(matchesSpecialPattern("BAÑERA AZUL", "BANERA"), true);
  });

  it("S4: NFD normalization does not produce false positives", () => {
    assert.equal(matchesSpecialPattern("CUNA COLECHO PREMIUM", "BAÑERA"), false);
    assert.equal(matchesSpecialPattern("CORRAL GRIS", "BAÑERA"), false);
    assert.equal(matchesSpecialPattern("PIJAMA NIÑA", "BAÑERA"), false);
  });
});

// ── S5–S10: matchedReferences in evaluateSpecialRules (D2) ──────────────────

describe("S5–S10: matchedReferences array in SpecialRuleEvaluation", () => {
  it("S5: matchedReferences contains exactly the items with stock > 0 that match", () => {
    const r = evaluateSpecialRules("san_diego", [
      item("B-1", "BAÑERA ROSA", 2),
      item("B-2", "BAÑERA AZUL", 1),
      item("C-1", "CAMISETA", 5),   // no match
    ], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.matchedReferences.length, 2);
    assert.equal(banera.matchedReferenceCount, 2);
    assert.deepEqual(
      banera.matchedReferences.map(m => m.referenceCode).sort(),
      ["B-1", "B-2"],
    );
  });

  it("S6: matchedReferences has correct units per reference", () => {
    const r = evaluateSpecialRules("caldas", [
      item("CR-1", "CORRAL XL", 3),
      item("CR-2", "CORRAL MINI", 1),
    ], SPECIAL);
    const corral = r.find(x => x.pattern === "CORRAL")!;
    const cr1 = corral.matchedReferences.find(m => m.referenceCode === "CR-1")!;
    const cr2 = corral.matchedReferences.find(m => m.referenceCode === "CR-2")!;
    assert.equal(cr1.units, 3);
    assert.equal(cr2.units, 1);
  });

  it("S7: matchedReferences is empty when no items match the pattern", () => {
    const r = evaluateSpecialRules("san_diego", [
      item("C-1", "CAMISETA NIÑO", 5),
    ], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.matchedReferences.length, 0);
    assert.equal(banera.matchedReferenceCount, 0);
  });

  it("S8: matchedReferences excludes items with currentUnits === 0", () => {
    const r = evaluateSpecialRules("san_diego", [
      item("B-1", "BAÑERA ROSA", 0),  // stock 0 → no match
      item("B-2", "BAÑERA AZUL", 2),
    ], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.matchedReferences.length, 1);
    assert.equal(banera.matchedReferences[0].referenceCode, "B-2");
  });

  it("S9: matchedReferences preserves productName verbatim", () => {
    const r = evaluateSpecialRules("san_diego", [
      item("CC-9", "Cuna Colecho Deluxe Premium", 3),
    ], SPECIAL);
    const cc = r.find(x => x.pattern === "CUNA_COLECHO")!;
    assert.equal(cc.matchedReferences[0].productName, "Cuna Colecho Deluxe Premium");
  });

  it("S10: all 3 rules always present even when no items exist", () => {
    const r = evaluateSpecialRules("centro", [], SPECIAL);
    assert.equal(r.length, 3);
    assert.ok(r.every(x => x.matchedReferences.length === 0));
    assert.ok(r.every(x => x.totalUnits === 0));
  });
});

// ── S11–S14: Castillitos 4-store truth table ─────────────────────────────────

describe("S11–S14: Castillitos 4-store truth table", () => {
  it("S11: San Diego — 0/3 FALTANTE, 2/3 FALTANTE, 3/3 CUMPLIDA, 4/3 EXCEDENTE", () => {
    const r0 = evaluateSpecialRules("san_diego", [], SPECIAL);
    assert.equal(r0.find(x => x.pattern === "BAÑERA")!.status, "FALTANTE");
    assert.equal(r0.find(x => x.pattern === "BAÑERA")!.gapUnits, 3);

    const r2 = evaluateSpecialRules("san_diego", [item("B-1", "BAÑERA", 2)], SPECIAL);
    assert.equal(r2.find(x => x.pattern === "BAÑERA")!.status, "FALTANTE");
    assert.equal(r2.find(x => x.pattern === "BAÑERA")!.gapUnits, 1);

    const r3 = evaluateSpecialRules("san_diego", [item("B-1", "BAÑERA", 3)], SPECIAL);
    assert.equal(r3.find(x => x.pattern === "BAÑERA")!.status, "CUMPLIDA");

    const r4 = evaluateSpecialRules("san_diego", [item("B-1", "BAÑERA", 4)], SPECIAL);
    assert.equal(r4.find(x => x.pattern === "BAÑERA")!.status, "EXCEDENTE");
    assert.equal(r4.find(x => x.pattern === "BAÑERA")!.gapUnits, 1);
  });

  it("S12: Caldas — same truth table as San Diego (ideal=3)", () => {
    const r0 = evaluateSpecialRules("caldas", [], SPECIAL);
    assert.equal(r0.find(x => x.pattern === "CORRAL")!.status, "FALTANTE");
    assert.equal(r0.find(x => x.pattern === "CORRAL")!.gapUnits, 3);

    const r3 = evaluateSpecialRules("caldas", [item("CR-1", "CORRAL", 3)], SPECIAL);
    assert.equal(r3.find(x => x.pattern === "CORRAL")!.status, "CUMPLIDA");

    const r5 = evaluateSpecialRules("caldas", [item("CR-1", "CORRAL", 5)], SPECIAL);
    assert.equal(r5.find(x => x.pattern === "CORRAL")!.status, "EXCEDENTE");
    assert.equal(r5.find(x => x.pattern === "CORRAL")!.gapUnits, 2);
  });

  it("S13: Centro — 0/1 FALTANTE, 1/1 CUMPLIDA, 2/1 EXCEDENTE", () => {
    const r0 = evaluateSpecialRules("centro", [], SPECIAL);
    assert.equal(r0.find(x => x.pattern === "BAÑERA")!.status, "FALTANTE");
    assert.equal(r0.find(x => x.pattern === "BAÑERA")!.gapUnits, 1);
    assert.equal(r0.find(x => x.pattern === "BAÑERA")!.idealUnits, 1);

    const r1 = evaluateSpecialRules("centro", [item("B-1", "BAÑERA", 1)], SPECIAL);
    assert.equal(r1.find(x => x.pattern === "BAÑERA")!.status, "CUMPLIDA");

    const r2 = evaluateSpecialRules("centro", [item("B-1", "BAÑERA", 2)], SPECIAL);
    assert.equal(r2.find(x => x.pattern === "BAÑERA")!.status, "EXCEDENTE");
    assert.equal(r2.find(x => x.pattern === "BAÑERA")!.gapUnits, 1);
  });

  it("S14: Gran Plaza — same truth table as Centro (ideal=1)", () => {
    const r0 = evaluateSpecialRules("gran_plaza", [], SPECIAL);
    assert.equal(r0.find(x => x.pattern === "CUNA_COLECHO")!.status, "FALTANTE");
    assert.equal(r0.find(x => x.pattern === "CUNA_COLECHO")!.gapUnits, 1);
    assert.equal(r0.find(x => x.pattern === "CUNA_COLECHO")!.idealUnits, 1);

    const r1 = evaluateSpecialRules("gran_plaza", [item("CC-1", "CUNA COLECHO", 1)], SPECIAL);
    assert.equal(r1.find(x => x.pattern === "CUNA_COLECHO")!.status, "CUMPLIDA");

    const r2 = evaluateSpecialRules("gran_plaza", [item("CC-1", "CUNA COLECHO", 2)], SPECIAL);
    assert.equal(r2.find(x => x.pattern === "CUNA_COLECHO")!.status, "EXCEDENTE");
  });
});

// ── S15–S18: NFD normalization with evaluateSpecialRules integration ─────────

describe("S15–S18: NFD normalization in full evaluation pipeline", () => {
  it("S15: BAÑERA pattern matches real-world product with tilde in evaluateSpecialRules", () => {
    const r = evaluateSpecialRules("san_diego", [
      item("C4-P154D", "BAÑERA PLEGABLE ROSADA", 1),
      item("C6-155D", "BAÑERA PLEGABLE CON TERMOMETRO", 1),
      item("C7-1541D", "BAÑERA PLEGABLE CON COJIN AZUL", 1),
    ], SPECIAL);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    assert.equal(banera.status, "CUMPLIDA");
    assert.equal(banera.totalUnits, 3);
    assert.equal(banera.matchedReferenceCount, 3);
  });

  it("S16: BAÑERA pattern matches mixed-case product name", () => {
    assert.equal(matchesSpecialPattern("bañera plegable", "BAÑERA"), true);
    assert.equal(matchesSpecialPattern("Bañera Con Cojín", "BAÑERA"), true);
  });

  it("S17: underscore↔space normalization still works with NFD", () => {
    assert.equal(matchesSpecialPattern("CUNA COLECHO AZUL", "CUNA_COLECHO"), true);
    assert.equal(matchesSpecialPattern("CUNA_COLECHO VERDE", "CUNA_COLECHO"), true);
  });

  it("S18: all 3 patterns work together in one evaluation for authorized store", () => {
    const r = evaluateSpecialRules("caldas", [
      item("B-1", "BAÑERA PLEGABLE", 2),
      item("CC-1", "CUNA COLECHO DELUXE", 3),
      item("CR-1", "CORRAL GRIS", 1),
    ], SPECIAL);
    assert.equal(r.length, 3);
    const banera = r.find(x => x.pattern === "BAÑERA")!;
    const cuna = r.find(x => x.pattern === "CUNA_COLECHO")!;
    const corral = r.find(x => x.pattern === "CORRAL")!;
    assert.equal(banera.totalUnits, 2);
    assert.equal(banera.status, "FALTANTE");
    assert.equal(cuna.totalUnits, 3);
    assert.equal(cuna.status, "CUMPLIDA");
    assert.equal(corral.totalUnits, 1);
    assert.equal(corral.status, "FALTANTE");
  });
});

// ── S19–S22: KPI counting semantics (requiresSupply / requiresRemoval) ───────

describe("S19–S22: KPI counting semantics for special products", () => {
  // Helper: count patterns by status from evaluateSpecialRules result
  const countByStatus = (rules: ReturnType<typeof evaluateSpecialRules>, status: string) =>
    rules.filter(r => r.status === status).length;

  it("S19: FALTANTE → requiresSupply count, EXCEDENTE → requiresRemoval count, CUMPLIDA → neither", () => {
    const r = evaluateSpecialRules("caldas", [
      item("B-1", "BAÑERA PLEGABLE", 2),      // ideal 3 → FALTANTE
      item("CC-1", "CUNA COLECHO", 3),         // ideal 3 → CUMPLIDA
      item("CR-1", "CORRAL GRANDE", 5),         // ideal 3 → EXCEDENTE
    ], SPECIAL);
    assert.equal(countByStatus(r, "FALTANTE"), 1, "1 pattern requires supply");
    assert.equal(countByStatus(r, "EXCEDENTE"), 1, "1 pattern requires removal");
    assert.equal(countByStatus(r, "CUMPLIDA"), 1, "1 pattern met objective");
  });

  it("S20: Gran Plaza real scenario — requiresSupply=0, requiresRemoval=2", () => {
    // Gran Plaza ideal=1 for all 3 patterns.
    // Smoke confirmed: BAÑERA=4 (EXCEDENTE), CUNA_COLECHO=2 (EXCEDENTE), CORRAL=1 (CUMPLIDA)
    const r = evaluateSpecialRules("gran_plaza", [
      item("B-1", "BAÑERA PLEGABLE", 2),
      item("B-2", "BAÑERA CON TERMOMETRO", 2),
      item("CC-1", "CUNA COLECHO AZUL", 2),
      item("CR-1", "CORRAL GRANDE", 1),
    ], SPECIAL);
    const requiresSupply = countByStatus(r, "FALTANTE");
    const requiresRemoval = countByStatus(r, "EXCEDENTE");
    assert.equal(requiresSupply, 0, "Gran Plaza: 0 patterns require supply");
    assert.equal(requiresRemoval, 2, "Gran Plaza: 2 patterns require removal (BAÑERA + CUNA_COLECHO)");
  });

  it("S21: all patterns CUMPLIDA → requiresSupply=0, requiresRemoval=0", () => {
    const r = evaluateSpecialRules("centro", [
      item("B-1", "BAÑERA", 1),
      item("CC-1", "CUNA COLECHO", 1),
      item("CR-1", "CORRAL", 1),
    ], SPECIAL);
    assert.equal(countByStatus(r, "FALTANTE"), 0);
    assert.equal(countByStatus(r, "EXCEDENTE"), 0);
    assert.equal(countByStatus(r, "CUMPLIDA"), 3);
  });

  it("S22: all patterns FALTANTE → requiresSupply=3, requiresRemoval=0", () => {
    const r = evaluateSpecialRules("san_diego", [], SPECIAL);
    assert.equal(countByStatus(r, "FALTANTE"), 3, "all 3 patterns require supply");
    assert.equal(countByStatus(r, "EXCEDENTE"), 0, "no patterns require removal");
  });
});
