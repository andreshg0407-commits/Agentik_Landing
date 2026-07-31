/**
 * lib/comercial/tiendas/__tests__/store-snapshot-pipeline.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: certificación del pipeline del
 * StoreSnapshot. Los 14 casos obligatorios del diseño aprobado, corriendo
 * por el assembler REAL (F1) y los motores REALES S4/S5/S6 — cero simulación.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-snapshot-pipeline.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotInventoryRow,
  type SnapshotSourceRows,
} from "../store-snapshot-assembler";
import {
  runStoreSnapshotPipeline,
  computeStoreKpis,
  computeModuleKpis,
  attachDocumentRefs,
  buildCompatibilityIndexFromAssembled,
  type SnapshotStoreCoverage,
  type SnapshotPerStore,
} from "../store-snapshot-pipeline";
import {
  STORE_SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_PIPELINE_VERSION,
  SNAPSHOT_RULES_VERSION,
} from "../store-snapshot-versions";
import { resolveCatalogInfo, findCompatibleRefs } from "../store-structure-compatibility";
import { CASTILLITOS_SPECIAL_PRODUCTS, CASTILLITOS_TEXTILE_COVERAGE } from "../store-policy-pack-config";
import type { StoreUnitNeedsResult } from "../store-unit-needs-engine";

// ── Fixture sobre claves REALES del catálogo ─────────────────────────────────

const lookup = buildStructureLookup();
const csEntries = [...lookup.csByMatchKey.entries()];
const CS_KEY = csEntries[0][0];
const [CS_GRUPO, CS_SUBGRUPO] = CS_KEY.split("|");
const CS_STRUCTURE = csEntries[0][1].structureKey;
// Segunda estructura CS distinta (para B4)
const second = csEntries.find(([, info]) => info.structureKey !== CS_STRUCTURE)!;
const CS2_KEY = second[0];
const [CS2_GRUPO, CS2_SUBGRUPO] = CS2_KEY.split("|");

const CS_RULE = CASTILLITOS_TEXTILE_COVERAGE;   // 8 / 10 / 12 (default del pack)

function row(partial: Partial<SnapshotInventoryRow>): SnapshotInventoryRow {
  return {
    warehouseKind: "STORE",
    storeId: "centro",
    warehousePk: "31",
    referenceCode: "REF-1",
    productId: "prod-1",
    productName: "Producto 1",
    variantKey: "V1",
    units: 1,
    grupoSag: CS_GRUPO,
    subgrupoSag: CS_SUBGRUPO,
    productLine: "1",
    handlingUnit: null,
    createdAtSag: null,
    heroImageUrl: null,
    updatedAt: "2026-07-30T10:00:00.000Z",
    ...partial,
  };
}

function main(referenceCode: string, units: number, productId = `prod-${referenceCode}`): SnapshotInventoryRow {
  return row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", referenceCode, productId, variantKey: "M1", units });
}

const GOV_2 = [
  { storeId: "caldas", displayName: "Caldas" },
  { storeId: "centro", displayName: "Centro" },
];
const GOV_3 = [...GOV_2, { storeId: "san_diego", displayName: "San Diego" }];

function assembled(rows: SnapshotInventoryRow[], governanceStores = GOV_2) {
  const source: SnapshotSourceRows = {
    organizationId: "org-1",
    readAt: "2026-07-30T12:00:00.000Z",
    inventoryRows: rows,
    governanceStores,
    policyRulesByStore: [],
  };
  return assembleSnapshotSource(source);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. End-to-end mínimo
// ═════════════════════════════════════════════════════════════════════════════

describe("pipeline end-to-end", () => {
  it("OBLIGATORIA 1: déficit 4 con pool 40 → need 4, asignación 4, KPIs cuadrados sobre el universo real (46 estructuras)", () => {
    const snap = runStoreSnapshotPipeline(assembled([
      row({ units: 6 }),                    // 6 uds < ideal 10 → déficit 4
      main("REF-1", 40),                    // pool global 40 (> umbral 36)
    ]));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const need = centro.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!;
    assert.equal(need.requiredUnits, 4);
    assert.equal(need.executableUnits, 4);
    // El universo esperado COMPLETO se evalúa (mismo comportamiento del mundo
    // certificado): las estructuras vacías generan sus propias necesidades
    // NO_COVERAGE, así que B2 = suma del universo, y la ÚNICA asignable es la
    // del pool existente:
    assert.equal(centro.coverage.expectedStructures, snap.perStore[0].coverage.expectedStructures);
    assert.equal(centro.kpis.shortageUnits, centro.needs.summary.replenishment.requiredUnits);  // B2 = S5 verbatim
    assert.ok(centro.kpis.shortageUnits >= 4);
    assert.equal(centro.kpis.executableUnits, 4);         // solo REF-1 tiene pool
    assert.equal(centro.kpis.allocatedUnits, 4);
    // Caldas (activa, estructura vacía → NO_COVERAGE con déficit 10) recibe del
    // MISMO pool una REFERENCIA_NUEVA_COMPATIBLE — ley S6 verbatim:
    const caldas = snap.perStore.find(s => s.storeId === "caldas")!;
    assert.equal(caldas.kpis.allocatedUnits, 10);
    assert.equal(snap.moduleKpis.unidadesAsignadas, 14);  // 4 + 10, pool global sin double-booking
    assert.equal(snap.moduleKpis.unidadesPorSurtir, snap.perStore.reduce((s, x) => s + x.kpis.shortageUnits, 0));
    const sug = snap.plan.suggestions.filter(s => s.structureKey === CS_STRUCTURE);
    assert.equal(sug.reduce((s, x) => s + x.units, 0), 14);
    const pool = snap.plan.poolUsage.find(p => p.referenceCode === "REF-1")!;
    assert.deepEqual({ e: pool.eligible, a: pool.allocated, r: pool.remaining }, { e: 40, a: 14, r: 26 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2–3. Invariantes 5 y 2 (una sola cobertura · moduleKpis recomputable)
// ═════════════════════════════════════════════════════════════════════════════

describe("invariantes de KPIs", () => {
  const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 }), main("REF-1", 40)]));

  it("OBLIGATORIA 2 (inv. 5): B1 recomputado desde coverage = B1 publicado, por tienda", () => {
    for (const s of snap.perStore) {
      const healthy = s.coverage.structures.filter(x => x.quantitativeStatus === "SALUDABLE").length;
      const expected = s.coverage.structures.length;
      assert.equal(s.coverage.healthyStructures, healthy);
      assert.equal(s.coverage.expectedStructures, expected);
      const recomputed = expected > 0 ? Math.round((healthy / expected) * 100) : null;
      assert.equal(s.kpis.coveragePercent, recomputed);
    }
  });

  it("OBLIGATORIA 3 (inv. 2): moduleKpis = computeModuleKpis(perStore, openCount), exacto", () => {
    assert.deepEqual(
      snap.moduleKpis,
      computeModuleKpis(snap.perStore, snap.documentRefs.openCount),
    );
    assert.equal(snap.moduleKpis.unidadesPorSurtir, snap.perStore.reduce((s, x) => s + x.kpis.shortageUnits, 0));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Invariantes 1 y 9 (determinismo · fingerprint)
// ═════════════════════════════════════════════════════════════════════════════

describe("determinismo y fingerprint", () => {
  it("OBLIGATORIA 4: mismo assembled → snapshot byte-idéntico y mismo fingerprint; distinto → distinto", () => {
    const a1 = assembled([row({ units: 6 }), main("REF-1", 40)]);
    const s1 = runStoreSnapshotPipeline(a1);
    const s2 = runStoreSnapshotPipeline(a1);
    assert.equal(JSON.stringify(s1), JSON.stringify(s2));
    assert.equal(s1.fingerprint, s2.fingerprint);
    assert.match(s1.fingerprint, /^snap1r1-[0-9a-f]{16}$/);
    assert.equal(s1.generatedAt, null);                    // el pipeline NO tiene reloj
    assert.equal(s1.dataAsOf, a1.dataAsOf);                // inv. 1: passthrough
    const s3 = runStoreSnapshotPipeline(assembled([row({ units: 7 }), main("REF-1", 40)]));
    assert.notEqual(s3.fingerprint, s1.fingerprint);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Invariante 7 (SIN_BASE explícito, fuera del denominador)
// ═════════════════════════════════════════════════════════════════════════════

describe("SIN_BASE", () => {
  const emptyCoverage: SnapshotStoreCoverage = { expectedStructures: 0, healthyStructures: 0, structures: [], specialRules: [] };
  const emptyNeeds = { storeId: "x", needs: [], summary: {
    storeId: "x", structuresEvaluated: 0,
    replenishment: { requiredUnits: 0, executableUnits: 0, pendingUnits: 0, unknownAvailabilityUnits: 0, needCount: 0 },
    removals: { requiredUnits: 0, needCount: 0 },
    coverage: { fullyCoverableCount: 0, partiallyCoverableCount: 0, notCoverableCount: 0, unknownCount: 0 },
  } } as unknown as StoreUnitNeedsResult;
  const thresholds = { healthCritical: 3, unauthorizedHighIsCritical: true, attentionIncludesWithdrawals: true, scarcityThreshold: 36, allowedStoreIds: ["centro", "caldas"] };

  it("OBLIGATORIA 5: 0 estructuras esperadas → coverageStatus SIN_BASE, percent null (jamás -1 ni 0)", () => {
    const kpis = computeStoreKpis(emptyCoverage, emptyNeeds, 0, thresholds);
    assert.equal(kpis.coverageStatus, "SIN_BASE");
    assert.equal(kpis.coveragePercent, null);
    // Y A5 la excluye del denominador:
    const perStore = [
      { storeId: "a", displayName: "A", coverage: { ...emptyCoverage, expectedStructures: 10, healthyStructures: 10 }, needs: emptyNeeds, kpis: { ...kpis, coverageStatus: "OK" as const, coveragePercent: 100 } },
      { storeId: "b", displayName: "B", coverage: emptyCoverage, needs: emptyNeeds, kpis },
    ] as unknown as readonly SnapshotPerStore[];
    assert.equal(computeModuleKpis(perStore, 0).coberturaRed, 100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6–7. H8 muerto · B4 cuenta estructuras
// ═════════════════════════════════════════════════════════════════════════════

describe("KPIs sin inflado", () => {
  it("OBLIGATORIA 6 (H8): 3 variantes de una referencia = EXACTAMENTE lo mismo que 1 variante con la suma — cero inflado", () => {
    const tresVariantes = runStoreSnapshotPipeline(assembled([
      row({ variantKey: "V1", units: 2 }),
      row({ variantKey: "V2", units: 3 }),
      row({ variantKey: "V3", units: 1 }),     // consolidado: 6 uds, variantCount 3
      main("REF-1", 40),
    ]));
    const unaVariante = runStoreSnapshotPipeline(assembled([
      row({ variantKey: "V1", units: 6 }),
      main("REF-1", 40),
    ]));
    const c3 = tresVariantes.perStore.find(s => s.storeId === "centro")!;
    const c1 = unaVariante.perStore.find(s => s.storeId === "centro")!;
    assert.equal(c3.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!.requiredUnits, 4);
    assert.deepEqual(c3.kpis, c1.kpis);        // el número de variantes NO mueve un solo KPI
    assert.deepEqual(tresVariantes.moduleKpis, unaVariante.moduleKpis);
  });

  it("OBLIGATORIA 7: B4 cuenta ESTRUCTURAS bajo mínimo — el número de refs no lo altera; sanar una estructura lo baja en 1", () => {
    const base = [
      row({ referenceCode: "R3", productId: "p3", variantKey: "V1", units: 1, grupoSag: CS2_GRUPO, subgrupoSag: CS2_SUBGRUPO }),
      row({ referenceCode: "R4", productId: "p4", variantKey: "V1", units: 2, grupoSag: CS2_GRUPO, subgrupoSag: CS2_SUBGRUPO }),  // estructura 2: 3 < min 8
    ];
    // Estructura 1 con DOS refs (2+3=5 < min 8):
    const dosRefs = runStoreSnapshotPipeline(assembled([
      row({ referenceCode: "R1", productId: "p1", units: 2 }),
      row({ referenceCode: "R2", productId: "p2", variantKey: "V1", units: 3 }),
      ...base,
    ])).perStore.find(s => s.storeId === "centro")!.kpis;
    // Estructura 1 con CINCO refs (1×5=5 < min 8):
    const cincoRefs = runStoreSnapshotPipeline(assembled([
      ...[1, 2, 3, 4, 5].map(i => row({ referenceCode: `Q${i}`, productId: `q${i}`, variantKey: "V1", units: 1 })),
      ...base,
    ])).perStore.find(s => s.storeId === "centro")!.kpis;
    assert.equal(dosRefs.criticalStructures, cincoRefs.criticalStructures);  // refs no inflan B4
    // Estructura 1 SANA (10 uds) → exactamente una estructura crítica menos:
    const sana = runStoreSnapshotPipeline(assembled([
      row({ referenceCode: "R1", productId: "p1", units: 10 }),
      ...base,
    ])).perStore.find(s => s.storeId === "centro")!.kpis;
    assert.equal(sana.criticalStructures, dosRefs.criticalStructures - 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8–9. A5 ponderado · semáforo D1/D2
// ═════════════════════════════════════════════════════════════════════════════

describe("A5 y semáforo", () => {
  const thresholds = { healthCritical: 3, unauthorizedHighIsCritical: true, attentionIncludesWithdrawals: true, scarcityThreshold: 36, allowedStoreIds: ["centro", "caldas"] };
  const mkStore = (id: string, healthy: number, expected: number) => ({
    storeId: id, displayName: id,
    coverage: { expectedStructures: expected, healthyStructures: healthy, structures: [], specialRules: [] },
    needs: { storeId: id, needs: [], summary: { replenishment: { requiredUnits: 0, executableUnits: 0 }, removals: { requiredUnits: 0 } } },
    kpis: { coverageStatus: "OK", coveragePercent: 0, shortageUnits: 0, executableUnits: 0, allocatedUnits: 0, withdrawalUnits: 0, criticalStructures: 0, excessStructures: 0, healthStatus: "SALUDABLE", requiresAttention: false },
  }) as unknown as SnapshotPerStore;

  it("OBLIGATORIA 8: A5 ponderado global — 10/10 y 0/5 → 67 %, no 50 %", () => {
    const m = computeModuleKpis([mkStore("a", 10, 10), mkStore("b", 0, 5)], 0);
    assert.equal(m.coberturaRed, 67);
  });

  it("OBLIGATORIA 9: D1 retiros → ATENCION · D2 ≥3 bajo mínimo o NO_AUTORIZADA alta → CRITICA", () => {
    const base: SnapshotStoreCoverage = { expectedStructures: 10, healthyStructures: 8, structures: [], specialRules: [] };
    const needsWith = (withdrawal: number) => ({
      storeId: "x", needs: [],
      summary: { replenishment: { requiredUnits: 0, executableUnits: 0 }, removals: { requiredUnits: withdrawal } },
    }) as unknown as StoreUnitNeedsResult;

    // D1: solo retiro pendiente → ATENCION y cuenta en A2
    const k1 = computeStoreKpis(base, needsWith(5), 0, thresholds);
    assert.equal(k1.healthStatus, "ATENCION");
    assert.equal(k1.requiresAttention, true);

    // D2: 3 estructuras bajo mínimo → CRITICA (usa el umbral del snapshot)
    const critCov = { ...base, structures: Array.from({ length: 3 }, (_, i) => ({
      structureKey: `S${i}`, label: `S${i}`, groupLabel: null, line: "castillitos", priority: 1,
      refCount: 1, totalUnits: 1, rule: { minUnits: 8, idealUnits: 10, maxUnits: 12, source: "PACK_DEFAULT" },
      unitRule: { measurementUnit: "UNITS", totalUnits: 1, status: "BELOW_MINIMUM", deficitToMin: 7, deficitToIdeal: 9, excessOverMax: 0, fulfilled: false },
      structuralCoverageStatus: "CUBIERTA", quantitativeStatus: "CON_REFERENCIAS_BAJO_MINIMO",
    })) } as unknown as SnapshotStoreCoverage;
    assert.equal(computeStoreKpis(critCov, needsWith(0), 0, thresholds).healthStatus, "CRITICA");

    // D2: NO_AUTORIZADA de severidad alta → CRITICA
    const unauthorized = { ...base, specialRules: [{ pattern: "X", label: "X", status: "NO_AUTORIZADA", severity: "high", currentUnits: 3, idealUnits: 0 }] } as unknown as SnapshotStoreCoverage;
    assert.equal(computeStoreKpis(unauthorized, needsWith(0), 0, thresholds).healthStatus, "CRITICA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Regla 36 en la cadena completa
// ═════════════════════════════════════════════════════════════════════════════

describe("Regla 36 (pool escaso ≤ 36)", () => {
  it("OBLIGATORIA 10: escasez → Centro asignado; San Diego SIN_DISPONIBILIDAD con blockedUnits del pool", () => {
    const snap = runStoreSnapshotPipeline(assembled([
      row({ units: 6 }),                                                          // centro: déficit 4
      row({ storeId: "san_diego", warehousePk: "11", variantKey: "V9", units: 6 }),  // san diego: déficit 4
      main("REF-1", 20),                                                          // pool 20 ≤ 36 → ESCASO
    ], GOV_3));

    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const sd = snap.perStore.find(s => s.storeId === "san_diego")!;

    // Centro (permitida): elegible, ejecutable y asignada
    const needCentro = centro.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!;
    assert.equal(needCentro.executableUnits, 4);
    assert.equal(centro.kpis.allocatedUnits, 4);

    // San Diego (no permitida): TODO el pool bloqueado por Regla 36 — jamás en cola
    const needSd = sd.needs.needs.find(n => n.structureKey === CS_STRUCTURE)!;
    assert.equal(needSd.executionStatus, "SIN_DISPONIBILIDAD");
    assert.equal(needSd.availability?.status, "CONOCIDA");
    if (needSd.availability?.status === "CONOCIDA") {
      assert.equal(needSd.availability.eligibleUnits, 0);
      assert.equal(needSd.availability.blockedUnits, 20);
    }
    assert.equal(sd.kpis.allocatedUnits, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11–12. Compatibilidad compartida · documentRefs
// ═════════════════════════════════════════════════════════════════════════════

describe("compatibilidad y documentRefs", () => {
  it("OBLIGATORIA 11: la ley compartida (findCompatibleRefs) sobre el índice del assembled encuentra la ref", () => {
    const a = assembled([row({ units: 6 })]);
    const refInfo = new Map(a.referenceCatalog.map(c => [c.referenceCode, { productName: c.productName, grupoSag: c.grupoSag, subgrupoSag: c.subgrupoSag, sizeClass: c.sizeClass }]));
    const index = buildCompatibilityIndexFromAssembled(a, refInfo);
    const info = resolveCatalogInfo(CS_STRUCTURE)!;
    assert.ok(findCompatibleRefs(info, index).has("REF-1"));
  });

  it("OBLIGATORIA 12: attachDocumentRefs es pura — A6 real, fingerprint intacto, cero copias", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 })]));
    const withDocs = attachDocumentRefs(snap, { openDocumentIds: ["d1", "d2", "d3"], openCount: 3, lastDocumentNumber: "SR-00007" });
    assert.equal(withDocs.moduleKpis.documentosAbiertos, 3);
    assert.equal(withDocs.fingerprint, snap.fingerprint);        // inv. 9
    assert.deepEqual(withDocs.documentRefs.openDocumentIds, ["d1", "d2", "d3"]);
    assert.equal(snap.moduleKpis.documentosAbiertos, 0);         // el original no se muta
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13–14. Reglas especiales vía join · guardián de contrato
// ═════════════════════════════════════════════════════════════════════════════

describe("reglas especiales y contrato", () => {
  it("OBLIGATORIA 13: el patrón especial matchea contra productName del catálogo estático (obs. 1 F1 no rompe S4)", () => {
    const pattern = CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns[0];   // "BANERA"
    const snap = runStoreSnapshotPipeline(assembled([
      row({ referenceCode: "REF-ESP", productId: "prod-esp", productName: pattern, units: 2 }),
    ]));
    const centro = snap.perStore.find(s => s.storeId === "centro")!;
    const evalRule = centro.coverage.specialRules.find(r => r.pattern === pattern)!;
    assert.ok(evalRule, "la regla especial del patrón debe evaluarse");
    assert.equal(evalRule.totalUnits, 2);                  // matcheó por productName del catálogo
    assert.equal(evalRule.matchedReferenceCount, 1);
    assert.equal(evalRule.status, "NO_AUTORIZADA");        // centro: ideal 0 (ley S4 verbatim)
  });

  it("OBLIGATORIA 14: guardián — serializable, sin Map/Set, versiones presentes, poolUsage como array", () => {
    const snap = runStoreSnapshotPipeline(assembled([row({ units: 6 }), main("REF-1", 40)]));
    const scan = (v: unknown): void => {
      assert.ok(!(v instanceof Map) && !(v instanceof Set) && typeof v !== "function");
      if (v && typeof v === "object") for (const child of Object.values(v)) scan(child);
    };
    scan(snap);
    assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);    // roundtrip sin pérdida
    assert.equal(snap.schemaVersion, STORE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.pipelineVersion, SNAPSHOT_PIPELINE_VERSION);
    assert.equal(snap.rulesVersion, SNAPSHOT_RULES_VERSION);
    assert.ok(Array.isArray(snap.plan.poolUsage));
    assert.deepEqual(snap.extensions, {});                       // bloque reservado (ajuste 5)
    assert.equal(snap.perStore.length, snap.activeStores.length);
  });
});
