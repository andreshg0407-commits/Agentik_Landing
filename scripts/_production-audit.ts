/**
 * scripts/_production-audit.ts
 * READ-ONLY audit: production suggestion data for MALETAS-SUGERENCIAS-PRODUCCION-REAL-SAG-01
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

  // 1. Coverage snapshot: stock by subgrupo
  interface CoverageAgg { subgrupoSag: string; line: string; totalDisponible: bigint; refCount: bigint }
  const coverageAgg: CoverageAgg[] = await prisma.$queryRawUnsafe(`
    WITH latest AS (
      SELECT DISTINCT ON ("refCode")
        "refCode", line, disponible, "subgrupoId", "subgrupoSag"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
      ORDER BY "refCode", "snapshotAt" DESC
    )
    SELECT "subgrupoSag", line,
           SUM(GREATEST(disponible, 0))::bigint AS "totalDisponible",
           COUNT(*)::bigint AS "refCount"
    FROM latest
    WHERE "subgrupoSag" IS NOT NULL
    GROUP BY "subgrupoSag", line
    ORDER BY line, "subgrupoSag"
  `, org.id);

  console.log("\n=== COVERAGE STOCK BY SUBGRUPO (bodega principal) ===");
  console.log("line | subgrupoSag | totalDisponible | refCount");
  for (const r of coverageAgg) {
    console.log(`${r.line} | ${r.subgrupoSag} | ${r.totalDisponible} | ${r.refCount}`);
  }

  // 2. Check if subgrupoId is populated and can resolve grupo
  interface SubgrupoIdCheck { subgrupoId: number; subgrupoSag: string; line: string; cnt: bigint }
  const subgrupoIds: SubgrupoIdCheck[] = await prisma.$queryRawUnsafe(`
    WITH latest AS (
      SELECT DISTINCT ON ("refCode")
        "refCode", line, "subgrupoId", "subgrupoSag"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
      ORDER BY "refCode", "snapshotAt" DESC
    )
    SELECT "subgrupoId", "subgrupoSag", line, COUNT(*)::bigint AS cnt
    FROM latest
    WHERE "subgrupoId" IS NOT NULL
    GROUP BY "subgrupoId", "subgrupoSag", line
    ORDER BY line, "subgrupoSag"
  `, org.id);

  console.log("\n=== SUBGRUPO IDS (for grupo resolution) ===");
  console.log("subgrupoId | subgrupoSag | line | refCount");
  for (const r of subgrupoIds) {
    console.log(`${r.subgrupoId} | ${r.subgrupoSag} | ${r.line} | ${r.cnt}`);
  }

  // 3. Check ProductEntity for grupo resolution
  interface GrupoResolution { subgrupoSag: string; grupo: string; brand: string; cnt: bigint }
  const grupoData: GrupoResolution[] = await prisma.$queryRawUnsafe(`
    SELECT
      pe."sagSubgroupName" AS "subgrupoSag",
      pe."sagGroupName" AS grupo,
      CASE pe."productLine"
        WHEN '1' THEN 'Latin Kids'
        WHEN '2' THEN 'Castillitos'
        ELSE 'Other'
      END AS brand,
      COUNT(*)::bigint AS cnt
    FROM "ProductEntity" pe
    WHERE pe."organizationId" = $1
      AND pe."sagSubgroupName" IS NOT NULL
      AND pe."productLine" IN ('1', '2')
    GROUP BY pe."sagSubgroupName", pe."sagGroupName", pe."productLine"
    ORDER BY brand, grupo, "subgrupoSag"
  `, org.id);

  console.log("\n=== GRUPO RESOLUTION FROM ProductEntity ===");
  console.log("brand | grupo | subgrupoSag | refCount");
  for (const r of grupoData) {
    console.log(`${r.brand} | ${r.grupo} | ${r.subgrupoSag} | ${r.cnt}`);
  }

  // 4. Active production orders (OP)
  interface OpCheck { status: string; cnt: bigint }
  const opData: OpCheck[] = await prisma.$queryRawUnsafe(`
    SELECT status, COUNT(*)::bigint AS cnt
    FROM "ProductionOrder"
    WHERE "organizationId" = $1
    GROUP BY status
    ORDER BY cnt DESC
  `, org.id);

  console.log("\n=== PRODUCTION ORDERS BY STATUS ===");
  for (const r of opData) {
    console.log(`${r.status}: ${r.cnt}`);
  }

  // 5. Active OP lines by subgrupo
  interface OpLineCheck { subgrupoSag: string; opCount: bigint; totalQty: bigint }
  const opLines: OpLineCheck[] = await prisma.$queryRawUnsafe(`
    SELECT
      pe."sagSubgroupName" AS "subgrupoSag",
      COUNT(DISTINCT po.id)::bigint AS "opCount",
      SUM(pol.quantity)::bigint AS "totalQty"
    FROM "ProductionOrder" po
    JOIN "ProductionOrderLine" pol ON pol."orderId" = po.id
    LEFT JOIN "ProductEntity" pe ON pe.sku = pol."referenceCode" AND pe."organizationId" = po."organizationId"
    WHERE po."organizationId" = $1
      AND po.status NOT IN ('cerrada', 'cancelada', 'terminada', 'anulada', 'CERRADA', 'CANCELADA', 'TERMINADA', 'ANULADA')
    GROUP BY pe."sagSubgroupName"
    ORDER BY "subgrupoSag"
  `, org.id);

  console.log("\n=== ACTIVE OP BY SUBGRUPO ===");
  console.log("subgrupoSag | opCount | totalQty");
  for (const r of opLines) {
    console.log(`${r.subgrupoSag} | ${r.opCount} | ${r.totalQty}`);
  }

  // 6. What warehouses does CommercialCoverageSnapshot represent?
  console.log("\n=== COVERAGE SNAPSHOT NOTES ===");
  console.log("CommercialCoverageSnapshot.disponible represents main warehouse (B01+B04) stock.");
  console.log("It is built by the SAG sync process from sag-pya-soap adapter.");

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
