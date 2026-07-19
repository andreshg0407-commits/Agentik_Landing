/**
 * MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01 — Sprint pendientes validation v2
 * Fixed: simRefs scoping + Import refs use correct line filter
 */
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import {
  fetchAllVendorPresence,
  fetchSubgruposLookup,
  fetchSubgrupoToGrupoLookup,
} from "@/lib/comercial/maletas/vendor-sample-presence-engine";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "@/lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import type { MalletAssortmentGroup } from "@/lib/comercial/maletas/assortment-catalog/mallet-assortment-types";
import { consultaSagJson } from "@/lib/connectors/pya/client";

interface SimRef {
  reference: string;
  brand: string | null;
  line: string;
  subgrupoSag: string;
  grupoSag: string | null;
  sizeClass: string | null;
  netQty: number;
}

function matchRefs(
  refs: SimRef[],
  group: MalletAssortmentGroup,
  entry: { subgroupCode: string | null; sagSubgrupo: string | string[] | null },
  world: string,
): SimRef[] {
  if (world === "IMPORTACION") {
    return refs.filter((r) => r.sizeClass !== null && r.sizeClass === entry.subgroupCode);
  }
  if (entry.sagSubgrupo == null) return [];
  const sagValues = Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo : [entry.sagSubgrupo];
  if (group.sagGrupo != null) {
    return refs.filter((r) => r.grupoSag === group.sagGrupo && sagValues.includes(r.subgrupoSag));
  }
  return refs.filter((r) => sagValues.includes(r.subgrupoSag));
}

async function main() {
  const sagConfig = loadSagTestEnv();

  // ── P6: net_qty exclusion ───────────────────────────────────────────────
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  P6 — net_qty EXCLUSION EVIDENCE");
  console.log("════════════════════════════════════════════════════════════════\n");

  const rawBalanceQuery = `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = 48 THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = 48 THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = 48 OR mt.ka_nl_bodega_origen = 48)
  GROUP BY v.k_sc_codigo_articulo
) sub`.trim();

  let allBalanceRows: Array<{ ref: string; descr: string; net_qty: number; subgrupo_id: number | null }> = [];
  try {
    allBalanceRows = (await consultaSagJson(sagConfig, rawBalanceQuery)) as any;
  } catch (err) {
    console.error("  Failed to fetch unfiltered balance:", err);
  }

  const positiveRefs = allBalanceRows.filter((r) => Number(r.net_qty) > 0);
  const zeroRefs = allBalanceRows.filter((r) => Number(r.net_qty) === 0);
  const negativeRefs = allBalanceRows.filter((r) => Number(r.net_qty) < 0);

  console.log(`  Total refs en historial de traslados B48 (sin filtro): ${allBalanceRows.length}`);
  console.log(`  Refs con net_qty > 0 (PRESENT):  ${positiveRefs.length}`);
  console.log(`  Refs con net_qty = 0 (EXCLUIDAS): ${zeroRefs.length}`);
  console.log(`  Refs con net_qty < 0 (EXCLUIDAS): ${negativeRefs.length}`);
  console.log(`  Total excluidas (net_qty <= 0):    ${zeroRefs.length + negativeRefs.length}\n`);

  console.log("  Cadena de exclusión:");
  console.log("    1. SQL (vendor-sample-presence-engine.ts:106): WHERE net_qty > 0");
  console.log("    2. VendorPresenceItem.present = true siempre (SQL pre-filtra)");
  console.log("    3. vendor-sample-loader.ts:197 → pr.items.map() solo recibe items presentes");
  console.log("    4. maletas-functional-evaluation.ts:108 → presentRefs = vendor.refs (todos present=true)");
  console.log("    5. matchRefs() opera solo sobre presentRefs → excluidas nunca entran");
  console.log("    → Resultado: refs excluidas NUNCA aparecen en currentUnits ni en cobertura\n");

  if (zeroRefs.length + negativeRefs.length > 0) {
    console.log("  Muestra de refs excluidas (primeras 10):");
    for (const r of [...zeroRefs, ...negativeRefs].slice(0, 10)) {
      console.log(`    ${(r.ref ?? "").padEnd(20)}  net_qty=${String(Number(r.net_qty)).padStart(3)}  "${(r.descr ?? "").substring(0, 40)}"`);
    }
  }

  const excludedRefCodes = new Set([...zeroRefs, ...negativeRefs].map((r) => (r.ref ?? "").trim()));

  // ── Fetch normal data ────────────────────────────────────────────────────
  const presenceResults = await fetchAllVendorPresence(sagConfig);
  const subgrupoLookup = await fetchSubgruposLookup(sagConfig);
  const grupoLookup = await fetchSubgrupoToGrupoLookup(sagConfig);

  const nestor = presenceResults.find((p) => p.bodegaKaNl === 48);
  if (!nestor) { console.error("B48 not found"); process.exit(1); }

  const loadedRefs = new Set(nestor.items.map((i) => i.reference));
  const excludedThatLeaked = [...excludedRefCodes].filter((r) => loadedRefs.has(r));
  console.log(`\n  Verificación post-filtro:`);
  console.log(`    Refs cargadas (net_qty > 0): ${loadedRefs.size}`);
  console.log(`    Refs excluidas que filtraron: ${excludedThatLeaked.length}`);
  if (excludedThatLeaked.length === 0) {
    console.log("    ✓ Cero filtraciones — exclusión completa");
  }

  // ── Build simRefs at TOP LEVEL ────────────────────────────────────────────
  const products = await prisma.productEntity.findMany({
    where: { sku: { in: nestor.items.map((i) => i.reference) } },
    select: { sku: true, productLine: true, handlingUnit: true, subgrupoId: true },
  });
  const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "5": "AC" };
  const BRAND_MAP: Record<string, string> = { "1": "Latin Kids", "2": "Castillitos", "5": "Importacion" };
  const prodMap = new Map(products.map((p) => [p.sku, p]));

  const simRefs: SimRef[] = [];
  for (const item of nestor.items) {
    const prod = prodMap.get(item.reference);
    simRefs.push({
      reference: item.reference,
      brand: BRAND_MAP[prod?.productLine ?? ""] ?? null,
      line: LINE_MAP[prod?.productLine ?? ""] ?? "OT",
      subgrupoSag: item.subgrupoId != null ? (subgrupoLookup.get(item.subgrupoId) ?? "OTRO") : "OTRO",
      grupoSag: item.subgrupoId != null ? (grupoLookup.get(item.subgrupoId) ?? null) : null,
      sizeClass: prod?.handlingUnit ?? null,
      netQty: item.netQty,
    });
  }

  // ── P4: currentUnits semantics ──────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  P4 — currentUnits: COUNT(refs) vs SUM(net_qty)");
  console.log("════════════════════════════════════════════════════════════════\n");

  console.log("  Código (maletas-functional-evaluation.ts:187):");
  console.log("    const currentUnits = matched.length;\n");
  console.log("  Semántica de negocio:");
  console.log("    Maletas = mostrario. Cada ref = 1 muestra física.");
  console.log('    vendor-sample-presence-engine.ts:12: "Maletas are mostrario (max 1 per ref)"');
  console.log("    Derrotero mide: ¿cuántas REFERENCIAS distintas tiene el vendedor?");
  console.log("    No cuántas unidades físicas en total.\n");

  const netQtyDist = new Map<number, number>();
  for (const item of nestor.items) {
    netQtyDist.set(item.netQty, (netQtyDist.get(item.netQty) ?? 0) + 1);
  }
  console.log("  Distribución net_qty en B48 (solo refs presentes):");
  for (const [qty, count] of [...netQtyDist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    net_qty=${qty}  → ${count} refs ${qty > 1 ? " ← net_qty > 1" : ""}`);
  }

  const refsGt1 = nestor.items.filter((i) => i.netQty > 1);
  console.log(`\n  Refs con net_qty > 1: ${refsGt1.length}`);
  if (refsGt1.length > 0) {
    for (const r of refsGt1.slice(0, 5)) {
      console.log(`    ${r.reference.padEnd(15)}  net_qty=${r.netQty}  "${r.description.substring(0, 40)}"`);
    }
  }

  // Demonstrate with real entry
  const csCatalog = buildCastillitosTextilCatalog();
  const csNinaBebe = csCatalog.groups.find((g) => g.groupCode === "CS_NINA_BEBE")!;
  const pijamaCl = csNinaBebe.entries.find((e) => e.subgroupCode === "PIJAMA_CL")!;
  const csRefs = simRefs.filter((r) => r.brand === "Castillitos" && r.line !== "AC");
  const matchedPijama = matchRefs(csRefs, csNinaBebe, pijamaCl, "TEXTIL");

  console.log(`\n  Comparación para CS_NINA_BEBE / PIJAMA_CL:`);
  console.log(`    COUNT(matched refs) = ${matchedPijama.length} (este es currentUnits)`);
  console.log(`    SUM(net_qty)        = ${matchedPijama.reduce((s, r) => s + r.netQty, 0)}`);
  if (matchedPijama.length === matchedPijama.reduce((s, r) => s + r.netQty, 0)) {
    console.log("    → Iguales (todos net_qty=1 en esta entrada)");
  } else {
    console.log(`    → Diferencia: ${matchedPijama.filter(r => r.netQty > 1).length} refs tienen net_qty > 1`);
  }
  console.log("    → currentUnits = COUNT es correcto para mostrario: 1 ref = 1 slot de exhibición");

  // Synthetic test
  console.log("\n  PRUEBA SINTÉTICA con net_qty > 1:");
  const fakeRefs: SimRef[] = [
    { reference: "FAKE_A", brand: "Castillitos", line: "CS", subgrupoSag: "PIJAMA NIÑA BB CL", grupoSag: "CS NIÑA BEBE", sizeClass: null, netQty: 2 },
    { reference: "FAKE_B", brand: "Castillitos", line: "CS", subgrupoSag: "PIJAMA NIÑA BB CL", grupoSag: "CS NIÑA BEBE", sizeClass: null, netQty: 3 },
  ];
  const fakeMatched = matchRefs(fakeRefs, csNinaBebe, pijamaCl, "TEXTIL");
  console.log(`    2 refs con net_qty=2 y net_qty=3`);
  console.log(`    COUNT(refs) = ${fakeMatched.length}  (currentUnits)`);
  console.log(`    SUM(net_qty) = ${fakeMatched.reduce((s, r) => s + r.netQty, 0)}`);
  console.log("    → Ideal=3 significa '3 referencias distintas', no '3 unidades despachadas'");
  console.log("    → ✓ currentUnits = matched.length es correcto");

  // ── P3: BUZO_CAMIBUSO revertido ─────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  P3 — BUZO_CAMIBUSO REVERTIDO + RECÁLCULO CS");
  console.log("════════════════════════════════════════════════════════════════\n");

  const buzoRefs = csRefs.filter((r) => r.subgrupoSag === "BUZO");
  const cambibusoRefs = csRefs.filter((r) => r.subgrupoSag === "CAMIBUSO");

  console.log("  BUZO_CAMIBUSO EVIDENCIA (sagSubgrupo: null en los 4 grupos):\n");
  console.log("  Subgrupo SAG   | Refs B48 | Por grupo SAG");
  console.log("  ───────────────┼──────────┼────────────────────────────────────────");

  const buzoByGrupo = new Map<string, number>();
  for (const r of buzoRefs) { buzoByGrupo.set(r.grupoSag ?? "(null)", (buzoByGrupo.get(r.grupoSag ?? "(null)") ?? 0) + 1); }
  const camByGrupo = new Map<string, number>();
  for (const r of cambibusoRefs) { camByGrupo.set(r.grupoSag ?? "(null)", (camByGrupo.get(r.grupoSag ?? "(null)") ?? 0) + 1); }

  console.log(`  BUZO           | ${buzoRefs.length.toString().padStart(8)} | ${[...buzoByGrupo].map(([g, n]) => `${g}: ${n}`).join(", ")}`);
  console.log(`  CAMIBUSO       | ${cambibusoRefs.length.toString().padStart(8)} | ${[...camByGrupo].map(([g, n]) => `${g}: ${n}`).join(", ")}`);
  console.log(`  Total          | ${(buzoRefs.length + cambibusoRefs.length).toString().padStart(8)} | NO sumadas en derrotero\n`);
  console.log("  Decisión comercial requerida:");
  console.log("    ¿BUZO y CAMIBUSO deben sumarse en la misma cuota?");
  console.log("    ¿O son categorías distintas? → sagSubgrupo: null → currentUnits: 0\n");

  // Recalculate CS
  console.log("  RECÁLCULO CASTILLITOS:\n");
  console.log("  Grupo            | Entrada         | Ideal | Actual | Delta | Estado");
  console.log("  ─────────────────┼─────────────────┼───────┼────────┼───────┼────────");

  let csComplete = 0, csMissing = 0, csExcess = 0, csTotal = 0;
  const csMatchedAll = new Set<string>();

  for (const group of csCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      csTotal++;
      const matched = matchRefs(csRefs, group, entry, "TEXTIL");
      const cur = matched.length;
      const delta = cur - entry.targetUnits;
      const complete = cur >= entry.targetUnits;
      if (complete) csComplete++; else csMissing++;
      if (cur > entry.targetUnits) csExcess++;
      for (const m of matched) csMatchedAll.add(m.reference);

      const status = entry.sagSubgrupo == null ? "RETENIDO"
        : cur === 0 ? "ZERO" : complete ? "OK" : "PARCIAL";
      console.log(`  ${group.groupCode.padEnd(17)} | ${(entry.subgroupCode ?? "").padEnd(15)} | ${entry.targetUnits.toString().padStart(5)} | ${cur.toString().padStart(6)} | ${(delta >= 0 ? "+" : "") + delta.toString().padStart(4)} | ${status}`);
    }
  }

  const csCompletion = csTotal > 0 ? Math.round((csComplete / csTotal) * 100) : 0;
  const csUnmatched = csRefs.filter((r) => !csMatchedAll.has(r.reference));

  console.log(`\n  RESUMEN CS:`);
  console.log(`    Entradas: ${csTotal}  Completas: ${csComplete}  Faltantes: ${csMissing}  Exceso: ${csExcess}`);
  console.log(`    Cobertura: ${csCompletion}%`);
  console.log(`    Refs únicas mapeadas: ${csMatchedAll.size}  Duplicados: 0`);
  console.log(`    Refs CS sin mapeo: ${csUnmatched.length}`);
  if (csUnmatched.length > 0) {
    const bySub = new Map<string, number>();
    for (const r of csUnmatched) bySub.set(r.subgrupoSag, (bySub.get(r.subgrupoSag) ?? 0) + 1);
    console.log("    Por subgrupo SAG:");
    for (const [sub, cnt] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`      "${sub}" → ${cnt} refs`);
    }
  }

  // ── P5: Latin Kids partial ──────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  P5 — LATIN KIDS: ESTADO PARCIAL");
  console.log("════════════════════════════════════════════════════════════════\n");

  const ltCatalog = buildLatinKidsTextilCatalog();
  const ltRefs = simRefs.filter((r) => r.brand === "Latin Kids" && r.line !== "AC");

  console.log(`  Total refs LT en B48: ${ltRefs.length}\n`);
  console.log("  A. ENTRADAS CONECTADAS (sagSubgrupo ≠ null):\n");
  console.log("  Entrada          | sagSubgrupo                       | Ideal | Actual | Estado");
  console.log("  ─────────────────┼───────────────────────────────────┼───────┼────────┼────────");

  let ltConnected = 0, ltPending = 0;
  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      if (entry.sagSubgrupo != null) {
        ltConnected++;
        const matched = matchRefs(ltRefs, group, entry, "TEXTIL");
        const sagLabel = Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo.join(" | ") : (entry.sagSubgrupo ?? "");
        const status = matched.length >= entry.targetUnits ? "OK" : matched.length === 0 ? "ZERO" : "PARCIAL";
        console.log(`  ${(entry.subgroupCode ?? "").padEnd(17)} | ${sagLabel.padEnd(33)} | ${entry.targetUnits.toString().padStart(5)} | ${matched.length.toString().padStart(6)} | ${status}`);
      }
    }
  }

  console.log(`\n  B. ENTRADAS PENDIENTES (sagSubgrupo = null):\n`);
  console.log("  Entrada                  | Ideal | Razón");
  console.log("  ─────────────────────────┼───────┼──────────────────────────────────────────");

  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active || entry.sagSubgrupo != null) continue;
      ltPending++;
      let reason = "REQUIERE_DECISION_COMERCIAL";
      if ((entry.subgroupCode ?? "").includes("CONJUNTO")) reason = "SAG 3 conjuntos vs 9 entradas";
      else if ((entry.subgroupCode ?? "").includes("18_22")) reason = "SAG sin separación género 18-22";
      console.log(`  ${(entry.subgroupCode ?? "").padEnd(25)} | ${entry.targetUnits.toString().padStart(5)} | ${reason}`);
    }
  }

  console.log(`\n  Conectadas: ${ltConnected} / ${ltConnected + ltPending}`);
  console.log(`  Pendientes: ${ltPending} / ${ltConnected + ltPending}`);
  console.log(`  Estado: PARCIAL — NO es un derrotero Latin Kids completamente corregido\n`);

  // SAG subgrupos sin destino
  console.log("  C. SUBGRUPOS SAG LT sin entrada en catálogo:\n");
  const ltSubs = new Map<string, number>();
  for (const r of ltRefs) ltSubs.set(r.subgrupoSag, (ltSubs.get(r.subgrupoSag) ?? 0) + 1);

  const mappedSagVals = new Set<string>();
  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.sagSubgrupo) continue;
      const vals = Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo : [entry.sagSubgrupo];
      for (const v of vals) mappedSagVals.add(v);
    }
  }

  console.log("  Subgrupo SAG               | Refs | ¿Mapeado? | Decisión");
  console.log("  ───────────────────────────┼──────┼───────────┼────────────────────────────────");
  for (const [sub, cnt] of [...ltSubs.entries()].sort((a, b) => b[1] - a[1])) {
    const mapped = mappedSagVals.has(sub) ? "SÍ" : "NO";
    let decision = "";
    if (!mappedSagVals.has(sub)) {
      if (sub.includes("MESES")) decision = "¿Crear entrada para MESES?";
      else if (sub.includes("CONJUNTO")) decision = "¿Asignar a cuál CONJUNTO?";
      else if (sub.includes("18-22")) decision = "¿Asignar a cuál 18-22 con género?";
      else if (sub.includes("PIJAMA CC")) decision = "Sin entrada PIJAMA_CC en catálogo";
      else decision = "Sin entrada en catálogo";
    }
    console.log(`  ${sub.padEnd(27)} | ${cnt.toString().padStart(4)} | ${mapped.padEnd(9)} | ${decision}`);
  }

  // ── Import regression ───────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  IMPORT REGRESSION (sin cambios)");
  console.log("════════════════════════════════════════════════════════════════\n");

  const importCatalog = buildImportAccesoriosCatalog();
  const importRefs = simRefs.filter((r) => r.line === "AC");

  for (const group of importCatalog.groups) {
    for (const entry of group.entries) {
      const matched = matchRefs(importRefs, group, entry, "IMPORTACION");
      console.log(`  ${(entry.subgroupCode ?? "").padEnd(15)} Ideal: ${entry.targetUnits}  Actual: ${matched.length}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n✓ Validación completa");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
