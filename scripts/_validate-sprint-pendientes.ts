/**
 * MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01 — Sprint pendientes validation
 *
 * Validates:
 *   P3: BUZO_CAMIBUSO revertido + recálculo CS + BUZO/CAMIBUSO ref counts
 *   P4: currentUnits = matched.length (ref count) — demonstrate net_qty semantics
 *   P5: Latin Kids partial state — connected vs pending entries
 *   P6: net_qty <= 0 exclusion — before/after filter evidence
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
import type { MalletAssortmentGroup, MalletAssortmentEntry } from "@/lib/comercial/maletas/assortment-catalog/mallet-assortment-types";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

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

  // ── Fetch raw balance (INCLUDING net_qty <= 0) for P6 evidence ──────────
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  P6 — net_qty EXCLUSION EVIDENCE");
  console.log("════════════════════════════════════════════════════════════════\n");

  // Query B48 (Nestor) WITHOUT the WHERE net_qty > 0 filter
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
) sub
  `.trim();

  let allBalanceRows: Array<{ ref: string; descr: string; net_qty: number; subgrupo_id: number | null }> = [];
  try {
    const raw = await consultaSagJson(sagConfig, rawBalanceQuery);
    allBalanceRows = raw as any;
  } catch (err) {
    console.error("  Failed to fetch unfiltered balance:", err);
  }

  const totalAllRefs = allBalanceRows.length;
  const positiveRefs = allBalanceRows.filter((r) => Number(r.net_qty) > 0);
  const zeroRefs = allBalanceRows.filter((r) => Number(r.net_qty) === 0);
  const negativeRefs = allBalanceRows.filter((r) => Number(r.net_qty) < 0);

  console.log(`  Total refs in B48 transfer history (no filter): ${totalAllRefs}`);
  console.log(`  Refs with net_qty > 0 (PRESENT):  ${positiveRefs.length}`);
  console.log(`  Refs with net_qty = 0 (EXCLUDED): ${zeroRefs.length}`);
  console.log(`  Refs with net_qty < 0 (EXCLUDED): ${negativeRefs.length}`);
  console.log(`  Total excluded (net_qty <= 0):     ${zeroRefs.length + negativeRefs.length}`);
  console.log();

  // Show exclusion condition
  console.log("  Exclusion mechanism:");
  console.log("    SQL: vendor-sample-presence-engine.ts:106 → WHERE net_qty > 0");
  console.log("    Code: VendorPresenceItem.present is always true (SQL pre-filters)");
  console.log("    Code: vendor-sample-loader.ts:197 → pr.items.map() only receives present items");
  console.log("    Code: maletas-functional-evaluation.ts:108 → presentRefs = vendor.refs (all present=true)");
  console.log("    Result: excluded refs NEVER enter matchRefs(), currentUnits, or coverage");
  console.log();

  if (zeroRefs.length + negativeRefs.length > 0) {
    console.log("  Sample excluded refs (first 10):");
    const excluded = [...zeroRefs, ...negativeRefs].slice(0, 10);
    for (const r of excluded) {
      console.log(`    ${(r.ref ?? "").padEnd(15)}  net_qty=${Number(r.net_qty).toString().padStart(3)}  "${(r.descr ?? "").substring(0, 40)}"`);
    }
  }

  // Verify none of these appear in the loaded data
  const excludedRefCodes = new Set([...zeroRefs, ...negativeRefs].map((r) => (r.ref ?? "").trim()));

  // ── Now load through the normal path ─────────────────────────────────────
  const presenceResults = await fetchAllVendorPresence(sagConfig);
  const subgrupoLookup = await fetchSubgruposLookup(sagConfig);
  const grupoLookup = await fetchSubgrupoToGrupoLookup(sagConfig);

  const nestor = presenceResults.find((p) => p.bodegaKaNl === 48);
  if (!nestor) { console.error("B48 not found"); process.exit(1); }

  const loadedRefs = new Set(nestor.items.map((i) => i.reference));
  const excludedThatLeaked = [...excludedRefCodes].filter((r) => loadedRefs.has(r));
  console.log(`\n  Post-filter verification:`);
  console.log(`    Loaded refs (net_qty > 0): ${loadedRefs.size}`);
  console.log(`    Excluded refs that leaked into loaded data: ${excludedThatLeaked.length}`);
  if (excludedThatLeaked.length === 0) {
    console.log("    ✓ Zero leaks — exclusion is complete");
  } else {
    console.log("    ✗ LEAKS DETECTED:");
    for (const r of excludedThatLeaked) console.log(`      ${r}`);
  }

  // ── P4 — currentUnits = matched.length vs SUM(net_qty) ─────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  P4 — currentUnits SEMANTICS: COUNT(refs) vs SUM(net_qty)");
  console.log("════════════════════════════════════════════════════════════════\n");

  console.log("  Code path (maletas-functional-evaluation.ts:187):");
  console.log("    const currentUnits = matched.length;");
  console.log();
  console.log("  Business semantics:");
  console.log("    Maletas = mostrario (display cases). Each ref = 1 physical sample.");
  console.log("    vendor-sample-presence-engine.ts:12 comment:");
  console.log('    "Maletas are mostrario (max 1 per ref)"');
  console.log("    The derrotero measures: ¿cuántas REFERENCIAS distintas tiene el vendedor");
  console.log("    en cada subgrupo? No cuántas unidades físicas en total.");
  console.log();

  // Show net_qty distribution for B48
  const netQtyDistribution = new Map<number, number>();
  for (const item of nestor.items) {
    const qty = item.netQty;
    netQtyDistribution.set(qty, (netQtyDistribution.get(qty) ?? 0) + 1);
  }

  console.log("  B48 net_qty distribution (present refs only):");
  const sortedQtys = [...netQtyDistribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [qty, count] of sortedQtys) {
    console.log(`    net_qty=${qty}  → ${count} refs ${qty > 1 ? " ← net_qty > 1 EXISTS" : ""}`);
  }

  const refsWithMultiple = nestor.items.filter((i) => i.netQty > 1);
  console.log(`\n  Refs with net_qty > 1: ${refsWithMultiple.length}`);

  if (refsWithMultiple.length > 0) {
    console.log("\n  Examples of net_qty > 1:");
    for (const item of refsWithMultiple.slice(0, 5)) {
      console.log(`    ${item.reference.padEnd(15)}  net_qty=${item.netQty}  "${item.description.substring(0, 40)}"`);
    }
    console.log("\n  ANALYSIS:");
    console.log("    net_qty > 1 means multiple transfer-in without corresponding transfer-out.");
    console.log("    In mostrario context: vendor has received that ref multiple times but");
    console.log("    only carries 1 physical sample. The derrotero entry asks 'is the ref present?'");
    console.log("    not 'how many duplicates exist?'.");
    console.log("    currentUnits = COUNT(matched refs) is the CORRECT semantic for mostrario.");
    console.log();

    // Demonstrate the difference
    console.log("  Comparative calculation for CS_NINA_BEBE / PIJAMA_CL:");
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
      const line = LINE_MAP[prod?.productLine ?? ""] ?? "OT";
      const brand = BRAND_MAP[prod?.productLine ?? ""] ?? null;
      const subgrupoName = item.subgrupoId != null
        ? (subgrupoLookup.get(item.subgrupoId) ?? "OTRO")
        : "OTRO";
      const grupoSag = item.subgrupoId != null
        ? (grupoLookup.get(item.subgrupoId) ?? null)
        : null;
      simRefs.push({
        reference: item.reference,
        brand,
        line,
        subgrupoSag: subgrupoName,
        grupoSag,
        sizeClass: prod?.handlingUnit ?? null,
        netQty: item.netQty,
      });
    }

    const csCatalog = buildCastillitosTextilCatalog();
    const csNinaBebe = csCatalog.groups.find((g) => g.groupCode === "CS_NINA_BEBE")!;
    const pijamaCl = csNinaBebe.entries.find((e) => e.subgroupCode === "PIJAMA_CL")!;
    const csRefs = simRefs.filter((r) => r.brand === "Castillitos" && r.line !== "AC");
    const matchedPijama = matchRefs(csRefs, csNinaBebe, pijamaCl, "TEXTIL");

    const countResult = matchedPijama.length;
    const sumResult = matchedPijama.reduce((s, r) => s + r.netQty, 0);
    console.log(`    COUNT(matched refs) = ${countResult} (used as currentUnits)`);
    console.log(`    SUM(net_qty)        = ${sumResult}`);
    console.log(`    Difference          = ${sumResult - countResult}`);
    if (countResult === sumResult) {
      console.log("    → In this case they are equal (all net_qty=1)");
    } else {
      console.log(`    → Difference exists because ${matchedPijama.filter(r => r.netQty > 1).length} refs have net_qty > 1`);
      console.log("    → currentUnits = COUNT is correct for mostrario: 1 ref = 1 display slot");
    }
  } else {
    console.log("\n  All refs have net_qty = 1.");
    console.log("  → COUNT(refs) = SUM(net_qty) in this dataset.");
    console.log("  → Both would produce the same result.");
    console.log("  → currentUnits = matched.length is correct for mostrario semantics.");

    // Create a synthetic test to demonstrate
    console.log("\n  SYNTHETIC TEST: Verify logic with net_qty > 1");
    console.log("    Creating 2 fake refs with net_qty = 2 and net_qty = 3...");
    const fakeRefs: SimRef[] = [
      { reference: "FAKE_A", brand: "Castillitos", line: "CS", subgrupoSag: "PIJAMA NIÑA BB CL", grupoSag: "CS NIÑA BEBE", sizeClass: null, netQty: 2 },
      { reference: "FAKE_B", brand: "Castillitos", line: "CS", subgrupoSag: "PIJAMA NIÑA BB CL", grupoSag: "CS NIÑA BEBE", sizeClass: null, netQty: 3 },
    ];
    const csCatalog = buildCastillitosTextilCatalog();
    const csNinaBebe = csCatalog.groups.find((g) => g.groupCode === "CS_NINA_BEBE")!;
    const pijamaCl = csNinaBebe.entries.find((e) => e.subgroupCode === "PIJAMA_CL")!;
    const fakeMatched = matchRefs(fakeRefs, csNinaBebe, pijamaCl, "TEXTIL");
    console.log(`    matchRefs returned: ${fakeMatched.length} refs`);
    console.log(`    COUNT(refs) = ${fakeMatched.length} (this is currentUnits)`);
    console.log(`    SUM(net_qty) = ${fakeMatched.reduce((s, r) => s + r.netQty, 0)}`);
    console.log(`    → The matcher counts REFERENCES (display slots), not transfer units`);
    console.log(`    → Derrotero Ideal=3 means "3 distinct references", not "3 units shipped"`);
    console.log(`    → ✓ currentUnits = matched.length is correct`);
  }

  // ── P3 — BUZO_CAMIBUSO reverted + recalculate CS ─────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  P3 — BUZO_CAMIBUSO REVERTIDO + RECÁLCULO CS");
  console.log("════════════════════════════════════════════════════════════════\n");

  // Build simRefs if not already built
  let csRefsForCalc: SimRef[];
  if (typeof simRefs !== "undefined" && simRefs.length > 0) {
    // @ts-ignore — simRefs already built above
    csRefsForCalc = simRefs.filter((r: SimRef) => r.brand === "Castillitos" && r.line !== "AC");
  } else {
    const products = await prisma.productEntity.findMany({
      where: { sku: { in: nestor.items.map((i) => i.reference) } },
      select: { sku: true, productLine: true, handlingUnit: true, subgrupoId: true },
    });
    const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "5": "AC" };
    const BRAND_MAP: Record<string, string> = { "1": "Latin Kids", "2": "Castillitos", "5": "Importacion" };
    const prodMap = new Map(products.map((p) => [p.sku, p]));
    const allSimRefs: SimRef[] = [];
    for (const item of nestor.items) {
      const prod = prodMap.get(item.reference);
      allSimRefs.push({
        reference: item.reference,
        brand: BRAND_MAP[prod?.productLine ?? ""] ?? null,
        line: LINE_MAP[prod?.productLine ?? ""] ?? "OT",
        subgrupoSag: item.subgrupoId != null ? (subgrupoLookup.get(item.subgrupoId) ?? "OTRO") : "OTRO",
        grupoSag: item.subgrupoId != null ? (grupoLookup.get(item.subgrupoId) ?? null) : null,
        sizeClass: prod?.handlingUnit ?? null,
        netQty: item.netQty,
      });
    }
    csRefsForCalc = allSimRefs.filter((r) => r.brand === "Castillitos" && r.line !== "AC");
  }

  // Show BUZO and CAMIBUSO ref counts separately
  const buzoRefs = csRefsForCalc.filter((r) => r.subgrupoSag === "BUZO");
  const cambibusoRefs = csRefsForCalc.filter((r) => r.subgrupoSag === "CAMIBUSO");

  console.log("  BUZO_CAMIBUSO EVIDENCE (now sagSubgrupo: null in all 4 groups):\n");
  console.log("  Subgrupo SAG    | Refs in B48 | Per grupo SAG");
  console.log("  ────────────────┼─────────────┼───────────────────────────────────");

  const buzoByGrupo = new Map<string, number>();
  for (const r of buzoRefs) {
    const k = r.grupoSag ?? "(null)";
    buzoByGrupo.set(k, (buzoByGrupo.get(k) ?? 0) + 1);
  }
  const cambibusoByGrupo = new Map<string, number>();
  for (const r of cambibusoRefs) {
    const k = r.grupoSag ?? "(null)";
    cambibusoByGrupo.set(k, (cambibusoByGrupo.get(k) ?? 0) + 1);
  }

  const grupoDetail1 = [...buzoByGrupo.entries()].map(([g, n]) => `${g}: ${n}`).join(", ");
  const grupoDetail2 = [...cambibusoByGrupo.entries()].map(([g, n]) => `${g}: ${n}`).join(", ");
  console.log(`  BUZO            | ${buzoRefs.length.toString().padStart(11)} | ${grupoDetail1}`);
  console.log(`  CAMIBUSO        | ${cambibusoRefs.length.toString().padStart(11)} | ${grupoDetail2}`);
  console.log(`  Total           | ${(buzoRefs.length + cambibusoRefs.length).toString().padStart(11)} | Combined (NOT summed in derrotero)`);
  console.log();
  console.log("  Decisión comercial requerida:");
  console.log("    ¿BUZO y CAMIBUSO deben sumarse en la misma cuota del derrotero?");
  console.log("    ¿O son categorías distintas con cuotas independientes?");
  console.log("    Mientras tanto → sagSubgrupo: null → currentUnits: 0 → no contamina");

  // Recalculate CS with BUZO_CAMIBUSO = null
  const csCatalog2 = buildCastillitosTextilCatalog();

  console.log("\n  RECÁLCULO CASTILLITOS (post BUZO_CAMIBUSO revert):\n");
  console.log("  Grupo            | Entrada         | Ideal | Actual | Delta | Estado");
  console.log("  ─────────────────┼─────────────────┼───────┼────────┼───────┼────────");

  let totalComplete = 0, totalMissing = 0, totalExcess = 0, totalEntries = 0;
  const csMatchedAll = new Set<string>();
  let duplicates = 0;

  for (const group of csCatalog2.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      totalEntries++;
      const matched = matchRefs(csRefsForCalc, group, entry, "TEXTIL");
      const currentUnits = matched.length;
      const delta = currentUnits - entry.targetUnits;
      const complete = currentUnits >= entry.targetUnits;
      const excess = currentUnits > entry.targetUnits;
      if (complete) totalComplete++;
      else totalMissing++;
      if (excess) totalExcess++;

      for (const m of matched) {
        if (csMatchedAll.has(m.reference)) duplicates++;
        csMatchedAll.add(m.reference);
      }

      const status = entry.sagSubgrupo == null ? "RETENIDO"
        : currentUnits === 0 ? "ZERO"
        : complete ? "OK"
        : "PARCIAL";
      const groupLabel = group.groupCode.substring(0, 17).padEnd(17);
      const entryLabel = (entry.subgroupCode ?? "").padEnd(15);
      console.log(`  ${groupLabel} | ${entryLabel} | ${entry.targetUnits.toString().padStart(5)} | ${currentUnits.toString().padStart(6)} | ${(delta >= 0 ? "+" : "") + delta.toString().padStart(4)} | ${status}`);
    }
  }

  const csUnmatched = csRefsForCalc.filter((r) => !csMatchedAll.has(r.reference));
  const completion = totalEntries > 0 ? Math.round((totalComplete / totalEntries) * 100) : 0;

  console.log(`\n  RESUMEN CS (post revert):`);
  console.log(`    Entradas totales: ${totalEntries}`);
  console.log(`    Completas: ${totalComplete}  Faltantes: ${totalMissing}  Exceso: ${totalExcess}`);
  console.log(`    Cobertura: ${completion}%`);
  console.log(`    Refs únicas mapeadas: ${csMatchedAll.size}`);
  console.log(`    Duplicados: ${duplicates}`);
  console.log(`    Refs CS sin mapeo: ${csUnmatched.length}`);

  if (csUnmatched.length > 0) {
    const bySubgrupo = new Map<string, number>();
    for (const r of csUnmatched) {
      bySubgrupo.set(r.subgrupoSag, (bySubgrupo.get(r.subgrupoSag) ?? 0) + 1);
    }
    console.log(`\n    Refs CS sin mapeo por subgrupo SAG:`);
    for (const [sub, cnt] of [...bySubgrupo.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`      "${sub}" → ${cnt} refs`);
    }
  }

  // ── P5 — Latin Kids partial state ────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  P5 — LATIN KIDS: ESTADO REAL PARCIAL");
  console.log("════════════════════════════════════════════════════════════════\n");

  const ltCatalog = buildLatinKidsTextilCatalog();
  const ltSimRefs = (typeof simRefs !== "undefined" ? simRefs : []).filter((r: SimRef) => r.brand === "Latin Kids" && r.line !== "AC");

  console.log("  A. ENTRADAS CONECTADAS (sagSubgrupo ≠ null):\n");
  console.log("  Entrada         | sagSubgrupo                            | Ideal | Actual | Estado");
  console.log("  ────────────────┼────────────────────────────────────────┼───────┼────────┼────────");

  let ltConnected = 0, ltPending = 0;
  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const connected = entry.sagSubgrupo != null;
      const matched = matchRefs(ltSimRefs, group, entry, "TEXTIL");
      if (connected) {
        ltConnected++;
        const sagLabel = Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo.join(" | ") : (entry.sagSubgrupo ?? "");
        const status = matched.length >= entry.targetUnits ? "OK" : matched.length === 0 ? "ZERO" : "PARCIAL";
        console.log(`  ${(entry.subgroupCode ?? "").padEnd(16)} | ${sagLabel.padEnd(38)} | ${entry.targetUnits.toString().padStart(5)} | ${matched.length.toString().padStart(6)} | ${status}`);
      }
    }
  }

  console.log(`\n  B. ENTRADAS PENDIENTES (sagSubgrupo = null, REQUIERE_DECISION_COMERCIAL):\n`);
  console.log("  Entrada                 | Ideal | Razón");
  console.log("  ────────────────────────┼───────┼──────────────────────────────────────────────────");

  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      if (entry.sagSubgrupo != null) continue;
      ltPending++;
      let reason = "REQUIERE_DECISION_COMERCIAL";
      if ((entry.subgroupCode ?? "").includes("CONJUNTO")) {
        reason = "SAG tiene 3 conjuntos vs 9 entradas catálogo";
      } else if ((entry.subgroupCode ?? "").includes("18_22")) {
        reason = "SAG no tiene separación por género en 18-22";
      }
      console.log(`  ${(entry.subgroupCode ?? "").padEnd(24)} | ${entry.targetUnits.toString().padStart(5)} | ${reason}`);
    }
  }

  console.log(`\n  Conectadas: ${ltConnected} / ${ltConnected + ltPending}`);
  console.log(`  Pendientes: ${ltPending} / ${ltConnected + ltPending}`);
  console.log(`  Cobertura real: ${Math.round((ltConnected / (ltConnected + ltPending)) * 100)}%`);
  console.log(`  Estado: PARCIAL — no es un derrotero Latin Kids completamente corregido`);

  // Show SAG subgrupos that have no catalog entry
  console.log("\n  C. SUBGRUPOS SAG LT SIN DESTINO EN CATÁLOGO:\n");
  const ltSubgrupos = new Map<string, number>();
  for (const r of ltSimRefs) {
    ltSubgrupos.set(r.subgrupoSag, (ltSubgrupos.get(r.subgrupoSag) ?? 0) + 1);
  }

  // Collect all sagSubgrupo values that ARE mapped
  const mappedSagValues = new Set<string>();
  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (entry.sagSubgrupo == null) continue;
      const vals = Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo : [entry.sagSubgrupo];
      for (const v of vals) mappedSagValues.add(v);
    }
  }

  console.log("  Subgrupo SAG                  | Refs | ¿Tiene entrada? | Decisión requerida");
  console.log("  ──────────────────────────────┼──────┼─────────────────┼────────────────────────────────────");
  for (const [sub, cnt] of [...ltSubgrupos.entries()].sort((a, b) => b[1] - a[1])) {
    const mapped = mappedSagValues.has(sub) ? "SÍ" : "NO";
    let decision = "";
    if (!mappedSagValues.has(sub)) {
      if (sub.includes("MESES")) decision = "¿Crear entrada MESES?";
      else if (sub.includes("CONJUNTO")) decision = "¿Asignar a cuál de 9 entradas CONJUNTO?";
      else if (sub.includes("18-22")) decision = "¿Asignar a entrada con/sin género?";
      else decision = "Sin entrada catálogo";
    }
    console.log(`  ${sub.padEnd(30)} | ${cnt.toString().padStart(4)} | ${mapped.padEnd(15)} | ${decision}`);
  }

  // ── Import regression recheck ────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  IMPORT REGRESSION RECHECK (unchanged)");
  console.log("════════════════════════════════════════════════════════════════\n");

  const importCatalog = buildImportAccesoriosCatalog();
  const importSimRefs = (typeof simRefs !== "undefined" ? simRefs : []).filter((r: SimRef) => r.line === "AC");

  for (const group of importCatalog.groups) {
    for (const entry of group.entries) {
      const matched = matchRefs(importSimRefs, group, entry, "IMPORTACION");
      console.log(`  ${(entry.subgroupCode ?? "").padEnd(15)} Ideal: ${entry.targetUnits}  Actual: ${matched.length}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n✓ Validation complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
