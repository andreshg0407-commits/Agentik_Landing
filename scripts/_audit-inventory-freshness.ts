import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any) as any;

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FATAL: org not found"); return; }
  const orgId = org.id;

  // ConnectorRun
  const runs = await prisma.$queryRawUnsafe(`
    SELECT "id", "connectorId", "source", "module", "status",
           "startedAt", "finishedAt", "rowsImported"
    FROM "ConnectorRun"
    WHERE "organizationId" = $1
    ORDER BY "startedAt" DESC
    LIMIT 15
  `, orgId);
  console.log("=== ConnectorRuns (latest 15) ===");
  for (const r of runs as any[]) {
    console.log(`  ${(r.id as string)?.slice(0,8)} src=${r.source} mod=${r.module} status=${r.status} started=${r.startedAt} finished=${r.finishedAt} imported=${r.rowsImported}`);
  }

  // IntegrationConnection
  const ic = await prisma.$queryRawUnsafe(`
    SELECT "id", "provider", "status", "health", "updatedAt"
    FROM "IntegrationConnection"
    WHERE "organizationId" = $1
    ORDER BY "updatedAt" DESC
    LIMIT 5
  `, orgId);
  console.log("\n=== IntegrationConnections ===");
  for (const r of ic as any[]) {
    console.log(`  ${(r.id as string)?.slice(0,8)} provider=${r.provider} status=${r.status} health=${r.health} updated=${r.updatedAt}`);
  }

  // Summary
  console.log("\n=== FRESHNESS SUMMARY ===");
  const pilMax = await prisma.$queryRaw`SELECT MAX("syncedAt") AS d FROM "ProductInventoryLevel" WHERE "organizationId" = ${orgId}` as any[];
  const ccsMax = await prisma.$queryRaw`SELECT MAX("snapshotAt") AS d FROM "CommercialCoverageSnapshot" WHERE "organizationId" = ${orgId}` as any[];
  console.log("PIl max syncedAt:  ", pilMax[0]?.d);
  console.log("CCS max snapshotAt:", ccsMax[0]?.d);
  console.log("Today:             ", new Date().toISOString());

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
