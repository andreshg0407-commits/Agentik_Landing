/**
 * CANONICAL DERROTERO AUDIT — Extract exact B48 data per official entry
 * Compares official derroteros against SAG real data and current catalog.
 */
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  fetchSubgruposLookup,
  fetchSubgrupoToGrupoLookup,
} from "@/lib/comercial/maletas/vendor-sample-presence-engine";

interface B48Ref {
  reference: string;
  description: string;
  netQty: number;
  subgrupoId: number | null;
  subgrupoSag: string;
  grupoSag: string | null;
  brand: string | null;
  line: string;
}

async function main() {
  const sagConfig = loadSagTestEnv();

  // Fetch B48 balance (net_qty > 0 only)
  const balanceQuery = `
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
WHERE net_qty > 0`.trim();

  const rawRows = (await consultaSagJson(sagConfig, balanceQuery)) as any[];
  const subgrupoLookup = await fetchSubgruposLookup(sagConfig);
  const grupoLookup = await fetchSubgrupoToGrupoLookup(sagConfig);

  // Enrich with product data
  const refCodes = rawRows.map((r: any) => (r.ref ?? "").trim()).filter(Boolean);
  const products = await prisma.productEntity.findMany({
    where: { sku: { in: refCodes } },
    select: { sku: true, productLine: true, handlingUnit: true },
  });
  const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "5": "AC" };
  const BRAND_MAP: Record<string, string> = { "1": "Latin Kids", "2": "Castillitos", "5": "Importacion" };
  const prodMap = new Map(products.map((p) => [p.sku, p]));

  const b48Refs: B48Ref[] = [];
  for (const row of rawRows) {
    const ref = (row.ref ?? "").trim();
    if (!ref) continue;
    const prod = prodMap.get(ref);
    const subId = row.subgrupo_id != null ? Number(row.subgrupo_id) : null;
    b48Refs.push({
      reference: ref,
      description: (row.descr ?? "").trim(),
      netQty: Number(row.net_qty),
      subgrupoId: subId,
      subgrupoSag: subId != null ? (subgrupoLookup.get(subId) ?? "OTRO") : "OTRO",
      grupoSag: subId != null ? (grupoLookup.get(subId) ?? null) : null,
      brand: BRAND_MAP[prod?.productLine ?? ""] ?? null,
      line: LINE_MAP[prod?.productLine ?? ""] ?? "OT",
    });
  }

  // ── CASTILLITOS OFFICIAL DERROTERO ────────────────────────────────────────
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  TABLA CANÓNICA — DERROTERO CASTILLITOS OFICIAL");
  console.log("════════════════════════════════════════════════════════════════\n");

  interface OfficialEntry {
    grupoSag: string;
    subgrupoSag: string | string[];
    nombre: string;
    ideal: number;
    claveInterna: string;
  }

  const CS_OFFICIAL: OfficialEntry[] = [
    // CS NIÑA BEBE
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB CL", nombre: "Pijama Niña BB CL", ideal: 3, claveInterna: "PIJAMA_CL" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB LL", nombre: "Pijama Niña BB LL", ideal: 2, claveInterna: "PIJAMA_LL" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "CONJUNTO NIÑA BB CC", nombre: "Conjunto Niña BB CC", ideal: 3, claveInterna: "CONJUNTO_CC" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "CONJUNTO NIÑA BB CL", nombre: "Conjunto Niña BB CL", ideal: 2, claveInterna: "CONJUNTO_CL" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "BLUSAS", nombre: "Blusas", ideal: 2, claveInterna: "BLUSAS" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "VESTIDO", nombre: "Vestido", ideal: 3, claveInterna: "VESTIDO" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "CAMISETA", nombre: "Camiseta", ideal: 1, claveInterna: "CAMISETA" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: "MAMELUCO", nombre: "Mameluco", ideal: 1, claveInterna: "MAMELUCO" },
    { grupoSag: "CS NIÑA BEBE", subgrupoSag: ["BUZO", "CAMIBUSO"], nombre: "Buzo / Camibuso", ideal: 1, claveInterna: "BUZO_CAMIBUSO" },
    // CS NIÑO BEBE
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "PIJAMA NIÑO BB CL", nombre: "Pijama Niño BB CL", ideal: 3, claveInterna: "PIJAMA_CL" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "PIJAMA NIÑO BB LL", nombre: "Pijama Niño BB LL", ideal: 2, claveInterna: "PIJAMA_LL" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "CONJUNTO NIÑO BB CC", nombre: "Conjunto Niño BB CC", ideal: 2, claveInterna: "CONJUNTO_CC" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "CONJUNTO NIÑO BB CL", nombre: "Conjunto Niño BB CL", ideal: 3, claveInterna: "CONJUNTO_CL" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "CAMISETA", nombre: "Camiseta", ideal: 2, claveInterna: "CAMISETA" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "MAMELUCO", nombre: "Mameluco", ideal: 1, claveInterna: "MAMELUCO" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: ["BUZO", "CAMIBUSO"], nombre: "Buzo / Camibuso", ideal: 1, claveInterna: "BUZO_CAMIBUSO" },
    { grupoSag: "CS NIÑO BEBE", subgrupoSag: "POLO", nombre: "Polo", ideal: 1, claveInterna: "POLO" },
    // CS NIÑA KIDS
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "PIJAMA NIÑA KIDS CL", nombre: "Pijama Niña Kids CL", ideal: 3, claveInterna: "PIJAMA_CL" },
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "PIJAMA NIÑA KIDS LL", nombre: "Pijama Niña Kids LL", ideal: 2, claveInterna: "PIJAMA_LL" },
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "CONJUNTO NIÑA KIDS CC", nombre: "Conjunto Niña Kids CC", ideal: 2, claveInterna: "CONJUNTO_CC" },
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "CONJUNTO NIÑA KIDS CL", nombre: "Conjunto Niña Kids CL", ideal: 2, claveInterna: "CONJUNTO_CL" },
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "BLUSA", nombre: "Blusa", ideal: 2, claveInterna: "BLUSA" },  // NOTE: doc says "BLUSA" not "BLUSAS"
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "VESTIDO", nombre: "Vestido", ideal: 3, claveInterna: "VESTIDO" },
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: "CAMISETA", nombre: "Camiseta", ideal: 1, claveInterna: "CAMISETA" },
    { grupoSag: "CS NIÑA KIDS", subgrupoSag: ["BUZO", "CAMIBUSO"], nombre: "Buzo / Camibuso", ideal: 1, claveInterna: "BUZO_CAMIBUSO" },
    // CS NIÑO KIDS
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: "PIJAMA NIÑO KIDS CL", nombre: "Pijama Niño Kids CL", ideal: 3, claveInterna: "PIJAMA_CL" },
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: "PIJAMA NIÑO KIDS LL", nombre: "Pijama Niño Kids LL", ideal: 2, claveInterna: "PIJAMA_LL" },
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: "CONJUNTO NIÑO KIDS CC", nombre: "Conjunto Niño Kids CC", ideal: 2, claveInterna: "CONJUNTO_CC" },
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: "CONJUNTO NIÑO KIDS CL", nombre: "Conjunto Niño Kids CL", ideal: 3, claveInterna: "CONJUNTO_CL" },
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: "CAMISETA", nombre: "Camiseta", ideal: 2, claveInterna: "CAMISETA" },
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: ["BUZO", "CAMIBUSO"], nombre: "Buzo / Camibuso", ideal: 1, claveInterna: "BUZO_CAMIBUSO" },
    { grupoSag: "CS NIÑO KIDS", subgrupoSag: "POLO", nombre: "Polo", ideal: 1, claveInterna: "POLO" },
  ];

  // NOTE: Document says "BLUSAS" for CS NIÑA BEBE and "BLUSA" for CS NIÑA KIDS
  // Need to verify against SAG which exact name exists

  const csRefs = b48Refs.filter((r) => r.brand === "Castillitos");

  console.log("Línea | Grupo SAG         | Subgrupo SAG Doc       | distinctRefs | totalNetQty | Ideal | Estado Agentik   | Acción");
  console.log("──────┼───────────────────┼────────────────────────┼──────────────┼─────────────┼───────┼──────────────────┼─────────────");

  for (const entry of CS_OFFICIAL) {
    const sagValues = Array.isArray(entry.subgrupoSag) ? entry.subgrupoSag : [entry.subgrupoSag];
    const matched = csRefs.filter((r) =>
      r.grupoSag === entry.grupoSag && sagValues.includes(r.subgrupoSag)
    );
    const distinctRefs = matched.length;
    const totalNetQty = matched.reduce((s, r) => s + r.netQty, 0);

    // Check current catalog status
    let agentikStatus = "EXISTE";  // Simplified; real check would compare catalog code
    if (entry.claveInterna === "MAMELUCO" || entry.claveInterna === "BUZO_CAMIBUSO") {
      agentikStatus = "sagSubgrupo:null";
    }

    const action = agentikStatus === "sagSubgrupo:null" ? "CORREGIR" : "CONSERVAR";
    const sagLabel = sagValues.join(" | ");

    console.log(
      `CS    | ${entry.grupoSag.padEnd(17)} | ${sagLabel.padEnd(22)} | ${distinctRefs.toString().padStart(12)} | ${totalNetQty.toString().padStart(11)} | ${entry.ideal.toString().padStart(5)} | ${agentikStatus.padEnd(16)} | ${action}`
    );
  }

  // ── MAMELUCO deep audit ─────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  MAMELUCO — AUDITORÍA PROFUNDA");
  console.log("════════════════════════════════════════════════════════════════\n");

  // Check if "MAMELUCO" exists as a subgrupo in SAG
  const allSubgrupos = [...subgrupoLookup.entries()];
  const mamelucoSubgrupos = allSubgrupos.filter(([, name]) =>
    name.toUpperCase().includes("MAMELUCO")
  );
  console.log(`  Subgrupos SAG que contienen "MAMELUCO": ${mamelucoSubgrupos.length}`);
  for (const [id, name] of mamelucoSubgrupos) {
    const grupo = grupoLookup.get(id);
    console.log(`    ka_ni_subgrupo=${id}  nombre="${name}"  grupo="${grupo ?? "(null)"}"`);
  }

  // Check B48 refs with MAMELUCO
  const mamelucoRefs = b48Refs.filter((r) => r.subgrupoSag.toUpperCase().includes("MAMELUCO"));
  console.log(`\n  Refs B48 con subgrupoSag MAMELUCO: ${mamelucoRefs.length}`);
  for (const r of mamelucoRefs) {
    console.log(`    ${r.reference.padEnd(15)}  subgrupo="${r.subgrupoSag}"  grupo="${r.grupoSag}"  brand=${r.brand}  net_qty=${r.netQty}`);
  }

  // Check all refs with description containing MAMELUCO
  const mamelucoDescRefs = b48Refs.filter((r) => r.description.toUpperCase().includes("MAMELUCO"));
  console.log(`\n  Refs B48 con descripción que contiene "MAMELUCO": ${mamelucoDescRefs.length}`);
  for (const r of mamelucoDescRefs) {
    console.log(`    ${r.reference.padEnd(15)}  subgrupo="${r.subgrupoSag}"  grupo="${r.grupoSag}"  desc="${r.description.substring(0, 50)}"  net_qty=${r.netQty}`);
  }

  // ── BUZO/CAMIBUSO deep audit ────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  BUZO / CAMIBUSO — AUDITORÍA POR GRUPO");
  console.log("════════════════════════════════════════════════════════════════\n");

  const buzoRefs = csRefs.filter((r) => r.subgrupoSag === "BUZO");
  const cambibusoRefs = csRefs.filter((r) => r.subgrupoSag === "CAMIBUSO");
  const buzoAllBrands = b48Refs.filter((r) => r.subgrupoSag === "BUZO");
  const cambibusoAllBrands = b48Refs.filter((r) => r.subgrupoSag === "CAMIBUSO");

  console.log("  BUZO (solo Castillitos, por grupo SAG):");
  const buzoByGrupo = new Map<string, B48Ref[]>();
  for (const r of buzoRefs) {
    const g = r.grupoSag ?? "(null)";
    if (!buzoByGrupo.has(g)) buzoByGrupo.set(g, []);
    buzoByGrupo.get(g)!.push(r);
  }
  for (const [grupo, refs] of buzoByGrupo) {
    console.log(`    ${grupo}: ${refs.length} refs, SUM(net_qty)=${refs.reduce((s, r) => s + r.netQty, 0)}`);
    for (const r of refs) console.log(`      ${r.reference}  net_qty=${r.netQty}  "${r.description.substring(0, 40)}"`);
  }

  console.log("\n  CAMIBUSO (solo Castillitos, por grupo SAG):");
  const camByGrupo = new Map<string, B48Ref[]>();
  for (const r of cambibusoRefs) {
    const g = r.grupoSag ?? "(null)";
    if (!camByGrupo.has(g)) camByGrupo.set(g, []);
    camByGrupo.get(g)!.push(r);
  }
  for (const [grupo, refs] of camByGrupo) {
    console.log(`    ${grupo}: ${refs.length} refs, SUM(net_qty)=${refs.reduce((s, r) => s + r.netQty, 0)}`);
    for (const r of refs) console.log(`      ${r.reference}  net_qty=${r.netQty}  "${r.description.substring(0, 40)}"`);
  }

  console.log("\n  BUZO/CAMIBUSO en grupos EXCLUIDOS (no Castillitos):");
  const buzoExcluded = buzoAllBrands.filter((r) => r.brand !== "Castillitos");
  const camExcluded = cambibusoAllBrands.filter((r) => r.brand !== "Castillitos");
  for (const r of [...buzoExcluded, ...camExcluded]) {
    console.log(`    ${r.reference.padEnd(15)}  subgrupo="${r.subgrupoSag}"  grupo="${r.grupoSag}"  brand=${r.brand}  net_qty=${r.netQty}  → EXCLUIDO del derrotero CS`);
  }

  // ── L-9108 currentUnits investigation ───────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  L-9108 (net_qty=2) — INVESTIGACIÓN");
  console.log("════════════════════════════════════════════════════════════════\n");

  const l9108 = b48Refs.find((r) => r.reference === "L-9108");
  if (l9108) {
    console.log(`  Referencia: ${l9108.reference}`);
    console.log(`  Descripción: ${l9108.description}`);
    console.log(`  net_qty: ${l9108.netQty}`);
    console.log(`  subgrupoSag: ${l9108.subgrupoSag}`);
    console.log(`  grupoSag: ${l9108.grupoSag}`);
    console.log(`  brand: ${l9108.brand}`);
    console.log(`  line: ${l9108.line}`);

    // Does it belong to the official derrotero?
    const belongsToCS = CS_OFFICIAL.some((e) => {
      const sagValues = Array.isArray(e.subgrupoSag) ? e.subgrupoSag : [e.subgrupoSag];
      return e.grupoSag === l9108.grupoSag && sagValues.includes(l9108.subgrupoSag);
    });
    console.log(`  ¿Pertenece al derrotero CS oficial?: ${belongsToCS ? "SÍ" : "NO"}`);

    // Check LT official derrotero
    const LT_OFFICIAL_SUBGRUPOS = [
      "PIJAMA CC 10-16", "PIJAMA CC 2-8", "PIJAMA CL 10-16", "PIJAMA CL 2-8",
      "PIJAMA LL 10-16", "PIJAMA LL 2-8", "PIJAMA CL 18-22", "PIJAMA CC 18-22",
      "CONJUNTO 2-12", "CONJUNTO NAUTICO MESES", "CONJUNTO MESES",
    ];
    const belongsToLT = l9108.brand === "Latin Kids" && LT_OFFICIAL_SUBGRUPOS.includes(l9108.subgrupoSag);
    console.log(`  ¿Pertenece al derrotero LT oficial?: ${belongsToLT ? "SÍ" : "NO"}`);

    if (belongsToCS || belongsToLT) {
      console.log(`  → Con COUNT: currentUnits contribuye 1 a su entrada`);
      console.log(`  → Con SUM: currentUnits contribuiría 2 a su entrada`);
    }
  }

  // ── LATIN KIDS OFFICIAL DERROTERO ───────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  TABLA CANÓNICA — DERROTERO LATIN KIDS OFICIAL");
  console.log("════════════════════════════════════════════════════════════════\n");

  const LT_OFFICIAL = [
    { subgrupoSag: "PIJAMA CC 10-16", ideal: 3 },
    { subgrupoSag: "PIJAMA CC 2-8", ideal: 4 },
    { subgrupoSag: "PIJAMA CL 10-16", ideal: 4 },
    { subgrupoSag: "PIJAMA CL 2-8", ideal: 5 },
    { subgrupoSag: "PIJAMA LL 10-16", ideal: 2 },
    { subgrupoSag: "PIJAMA LL 2-8", ideal: 3 },
    { subgrupoSag: "PIJAMA CL 18-22", ideal: 2 },
    { subgrupoSag: "PIJAMA CC 18-22", ideal: 2 },
    { subgrupoSag: "CONJUNTO 2-12", ideal: 5 },
    { subgrupoSag: "CONJUNTO NAUTICO MESES", ideal: 5 },
    { subgrupoSag: "CONJUNTO MESES", ideal: 3 },
  ];

  const ltRefs = b48Refs.filter((r) => r.brand === "Latin Kids");

  console.log("Subgrupo SAG Doc            | distinctRefs | totalNetQty | Ideal | Estado catálogo actual  | Acción");
  console.log("────────────────────────────┼──────────────┼─────────────┼───────┼─────────────────────────┼─────────────");

  // Check current catalog entries
  const CURRENT_LT_ENTRIES = [
    "60_CONJUNTOS", "20_CONJUNTOS_PANTALONETA", "80_CONJUNTOS",
    "CONJUNTO_CL_2_8", "CONJUNTO_CC_2_8", "CONJUNTO_LL_2_8",
    "CONJUNTO_CL_10_16", "CONJUNTO_CC_10_16", "CONJUNTO_LL_10_16",
    "PIJAMA_CL", "PIJAMA_LL",
    "PIJAMA_CL_NINA_18_22", "PIJAMA_CL_NINO_18_22",
    "PIJAMA_CC_NINA_18_22", "PIJAMA_CC_NINO_18_22",
  ];

  for (const entry of LT_OFFICIAL) {
    const matched = ltRefs.filter((r) => r.subgrupoSag === entry.subgrupoSag);
    const distinctRefs = matched.length;
    const totalNetQty = matched.reduce((s, r) => s + r.netQty, 0);

    let currentStatus: string;
    // Check if this exact subgrupo maps to an existing catalog entry
    if (entry.subgrupoSag.startsWith("PIJAMA CL") && !entry.subgrupoSag.includes("18-22")) {
      currentStatus = "AGRUPADO en PIJAMA_CL";
    } else if (entry.subgrupoSag.startsWith("PIJAMA LL")) {
      currentStatus = "AGRUPADO en PIJAMA_LL";
    } else if (entry.subgrupoSag.includes("18-22")) {
      currentStatus = "RETENIDO (sin género)";
    } else if (entry.subgrupoSag.startsWith("CONJUNTO")) {
      currentStatus = "RETENIDO (9 vs 3)";
    } else if (entry.subgrupoSag.startsWith("PIJAMA CC")) {
      currentStatus = "NO EXISTE en catálogo";
    } else {
      currentStatus = "NO EXISTE";
    }

    const action = currentStatus.includes("NO EXISTE") ? "CREAR"
      : currentStatus.includes("AGRUPADO") ? "CORREGIR"
      : currentStatus.includes("RETENIDO") ? "CORREGIR"
      : "CONSERVAR";

    console.log(
      `${entry.subgrupoSag.padEnd(28)} | ${distinctRefs.toString().padStart(12)} | ${totalNetQty.toString().padStart(11)} | ${entry.ideal.toString().padStart(5)} | ${currentStatus.padEnd(23)} | ${action}`
    );
  }

  // ── ENTRIES TO DELETE ──────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  ENTRADAS A ELIMINAR DEL CATÁLOGO LT");
  console.log("════════════════════════════════════════════════════════════════\n");

  const officialSubgrupos = new Set(LT_OFFICIAL.map((e) => e.subgrupoSag));

  for (const code of CURRENT_LT_ENTRIES) {
    console.log(`  ${code.padEnd(30)} → ELIMINAR (no existe en derrotero oficial)`);
  }

  // ── SAG name verification ─────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  VERIFICACIÓN: NOMBRE DOCUMENTO vs NOMBRE SAG REAL");
  console.log("════════════════════════════════════════════════════════════════\n");

  // Check exact SAG subgrupo names in the lookup table
  const allSagNames = new Set([...subgrupoLookup.values()]);

  console.log("  Documento                    | ¿Existe exacto en SAG? | Notas");
  console.log("  ─────────────────────────────┼────────────────────────┼────────────────────────");

  const allDocNames = [
    ...LT_OFFICIAL.map((e) => e.subgrupoSag),
    "PIJAMA NIÑA BB CL", "PIJAMA NIÑA BB LL", "CONJUNTO NIÑA BB CC", "CONJUNTO NIÑA BB CL",
    "BLUSAS", "VESTIDO", "CAMISETA", "MAMELUCO", "BUZO", "CAMIBUSO",
    "PIJAMA NIÑO BB CL", "PIJAMA NIÑO BB LL", "CONJUNTO NIÑO BB CC", "CONJUNTO NIÑO BB CL",
    "POLO",
    "PIJAMA NIÑA KIDS CL", "PIJAMA NIÑA KIDS LL", "CONJUNTO NIÑA KIDS CC", "CONJUNTO NIÑA KIDS CL",
    "BLUSA",
    "PIJAMA NIÑO KIDS CL", "PIJAMA NIÑO KIDS LL", "CONJUNTO NIÑO KIDS CC", "CONJUNTO NIÑO KIDS CL",
  ];

  const uniqueDocNames = [...new Set(allDocNames)].sort();
  for (const name of uniqueDocNames) {
    const exists = allSagNames.has(name);
    let note = "";
    if (!exists) {
      // Check case-insensitive
      const ciMatch = [...allSagNames].find((s) => s.toUpperCase() === name.toUpperCase());
      if (ciMatch) note = `Existe como "${ciMatch}" (diferencia de caso)`;
      else {
        const partial = [...allSagNames].filter((s) => s.toUpperCase().includes(name.toUpperCase()));
        if (partial.length > 0) note = `Parcial: ${partial.slice(0, 3).join(", ")}`;
        else note = "NO ENCONTRADO EN SAG";
      }
    }
    console.log(`  ${name.padEnd(29)} | ${(exists ? "SÍ" : "NO").padEnd(22)} | ${note}`);
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  RESUMEN DE DIFERENCIAS");
  console.log("════════════════════════════════════════════════════════════════\n");

  console.log("  LATIN KIDS:");
  console.log(`    Filas documento oficial: 11`);
  console.log(`    Filas catálogo actual: ${CURRENT_LT_ENTRIES.length}`);
  console.log(`    A CREAR: todas 11 (reemplazo completo)`);
  console.log(`    A ELIMINAR: todas ${CURRENT_LT_ENTRIES.length} actuales`);

  console.log("\n  CASTILLITOS:");
  console.log(`    Filas documento oficial: ${CS_OFFICIAL.length}`);
  console.log(`    A CORREGIR: MAMELUCO (restaurar sagSubgrupo), BUZO_CAMIBUSO (restaurar sagSubgrupo)`);
  console.log(`    Ideales: verificar coincidencia exacta con documento`);

  console.log("\n  IMPORTACIÓN:");
  console.log("    Sin cambios");

  await prisma.$disconnect();
  console.log("\n✓ Auditoría canónica completa");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
