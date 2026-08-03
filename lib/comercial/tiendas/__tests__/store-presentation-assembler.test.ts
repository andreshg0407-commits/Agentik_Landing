/**
 * lib/comercial/tiendas/__tests__/store-presentation-assembler.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F3A: certificación del PresentationAssembler.
 * Pruebas obligatorias T4 (B1 idéntico card↔tab), T5 (A3 idéntico al snapshot),
 * T6 (SIN_BASE jamás 0 %) + contrato endurecido (estados solo desde hints,
 * números verbatim) + guardián del fuente del módulo.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-presentation-assembler.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotInventoryRow,
} from "../store-snapshot-assembler";
import {
  runStoreSnapshotPipeline,
  attachDocumentRefs,
  type StoreSnapshot,
  type SnapshotStoreCoverage,
} from "../store-snapshot-pipeline";
import type { CoverageRuleEvaluation } from "../coverage-rule-projection";
import {
  buildDashboardPresentation,
  buildCoverageTabPresentation,
  buildNeedsTabPresentation,
  buildReplenishmentPresentation,
} from "../store-presentation-assembler";

// ── Snapshot real (assembler + pipeline reales, cero simulación) ─────────────

const lookup = buildStructureLookup();
const [CS_KEY, CS_INFO] = [...lookup.csByMatchKey.entries()][0];
const [CS_GRUPO, CS_SUBGRUPO] = CS_KEY.split("|");

function row(partial: Partial<SnapshotInventoryRow>): SnapshotInventoryRow {
  return {
    warehouseKind: "STORE", storeId: "centro", warehousePk: "31",
    referenceCode: "REF-1", productId: "prod-1", productName: "Producto 1",
    variantKey: "V1", units: 1, grupoSag: CS_GRUPO, subgrupoSag: CS_SUBGRUPO,
    productLine: "1", handlingUnit: null, createdAtSag: null, heroImageUrl: null,
    updatedAt: "2026-07-30T10:00:00.000Z", ...partial,
  };
}

function snap(): StoreSnapshot {
  const assembled = assembleSnapshotSource({
    organizationId: "org-1",
    readAt: "2026-07-30T12:00:00.000Z",
    inventoryRows: [
      row({ units: 6 }),
      row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", variantKey: "M1", units: 40 }),
    ],
    governanceStores: [
      { storeId: "caldas", displayName: "Caldas" },
      { storeId: "centro", displayName: "Centro" },
    ],
    policyRulesByStore: [],
  });
  return attachDocumentRefs(runStoreSnapshotPipeline(assembled), {
    openDocumentIds: ["d1", "d2"], openCount: 2, lastDocumentNumber: "SR-00002",
  });
}

const SNAPSHOT = snap();

describe("pruebas obligatorias T4/T5/T6", () => {
  it("T4: B1 idéntico entre card y tab — mismo campo, mismo texto", () => {
    const dash = buildDashboardPresentation(SNAPSHOT);
    for (const store of SNAPSHOT.perStore) {
      const card = dash.storeCards.find(c => c.storeId === store.storeId)!;
      const tab = buildCoverageTabPresentation(SNAPSHOT, store.storeId);
      assert.equal(card.coverageText, tab.structural.coverageText);
      assert.ok(card.subtitle.includes(card.coverageText));           // el subtítulo usa el MISMO campo
    }
  });

  it("T5: A3 idéntico al snapshot, dígito a dígito", () => {
    const dash = buildDashboardPresentation(SNAPSHOT);
    const a3 = dash.kpiCards.find(k => k.key === "unidadesPorSurtir")!;
    assert.equal(a3.value, `${SNAPSHOT.moduleKpis.unidadesPorSurtir.toLocaleString("es-CO")} uds`);
    const a1 = dash.kpiCards.find(k => k.key === "tiendasActivas")!;
    assert.equal(a1.value, String(SNAPSHOT.moduleKpis.tiendasActivas));
  });

  it("T6: SIN_BASE visible como 'Sin base', jamás convertido a 0 %", () => {
    // Snapshot sintético con SIN_BASE explícito (inv. 7)
    const store = SNAPSHOT.perStore[0];
    const sinBase: StoreSnapshot = {
      ...SNAPSHOT,
      presentationHints: { ...SNAPSHOT.presentationHints, coberturaRed: "SIN_BASE" },
      moduleKpis: { ...SNAPSHOT.moduleKpis, coberturaRed: null },
      perStore: [{
        ...store,
        kpis: { ...store.kpis, coveragePercent: null, coverageStatus: "SIN_BASE" },
      }, ...SNAPSHOT.perStore.slice(1)],
    };
    const dash = buildDashboardPresentation(sinBase);
    const card = dash.storeCards.find(c => c.storeId === store.storeId)!;
    assert.equal(card.coverageText, "Sin base");
    assert.ok(!card.coverageText.includes("0"));
    const a5 = dash.kpiCards.find(k => k.key === "coberturaRed")!;
    assert.equal(a5.value, "Sin base");
    // La tienda SIN_BASE jamás muestra "0 %" en ninguna de sus superficies:
    assert.ok(!card.subtitle.includes("0 %"));
    assert.equal(buildCoverageTabPresentation(sinBase, store.storeId).structural.coverageText, "Sin base");
    // Y un 0 % LEGÍTIMO (Centro: 0 sanas de 46 esperadas) sigue siendo "0 %", no "Sin base":
    const centroCard = dash.storeCards.find(c => c.storeId === "centro")!;
    assert.equal(centroCard.coverageText, "0 %");
  });
});

describe("contrato endurecido", () => {
  it("los estados visuales salen EXCLUSIVAMENTE de presentationHints (actionKey → plantilla)", () => {
    const dash = buildDashboardPresentation(SNAPSHOT);
    const centro = SNAPSHOT.perStore.find(s => s.storeId === "centro")!;
    const card = dash.storeCards.find(c => c.storeId === "centro")!;
    assert.equal(centro.presentationHints.actionKey, "SURTIR");
    assert.equal(card.actionText, `Surtir ${centro.kpis.shortageUnits.toLocaleString("es-CO")} uds`);
    // Tono de KPI de módulo desde hints, 1:1:
    const at = dash.kpiCards.find(k => k.key === "requierenAtencion")!;
    assert.equal(at.tone, SNAPSHOT.presentationHints.requierenAtencion === "ALERTA" ? "critical" : "positive");
  });

  it("todo número del DTO es copia verbatim de un campo del snapshot", () => {
    const centro = SNAPSHOT.perStore.find(s => s.storeId === "centro")!;
    const needsTab = buildNeedsTabPresentation(SNAPSHOT, "centro");
    assert.equal(needsTab.totals.suggestedUnitsText, centro.presentationHints.needs.totals.suggestedUnits.toLocaleString("es-CO"));
    assert.equal(needsTab.totals.unassignedCountText, centro.presentationHints.needs.totals.unassignedCount.toLocaleString("es-CO"));
    assert.equal(needsTab.suggestions.length, centro.presentationHints.needs.suggestions.length);   // proyección, no recomputo
    const repl = buildReplenishmentPresentation(SNAPSHOT);
    for (const s of repl.storeSummaries) {
      const src = SNAPSHOT.plan.summaryByStore.find(x => x.storeId === s.storeId)!;
      assert.equal(s.allocatedText, src.allocatedUnits.toLocaleString("es-CO"));
    }
    assert.equal(repl.documentsOpenText, "2 documentos abiertos");   // openCount del snapshot
  });

  it("tienda inexistente → error explícito (jamás DTO vacío silencioso)", () => {
    assert.throws(() => buildCoverageTabPresentation(SNAPSHOT, "no_existe"), /no existe en el snapshot/);
  });

  it("la proyección de no-asignadas conserva code/detail/engineReason certificados, verbatim", () => {
    const needsTab = buildNeedsTabPresentation(SNAPSHOT, "centro");
    const src = SNAPSHOT.perStore.find(s => s.storeId === "centro")!.presentationHints.needs;
    assert.equal(needsTab.unassignedTitle, "Necesidades no asignadas");
    assert.equal(needsTab.unassigned.length, src.unassigned.length);
    for (let i = 0; i < needsTab.unassigned.length; i++) {
      assert.equal(needsTab.unassigned[i].code, src.unassigned[i].code);
      assert.equal(needsTab.unassigned[i].detail, src.unassigned[i].detail);
      assert.equal(needsTab.unassigned[i].engineReason, src.unassigned[i].engineReason);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COVERAGE-UX-01 — tab Cobertura proyectado desde coverage.ruleEvaluations
// ═════════════════════════════════════════════════════════════════════════════

/** Clona el snapshot reemplazando campos de coverage de UNA tienda (fixture). */
function withCoverage(
  snapshot: StoreSnapshot,
  storeId: string,
  coverage: Partial<SnapshotStoreCoverage>,
): StoreSnapshot {
  return {
    ...snapshot,
    perStore: snapshot.perStore.map(s =>
      s.storeId === storeId ? { ...s, coverage: { ...s.coverage, ...coverage } } : s,
    ),
  };
}

function allStructuralRows(tab: ReturnType<typeof buildCoverageTabPresentation>) {
  return tab.structural.sections.flatMap(s => s.groups).flatMap(g => g.rows);
}

function syntheticSpecial(
  storeId: string,
  pattern: string,
  status: "CUMPLIDA" | "FALTANTE" | "EXCEDENTE" | "NO_AUTORIZADA",
): CoverageRuleEvaluation {
  return {
    ruleId: `SPECIAL:${storeId}:${pattern}`,
    ruleType: "SPECIAL_PRODUCT",
    label: pattern,
    minimum: 1, ideal: 1, maximum: null,
    actualUnits: status === "CUMPLIDA" ? 1 : 0,
    status,
    gapToIdeal: status === "FALTANTE" ? 1 : 0,
    source: "SPECIAL_POLICY",
    priority: 1000,
  };
}

describe("COVERAGE-UX-01 — fuente canónica ruleEvaluations", () => {
  const centro = SNAPSHOT.perStore.find(s => s.storeId === "centro")!;
  const baseEvals = centro.coverage.ruleEvaluations;
  const structuralEvals = baseEvals.filter(ev => ev.ruleType !== "SPECIAL_PRODUCT");

  it("universo dinámico: una fila por evaluación estructural — jamás un conteo fijo", () => {
    const tab = buildCoverageTabPresentation(SNAPSHOT, "centro");
    const rows = allStructuralRows(tab);
    assert.equal(rows.length, structuralEvals.length);
    // cards: SALUDABLES verbatim del snapshot; ATENCIÓN = cardinalidad proyectada
    assert.equal(tab.structural.healthyCountText, centro.coverage.healthyStructures.toLocaleString("es-CO"));
    assert.equal(tab.structural.attentionCountText, rows.filter(r => r.requiresAttention).length.toLocaleString("es-CO"));
    assert.ok(tab.structural.coverageDetailText.startsWith(
      `${centro.coverage.healthyStructures.toLocaleString("es-CO")} de ${centro.coverage.expectedStructures.toLocaleString("es-CO")}`,
    ));
    // estados humanos (corrección 7): jamás claves de enum crudas
    for (const r of rows) assert.ok(!r.statusLabel.includes("_"), `label crudo: ${r.statusLabel}`);
  });

  it("jerarquía dinámica: CS por grupo real; LK y ACC planos; secciones = líneas presentes", () => {
    const tab = buildCoverageTabPresentation(SNAPSHOT, "centro");
    const cs = tab.structural.sections.find(s => s.line === "castillitos")!;
    assert.ok(cs.groups.length > 1 && cs.groups.every(g => g.groupLabel !== null));
    const lk = tab.structural.sections.find(s => s.line === "latin_kids")!;
    assert.ok(lk.groups.length === 1 && lk.groups[0].groupLabel === null);
    const acc = tab.structural.sections.find(s => s.line === "accesorios_importacion")!;
    assert.ok(acc.groups.length === 1 && acc.groups[0].groupLabel === null);
    assert.equal(acc.lineLabel, "Accesorios");
    // dinamismo — quitar: sin evaluaciones ACC → la sección desaparece (sin chip vacío)
    const noAcc = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: baseEvals.filter(ev => ev.ruleType !== "ACCESSORY_SIZE"),
    });
    const tabNoAcc = buildCoverageTabPresentation(noAcc, "centro");
    assert.ok(!tabNoAcc.structural.sections.some(s => s.line === "accesorios_importacion"));
    assert.equal(allStructuralRows(tabNoAcc).length, structuralEvals.filter(ev => ev.ruleType !== "ACCESSORY_SIZE").length);
  });

  it("G2: una regla ADD sintética en ruleEvaluations aparece SIN tocar structures", () => {
    const synthetic: CoverageRuleEvaluation = {
      ruleId: "STRUCT:CS|CS GRUPO NUEVO|Regla Nueva",
      ruleType: "TEXTILE_STRUCTURE",
      label: "Regla Nueva",
      minimum: 2, ideal: 4, maximum: 6,
      actualUnits: 0, status: "SIN_COBERTURA", gapToIdeal: 4,
      source: "POLICY_ADD", priority: 1,
    };
    // structures NO cambia — la fila la gobierna la proyección
    const snap2 = withCoverage(SNAPSHOT, "centro", { ruleEvaluations: [...baseEvals, synthetic] });
    const tab = buildCoverageTabPresentation(snap2, "centro");
    const cs = tab.structural.sections.find(s => s.line === "castillitos")!;
    const grupo = cs.groups.find(g => g.groupLabel === "CS GRUPO NUEVO")!;
    assert.equal(grupo.rows.length, 1);
    assert.equal(grupo.rows[0].ruleId, synthetic.ruleId);
    assert.equal(grupo.rows[0].statusLabel, "Sin cobertura");
    assert.equal(grupo.rows[0].ruleText, "2 / 4 / 6");
    assert.equal(grupo.groupDisplay, "Grupo Nuevo");   // prefijo de línea removido + Title Case
  });

  it("G3: remover una evaluación la oculta aunque structures aún la traiga", () => {
    const removed = structuralEvals[0];
    const snap3 = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: baseEvals.filter(ev => ev.ruleId !== removed.ruleId),
    });
    // structures intacto y CONTIENE la estructura removida de la proyección:
    assert.ok(centro.coverage.structures.some(s => `STRUCT:${s.structureKey}` === removed.ruleId));
    const rows = allStructuralRows(buildCoverageTabPresentation(snap3, "centro"));
    assert.ok(!rows.some(r => r.ruleId === removed.ruleId));
    assert.equal(rows.length, structuralEvals.length - 1);
  });

  it("G4 separación: mutar especiales jamás mueve la cobertura estructural (byte-idéntica)", () => {
    const withFaltantes = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: [...baseEvals, syntheticSpecial("centro", "BAÑERA_TEST", "FALTANTE"), syntheticSpecial("centro", "LAMPARA_TEST", "FALTANTE")],
    });
    const withCumplidas = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: [...baseEvals, syntheticSpecial("centro", "BAÑERA_TEST", "CUMPLIDA"), syntheticSpecial("centro", "LAMPARA_TEST", "CUMPLIDA")],
    });
    const tabA = buildCoverageTabPresentation(withFaltantes, "centro");
    const tabB = buildCoverageTabPresentation(withCumplidas, "centro");
    assert.equal(JSON.stringify(tabA.structural), JSON.stringify(tabB.structural));
    assert.notEqual(tabA.specials.summaryText, tabB.specials.summaryText);
    // Resumen dinámico "N de M cumplidas": M crece con las 2 sintéticas; N sube en 2 entre A y B
    const baseSpecials = baseEvals.filter(ev => ev.ruleType === "SPECIAL_PRODUCT");
    const baseCumplidas = baseSpecials.filter(ev => ev.status === "CUMPLIDA").length;
    const total = baseSpecials.length + 2;
    assert.equal(tabA.specials.summaryText, `${baseCumplidas.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} cumplidas`);
    assert.equal(tabB.specials.summaryText, `${(baseCumplidas + 2).toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} cumplidas`);
    const rowA = tabA.specials.rows.find(r => r.ruleId === "SPECIAL:centro:BAÑERA_TEST")!;
    assert.equal(rowA.statusLabel, "Requiere surtido");
    assert.equal(rowA.detailText, "Faltan 1 uds para el objetivo");
    const rowB = tabB.specials.rows.find(r => r.ruleId === "SPECIAL:centro:BAÑERA_TEST")!;
    assert.equal(rowB.statusLabel, "Objetivo cumplido");
    assert.equal(rowB.detailText, null);
  });

  it("G5: SOBRE_MAXIMO visible y distinto — sano para B1, con exceso verbatim enriquecido", () => {
    const ev0 = structuralEvals.find(ev => ev.ruleType === "TEXTILE_STRUCTURE")!;
    const overEv: CoverageRuleEvaluation = { ...ev0, status: "SOBRE_MAXIMO", gapToIdeal: 0 };
    const stKey = overEv.ruleId.slice("STRUCT:".length);
    const structures = centro.coverage.structures.map(s =>
      s.structureKey === stKey ? { ...s, unitRule: { ...s.unitRule, excessOverMax: 4 } } : s,
    );
    const snap5 = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: baseEvals.map(ev => (ev.ruleId === overEv.ruleId ? overEv : ev)),
      structures,
    });
    const row = allStructuralRows(buildCoverageTabPresentation(snap5, "centro")).find(r => r.ruleId === overEv.ruleId)!;
    assert.equal(row.statusLabel, "Sobre máximo");        // jamás escondido tras "Saludable"
    assert.equal(row.healthy, true);                       // pero sigue sano para B1 (ley del pipeline)
    assert.equal(row.requiresAttention, false);
    assert.equal(row.detailText, "Cumple cobertura · 4 uds sobre el máximo");
    // Sin enriquecimiento disponible (estructura ausente): condición visible sin cifra
    const snap5b = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: baseEvals.map(ev => (ev.ruleId === overEv.ruleId ? overEv : ev)),
      structures: centro.coverage.structures.filter(s => s.structureKey !== stKey),
    });
    const rowB = allStructuralRows(buildCoverageTabPresentation(snap5b, "centro")).find(r => r.ruleId === overEv.ruleId)!;
    assert.equal(rowB.detailText, "Cumple cobertura · sobre el máximo");
  });

  it("copy BAJO_MINIMO gobernado por minimum (real-data gate §4): deficitToMin verbatim, jamás el ideal", () => {
    // Fixture real: centro tiene una estructura CS con 6 uds vs regla 8/10/12
    // → BAJO_MINIMO con deficitToMin = 2 (motor) y deficitToIdeal = 4.
    const tab = buildCoverageTabPresentation(SNAPSHOT, "centro");
    const row = allStructuralRows(tab).find(r => r.statusKey === "BAJO_MINIMO" && r.actualUnitsText === "6")!;
    assert.ok(row, "fixture debe producir una fila BAJO_MINIMO con 6 uds");
    const st = centro.coverage.structures.find(s => `STRUCT:${s.structureKey}` === row.ruleId)!;
    assert.equal(row.detailText, `Faltan ${st.unitRule.deficitToMin.toLocaleString("es-CO")} uds para alcanzar el mínimo`);
    assert.ok(!row.detailText!.includes("ideal"), "el copy de BAJO_MINIMO jamás habla del ideal");
    assert.ok(row.ruleText.includes(` / ${st.rule.idealUnits} / `), "el ideal sigue visible en ruleText");
    // Fallback sin enriquecimiento (evaluación sin estructura): condición sin cifra fabricada
    const orphan: CoverageRuleEvaluation = {
      ruleId: "STRUCT:CS|CS GRUPO NUEVO|Huérfana",
      ruleType: "TEXTILE_STRUCTURE", label: "Huérfana",
      minimum: 8, ideal: 10, maximum: 12,
      actualUnits: 3, status: "BAJO_MINIMO", gapToIdeal: 7,
      source: "POLICY_ADD", priority: 1,
    };
    const snapO = withCoverage(SNAPSHOT, "centro", { ruleEvaluations: [...baseEvals, orphan] });
    const rowO = allStructuralRows(buildCoverageTabPresentation(snapO, "centro")).find(r => r.ruleId === orphan.ruleId)!;
    assert.equal(rowO.detailText, "Por debajo del mínimo de 8 uds");
  });

  it("copy SIN_COBERTURA (real-data gate §5): sin referencias + faltante al mínimo con minimum verbatim", () => {
    const tab = buildCoverageTabPresentation(SNAPSHOT, "centro");
    const row = allStructuralRows(tab).find(r => r.statusKey === "SIN_COBERTURA")!;
    const ev = baseEvals.find(e => e.ruleId === row.ruleId)!;
    assert.equal(row.detailText, `Sin referencias con inventario · Faltan ${ev.minimum.toLocaleString("es-CO")} uds para alcanzar el mínimo`);
  });

  it("edición de regla: min/ideal/max alterados en la evaluación → ruleText lo refleja", () => {
    const ev0 = structuralEvals.find(ev => ev.ruleType === "TEXTILE_STRUCTURE")!;
    const edited: CoverageRuleEvaluation = { ...ev0, minimum: 9, ideal: 12, maximum: 15 };
    const snap6 = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: baseEvals.map(ev => (ev.ruleId === edited.ruleId ? edited : ev)),
    });
    const row = allStructuralRows(buildCoverageTabPresentation(snap6, "centro")).find(r => r.ruleId === edited.ruleId)!;
    assert.equal(row.ruleText, "9 / 12 / 15");
    // Sin tope (maximum null, ley ACC): "—"
    const noMax: CoverageRuleEvaluation = { ...ev0, minimum: 9, ideal: 12, maximum: null };
    const snap6b = withCoverage(SNAPSHOT, "centro", {
      ruleEvaluations: baseEvals.map(ev => (ev.ruleId === noMax.ruleId ? noMax : ev)),
    });
    const rowB = allStructuralRows(buildCoverageTabPresentation(snap6b, "centro")).find(r => r.ruleId === noMax.ruleId)!;
    assert.equal(rowB.ruleText, "9 / 12 / —");
  });
});

describe("COVERAGE-UX-01 — guardián del render del tab (fs)", () => {
  const clientSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx"),
    "utf8",
  );

  it("grupos de Castillitos colapsados por defecto (Set vacío inicial)", () => {
    assert.ok(
      clientSrc.includes("const [covOpenGroups, setCovOpenGroups] = useState<Set<string>>(new Set());"),
      "estado inicial de grupos debe ser Set vacío (cerrados)",
    );
    assert.ok(
      clientSrc.includes("covOpenGroups.has(g.key) && g.rows.map"),
      "las filas de un grupo solo se renderizan si el grupo está abierto",
    );
  });

  it("filtros dinámicos desde las secciones proyectadas + Especiales condicional", () => {
    assert.ok(
      clientSrc.includes("covPres.structural.sections.map(sec => ({ key: sec.line, label: sec.lineLabel }))"),
      "chips generados de las líneas PRESENTES en la proyección",
    );
    assert.ok(
      clientSrc.includes('covPres.specials.rows.length > 0 ? [{ key: "ESPECIALES", label: "Especiales" }] : []'),
      "chip Especiales solo si existen reglas especiales",
    );
  });

  it("el tab consume EXCLUSIVAMENTE el DTO (render-only, sin recomputo)", () => {
    // Cards y secciones leen campos del DTO; el cliente jamás deriva estados
    for (const required of [
      "covPres.structural.coverageText",
      "covPres.structural.healthyCountText",
      "covPres.structural.attentionCountText",
      "covPres.specials.summaryText",
      "covPres.structural.coverageDetailText",
    ]) {
      assert.ok(clientSrc.includes(required), `el render debe usar ${required}`);
    }
    // La vieja superficie structures-driven no debe reaparecer:
    for (const banned of ["covPres.rows", "covPres.lineGroups", "covPres.specialRules", "covPres.coverageText", "healthyOfExpectedText"]) {
      assert.ok(!clientSrc.includes(banned), `superficie legacy prohibida en el cliente: ${banned}`);
    }
  });
});

describe("guardián del fuente del módulo (contrato §3 endurecido)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../store-presentation-assembler.ts"), "utf8");

  it("imports exactos: pipeline + proyección canónica + datos de taxonomía; sin motores/servicios/SDS/Prisma", () => {
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(imports, [
      "./store-snapshot-pipeline",
      "./coverage-rule-projection",
      "@/lib/products/commercial-taxonomy/commercial-taxonomy-data",
    ]);
    for (const banned of ["prisma", "store-distribution-service", "store-unit-needs-service", "store-coverage-service", "store-unit-coverage-engine", "server-only", ">= 90", ">= 70"]) {
      assert.ok(!src.includes(banned), `patrón prohibido en el PA: ${banned}`);
    }
  });

  it("G6 + contrato estricto en la sección COVERAGE-UX-01: cero aritmética, cero cardinalidades fijas", () => {
    const beginIfaces = src.indexOf("COVERAGE-UX-01 BEGIN");
    const endIfaces = src.indexOf("COVERAGE-UX-01 (interfaces)");
    const beginBuilder = src.indexOf("export function buildCoverageTabPresentation");
    const endBuilder = src.indexOf("COVERAGE-UX-01 END");
    assert.ok(beginIfaces >= 0 && endIfaces > beginIfaces, "marcadores de interfaces ausentes");
    assert.ok(beginBuilder >= 0 && endBuilder > beginBuilder, "marcadores del builder ausentes");
    for (const section of [src.slice(beginIfaces, endIfaces), src.slice(beginBuilder, endBuilder)]) {
      // G6: jamás cardinalidades fijas del universo de reglas
      assert.ok(!/\b(32|46)\b/.test(section), "cardinalidad fija en la sección de cobertura");
      assert.ok(!/\b11\b/.test(section), "cardinalidad fija (11) en la sección de cobertura");
      // contrato estricto: cero aritmética/umbrales — solo proyección y cardinalidades
      for (const banned of [".reduce(", "Math.", "* 100", "+ 1", "- 1", ">= 90", ">= 70"]) {
        assert.ok(!section.includes(banned), `patrón prohibido en sección de cobertura: ${banned}`);
      }
    }
  });
});
