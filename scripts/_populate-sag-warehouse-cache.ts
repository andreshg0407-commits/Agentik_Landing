/**
 * scripts/_populate-sag-warehouse-cache.ts
 *
 * Fetch SAG BODEGAS via SOAP and persist the lookup cache.
 * This enables the tiendas module to resolve warehouse names at read time.
 *
 * Usage: npx tsx scripts/_populate-sag-warehouse-cache.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const sagConfig: PyaApiConfig = {
  endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
  token: process.env.PYA_SOAP_TOKEN?.trim() || process.env.SAG_TEST_TOKEN?.trim() || "",
  database: process.env.PYA_SAG_BD,
};

async function main() {
  console.log("\n=== POPULATE SAG WAREHOUSE CACHE ===\n");

  if (!sagConfig.token) {
    console.log("ERROR: No SAG token. Set PYA_SOAP_TOKEN or SAG_TEST_TOKEN in .env");
    return;
  }

  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org found"); return; }
  const orgId = org.id;

  // 1. Fetch BODEGAS from SAG
  console.log("Fetching BODEGAS from SAG...");
  const rows = await consultaSagJson(sagConfig, "SELECT * FROM BODEGAS");
  console.log(`  Got ${rows.length} warehouses\n`);

  // 2. Build entries
  const entries = rows.map((r: Record<string, unknown>) => ({
    warehouseId: String(Number(r.ka_nl_bodega ?? 0)),
    code:        String(r.ss_codigo ?? "").trim(),
    name:        String(r.ss_nombre ?? "").trim(),
    active:      r.sc_activo === "S" || r.sc_activo === "s",
  }));

  // 3. Persist using AgentExecution (same pattern as store-warehouse-config-service)
  const MODULE    = "comercial";
  const OPERATION = "SAG_WAREHOUSE_LOOKUP_CACHE";
  const now = new Date().toISOString();
  const metadataJson = {
    warehouses: entries,
    cachedAt:   now,
    count:      entries.length,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execDb = (prisma as any).agentExecution;

  const existing = await execDb.findFirst({
    where: { tenantId: orgId, module: MODULE, operation: OPERATION },
    select: { id: true },
  });

  if (existing) {
    await execDb.update({
      where: { id: existing.id },
      data:  { metadataJson },
    });
    console.log(`Updated existing cache record (id=${existing.id})`);
  } else {
    const created = await execDb.create({
      data: {
        tenantId:     orgId,
        module:       MODULE,
        operation:    OPERATION,
        status:       "completed",
        createdBy:    "system",
        intent:       "SAG BODEGAS lookup cache",
        metadataJson,
      },
    });
    console.log(`Created new cache record (id=${created.id})`);
  }

  // 4. Verify
  console.log("\nCached warehouses:");
  for (const e of entries) {
    const active = e.active ? "ACTIVE" : "INACTIVE";
    console.log(`  ${e.warehouseId.padStart(3)} (${e.code.padEnd(3)}) = ${e.name.padEnd(24)} [${active}]`);
  }

  await pool.end();
  console.log(`\n=== DONE — ${entries.length} warehouses cached ===`);
}

main().catch(console.error);
