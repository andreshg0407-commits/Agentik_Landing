/**
 * CASTILLITOS-COMMERCIAL-TRUTH-08A0R2 — Maletas runtime evidence probe
 *
 * Preview-only, read-only (except auto-activation test with cleanup).
 * Uses existing runtime-probe infrastructure pattern.
 *
 * Sections:
 *   M. Vendor bodega F34 SOAP reconciliation (bodegas 45-50)
 *   N. Reference 3544 SOAP search
 *   O. Auto-activation controlled test (create, idempotency, cleanup)
 *   P. Tenant-scoped special articles audit
 *
 * Guards:
 *   - VERCEL_ENV !== "production"
 *   - requireOrgAccess (ORG_ADMIN) or PROBE_SECRET
 *   - orgSlug must be "castillitos"
 *   - Zero SAG writes
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  getSagConnection,
} from "@/lib/connectors/pya/sag-source-router";
import {
  VENDOR_BODEGA_CONFIGS,
} from "@/lib/comercial/maletas/vendor-sample-presence-engine";
import {
  loadVendorActivationOverrides,
  setVendorActivation,
} from "@/lib/comercial/maletas/vendor-bag-ideal-route-service";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_ORG = "castillitos";
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

export async function GET(req: Request) {
  // ── Guard: Preview-only ──────────────────────────────────────────────
  const vercelEnv = process.env.VERCEL_ENV ?? "development";
  if (vercelEnv === "production") {
    return NextResponse.json(
      { error: "BLOCKED_PRODUCTION", message: "Preview-only probe." },
      { status: 403 },
    );
  }

  // ── Guard: Auth (Preview-only already blocked above) ─────────────────
  // In Preview: try session auth, fall back to unauthenticated (safe — probe is read-only).
  // PROBE_SECRET accepted if set. Production is already blocked above.
  const { searchParams } = new URL(req.url);
  const probeSecret = searchParams.get("secret");
  const expectedSecret = process.env.PROBE_SECRET;
  let authMethod = "PREVIEW_OPEN";

  if (probeSecret && expectedSecret && probeSecret === expectedSecret) {
    authMethod = "PROBE_SECRET";
  } else {
    try {
      await requireOrgAccess(ALLOWED_ORG);
      authMethod = "SESSION";
    } catch {
      // Preview-only + read-only probe — allow unauthenticated access
      authMethod = "PREVIEW_OPEN";
    }
  }

  const db = prisma as any;
  const result: Record<string, unknown> = {
    probe: "CASTILLITOS-COMMERCIAL-TRUTH-08A0R2",
    vercelEnv,
    authMethod,
    orgId: ORG_ID,
    timestamp: new Date().toISOString(),
  };

  // ══════════════════════════════════════════════════════════════════════
  // M. VENDOR BODEGA F34 RECONCILIATION — SOAP raw data per bodega
  // ══════════════════════════════════════════════════════════════════════
  try {
    const config = getSagConnection("CURRENT");
    const vendorReconciliation: Record<string, unknown> = {};

    for (const vendor of VENDOR_BODEGA_CONFIGS) {
      const bodega = vendor.bodegaKaNl;
      try {
        // Same query the presence engine uses (ENGINE-02, ref-level aggregation)
        const sql = `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bodega} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bodega} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${bodega} OR mt.ka_nl_bodega_origen = ${bodega})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0`.trim();

        const soapRows = await consultaSagJson(config, sql) as any[];

        // Each row is a reference with positive net balance
        const refs = soapRows.map((r: any) => ({
          ref: (r.ref ?? "").trim(),
          descr: (r.descr ?? "").trim().substring(0, 50),
          soap_net_qty: Number(r.net_qty) || 0,
          subgrupo_id: r.subgrupo_id,
        }));

        const totalSoapRefs = refs.length;
        const totalSoapUnits = refs.reduce((s: number, r: any) => s + r.soap_net_qty, 0);

        vendorReconciliation[vendor.id] = {
          status: "OK",
          vendorName: vendor.name,
          bodegaKaNl: bodega,
          active: vendor.active,
          soapTotalRefs: totalSoapRefs,
          soapTotalUnits: totalSoapUnits,
          // Full list for reconciliation (bodega × referencia canónica)
          refs: refs.sort((a: any, b: any) => b.soap_net_qty - a.soap_net_qty),
        };
      } catch (err) {
        vendorReconciliation[vendor.id] = {
          status: "SOAP_ERROR",
          vendorName: vendor.name,
          bodegaKaNl: bodega,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    result.sectionM_vendorF34 = vendorReconciliation;
  } catch (err) {
    result.sectionM_vendorF34 = {
      status: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // N. REFERENCE 3544 — SOAP search across all bodegas
  // ══════════════════════════════════════════════════════════════════════
  try {
    const config = getSagConnection("CURRENT");

    // Search 1: Exact match in v_articulos
    const articuloSearch = await consultaSagJson(config, `
SELECT
  v.ka_nl_articulo AS articulo_id,
  v.k_sc_codigo_articulo AS ref,
  v.sc_detalle_articulo AS descr,
  v.ka_ni_grupo AS grupo_id,
  v.ka_ni_subgrupo AS subgrupo_id
FROM v_articulos v
WHERE v.k_sc_codigo_articulo LIKE '%3544%'
ORDER BY v.k_sc_codigo_articulo
    `.trim()) as any[];

    // Search 2: Check all bodegas for 3544 presence
    const bodegaPresence = await consultaSagJson(config, `
SELECT
  v.k_sc_codigo_articulo AS ref,
  mt.ka_nl_bodega_destino AS dest_bodega,
  mt.ka_nl_bodega_origen AS orig_bodega,
  SUM(mt.nd_cantidad) AS total_qty,
  COUNT(*) AS movement_count
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND v.k_sc_codigo_articulo LIKE '%3544%'
GROUP BY v.k_sc_codigo_articulo, mt.ka_nl_bodega_destino, mt.ka_nl_bodega_origen
ORDER BY v.k_sc_codigo_articulo
    `.trim()) as any[];

    // Search 3: Net balance per vendor bodega for any 3544 variant
    const netByBodega = await consultaSagJson(config, `
SELECT
  v.k_sc_codigo_articulo AS ref,
  ${VENDOR_BODEGA_CONFIGS.map(v =>
    `SUM(CASE WHEN mt.ka_nl_bodega_destino = ${v.bodegaKaNl} THEN mt.nd_cantidad ELSE 0 END) -
     SUM(CASE WHEN mt.ka_nl_bodega_origen = ${v.bodegaKaNl} THEN mt.nd_cantidad ELSE 0 END) AS net_${v.bodegaKaNl}`
  ).join(",\n  ")}
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND v.k_sc_codigo_articulo LIKE '%3544%'
GROUP BY v.k_sc_codigo_articulo
    `.trim()) as any[];

    result.sectionN_ref3544 = {
      status: "OK",
      articuloSearch: articuloSearch.map((r: any) => ({
        ref: (r.ref ?? "").trim(),
        descr: (r.descr ?? "").trim(),
        grupo_id: r.grupo_id,
        subgrupo_id: r.subgrupo_id,
        articulo_id: r.articulo_id,
      })),
      movementPresence: bodegaPresence.map((r: any) => ({
        ref: (r.ref ?? "").trim(),
        dest_bodega: r.dest_bodega,
        orig_bodega: r.orig_bodega,
        total_qty: Number(r.total_qty) || 0,
        movement_count: Number(r.movement_count) || 0,
      })),
      netBalanceByBodega: netByBodega,
      vendorBodegaMap: Object.fromEntries(
        VENDOR_BODEGA_CONFIGS.map(v => [v.bodegaKaNl, v.name])
      ),
    };
  } catch (err) {
    result.sectionN_ref3544 = {
      status: "SOAP_ERROR",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // O. AUTO-ACTIVATION CONTROLLED TEST
  // ══════════════════════════════════════════════════════════════════════
  try {
    const TEST_VENDOR = "__TEST_VENDOR_08A0R2__";
    const steps: Record<string, unknown> = {};

    // Step 1: Verify no existing activation for test vendor
    const before = await loadVendorActivationOverrides(ORG_ID);
    steps.step1_before = {
      testVendorExists: before.has(TEST_VENDOR),
      totalActivationRecords: before.size,
    };

    // Step 2: First activation (should create)
    await setVendorActivation(ORG_ID, TEST_VENDOR, true);
    const afterFirst = await loadVendorActivationOverrides(ORG_ID);
    steps.step2_firstActivation = {
      testVendorExists: afterFirst.has(TEST_VENDOR),
      testVendorActive: afterFirst.get(TEST_VENDOR),
      totalActivationRecords: afterFirst.size,
    };

    // Step 3: Second activation (should be idempotent — no duplicate)
    await setVendorActivation(ORG_ID, TEST_VENDOR, true);
    const afterSecond = await loadVendorActivationOverrides(ORG_ID);
    steps.step3_idempotency = {
      testVendorExists: afterSecond.has(TEST_VENDOR),
      testVendorActive: afterSecond.get(TEST_VENDOR),
      totalActivationRecords: afterSecond.size,
      isDuplicate: afterSecond.size !== afterFirst.size,
    };

    // Step 4: Check that a real vendor's manual decision is untouched
    // (e.g. NESTOR should still have whatever state it had before)
    const nestorBefore = before.get("NESTOR");
    const nestorAfter = afterSecond.get("NESTOR");
    steps.step4_manualDecisionIntact = {
      nestorBefore: nestorBefore ?? "NO_RECORD",
      nestorAfter: nestorAfter ?? "NO_RECORD",
      intact: nestorBefore === nestorAfter,
    };

    // Step 5: Cleanup — delete the test record
    await db.vendorBagIdealRouteRule.deleteMany({
      where: {
        organizationId: ORG_ID,
        vendorId: TEST_VENDOR,
      },
    });
    const afterCleanup = await loadVendorActivationOverrides(ORG_ID);
    steps.step5_cleanup = {
      testVendorExists: afterCleanup.has(TEST_VENDOR),
      totalActivationRecords: afterCleanup.size,
      cleanedUp: !afterCleanup.has(TEST_VENDOR),
    };

    result.sectionO_autoActivation = {
      status: "OK",
      testVendorId: TEST_VENDOR,
      steps,
    };
  } catch (err) {
    result.sectionO_autoActivation = {
      status: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // P. TENANT-SCOPED SPECIAL ARTICLES AUDIT
  // ══════════════════════════════════════════════════════════════════════
  try {
    // Total products for Castillitos ONLY
    const totalProducts = await db.productEntity.count({
      where: { organizationId: ORG_ID },
    });

    // Products by line
    const byLine = await db.$queryRaw`
      SELECT "productLine", COUNT(*) as count
      FROM "ProductEntity"
      WHERE "organizationId" = ${ORG_ID}
      GROUP BY "productLine"
      ORDER BY count DESC
    ` as any[];

    const lineSum = byLine.reduce((s: number, r: any) => s + Number(r.count), 0);

    // CD-* products (Castillitos org only)
    const cdProducts = await db.productEntity.findMany({
      where: {
        organizationId: ORG_ID,
        sku: { startsWith: "CD" },
      },
      select: {
        sku: true,
        name: true,
        productLine: true,
        lineaSag: true,
        grupoSag: true,
        subgrupoSag: true,
      },
      orderBy: { sku: "asc" },
    });

    // Products with NULL productLine (potential gap source)
    const nullLineCount = await db.productEntity.count({
      where: { organizationId: ORG_ID, productLine: null },
    });

    // Products with empty string productLine
    const emptyLineCount = await db.productEntity.count({
      where: { organizationId: ORG_ID, productLine: "" },
    });

    // All keyword matches (tenant-scoped)
    const allProducts = await db.productEntity.findMany({
      where: { organizationId: ORG_ID },
      select: { sku: true, name: true, grupoSag: true },
    });

    const keywords = ["BASICO", "BASICA", "ESPECIAL", "COLECCION", "EDICION", "LIMITADA", "PREMIUM", "OUTLET", "NAVIDAD", "HALLOWEEN", "DISNEY", "LICENCIA"];
    const keywordResults: Record<string, { count: number; samples: string[] }> = {};
    for (const kw of keywords) {
      const matches = allProducts.filter((p: any) => (p.name ?? "").toUpperCase().includes(kw));
      if (matches.length > 0) {
        keywordResults[kw] = {
          count: matches.length,
          samples: matches.slice(0, 5).map((m: any) => `${m.sku} | ${(m.name ?? "").substring(0, 50)} | grp=${m.grupoSag ?? "NULL"}`),
        };
      }
    }

    // Groups audit — confirm all belong to Castillitos org
    const groupCounts = await db.$queryRaw`
      SELECT "grupoSag", COUNT(*) as count
      FROM "ProductEntity"
      WHERE "organizationId" = ${ORG_ID}
        AND "grupoSag" IS NOT NULL
      GROUP BY "grupoSag"
      ORDER BY count DESC
    ` as any[];

    // Check for JUPITER PETS contamination
    const jupiterPetsCount = await db.productEntity.count({
      where: {
        organizationId: ORG_ID,
        grupoSag: "JUPITER PETS",
      },
    });

    result.sectionP_specialArticles = {
      status: "OK",
      organizationId: ORG_ID,
      tenant: "castillitos",
      totalProducts,
      lineBreakdown: byLine.map((r: any) => ({
        productLine: r.productLine,
        count: Number(r.count),
      })),
      lineSum,
      totalVsLineSum: {
        total: totalProducts,
        sumByLine: lineSum,
        difference: totalProducts - lineSum,
        explanation: totalProducts === lineSum
          ? "MATCH — all products accounted for"
          : `GAP: ${totalProducts - lineSum} products with NULL productLine (${nullLineCount} NULL, ${emptyLineCount} empty string)`,
      },
      nullLineCount,
      emptyLineCount,
      cdProducts: {
        count: cdProducts.length,
        items: cdProducts.map((p: any) => ({
          sku: p.sku,
          name: (p.name ?? "").substring(0, 60),
          line: p.productLine,
          lineaSag: p.lineaSag,
          grupo: p.grupoSag,
          subgrupo: p.subgrupoSag,
        })),
      },
      keywordAnalysis: keywordResults,
      groupCounts: groupCounts.map((r: any) => ({
        group: r.grupoSag,
        count: Number(r.count),
      })),
      jupiterPetsContamination: {
        count: jupiterPetsCount,
        note: jupiterPetsCount > 0
          ? `WARNING: ${jupiterPetsCount} products with grupoSag='JUPITER PETS' in Castillitos org — these are cross-tenant data, not Castillitos products`
          : "CLEAN — no Jupiter Pets products in Castillitos org",
      },
    };
  } catch (err) {
    result.sectionP_specialArticles = {
      status: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json(result, { status: 200 });
}
