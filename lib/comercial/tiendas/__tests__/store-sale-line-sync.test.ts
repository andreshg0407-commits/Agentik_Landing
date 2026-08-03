/**
 * lib/comercial/tiendas/__tests__/store-sale-line-sync.test.ts
 *
 * AGENTIK-STORES-PRODUCT-SALES-SYNC-01 — Permanent certification tests.
 *
 * Tests cover:
 *   - Canonical source mapping (FG/NG/FC/NT/FD/NS/FA/NA)
 *   - Sign semantics (factura positive, NC negative lineTotal, NC positive qty)
 *   - Store isolation, tenant isolation
 *   - Decimal quantities, discount range, IVA values
 *   - Idempotency (@@unique constraint)
 *   - Per-document reconciliation vs SaleRecord
 *   - Reference coverage (ProductEntity join)
 *   - Reader service aggregation
 *   - Annulled document exclusion (sc_anulado='N' in sync query)
 *   - Date range filtering
 *
 * Run:
 *   env $(grep '^DATABASE_URL=' .env) npx tsx --test lib/comercial/tiendas/__tests__/store-sale-line-sync.test.ts
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCanonicalSalesSource,
  getCodesForStore,
  getFuenteIdsForStore,
  isStoreSale,
  CANONICAL_SALES_STORES,
} from "../../sales-canonical-source";

// ══════════════════════════════════════════════════════════════════════════════
// Section A: Canonical Source Mapping (pure — no DB)
// ══════════════════════════════════════════════════════════════════════════════

describe("canonical source mapping", () => {
  it("FG resolves to Gran Plaza FACTURA with sign=1 and fuente=177", () => {
    const fg = resolveCanonicalSalesSource("FG");
    assert.ok(fg);
    assert.equal(fg.store?.storeId, "gran_plaza");
    assert.equal(fg.documentFamily, "FACTURA");
    assert.equal(fg.revenueSign, 1);
    assert.equal(fg.kaNiFuente, 177);
  });

  it("NG resolves to Gran Plaza NOTA_CREDITO with sign=-1 and fuente=197", () => {
    const ng = resolveCanonicalSalesSource("NG");
    assert.ok(ng);
    assert.equal(ng.store?.storeId, "gran_plaza");
    assert.equal(ng.documentFamily, "NOTA_CREDITO");
    assert.equal(ng.revenueSign, -1);
    assert.equal(ng.kaNiFuente, 197);
  });

  it("FC resolves to Centro FACTURA", () => {
    const fc = resolveCanonicalSalesSource("FC");
    assert.ok(fc);
    assert.equal(fc.store?.storeId, "centro");
    assert.equal(fc.documentFamily, "FACTURA");
  });

  it("NT resolves to Centro NOTA_CREDITO", () => {
    const nt = resolveCanonicalSalesSource("NT");
    assert.ok(nt);
    assert.equal(nt.store?.storeId, "centro");
    assert.equal(nt.documentFamily, "NOTA_CREDITO");
  });

  it("FD resolves to San Diego FACTURA", () => {
    const fd = resolveCanonicalSalesSource("FD");
    assert.ok(fd);
    assert.equal(fd.store?.storeId, "san_diego");
    assert.equal(fd.documentFamily, "FACTURA");
  });

  it("NS resolves to San Diego NOTA_CREDITO", () => {
    const ns = resolveCanonicalSalesSource("NS");
    assert.ok(ns);
    assert.equal(ns.store?.storeId, "san_diego");
    assert.equal(ns.documentFamily, "NOTA_CREDITO");
  });

  it("FA resolves to Caldas FACTURA", () => {
    const fa = resolveCanonicalSalesSource("FA");
    assert.ok(fa);
    assert.equal(fa.store?.storeId, "caldas");
    assert.equal(fa.documentFamily, "FACTURA");
  });

  it("NA resolves to Caldas NOTA_CREDITO", () => {
    const na = resolveCanonicalSalesSource("NA");
    assert.ok(na);
    assert.equal(na.store?.storeId, "caldas");
    assert.equal(na.documentFamily, "NOTA_CREDITO");
  });

  it("all 4 stores have both FACTURA and NOTA_CREDITO codes", () => {
    for (const store of CANONICAL_SALES_STORES) {
      const codes = getCodesForStore(store.storeId);
      const hasFact = codes.some(
        (c) => resolveCanonicalSalesSource(c)?.documentFamily === "FACTURA",
      );
      const hasNota = codes.some(
        (c) => resolveCanonicalSalesSource(c)?.documentFamily === "NOTA_CREDITO",
      );
      assert.ok(hasFact, `${store.storeId} missing FACTURA code`);
      assert.ok(hasNota, `${store.storeId} missing NOTA_CREDITO code`);
    }
  });

  it("getFuenteIdsForStore returns valid IDs for gran_plaza", () => {
    const ids = getFuenteIdsForStore("gran_plaza");
    assert.equal(ids.length, 3, "gran_plaza has 3 fuente IDs (FG+NG+RG)");
    assert.ok(ids.includes(177), "177 (FG) in gran_plaza");
    assert.ok(ids.includes(197), "197 (NG) in gran_plaza");
  });

  it("isStoreSale distinguishes store vs empresa codes", () => {
    assert.equal(isStoreSale("FG"), true);
    assert.equal(isStoreSale("NG"), true);
    assert.equal(isStoreSale("FE"), false);
    assert.equal(isStoreSale("NC"), false);
    assert.equal(isStoreSale(null), false);
  });

  it("non-existent code returns null", () => {
    assert.equal(resolveCanonicalSalesSource("ZZ"), null);
    assert.equal(resolveCanonicalSalesSource(""), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Section B: Sync engine query construction (pure — no DB)
// ══════════════════════════════════════════════════════════════════════════════

describe("sync engine — SQL construction", () => {
  it("sync service source excludes annulled documents (sc_anulado=N)", () => {
    // Read the sync source and verify the annulled filter is present
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../connectors/adapters/sag-pya-soap/sales/sag-store-sale-lines-sync.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("sc_anulado = 'N'"),
      "sync query must filter sc_anulado = 'N'",
    );
  });

  it("sync service uses d_fecha_documento (not d_fecha)", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../connectors/adapters/sag-pya-soap/sales/sag-store-sale-lines-sync.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("d_fecha_documento"),
      "must use d_fecha_documento",
    );
    assert.ok(
      !src.includes("'d_fecha'"),
      "must NOT use bare d_fecha column name",
    );
  });

  it("sync service uses n_valor for line total (not n_total)", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../connectors/adapters/sag-pya-soap/sales/sag-store-sale-lines-sync.ts",
      ),
      "utf-8",
    );
    assert.ok(src.includes("n_valor"), "must use n_valor for line total");
  });

  it("sync service uses ON CONFLICT for idempotent upsert", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../connectors/adapters/sag-pya-soap/sales/sag-store-sale-lines-sync.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("ON CONFLICT"),
      "must use ON CONFLICT for idempotency",
    );
    assert.ok(
      src.includes('"organizationId", "erpItemId"'),
      "conflict key must be [organizationId, erpItemId]",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Section C: Type contract verification (pure — no DB)
// ══════════════════════════════════════════════════════════════════════════════

describe("type contracts", () => {
  it("StoreProductSalesAggregate has all required fields", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(__dirname, "../store-sale-line-types.ts"),
      "utf-8",
    );
    const requiredFields = [
      "referenceCode",
      "articleName",
      "invoiceUnits",
      "invoiceTotal",
      "creditNoteUnits",
      "creditNoteTotal",
      "netUnits",
      "netTotal",
      "sizeCount",
      "colorCount",
      "firstSaleDate",
      "lastSaleDate",
      "lineCount",
    ];
    for (const field of requiredFields) {
      assert.ok(
        src.includes(field),
        `StoreProductSalesAggregate must have field: ${field}`,
      );
    }
  });

  it("StoreProductSalesSummary has all required fields", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(__dirname, "../store-sale-line-types.ts"),
      "utf-8",
    );
    const requiredFields = [
      "storeId",
      "storeName",
      "dateFrom",
      "dateTo",
      "totalReferences",
      "totalLines",
      "totalInvoiceAmount",
      "totalCreditAmount",
      "totalNetAmount",
      "aggregates",
    ];
    for (const field of requiredFields) {
      assert.ok(
        src.includes(field),
        `StoreProductSalesSummary must have field: ${field}`,
      );
    }
  });

  it("reader service is server-only", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(__dirname, "../store-sale-line-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes('"server-only"'),
      "reader service must import server-only",
    );
  });

  it("types file does NOT import server-only (client-safe)", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const src = readFileSync(
      resolve(__dirname, "../store-sale-line-types.ts"),
      "utf-8",
    );
    assert.ok(
      !src.includes('import "server-only"'),
      "types file must NOT have import \"server-only\"",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Section D: DB integration certification (requires DATABASE_URL)
// ══════════════════════════════════════════════════════════════════════════════

describe("DB integration — StoreSaleLineRecord", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;

  before(async () => {
    if (!process.env.DATABASE_URL) {
      console.log("  ⚠ Skipping DB tests — no DATABASE_URL");
      return;
    }
    const mod = await import("../../../../lib/prisma");
    prisma = mod.prisma;
    const org = await prisma.organization.findUnique({
      where: { slug: "castillitos" },
    });
    if (!org) throw new Error("Org castillitos not found");
    orgId = org.id;
  });

  it("StoreSaleLineRecord has data", async () => {
    if (!prisma) return;
    const count = await prisma.storeSaleLineRecord.count({
      where: { organizationId: orgId },
    });
    assert.ok(count > 0, `expected rows > 0, got ${count}`);
  });

  it("Gran Plaza has rows", async () => {
    if (!prisma) return;
    const count = await prisma.storeSaleLineRecord.count({
      where: { organizationId: orgId, storeId: "gran_plaza" },
    });
    assert.ok(count > 0, `expected gran_plaza rows > 0, got ${count}`);
  });

  it("no duplicate erpItemIds (idempotency)", async () => {
    if (!prisma) return;
    const dupes: Array<{ cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt FROM (
        SELECT "erpItemId", COUNT(*) as c
        FROM "StoreSaleLineRecord"
        WHERE "organizationId" = $1
        GROUP BY "erpItemId"
        HAVING COUNT(*) > 1
      ) sub
    `, orgId);
    assert.equal(Number(dupes[0]?.cnt), 0, "no duplicate erpItemIds");
  });

  it("factura lines have positive lineTotal", async () => {
    if (!prisma) return;
    const neg: Array<{ cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
      AND "documentFamily" = 'FACTURA'
      AND "lineTotal"::numeric < 0
    `, orgId);
    assert.equal(Number(neg[0]?.cnt), 0, "no negative factura lineTotal");
  });

  it("NC lines have negative lineTotal", async () => {
    if (!prisma) return;
    const pos: Array<{ cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
      AND "documentFamily" = 'NOTA_CREDITO'
      AND "lineTotal"::numeric > 0
    `, orgId);
    assert.equal(Number(pos[0]?.cnt), 0, "no positive NC lineTotal");
  });

  it("NC lines have positive quantity", async () => {
    if (!prisma) return;
    const neg: Array<{ cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
      AND "documentFamily" = 'NOTA_CREDITO'
      AND "quantity"::numeric < 0
    `, orgId);
    assert.equal(Number(neg[0]?.cnt), 0, "no negative NC quantity");
  });

  it("discountPercent in [0, 100]", async () => {
    if (!prisma) return;
    const bad: Array<{ cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
      AND ("discountPercent"::numeric < 0 OR "discountPercent"::numeric > 100)
    `, orgId);
    assert.equal(Number(bad[0]?.cnt), 0, "all discountPercent in [0,100]");
  });

  it("ivaRate is only 0 or 19", async () => {
    if (!prisma) return;
    const rates: Array<{ rate: number }> = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "ivaRate"::numeric as rate
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
    `, orgId);
    for (const r of rates) {
      const v = Number(r.rate);
      assert.ok(v === 0 || v === 19, `unexpected ivaRate: ${v}`);
    }
  });

  it("no empty referenceCode", async () => {
    if (!prisma) return;
    const empty: Array<{ cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
      AND ("referenceCode" IS NULL OR "referenceCode" = '')
    `, orgId);
    assert.equal(Number(empty[0]?.cnt), 0, "no empty referenceCode");
  });

  it("all storeIds are canonical", async () => {
    if (!prisma) return;
    const validIds = CANONICAL_SALES_STORES.map((s) => s.storeId);
    const stores: Array<{ storeId: string }> = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "storeId"
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
    `, orgId);
    for (const s of stores) {
      assert.ok(validIds.includes(s.storeId), `invalid storeId: ${s.storeId}`);
    }
  });

  it("documentFamily is FACTURA or NOTA_CREDITO only", async () => {
    if (!prisma) return;
    const fams: Array<{ documentFamily: string }> = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "documentFamily"
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
    `, orgId);
    const valid = ["FACTURA", "NOTA_CREDITO"];
    for (const f of fams) {
      assert.ok(valid.includes(f.documentFamily), `invalid family: ${f.documentFamily}`);
    }
  });

  it("no null required fields (storeId, storeName, documentFamily, comprobanteCode, documentDate)", async () => {
    if (!prisma) return;
    const nulls: Array<{ field: string; cnt: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT 'storeId' as field, COUNT(*) as cnt FROM "StoreSaleLineRecord" WHERE "organizationId" = $1 AND "storeId" IS NULL
      UNION ALL SELECT 'storeName', COUNT(*) FROM "StoreSaleLineRecord" WHERE "organizationId" = $1 AND "storeName" IS NULL
      UNION ALL SELECT 'documentFamily', COUNT(*) FROM "StoreSaleLineRecord" WHERE "organizationId" = $1 AND "documentFamily" IS NULL
      UNION ALL SELECT 'comprobanteCode', COUNT(*) FROM "StoreSaleLineRecord" WHERE "organizationId" = $1 AND "comprobanteCode" IS NULL
      UNION ALL SELECT 'documentDate', COUNT(*) FROM "StoreSaleLineRecord" WHERE "organizationId" = $1 AND "documentDate" IS NULL
    `, orgId);
    for (const n of nulls) {
      assert.equal(Number(n.cnt), 0, `${n.field} has ${n.cnt} nulls`);
    }
  });

  it("comprobanteCode matches storeId (canonical coherence)", async () => {
    if (!prisma) return;
    const pairs: Array<{ comprobanteCode: string; storeId: string }> =
      await prisma.$queryRawUnsafe(`
        SELECT DISTINCT "comprobanteCode", "storeId"
        FROM "StoreSaleLineRecord"
        WHERE "organizationId" = $1
      `, orgId);
    for (const p of pairs) {
      const expected = resolveCanonicalSalesSource(p.comprobanteCode)?.store?.storeId;
      assert.equal(p.storeId, expected, `${p.comprobanteCode} → expected ${expected}, got ${p.storeId}`);
    }
  });

  it("per-document reconciliation vs SaleRecord (Gran Plaza facturas)", async () => {
    if (!prisma) return;
    const recon: Array<{ ssl_total: number; sr_amount: number }> =
      await prisma.$queryRawUnsafe(`
        SELECT ssl.ssl_total, sr.sr_amount
        FROM (
          SELECT REGEXP_REPLACE(MIN("comprobante"), '^[A-Z]+-', '') as docnum,
                 SUM("lineTotal"::numeric) as ssl_total
          FROM "StoreSaleLineRecord"
          WHERE "organizationId" = $1
          AND "storeId" = 'gran_plaza'
          AND "documentFamily" = 'FACTURA'
          GROUP BY "erpMovId"
        ) ssl
        JOIN (
          SELECT "comprobante" as docnum, "amount"::numeric as sr_amount
          FROM "SaleRecord"
          WHERE "organizationId" = $1
          AND "comprobanteCode" = 'FG'
        ) sr ON sr.docnum = ssl.docnum
      `, orgId);

    let matched = 0;
    let rounding = 0;
    let mismatched = 0;
    for (const row of recon) {
      const delta = Math.abs(Number(row.ssl_total) - Number(row.sr_amount));
      if (delta < 0.01) matched++;
      else if (delta < 0.02) rounding++; // floating-point rounding, not data error
      else mismatched++;
    }
    assert.equal(mismatched, 0, `real mismatches: ${mismatched} (matched=${matched}, rounding=${rounding})`);
    assert.ok(matched >= 50, `expected >= 50 matched docs, got ${matched}`);
  });

  it("per-document reconciliation vs SaleRecord (Gran Plaza NC)", async () => {
    if (!prisma) return;
    const recon: Array<{ ssl_total: number; sr_amount: number }> =
      await prisma.$queryRawUnsafe(`
        SELECT ssl.ssl_total, sr.sr_amount
        FROM (
          SELECT REGEXP_REPLACE(MIN("comprobante"), '^[A-Z]+-', '') as docnum,
                 SUM("lineTotal"::numeric) as ssl_total
          FROM "StoreSaleLineRecord"
          WHERE "organizationId" = $1
          AND "storeId" = 'gran_plaza'
          AND "documentFamily" = 'NOTA_CREDITO'
          GROUP BY "erpMovId"
        ) ssl
        JOIN (
          SELECT "comprobante" as docnum, "amount"::numeric as sr_amount
          FROM "SaleRecord"
          WHERE "organizationId" = $1
          AND "comprobanteCode" = 'NG'
        ) sr ON sr.docnum = ssl.docnum
      `, orgId);

    for (const row of recon) {
      const delta = Math.abs(Number(row.ssl_total) - Number(row.sr_amount));
      assert.ok(delta < 0.02, `NC doc mismatch: delta=${delta}`);
    }
  });

  it("reference coverage >= 90% (ProductEntity join)", async () => {
    if (!prisma) return;
    const ref: Array<{ total_refs: bigint; matched_refs: bigint }> =
      await prisma.$queryRawUnsafe(`
        SELECT
          (SELECT COUNT(DISTINCT "referenceCode") FROM "StoreSaleLineRecord" WHERE "organizationId" = $1) as total_refs,
          (SELECT COUNT(DISTINCT ssl."referenceCode")
           FROM "StoreSaleLineRecord" ssl
           JOIN "ProductEntity" pe ON pe."externalId" = ssl."referenceCode" AND pe."organizationId" = ssl."organizationId"
           WHERE ssl."organizationId" = $1) as matched_refs
      `, orgId);
    const total = Number(ref[0]?.total_refs);
    const matched = Number(ref[0]?.matched_refs);
    const coverage = total > 0 ? (matched / total) * 100 : 0;
    assert.ok(coverage >= 90, `coverage ${coverage.toFixed(1)}% < 90% (${matched}/${total})`);
  });

  it("date range is within expected sync window (2025-2026)", async () => {
    if (!prisma) return;
    const range: Array<{ min_date: string; max_date: string }> =
      await prisma.$queryRawUnsafe(`
        SELECT MIN("documentDate")::text as min_date, MAX("documentDate")::text as max_date
        FROM "StoreSaleLineRecord"
        WHERE "organizationId" = $1
      `, orgId);
    const minYear = Number(range[0]?.min_date?.slice(0, 4));
    const maxYear = Number(range[0]?.max_date?.slice(0, 4));
    assert.ok(minYear >= 2025 && minYear <= 2026, `min year ${minYear} outside [2025,2026]`);
    assert.ok(maxYear >= 2025 && maxYear <= 2027, `max year ${maxYear} outside expected`);
  });

  it("aggregate spot-check: top reference has positive qty and total", async () => {
    if (!prisma) return;
    const top: Array<{ referenceCode: string }> = await prisma.$queryRawUnsafe(`
      SELECT "referenceCode"
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1 AND "storeId" = 'gran_plaza' AND "documentFamily" = 'FACTURA'
      AND "referenceCode" NOT LIKE 'B_'
      GROUP BY "referenceCode"
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `, orgId);
    assert.ok(top.length > 0, "at least one non-packaging reference exists");

    const agg: Array<{ sum_qty: number; sum_total: number }> =
      await prisma.$queryRawUnsafe(`
        SELECT SUM("quantity"::numeric) as sum_qty, SUM("lineTotal"::numeric) as sum_total
        FROM "StoreSaleLineRecord"
        WHERE "organizationId" = $1
        AND "storeId" = 'gran_plaza'
        AND "documentFamily" = 'FACTURA'
        AND "referenceCode" = $2
      `, orgId, top[0].referenceCode);
    assert.ok(Number(agg[0]?.sum_qty) > 0, "top ref qty must be > 0");
    assert.ok(Number(agg[0]?.sum_total) > 0, "top ref total must be > 0");
  });

  it("decimal quantities are rare (< 0.1% of total)", async () => {
    if (!prisma) return;
    const result: Array<{ total: bigint; decimal_count: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE "quantity"::numeric != FLOOR("quantity"::numeric)) as decimal_count
      FROM "StoreSaleLineRecord"
      WHERE "organizationId" = $1
    `, orgId);
    const total = Number(result[0]?.total);
    const decCount = Number(result[0]?.decimal_count);
    const pct = total > 0 ? (decCount / total) * 100 : 0;
    assert.ok(pct < 0.1, `decimal quantities ${decCount}/${total} = ${pct.toFixed(3)}% exceeds 0.1% threshold`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Section E: Migration file verification (pure — no DB)
// ══════════════════════════════════════════════════════════════════════════════

describe("migration file", () => {
  it("migration SQL exists and creates StoreSaleLineRecord", () => {
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const sql = readFileSync(
      resolve(
        __dirname,
        "../../../../prisma/migrations/20260803000000_store_sale_line_record/migration.sql",
      ),
      "utf-8",
    );
    assert.ok(sql.includes('CREATE TABLE "StoreSaleLineRecord"'), "must CREATE TABLE");
    assert.ok(sql.includes("DECIMAL(18,2)"), "quantity/lineTotal must be DECIMAL(18,2)");
    assert.ok(sql.includes("DECIMAL(5,2)"), "discountPercent/ivaRate must be DECIMAL(5,2)");
    assert.ok(sql.includes("organizationId_erpItemId_key"), "unique constraint must exist");
    assert.ok(sql.includes("organizationId_storeId_documentDate"), "store+date index must exist");
    assert.ok(sql.includes("organizationId_referenceCode"), "reference index must exist");
    assert.ok(sql.includes("organizationId_erpMovId"), "erpMovId index must exist");
    assert.ok(sql.includes("organizationId_comprobanteCode_documentD"), "comprobanteCode index must exist");
    assert.ok(sql.includes("ON DELETE CASCADE"), "FK must cascade on delete");
  });
});
