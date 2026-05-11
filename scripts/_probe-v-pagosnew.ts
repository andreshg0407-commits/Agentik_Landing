/**
 * _probe-v-pagosnew.ts
 * Discover real column names in v_pagosnew via INFORMATION_SCHEMA and a sample row.
 */

import "@/lib/connectors/adapters";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { prisma }          from "@/lib/prisma";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function getConfig(): Promise<PyaApiConfig> {
  const connector = await prisma.connector.findUniqueOrThrow({
    where: { id: "cmnhu4hky0000n4y50jlhkfib" },
  });
  const cfg = connector.config as Record<string, string>;
  return {
    endpointUrl: cfg.endpointUrl ?? "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    token:       cfg.token,
    database:    cfg.database,
  };
}

async function run(label: string, query: string, cfg: PyaApiConfig) {
  console.log(`\n[${label}]`);
  console.log(`  query: ${query.slice(0, 120)}…`);
  try {
    const rows = await consultaSagJson(cfg, query);
    if (rows.length === 0) {
      console.log("  → (no rows)");
    } else {
      console.log(`  → ${rows.length} rows. First row keys:`);
      console.log("  ", Object.keys(rows[0]).join(", "));
      if (rows.length <= 3) {
        for (const r of rows) console.log("  ", JSON.stringify(r));
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }
}

async function main() {
  const cfg = await getConfig();

  // 1. INFORMATION_SCHEMA for v_pagosnew columns
  await run(
    "COLUMNS",
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'v_pagosnew' ORDER BY ORDINAL_POSITION",
    cfg
  );

  // 2. TOP 1 * to see actual data
  await run(
    "TOP1_STAR",
    "SELECT TOP 1 * FROM v_pagosnew",
    cfg
  );

  // 3. Try with just the two known-good columns + R1 filter
  await run(
    "TOP3_SAFE",
    "SELECT TOP 3 Codigo_Fuente_Comprobante, Valor_Pagado FROM v_pagosnew WHERE Codigo_Fuente_Comprobante IN ('R1','R2','RS') AND Valor_Pagado > 0",
    cfg
  );
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
