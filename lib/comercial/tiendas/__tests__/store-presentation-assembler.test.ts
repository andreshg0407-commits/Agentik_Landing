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
import { runStoreSnapshotPipeline, attachDocumentRefs, type StoreSnapshot } from "../store-snapshot-pipeline";
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
      assert.equal(card.coverageText, tab.coverageText);
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
    assert.equal(buildCoverageTabPresentation(sinBase, store.storeId).coverageText, "Sin base");
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

describe("guardián del fuente del módulo (contrato §3 endurecido)", () => {
  it("solo importa de store-snapshot-pipeline; sin motores/servicios/SDS/Prisma; sin reduce/Math/umbrales", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../store-presentation-assembler.ts"), "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(imports, ["./store-snapshot-pipeline"]);        // ÚNICO import
    for (const banned of [".reduce(", "Math.", "prisma", "store-distribution-service", "store-unit-needs-service", "store-coverage-service", ">= 90", ">= 70", "* 100"]) {
      assert.ok(!src.includes(banned), `patrón prohibido en el PA: ${banned}`);
    }
  });
});
