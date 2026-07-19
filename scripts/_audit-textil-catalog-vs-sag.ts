/**
 * _audit-textil-catalog-vs-sag.ts
 *
 * PHASES 1-4: Full audit of textil derrotero catalog vs SAG real data.
 *
 * Usage: npx tsx --env-file=.env scripts/_audit-textil-catalog-vs-sag.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const NESTOR_BODEGA_KA_NL = 48;
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";
  if (!token) { console.error("FATAL: PYA_SOAP_TOKEN required"); process.exit(1); }
  const config = { token, endpointUrl, database };
  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.error("Org not found"); process.exit(1); }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — CATALOG AUDIT
  // ══════════════════════════════════════════════════════════════════════════

  const { buildCastillitosTextilCatalog, buildLatinKidsTextilCatalog, buildImportAccesoriosCatalog } = await import(
    "../lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog"
  );

  const csCatalog = buildCastillitosTextilCatalog();
  const ltCatalog = buildLatinKidsTextilCatalog();
  const importCatalog = buildImportAccesoriosCatalog();

  console.log(`\n${"═".repeat(100)}`);
  console.log(B("  PHASE 1 — CATALOG AUDIT"));
  console.log(`${"═".repeat(100)}`);

  console.log(`\nFile: lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog.ts`);
  console.log(`Types: lib/comercial/maletas/assortment-catalog/mallet-assortment-types.ts`);
  console.log(`Matcher: lib/comercial/maletas/maletas-functional-evaluation.ts (matchRefs line 244-264)`);

  console.log(`\nField purposes:`);
  console.log(`  groupCode      → Internal identifier for the group (e.g. CS_NINA_BEBE). Used to partition refs.`);
  console.log(`  groupName      → Display label (e.g. "CS Niña Bebé"). UI only.`);
  console.log(`  subgroupCode   → Internal identifier AND integration key. matchRefs() uses this for matching.`);
  console.log(`  subgroupName   → Display label (e.g. "Pijama Niña BB CL"). UI only.`);
  console.log(`  targetUnits    → Ideal quantity of refs per entry.`);
  console.log(`  brand          → Catalog-level: "Castillitos" or "Latin Kids". Filters refs before matching.`);

  console.log(`\n${B("PROBLEM")}: subgroupCode is used BOTH as internal identifier AND as SAG matching key.`);
  console.log(`  matchRefs() at line 262: r.subgrupoSag === entry.subgroupCode`);
  console.log(`  No alias, no SAG key, no normalization map exists.`);

  // CS catalog detail
  console.log(`\n${"─".repeat(100)}`);
  console.log(B("  CASTILLITOS TEXTIL CATALOG"));
  console.log(`${"─".repeat(100)}\n`);
  console.log(
    `${"groupCode".padEnd(18)} ${"subgroupCode".padEnd(28)} ${"subgroupName".padEnd(28)} ${"target".padEnd(7)} ${"SAG alias?".padEnd(12)} brand`
  );
  console.log(`${"─".repeat(105)}`);
  for (const g of csCatalog.groups) {
    for (const e of g.entries) {
      console.log(
        `${g.groupCode.padEnd(18)} ${(e.subgroupCode ?? "—").padEnd(28)} ${e.subgroupName.padEnd(28)} ${String(e.targetUnits).padEnd(7)} ${"(none)".padEnd(12)} Castillitos`
      );
    }
  }

  // LT catalog detail
  console.log(`\n${"─".repeat(100)}`);
  console.log(B("  LATIN KIDS TEXTIL CATALOG"));
  console.log(`${"─".repeat(100)}\n`);
  console.log(
    `${"groupCode".padEnd(18)} ${"subgroupCode".padEnd(28)} ${"subgroupName".padEnd(28)} ${"target".padEnd(7)} ${"SAG alias?".padEnd(12)} brand`
  );
  console.log(`${"─".repeat(105)}`);
  for (const g of ltCatalog.groups) {
    for (const e of g.entries) {
      console.log(
        `${g.groupCode.padEnd(18)} ${(e.subgroupCode ?? "—").padEnd(28)} ${e.subgroupName.padEnd(28)} ${String(e.targetUnits).padEnd(7)} ${"(none)".padEnd(12)} Latin Kids`
      );
    }
  }

  // Import catalog detail
  console.log(`\n${"─".repeat(100)}`);
  console.log(B("  IMPORTACION CATALOG"));
  console.log(`${"─".repeat(100)}\n`);
  for (const g of importCatalog.groups) {
    for (const e of g.entries) {
      console.log(
        `${g.groupCode.padEnd(18)} ${(e.subgroupCode ?? "—").padEnd(28)} ${e.subgroupName.padEnd(28)} ${String(e.targetUnits).padEnd(7)} ${"(handlingUnit)".padEnd(12)} Importacion`
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — REAL B48 UNIVERSE
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${"═".repeat(100)}`);
  console.log(B("  PHASE 2 — REAL B48 UNIVERSE (net_qty > 0)"));
  console.log(`${"═".repeat(100)}`);

  // Fetch B48 presence
  const balanceQuery = `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${NESTOR_BODEGA_KA_NL} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${NESTOR_BODEGA_KA_NL} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${NESTOR_BODEGA_KA_NL} OR mt.ka_nl_bodega_origen = ${NESTOR_BODEGA_KA_NL})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0`.trim();

  const presenceRows = await consultaSagJson(config as any, balanceQuery);

  // v_articulos for resolved names
  const vArticulos = await consultaSagJson(config as any, "SELECT * FROM v_articulos");
  const vMap = new Map<string, { grupo: string; subgrupo: string; grupoId: number | null; subgrupoId: number | null }>();
  for (const r of vArticulos) {
    const code = String((r as any).k_sc_codigo_articulo ?? "").trim();
    if (!code) continue;
    vMap.set(code, {
      grupo: String((r as any).sc_detalle_grupo ?? "").trim(),
      subgrupo: String((r as any).sc_detalle_subgrupo ?? "").trim(),
      grupoId: (r as any).ka_ni_grupo != null ? Number((r as any).ka_ni_grupo) : null,
      subgrupoId: (r as any).ka_ni_subgrupo != null ? Number((r as any).ka_ni_subgrupo) : null,
    });
  }

  // ProductEntity for productLine/brand
  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: org.id },
    select: { sku: true, productLine: true, handlingUnit: true },
  });
  const productMap = new Map<string, { productLine: string | null; handlingUnit: string | null }>();
  for (const p of products) {
    if (p.sku) productMap.set(p.sku, { productLine: p.productLine, handlingUnit: p.handlingUnit });
  }

  const BRAND_FROM_LINE: Record<string, string> = { "1": "Latin Kids", "2": "Castillitos", "5": "Importación" };

  interface B48Ref {
    ref: string;
    descr: string;
    qty: number;
    brand: string;
    productLine: string;
    grupoId: number | null;
    grupoSag: string;
    subgrupoId: number | null;
    subgrupoSag: string;
    handlingUnit: string | null;
  }

  const csRefs: B48Ref[] = [];
  const ltRefs: B48Ref[] = [];
  const importRefs: B48Ref[] = [];

  for (const row of presenceRows) {
    const ref = String(row.ref ?? "").trim();
    if (!ref) continue;
    const qty = Number(row.net_qty) || 0;
    const product = productMap.get(ref);
    if (!product) continue;
    const brand = BRAND_FROM_LINE[product.productLine ?? ""] ?? "OTRO";
    const v = vMap.get(ref);

    const b48: B48Ref = {
      ref,
      descr: String(row.descr ?? "").trim(),
      qty,
      brand,
      productLine: product.productLine ?? "?",
      grupoId: v?.grupoId ?? null,
      grupoSag: v?.grupo ?? "—",
      subgrupoId: v?.subgrupoId ?? null,
      subgrupoSag: v?.subgrupo ?? "—",
      handlingUnit: product.handlingUnit,
    };

    if (brand === "Castillitos") csRefs.push(b48);
    else if (brand === "Latin Kids") ltRefs.push(b48);
    else if (brand === "Importación") importRefs.push(b48);
  }

  // ── LT aggregation: subgrupo ──
  console.log(`\n${"─".repeat(100)}`);
  console.log(B("  LATIN KIDS — B48 by subgrupoSag"));
  console.log(`${"─".repeat(100)}\n`);

  const ltAgg = new Map<string, { subgrupoId: number | null; count: number; totalQty: number }>();
  for (const r of ltRefs) {
    const key = r.subgrupoSag;
    const existing = ltAgg.get(key);
    if (existing) {
      existing.count++;
      existing.totalQty += r.qty;
    } else {
      ltAgg.set(key, { subgrupoId: r.subgrupoId, count: 1, totalQty: r.qty });
    }
  }
  console.log(`${"subgrupoId".padEnd(12)} ${"subgrupoSag".padEnd(30)} ${"refs".padEnd(6)} totalQty`);
  console.log(`${"─".repeat(60)}`);
  for (const [sg, agg] of [...ltAgg.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${String(agg.subgrupoId ?? "—").padEnd(12)} ${sg.padEnd(30)} ${String(agg.count).padEnd(6)} ${agg.totalQty}`);
  }
  console.log(`${"─".repeat(60)}`);
  console.log(`TOTAL: ${ltRefs.length} refs`);

  // ── CS aggregation: grupo + subgrupo ──
  console.log(`\n${"─".repeat(100)}`);
  console.log(B("  CASTILLITOS — B48 by grupoSag + subgrupoSag"));
  console.log(`${"─".repeat(100)}\n`);

  const csAgg = new Map<string, { grupoId: number | null; grupoSag: string; subgrupoId: number | null; subgrupoSag: string; count: number; totalQty: number }>();
  for (const r of csRefs) {
    const key = `${r.grupoSag}|||${r.subgrupoSag}`;
    const existing = csAgg.get(key);
    if (existing) {
      existing.count++;
      existing.totalQty += r.qty;
    } else {
      csAgg.set(key, { grupoId: r.grupoId, grupoSag: r.grupoSag, subgrupoId: r.subgrupoId, subgrupoSag: r.subgrupoSag, count: 1, totalQty: r.qty });
    }
  }
  console.log(`${"grupoId".padEnd(9)} ${"grupoSag".padEnd(20)} ${"subgrupoId".padEnd(12)} ${"subgrupoSag".padEnd(28)} ${"refs".padEnd(6)} totalQty`);
  console.log(`${"─".repeat(90)}`);
  for (const [_, agg] of [...csAgg.entries()].sort((a, b) => {
    const gc = a[1].grupoSag.localeCompare(b[1].grupoSag);
    return gc !== 0 ? gc : a[1].subgrupoSag.localeCompare(b[1].subgrupoSag);
  })) {
    console.log(
      `${String(agg.grupoId ?? "—").padEnd(9)} ${agg.grupoSag.padEnd(20)} ${String(agg.subgrupoId ?? "—").padEnd(12)} ${agg.subgrupoSag.padEnd(28)} ${String(agg.count).padEnd(6)} ${agg.totalQty}`
    );
  }
  console.log(`${"─".repeat(90)}`);
  console.log(`TOTAL: ${csRefs.length} refs`);

  // ── IMPORT baseline ──
  console.log(`\n${"─".repeat(100)}`);
  console.log(B("  IMPORTACION — B48 baseline (regression guard)"));
  console.log(`${"─".repeat(100)}\n`);
  const CANONICAL = new Set(["PEQUENO", "MEDIANO", "GRANDE"]);
  const importAgg = new Map<string, number>();
  for (const r of importRefs) {
    const hu = r.handlingUnit && CANONICAL.has(r.handlingUnit) ? r.handlingUnit : "(null)";
    importAgg.set(hu, (importAgg.get(hu) ?? 0) + 1);
  }
  for (const [hu, count] of [...importAgg.entries()].sort()) {
    console.log(`  ${hu.padEnd(12)} → ${count} refs`);
  }
  console.log(`  TOTAL: ${importRefs.length} refs`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — CATALOG vs SAG MATRIX
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${"═".repeat(100)}`);
  console.log(B("  PHASE 3 — CATALOG vs SAG MATRIX"));
  console.log(`${"═".repeat(100)}`);

  // ── CS: must match grupo + subgrupo ──
  console.log(`\n${"─".repeat(130)}`);
  console.log(B("  CASTILLITOS — catalog entry vs SAG (key = grupoSag + subgrupoSag)"));
  console.log(`${"─".repeat(130)}\n`);

  // Map catalog groupCode → expected SAG grupo
  // The catalog uses CS_NINA_BEBE, CS_NINO_BEBE, CS_NINA_KIDS, CS_NINO_KIDS
  // SAG uses: CS NIÑA BEBE (145), CS NIÑO BEBE (144), CS NIÑA KIDS (143), CS NIÑO KIDS (142)
  // Plus BASICAS BEBE (147) which is NOT in the catalog

  // Collect unique SAG grupos for CS
  const csGrupos = new Set(csRefs.map((r) => r.grupoSag));
  console.log(`  SAG grupos observed for Castillitos: ${[...csGrupos].sort().join(", ")}`);
  console.log(`  Catalog groupCodes: ${csCatalog.groups.map((g: any) => g.groupCode).join(", ")}`);
  console.log();

  console.log(
    `${"CATALOG_GROUP".padEnd(18)} ${"CATALOG_SUBG".padEnd(22)} ${"IDEAL".padEnd(6)} ` +
    `${"SAG_GRUPOS_EXPECTED".padEnd(22)} ${"SAG_SUBG_MATCH".padEnd(28)} ${"B48_REFS".padEnd(8)} ` +
    `TYPE`
  );
  console.log(`${"─".repeat(130)}`);

  for (const g of csCatalog.groups) {
    for (const e of g.entries) {
      if (!e.active) continue;
      const catalogSubg = e.subgroupCode ?? "—";

      // Find real SAG subgrupos that could match this catalog entry
      // First: exact match on subgrupoSag
      const exactMatches = csRefs.filter((r) => r.subgrupoSag === catalogSubg);
      // Also: check if SAG has a similar subgrupo (space vs underscore)
      const normalizedCatalog = catalogSubg.replace(/_/g, " ");
      const normalizedMatches = csRefs.filter((r) => r.subgrupoSag === normalizedCatalog);
      // And: check within the right grupo
      const grupoHint = g.groupCode
        .replace("CS_NINA_BEBE", "CS NIÑA BEBE")
        .replace("CS_NINO_BEBE", "CS NIÑO BEBE")
        .replace("CS_NINA_KIDS", "CS NIÑA KIDS")
        .replace("CS_NINO_KIDS", "CS NIÑO KIDS");
      const grupoFilteredNorm = normalizedMatches.filter((r) => r.grupoSag === grupoHint);

      // Find all unique subgrupoSag values from B48 refs in the expected grupo
      const refsInGrupo = csRefs.filter((r) => r.grupoSag === grupoHint);
      const subgsInGrupo = [...new Set(refsInGrupo.map((r) => r.subgrupoSag))].sort();

      let matchType: string;
      let matchedSubg: string;
      let matchedCount: number;

      if (exactMatches.length > 0) {
        matchType = "EXACTA";
        matchedSubg = catalogSubg;
        matchedCount = exactMatches.filter((r) => r.grupoSag === grupoHint).length;
      } else if (grupoFilteredNorm.length > 0) {
        matchType = "NORMALIZATION (space vs _)";
        matchedSubg = normalizedCatalog;
        matchedCount = grupoFilteredNorm.length;
      } else if (normalizedMatches.length > 0) {
        matchType = "NORMALIZATION (wrong grupo)";
        matchedSubg = normalizedCatalog;
        matchedCount = normalizedMatches.length;
      } else {
        // Check for partial matches
        const partial = refsInGrupo.filter((r) =>
          r.subgrupoSag.includes(normalizedCatalog) || normalizedCatalog.includes(r.subgrupoSag)
        );
        if (partial.length > 0) {
          matchType = "AMBIGUA";
          matchedSubg = [...new Set(partial.map((r) => r.subgrupoSag))].join(" | ");
          matchedCount = partial.length;
        } else if (refsInGrupo.length === 0) {
          matchType = "SIN DATOS EN B48";
          matchedSubg = "—";
          matchedCount = 0;
        } else {
          matchType = "SIN ENTRADA EN CATALOGO";
          matchedSubg = "—";
          matchedCount = 0;
        }
      }

      console.log(
        `${g.groupCode.padEnd(18)} ${catalogSubg.padEnd(22)} ${String(e.targetUnits).padEnd(6)} ` +
        `${grupoHint.padEnd(22)} ${matchedSubg.padEnd(28)} ${String(matchedCount).padEnd(8)} ` +
        `${matchType}`
      );
    }

    // Show SAG subgrupos in this grupo that have NO catalog entry
    const refsInGrupo = csRefs.filter((r) => r.grupoSag === grupoHint(g.groupCode));
    const sagSubgsInGrupo = [...new Set(refsInGrupo.map((r) => r.subgrupoSag))].sort();
    const catalogSubgs = new Set(g.entries.filter((e: any) => e.active).map((e: any) => {
      return (e.subgroupCode ?? "").replace(/_/g, " ");
    }));
    for (const sg of sagSubgsInGrupo) {
      if (!catalogSubgs.has(sg)) {
        const count = refsInGrupo.filter((r) => r.subgrupoSag === sg).length;
        console.log(
          `${g.groupCode.padEnd(18)} ${"—".padEnd(22)} ${"—".padEnd(6)} ` +
          `${grupoHint(g.groupCode).padEnd(22)} ${sg.padEnd(28)} ${String(count).padEnd(8)} ` +
          `SUBGRUPO SAG SIN ENTRADA EN CATALOGO`
        );
      }
    }
  }

  // CS refs in grupos NOT in catalog
  const catalogGrupos = new Set(["CS NIÑA BEBE", "CS NIÑO BEBE", "CS NIÑA KIDS", "CS NIÑO KIDS"]);
  const orphanGrupos = [...csGrupos].filter((g) => !catalogGrupos.has(g));
  if (orphanGrupos.length > 0) {
    console.log();
    for (const og of orphanGrupos) {
      const refsInGrupo = csRefs.filter((r) => r.grupoSag === og);
      const subgs = [...new Set(refsInGrupo.map((r) => r.subgrupoSag))].sort();
      for (const sg of subgs) {
        const count = refsInGrupo.filter((r) => r.subgrupoSag === sg).length;
        console.log(
          `${"(ORPHAN)".padEnd(18)} ${"—".padEnd(22)} ${"—".padEnd(6)} ` +
          `${og.padEnd(22)} ${sg.padEnd(28)} ${String(count).padEnd(8)} ` +
          `GRUPO SAG SIN ENTRADA EN CATALOGO`
        );
      }
    }
  }

  // ── LT: match by subgrupo only ──
  console.log(`\n${"─".repeat(130)}`);
  console.log(B("  LATIN KIDS — catalog entry vs SAG (key = subgrupoSag)"));
  console.log(`${"─".repeat(130)}\n`);

  console.log(
    `${"CATALOG_SUBG".padEnd(28)} ${"IDEAL".padEnd(6)} ` +
    `${"SAG_SUBG_MATCH".padEnd(28)} ${"B48_REFS".padEnd(8)} ` +
    `TYPE`
  );
  console.log(`${"─".repeat(100)}`);

  for (const g of ltCatalog.groups) {
    for (const e of g.entries) {
      if (!e.active) continue;
      const catalogSubg = e.subgroupCode ?? "—";
      const normalizedCatalog = catalogSubg.replace(/_/g, " ");

      const exactMatches = ltRefs.filter((r) => r.subgrupoSag === catalogSubg);
      const normalizedMatches = ltRefs.filter((r) => r.subgrupoSag === normalizedCatalog);

      let matchType: string;
      let matchedSubg: string;
      let matchedCount: number;

      if (exactMatches.length > 0) {
        matchType = "EXACTA";
        matchedSubg = catalogSubg;
        matchedCount = exactMatches.length;
      } else if (normalizedMatches.length > 0) {
        matchType = "NORMALIZATION (space vs _)";
        matchedSubg = normalizedCatalog;
        matchedCount = normalizedMatches.length;
      } else {
        const partial = ltRefs.filter((r) =>
          r.subgrupoSag.includes(normalizedCatalog) || normalizedCatalog.includes(r.subgrupoSag)
        );
        if (partial.length > 0) {
          matchType = "AMBIGUA";
          matchedSubg = [...new Set(partial.map((r) => r.subgrupoSag))].join(" | ");
          matchedCount = partial.length;
        } else {
          matchType = "SIN DATOS EN B48";
          matchedSubg = "—";
          matchedCount = 0;
        }
      }

      console.log(
        `${catalogSubg.padEnd(28)} ${String(e.targetUnits).padEnd(6)} ` +
        `${matchedSubg.slice(0, 27).padEnd(28)} ${String(matchedCount).padEnd(8)} ` +
        `${matchType}`
      );
    }
  }

  // LT SAG subgrupos not in catalog
  const ltCatalogSubgs = new Set(
    ltCatalog.groups.flatMap((g: any) =>
      g.entries.filter((e: any) => e.active).map((e: any) => (e.subgroupCode ?? "").replace(/_/g, " "))
    )
  );
  const ltSagSubgs = [...ltAgg.keys()].sort();
  const ltOrphans = ltSagSubgs.filter((sg) => !ltCatalogSubgs.has(sg));
  if (ltOrphans.length > 0) {
    console.log();
    for (const sg of ltOrphans) {
      const agg = ltAgg.get(sg)!;
      console.log(
        `${"—".padEnd(28)} ${"—".padEnd(6)} ` +
        `${sg.padEnd(28)} ${String(agg.count).padEnd(8)} ` +
        `SUBGRUPO SAG SIN ENTRADA EN CATALOGO`
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — MINIMUM CORRECTION PROPOSAL
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${"═".repeat(100)}`);
  console.log(B("  PHASE 4 — MINIMUM CORRECTION PROPOSAL"));
  console.log(`${"═".repeat(100)}`);

  console.log(`
  Files to modify:
    1. mallet-assortment-types.ts — Add sagKey fields to MalletAssortmentEntry and MalletAssortmentGroup
    2. castillitos-mallet-assortment-catalog.ts — Populate sagKey on every entry
    3. maletas-functional-evaluation.ts — matchRefs() uses sagKey instead of subgroupCode

  Structural change:
    MalletAssortmentEntry gets:   sagSubgrupo: string | null   (exact SAG sc_detalle_subgrupo)
    MalletAssortmentGroup gets:   sagGrupo: string | null      (exact SAG sc_detalle_grupo, CS only)

  Matching logic change:
    TEXTIL CS:   r.grupoSag matches group.sagGrupo AND r.subgrupoSag matches entry.sagSubgrupo
    TEXTIL LT:   r.subgrupoSag matches entry.sagSubgrupo (no grupo needed)
    IMPORT:      r.sizeClass matches entry.subgroupCode (unchanged)

  Catalog data changes (exact SAG values):
`);

  // CS proposals
  console.log(B("  CASTILLITOS — proposed sagGrupo + sagSubgrupo per entry:"));
  console.log();
  for (const g of csCatalog.groups) {
    const sagGrupo = grupoHint(g.groupCode);
    const refsInGrupo = csRefs.filter((r) => r.grupoSag === sagGrupo);
    console.log(`  group ${g.groupCode} → sagGrupo: "${sagGrupo}"`);
    for (const e of g.entries) {
      if (!e.active) continue;
      const normalized = (e.subgroupCode ?? "").replace(/_/g, " ");
      const matched = refsInGrupo.filter((r) => r.subgrupoSag === normalized);
      if (matched.length > 0) {
        console.log(`    ${(e.subgroupCode ?? "—").padEnd(22)} → sagSubgrupo: "${normalized}" (${matched.length} refs)`);
      } else {
        // Check broader match
        const broader = refsInGrupo.filter((r) =>
          r.subgrupoSag.includes(normalized) || normalized.includes(r.subgrupoSag)
        );
        if (broader.length > 0) {
          const candidates = [...new Set(broader.map((r) => r.subgrupoSag))];
          console.log(`    ${(e.subgroupCode ?? "—").padEnd(22)} → AMBIGUOUS: ${candidates.map((c) => `"${c}"`).join(", ")} (${broader.length} refs)`);
        } else {
          console.log(`    ${(e.subgroupCode ?? "—").padEnd(22)} → NO MATCH IN B48`);
        }
      }
    }
    console.log();
  }

  // LT proposals
  console.log(B("  LATIN KIDS — proposed sagSubgrupo per entry:"));
  console.log();
  for (const g of ltCatalog.groups) {
    for (const e of g.entries) {
      if (!e.active) continue;
      const normalized = (e.subgroupCode ?? "").replace(/_/g, " ");
      const matched = ltRefs.filter((r) => r.subgrupoSag === normalized);
      if (matched.length > 0) {
        console.log(`    ${(e.subgroupCode ?? "—").padEnd(28)} → sagSubgrupo: "${normalized}" (${matched.length} refs)`);
      } else {
        const broader = ltRefs.filter((r) =>
          r.subgrupoSag.includes(normalized) || normalized.includes(r.subgrupoSag)
        );
        if (broader.length > 0) {
          const candidates = [...new Set(broader.map((r) => r.subgrupoSag))];
          console.log(`    ${(e.subgroupCode ?? "—").padEnd(28)} → AMBIGUOUS: ${candidates.map((c) => `"${c}"`).join(", ")} (${broader.length} refs)`);
        } else {
          console.log(`    ${(e.subgroupCode ?? "—").padEnd(28)} → NO MATCH IN B48`);
        }
      }
    }
  }

  console.log(`\n${"═".repeat(100)}`);
  console.log(B("  AUDIT COMPLETE — Review matrix before implementing correction."));
  console.log(`${"═".repeat(100)}\n`);

  await prisma.$disconnect();
  pool.end();
}

function grupoHint(groupCode: string): string {
  return groupCode
    .replace("CS_NINA_BEBE", "CS NIÑA BEBE")
    .replace("CS_NINO_BEBE", "CS NIÑO BEBE")
    .replace("CS_NINA_KIDS", "CS NIÑA KIDS")
    .replace("CS_NINO_KIDS", "CS NIÑO KIDS");
}

main().catch((e) => { console.error(`FATAL: ${(e as Error).message}`); process.exit(1); });
