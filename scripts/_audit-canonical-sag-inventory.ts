/**
 * scripts/_audit-canonical-sag-inventory.ts
 *
 * Canonical SAG inventory audit — read-only, no modifications.
 *
 * SECTION A: Diverse sample of 30 ProductEntity references with full field dump
 * SECTION B: Null audit aggregates on ProductEntity + CommercialCoverageSnapshot
 * SECTION C: Freshness audit (snapshotAt / syncedAt / updatedAt)
 * SECTION D: Warehouse distribution from ProductInventoryLevel
 * SECTION E: ProductVariantAttribute existence + sample
 * SECTION F: handlingUnit / sizeClass distribution + sc_unidad notes
 *
 * Run: npx tsx scripts/_audit-canonical-sag-inventory.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── helpers ──────────────────────────────────────────────────────────────────

function sep(title: string) {
  console.log("\n" + "═".repeat(80));
  console.log(`  ${title}`);
  console.log("═".repeat(80));
}

function sub(title: string) {
  console.log("\n─── " + title + " ───");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printRow(label: string, val: any) {
  const display = val === null || val === undefined ? "(NULL)" : String(val);
  console.log(`    ${label.padEnd(28)} ${display}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve org
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, slug: true, name: true },
  });
  if (!org) {
    console.error("ERROR: castillitos org not found");
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`\nOrg: ${org.name} (${org.slug}) — ID: ${orgId}`);
  console.log(`Audit date: ${new Date().toISOString()}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION A — Diverse sample of 30 references
  // ══════════════════════════════════════════════════════════════════════════
  sep("SECTION A — DIVERSE SAMPLE (30 references)");

  // prettier-ignore
  const sampleGroups: Array<{ label: string; sql: string }> = [
    {
      label: "productLine=2 (Castillitos) WITH subgrupoId",
      sql: `SELECT id, sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category, brand, "handlingUnit", "sizeClass", "createdAt", "updatedAt"
            FROM "ProductEntity"
            WHERE "organizationId" = '${orgId}' AND "productLine" = '2' AND "subgrupoId" IS NOT NULL
            ORDER BY "createdAt" DESC LIMIT 5`,
    },
    {
      label: "productLine=2 (Castillitos) subgrupoId=NULL",
      sql: `SELECT id, sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category, brand, "handlingUnit", "sizeClass", "createdAt", "updatedAt"
            FROM "ProductEntity"
            WHERE "organizationId" = '${orgId}' AND "productLine" = '2' AND "subgrupoId" IS NULL
            ORDER BY "createdAt" DESC LIMIT 5`,
    },
    {
      label: "productLine=1 (Latin Kids) WITH subgrupoId",
      sql: `SELECT id, sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category, brand, "handlingUnit", "sizeClass", "createdAt", "updatedAt"
            FROM "ProductEntity"
            WHERE "organizationId" = '${orgId}' AND "productLine" = '1' AND "subgrupoId" IS NOT NULL
            ORDER BY "createdAt" DESC LIMIT 5`,
    },
    {
      label: "productLine=1 (Latin Kids) subgrupoId=NULL",
      sql: `SELECT id, sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category, brand, "handlingUnit", "sizeClass", "createdAt", "updatedAt"
            FROM "ProductEntity"
            WHERE "organizationId" = '${orgId}' AND "productLine" = '1' AND "subgrupoId" IS NULL
            ORDER BY "createdAt" DESC LIMIT 5`,
    },
    {
      label: "productLine=5 (Import/Accessories)",
      sql: `SELECT id, sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category, brand, "handlingUnit", "sizeClass", "createdAt", "updatedAt"
            FROM "ProductEntity"
            WHERE "organizationId" = '${orgId}' AND "productLine" = '5'
            ORDER BY "createdAt" DESC LIMIT 5`,
    },
    {
      label: "Oldest 5 references (by createdAt)",
      sql: `SELECT id, sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category, brand, "handlingUnit", "sizeClass", "createdAt", "updatedAt"
            FROM "ProductEntity"
            WHERE "organizationId" = '${orgId}'
            ORDER BY "createdAt" ASC LIMIT 5`,
    },
  ];

  for (const group of sampleGroups) {
    sub(group.label);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = await prisma.$queryRawUnsafe(group.sql);
      if (rows.length === 0) {
        console.log("    (no rows)");
        continue;
      }
      for (const r of rows) {
        console.log(`\n  ── SKU: ${r.sku ?? "(null)"} ──`);
        printRow("id", r.id);
        printRow("name", r.name);
        printRow("description", (r.description ?? "").substring(0, 80));
        printRow("productLine", r.productLine);
        printRow("subgrupoId", r.subgrupoId);
        printRow("subgrupoSag", r.subgrupoSag);
        printRow("category", r.category);
        printRow("brand", r.brand);
        printRow("handlingUnit", r.handlingUnit);
        printRow("sizeClass", r.sizeClass);
        printRow("createdAt", r.createdAt);
        printRow("updatedAt", r.updatedAt);

        // CommercialCoverageSnapshot — latest
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const snapRows: any[] = await prisma.$queryRawUnsafe(`
            SELECT "refCode", description, line, disponible, "pendingOrdersQty",
                   "subgrupoId", "subgrupoSag", "snapshotAt"
            FROM "CommercialCoverageSnapshot"
            WHERE "organizationId" = '${orgId}' AND "refCode" = '${r.sku?.replace(/'/g, "''") ?? ""}'
            ORDER BY "snapshotAt" DESC LIMIT 1
          `);
          if (snapRows.length > 0) {
            const s = snapRows[0];
            console.log(`    -- CommercialCoverageSnapshot (latest) --`);
            printRow("  ccs.refCode", s.refCode);
            printRow("  ccs.description", (s.description ?? "").substring(0, 60));
            printRow("  ccs.line", s.line);
            printRow("  ccs.disponible", s.disponible);
            printRow("  ccs.pendingOrdersQty", s.pendingOrdersQty);
            printRow("  ccs.subgrupoId", s.subgrupoId);
            printRow("  ccs.subgrupoSag", s.subgrupoSag);
            printRow("  ccs.snapshotAt", s.snapshotAt);
          } else {
            console.log(`    -- CommercialCoverageSnapshot: (no rows for sku=${r.sku}) --`);
          }
        } catch (e) {
          console.log(`    -- CommercialCoverageSnapshot: ERROR — ${(e as Error).message} --`);
        }

        // ProductInventoryLevel — all rows
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pilRows: any[] = await prisma.$queryRawUnsafe(`
            SELECT "warehouseId", quantity, "syncedAt"
            FROM "ProductInventoryLevel"
            WHERE "productId" = '${r.id}'
            ORDER BY "warehouseId"
          `);
          if (pilRows.length > 0) {
            console.log(`    -- ProductInventoryLevel (${pilRows.length} rows) --`);
            for (const p of pilRows) {
              console.log(`       warehouse=${p.warehouseId}  qty=${p.quantity}  syncedAt=${p.syncedAt ?? "(null)"}`);
            }
          } else {
            console.log(`    -- ProductInventoryLevel: (no rows) --`);
          }
        } catch (e) {
          console.log(`    -- ProductInventoryLevel: ERROR — ${(e as Error).message} --`);
        }

        // ProductVariantAttribute — existence check
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pvaRows: any[] = await prisma.$queryRawUnsafe(`
            SELECT pva.key, pva.value, pva.source
            FROM "ProductVariantAttribute" pva
            JOIN "ProductVariant" pv ON pv.id = pva."variantId"
            WHERE pv."productId" = '${r.id}'
            LIMIT 5
          `);
          if (pvaRows.length > 0) {
            console.log(`    -- ProductVariantAttribute (${pvaRows.length} sample) --`);
            for (const a of pvaRows) {
              console.log(`       key=${a.key}  value=${a.value}  source=${a.source}`);
            }
          } else {
            console.log(`    -- ProductVariantAttribute: (none) --`);
          }
        } catch (e) {
          console.log(`    -- ProductVariantAttribute: table may not exist — ${(e as Error).message} --`);
        }
      }
    } catch (e) {
      console.log(`    ERROR fetching group: ${(e as Error).message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION B — Null audit aggregates
  // ══════════════════════════════════════════════════════════════════════════
  sep("SECTION B — NULL AUDIT");

  try {
    sub("ProductEntity — totals and nulls by productLine");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalByLine: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        "productLine",
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "subgrupoId" IS NULL) AS null_subgrupoId,
        COUNT(*) FILTER (WHERE "subgrupoSag" IS NULL) AS null_subgrupoSag,
        COUNT(*) FILTER (WHERE category IS NULL) AS null_category,
        COUNT(*) FILTER (WHERE brand IS NULL) AS null_brand
      FROM "ProductEntity"
      WHERE "organizationId" = '${orgId}'
      GROUP BY "productLine"
      ORDER BY "productLine"
    `);
    console.log(
      "LINE".padEnd(10) +
      "TOTAL".padEnd(10) +
      "NULL_SUBID".padEnd(14) +
      "NULL_SUBSAG".padEnd(14) +
      "NULL_CAT".padEnd(12) +
      "NULL_BRAND"
    );
    console.log("-".repeat(70));
    for (const r of totalByLine) {
      console.log(
        (r.productLine ?? "(null)").padEnd(10) +
        String(r.total).padEnd(10) +
        String(r.null_subgrupoid).padEnd(14) +
        String(r.null_subgruposa).padEnd(14) +
        String(r.null_category).padEnd(12) +
        String(r.null_brand)
      );
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("ProductEntity — handlingUnit nulls by productLine");
    // Check if handlingUnit column exists first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ProductEntity' AND column_name = 'handlingUnit'
    `);
    if (colCheck.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const huRows: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          "productLine",
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "handlingUnit" IS NULL) AS null_handlingUnit,
          COUNT(*) FILTER (WHERE "handlingUnit" IS NOT NULL) AS has_handlingUnit
        FROM "ProductEntity"
        WHERE "organizationId" = '${orgId}'
        GROUP BY "productLine"
        ORDER BY "productLine"
      `);
      console.log("LINE".padEnd(10) + "TOTAL".padEnd(10) + "NULL_HU".padEnd(12) + "HAS_HU");
      console.log("-".repeat(40));
      for (const r of huRows) {
        console.log(
          (r.productLine ?? "(null)").padEnd(10) +
          String(r.total).padEnd(10) +
          String(r.null_handlingunit).padEnd(12) +
          String(r.has_handlingunit)
        );
      }
    } else {
      console.log("  handlingUnit column NOT FOUND in ProductEntity");
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("ProductEntity — sizeClass nulls by productLine");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ProductEntity' AND column_name = 'sizeClass'
    `);
    if (colCheck.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scRows: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          "productLine",
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "sizeClass" IS NULL) AS null_sizeClass,
          COUNT(*) FILTER (WHERE "sizeClass" IS NOT NULL) AS has_sizeClass
        FROM "ProductEntity"
        WHERE "organizationId" = '${orgId}'
        GROUP BY "productLine"
        ORDER BY "productLine"
      `);
      console.log("LINE".padEnd(10) + "TOTAL".padEnd(10) + "NULL_SC".padEnd(12) + "HAS_SC");
      console.log("-".repeat(40));
      for (const r of scRows) {
        console.log(
          (r.productLine ?? "(null)").padEnd(10) +
          String(r.total).padEnd(10) +
          String(r.null_sizeclass).padEnd(12) +
          String(r.has_sizeclass)
        );
      }
    } else {
      console.log("  sizeClass column NOT FOUND in ProductEntity");
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("CommercialCoverageSnapshot — aggregate nulls");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ccsAgg: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "subgrupoId" IS NULL) AS null_subgrupoId,
        COUNT(*) FILTER (WHERE "subgrupoSag" IS NULL) AS null_subgrupoSag,
        COUNT(*) FILTER (WHERE "pendingOrdersQty" IS NULL) AS null_pendingQty,
        COUNT(DISTINCT "refCode") AS distinct_refs,
        COUNT(DISTINCT "snapshotAt") AS distinct_snapshots
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = '${orgId}'
    `);
    const r = ccsAgg[0];
    if (r) {
      console.log(`  Total rows:              ${r.total}`);
      console.log(`  Distinct refs:           ${r.distinct_refs}`);
      console.log(`  Distinct snapshots:      ${r.distinct_snapshots}`);
      console.log(`  NULL subgrupoId:         ${r.null_subgrupoid}`);
      console.log(`  NULL subgrupoSag:        ${r.null_subgruposa}`);
      console.log(`  NULL pendingOrdersQty:   ${r.null_pendingqty}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION C — Freshness audit
  // ══════════════════════════════════════════════════════════════════════════
  sep("SECTION C — FRESHNESS AUDIT");

  try {
    sub("CommercialCoverageSnapshot — snapshotAt range");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ccsRange: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        MIN("snapshotAt") AS min_snapshot,
        MAX("snapshotAt") AS max_snapshot,
        COUNT(DISTINCT "snapshotAt") AS distinct_snapshot_values,
        COUNT(DISTINCT DATE("snapshotAt")) AS distinct_snapshot_dates
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = '${orgId}'
    `);
    const r = ccsRange[0];
    if (r) {
      console.log(`  MIN snapshotAt:          ${r.min_snapshot}`);
      console.log(`  MAX snapshotAt:          ${r.max_snapshot}`);
      console.log(`  Distinct snapshot timestamps: ${r.distinct_snapshot_values}`);
      console.log(`  Distinct snapshot dates: ${r.distinct_snapshot_dates}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("CommercialCoverageSnapshot — last 10 distinct snapshotAt values");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentSnaps: any[] = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "snapshotAt", COUNT(*) AS row_count
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = '${orgId}'
      GROUP BY "snapshotAt"
      ORDER BY "snapshotAt" DESC
      LIMIT 10
    `);
    for (const r of recentSnaps) {
      console.log(`  ${String(r.snapshotAt).padEnd(35)} rows=${r.row_count}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("ProductInventoryLevel — syncedAt range");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pilRange: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        MIN("syncedAt") AS min_synced,
        MAX("syncedAt") AS max_synced,
        COUNT(DISTINCT DATE("syncedAt")) AS distinct_synced_dates,
        COUNT(*) AS total_rows,
        COUNT(*) FILTER (WHERE "syncedAt" IS NULL) AS null_synced
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe.id = pil."productId"
      WHERE pe."organizationId" = '${orgId}'
    `);
    const r = pilRange[0];
    if (r) {
      console.log(`  MIN syncedAt:            ${r.min_synced}`);
      console.log(`  MAX syncedAt:            ${r.max_synced}`);
      console.log(`  Distinct syncedAt dates: ${r.distinct_synced_dates}`);
      console.log(`  Total PIL rows:          ${r.total_rows}`);
      console.log(`  NULL syncedAt:           ${r.null_synced}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("ProductEntity — updatedAt range");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peRange: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        MIN("updatedAt") AS min_updated,
        MAX("updatedAt") AS max_updated,
        COUNT(*) AS total
      FROM "ProductEntity"
      WHERE "organizationId" = '${orgId}'
    `);
    const r = peRange[0];
    if (r) {
      console.log(`  MIN updatedAt:           ${r.min_updated}`);
      console.log(`  MAX updatedAt:           ${r.max_updated}`);
      console.log(`  Total ProductEntity rows: ${r.total}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION D — Warehouse distribution
  // ══════════════════════════════════════════════════════════════════════════
  sep("SECTION D — WAREHOUSE DISTRIBUTION");

  try {
    sub("ProductInventoryLevel — distinct warehouseId values with counts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whDist: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        pil."warehouseId",
        COUNT(*) AS total_rows,
        COUNT(DISTINCT pil."productId") AS distinct_products,
        COUNT(*) FILTER (WHERE pil.quantity > 0) AS rows_with_stock,
        COUNT(DISTINCT pil."productId") FILTER (WHERE pil.quantity > 0) AS products_with_stock,
        SUM(pil.quantity) AS total_qty
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe.id = pil."productId"
      WHERE pe."organizationId" = '${orgId}'
      GROUP BY pil."warehouseId"
      ORDER BY total_rows DESC
    `);
    if (whDist.length === 0) {
      console.log("  (no ProductInventoryLevel rows found)");
    } else {
      console.log(
        "WAREHOUSE".padEnd(20) +
        "TOTAL_ROWS".padEnd(14) +
        "PRODS".padEnd(10) +
        "ROWS_STOCK".padEnd(14) +
        "PRODS_STOCK".padEnd(14) +
        "TOTAL_QTY"
      );
      console.log("-".repeat(90));
      for (const r of whDist) {
        console.log(
          String(r.warehouseid).padEnd(20) +
          String(r.total_rows).padEnd(14) +
          String(r.distinct_products).padEnd(10) +
          String(r.rows_with_stock).padEnd(14) +
          String(r.products_with_stock).padEnd(14) +
          String(r.total_qty)
        );
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION E — Variant audit
  // ══════════════════════════════════════════════════════════════════════════
  sep("SECTION E — VARIANT AUDIT");

  try {
    sub("ProductVariantAttribute — table existence + count");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'ProductVariantAttribute'
    `);
    if (tableCheck.length > 0) {
      console.log("  ProductVariantAttribute table EXISTS");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pvaCount: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          COUNT(*) AS total_rows,
          COUNT(DISTINCT pva."variantId") AS distinct_variants,
          COUNT(DISTINCT pv."productId") AS distinct_products
        FROM "ProductVariantAttribute" pva
        JOIN "ProductVariant" pv ON pv.id = pva."variantId"
        JOIN "ProductEntity" pe ON pe.id = pv."productId"
        WHERE pe."organizationId" = '${orgId}'
      `);
      const r = pvaCount[0];
      console.log(`  Total rows:              ${r?.total_rows ?? "(error)"}`);
      console.log(`  Distinct variants:       ${r?.distinct_variants ?? "(error)"}`);
      console.log(`  Distinct products:       ${r?.distinct_products ?? "(error)"}`);

      // sample 5 rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pvaSample: any[] = await prisma.$queryRawUnsafe(`
        SELECT pva.key, pva.label, pva.value, pva.source, pva."externalRef",
               pv."productId", pe.sku
        FROM "ProductVariantAttribute" pva
        JOIN "ProductVariant" pv ON pv.id = pva."variantId"
        JOIN "ProductEntity" pe ON pe.id = pv."productId"
        WHERE pe."organizationId" = '${orgId}'
        LIMIT 5
      `);
      if (pvaSample.length > 0) {
        sub("ProductVariantAttribute — sample 5 rows");
        for (const r of pvaSample) {
          console.log(`  sku=${r.sku}  key=${r.key}  label=${r.label}  value=${r.value}  source=${r.source}  extRef=${r.externalRef ?? "(null)"}`);
        }
      }

      // key distribution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keyDist: any[] = await prisma.$queryRawUnsafe(`
        SELECT pva.key, COUNT(*) AS cnt
        FROM "ProductVariantAttribute" pva
        JOIN "ProductVariant" pv ON pv.id = pva."variantId"
        JOIN "ProductEntity" pe ON pe.id = pv."productId"
        WHERE pe."organizationId" = '${orgId}'
        GROUP BY pva.key
        ORDER BY cnt DESC
      `);
      if (keyDist.length > 0) {
        sub("ProductVariantAttribute — key distribution");
        for (const r of keyDist) {
          console.log(`  key=${String(r.key).padEnd(20)}  count=${r.cnt}`);
        }
      }
    } else {
      console.log("  ProductVariantAttribute table DOES NOT EXIST");
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("ProductVariant — totals for this org");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pvTotal: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS total_variants,
        COUNT(DISTINCT pv."productId") AS distinct_products,
        COUNT(*) FILTER (WHERE pv.status = 'active') AS active_variants
      FROM "ProductVariant" pv
      JOIN "ProductEntity" pe ON pe.id = pv."productId"
      WHERE pe."organizationId" = '${orgId}'
    `);
    const r = pvTotal[0];
    console.log(`  Total variants:          ${r?.total_variants}`);
    console.log(`  Distinct products:       ${r?.distinct_products}`);
    console.log(`  Active variants:         ${r?.active_variants}`);
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION F — handlingUnit / sizeClass distribution
  // ══════════════════════════════════════════════════════════════════════════
  sep("SECTION F — HANDLING UNIT / SIZE CLASS DISTRIBUTION");

  try {
    sub("Check columns: handlingUnit, sizeClass on ProductEntity");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ProductEntity'
        AND column_name IN ('handlingUnit', 'sizeClass', 'brand')
      ORDER BY column_name
    `);
    if (colCheck.length === 0) {
      console.log("  NONE of handlingUnit, sizeClass, brand found on ProductEntity");
    } else {
      for (const c of colCheck) {
        console.log(`  Column: ${c.column_name}  type: ${c.data_type}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("handlingUnit distribution by productLine");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const huDistCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ProductEntity' AND column_name = 'handlingUnit'
    `);
    if (huDistCheck.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const huDist: any[] = await prisma.$queryRawUnsafe(`
        SELECT "productLine", "handlingUnit", COUNT(*) AS cnt
        FROM "ProductEntity"
        WHERE "organizationId" = '${orgId}'
        GROUP BY "productLine", "handlingUnit"
        ORDER BY "productLine", cnt DESC
      `);
      console.log("LINE".padEnd(10) + "HANDLING_UNIT".padEnd(25) + "COUNT");
      console.log("-".repeat(45));
      for (const r of huDist) {
        console.log(
          (r.productLine ?? "(null)").padEnd(10) +
          (r.handlingunit ?? "(NULL)").padEnd(25) +
          String(r.cnt)
        );
      }
    } else {
      console.log("  handlingUnit column NOT FOUND");
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("sizeClass distribution by productLine");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scDistCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ProductEntity' AND column_name = 'sizeClass'
    `);
    if (scDistCheck.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scDist: any[] = await prisma.$queryRawUnsafe(`
        SELECT "productLine", "sizeClass", COUNT(*) AS cnt
        FROM "ProductEntity"
        WHERE "organizationId" = '${orgId}'
        GROUP BY "productLine", "sizeClass"
        ORDER BY "productLine", cnt DESC
      `);
      console.log("LINE".padEnd(10) + "SIZE_CLASS".padEnd(25) + "COUNT");
      console.log("-".repeat(45));
      for (const r of scDist) {
        console.log(
          (r.productLine ?? "(null)").padEnd(10) +
          (r.sizeclass ?? "(NULL)").padEnd(25) +
          String(r.cnt)
        );
      }
    } else {
      console.log("  sizeClass column NOT FOUND");
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  try {
    sub("sc_unidad — codebase reference summary (static note, not a DB query)");
    console.log("  Source: lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync.ts");
    console.log("  sc_unidad lives in SAG view v_articulos (NOT in ARTICULOS table).");
    console.log("  During sync, consultaSagJson fetches v_articulos → builds handlingUnitLookup map.");
    console.log("  Values seen in SAG: PEQUEÑO, MEDIANO, GRANDE (size classes)");
    console.log("                      UNIDAD, METROS, PESOS (non-size units)");
    console.log("  Mapped to ProductEntity.handlingUnit via normalizeHandlingUnit().");
    console.log("  sizeClass is derived from handlingUnit during the same sync step.");
    console.log("  ARTICULOS table has NO sc_unidad_manejo field — only v_articulos has sc_unidad.");
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  console.log("\n" + "═".repeat(80));
  console.log("  AUDIT COMPLETE");
  console.log("═".repeat(80) + "\n");
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
