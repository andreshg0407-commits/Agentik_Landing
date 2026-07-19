/**
 * scripts/_audit-tiendas-data.ts
 *
 * READ-ONLY audit: what store-related data exists for Castillitos?
 * No writes, no mutations. Pure SELECT queries.
 *
 * Usage: npx tsx scripts/_audit-tiendas-data.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org found"); return; }
  const orgId = org.id;
  console.log(`\n=== TIENDAS AUDIT — org: ${org.slug} (${orgId}) ===\n`);

  // 1. Distinct stores from SaleRecord
  const storeRows = await (prisma as any).$queryRaw`
    SELECT "storeSlug", "storeName", COUNT(*)::int as records,
           MIN("saleDate")::text as first_sale, MAX("saleDate")::text as last_sale,
           SUM("amount")::bigint as total_amount
    FROM "SaleRecord"
    WHERE "organizationId" = ${orgId}
    GROUP BY "storeSlug", "storeName"
    ORDER BY total_amount DESC
  `;
  console.log("--- 1. STORES FROM SaleRecord ---");
  console.table(storeRows);

  // 2. ProductInventoryLevel — per-warehouse stock
  try {
    const invLevels = await (prisma as any).$queryRaw`
      SELECT COUNT(*)::int as total,
             COUNT(DISTINCT "warehouseCode")::int as warehouses,
             COUNT(DISTINCT "referenceCode")::int as references,
             SUM("availableUnits")::int as total_available,
             MAX("updatedAt")::text as latest_update
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${orgId}
    `;
    console.log("\n--- 2. ProductInventoryLevel (real stock) ---");
    console.table(invLevels);

    const warehouseBreakdown = await (prisma as any).$queryRaw`
      SELECT "warehouseCode", COUNT(*)::int as records,
             COUNT(DISTINCT "referenceCode")::int as refs,
             SUM("availableUnits")::int as total_units,
             MAX("updatedAt")::text as latest
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${orgId}
      GROUP BY "warehouseCode"
      ORDER BY total_units DESC
    `;
    console.log("  Per-warehouse breakdown:");
    console.table(warehouseBreakdown);
  } catch (e: any) {
    console.log("\n--- 2. ProductInventoryLevel ---");
    console.log("  Table does not exist or error:", e.message?.slice(0, 120));
  }

  // 3. CRMQuoteLine — warehouse info in quote lines
  try {
    const quoteLineWarehouses = await (prisma as any).$queryRaw`
      SELECT "warehouseName", COUNT(*)::int as lines,
             COUNT(DISTINCT "referenceCode")::int as refs
      FROM "CRMQuoteLine"
      WHERE "organizationId" = ${orgId}
        AND "warehouseName" IS NOT NULL AND "warehouseName" != ''
      GROUP BY "warehouseName"
      ORDER BY lines DESC
      LIMIT 20
    `;
    console.log("\n--- 3. CRMQuoteLine warehouses ---");
    console.table(quoteLineWarehouses);
  } catch (e: any) {
    console.log("\n--- 3. CRMQuoteLine warehouses ---");
    console.log("  Table does not exist or error:", e.message?.slice(0, 120));
  }

  // 4. AgentExecution — warehouse configs
  try {
    const warehouseConfigs = await (prisma as any).agentExecution.findMany({
      where: {
        tenantId: orgId,
        module: "comercial",
        operation: "COMERCIAL_STORE_WAREHOUSE_MAPPING_CONFIG",
      },
    });
    console.log("\n--- 4. Warehouse Mapping Configs (AgentExecution) ---");
    console.log(`  Count: ${warehouseConfigs.length}`);
    for (const c of warehouseConfigs) {
      const meta = c.metadataJson as any;
      console.log(`  - ${meta?.storeName ?? "?"} | code=${meta?.sagWarehouseCode ?? "?"} | main=${meta?.isMainWarehouse ?? false} | active=${meta?.active ?? true}`);
    }
  } catch (e: any) {
    console.log("\n--- 4. Warehouse Mapping Configs ---");
    console.log("  Error:", e.message?.slice(0, 120));
  }

  // 5. AgentExecution — transfer proposals
  try {
    const proposals = await (prisma as any).agentExecution.findMany({
      where: {
        tenantId: orgId,
        module: "comercial",
        operation: { startsWith: "STORE_REPLENISHMENT" },
      },
    });
    console.log("\n--- 5. Transfer Proposals (AgentExecution) ---");
    console.log(`  Count: ${proposals.length}`);
    for (const p of proposals.slice(0, 5)) {
      const meta = p.metadataJson as any;
      console.log(`  - id=${p.id.slice(0, 8)} | status=${p.status} | op=${p.operation} | store=${meta?.storeName ?? "?"}`);
    }
  } catch (e: any) {
    console.log("\n--- 5. Transfer Proposals ---");
    console.log("  Error:", e.message?.slice(0, 120));
  }

  // 6. CommercialCoverageSnapshot — inventory coverage
  try {
    const coverageStats = await (prisma as any).$queryRaw`
      SELECT COUNT(*)::int as total,
             COUNT(DISTINCT "batchId")::int as batches,
             MAX("createdAt")::text as latest_batch
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = ${orgId}
    `;
    console.log("\n--- 6. CommercialCoverageSnapshot ---");
    console.table(coverageStats);

    const sampleSnap = await (prisma as any).$queryRaw`
      SELECT "referenceCode", "onHand", "reorderPoint", "daysOfCover", "coverageStatus"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = ${orgId}
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;
    console.log("  Sample records:");
    console.table(sampleSnap);
  } catch (e: any) {
    console.log("\n--- 6. CommercialCoverageSnapshot ---");
    console.log("  Table does not exist or error:", e.message?.slice(0, 120));
  }

  // 7. SaleRecord by store — sales per store detail
  const salesByStore = await (prisma as any).$queryRaw`
    SELECT "storeSlug",
           COUNT(*)::int as sales,
           SUM(CASE WHEN "saleType" = 'OFICIAL' THEN "amount" ELSE 0 END)::bigint as oficial,
           SUM(CASE WHEN "saleType" = 'REMISION' THEN "amount" ELSE 0 END)::bigint as remision,
           COUNT(DISTINCT "referenceCode")::int as distinct_refs
    FROM "SaleRecord"
    WHERE "organizationId" = ${orgId}
    GROUP BY "storeSlug"
    ORDER BY sales DESC
  `;
  console.log("\n--- 7. Sales by Store ---");
  console.table(salesByStore);

  // 8. Channel × Store matrix
  const channelStore = await (prisma as any).$queryRaw`
    SELECT "channel", "storeSlug", COUNT(*)::int as records
    FROM "SaleRecord"
    WHERE "organizationId" = ${orgId}
    GROUP BY "channel", "storeSlug"
    ORDER BY records DESC
  `;
  console.log("\n--- 8. Channel x Store Matrix ---");
  console.table(channelStore);

  await pool.end();
  console.log("\n=== AUDIT COMPLETE ===");
}

main().catch(console.error);
