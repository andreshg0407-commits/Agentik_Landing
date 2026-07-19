/**
 * _sync-inventory-transfers.ts
 *
 * INVENTORY-F34-TRANSFER-SYNC-01 — Execute F34/TM transfer sync from SAG.
 *
 * Syncs MOVIMIENTOS headers + MOVIMIENTOS_ITEMS lines for fuentes 34 (TR) and 206 (TM).
 * Then backfills warehouse codes on headers from their line items.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sync-inventory-transfers.ts [dryrun|sync]
 */

import { syncInventoryTransfers } from "@/lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { prisma } from "@/lib/prisma";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const mode = (process.argv[2] || "dryrun").toLowerCase();
  if (!["dryrun", "sync"].includes(mode)) {
    console.error(R("Usage: _sync-inventory-transfers.ts [dryrun|sync]"));
    process.exit(1);
  }

  const token = (process.env.PYA_SOAP_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl =
    process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN not configured"));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  INVENTORY-F34-TRANSFER-SYNC-01 — Transfer Sync"));
  console.log(B(`  Mode: ${mode.toUpperCase()}`));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Pre-sync counts
  const db = prisma as any;
  const preCounts = {
    headers: await db.inventoryTransfer.count({ where: { organizationId: ORG } }),
    lines: await db.inventoryTransferLine.count({ where: { organizationId: ORG } }),
  };
  console.log(`  Pre-sync: ${B(String(preCounts.headers))} headers, ${B(String(preCounts.lines))} lines`);
  console.log("");

  // Run sync
  console.log(B("  SYNCING FROM SAG..."));
  const result = await syncInventoryTransfers({
    organizationId: ORG,
    sagConfig: config,
    sagDatabase: database ?? "",
    transferTypes: ["TR", "TM"],
    sinceDate: null, // Full sync
    dryRun: mode === "dryrun",
    batchSize: 500,
  });

  const m = result.metrics;
  console.log("");
  console.log(B("  SYNC RESULT"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Success:            ${result.success ? G("YES") : R("NO")}`);
  console.log(`  Dry run:            ${result.dryRun ? Y("YES") : "NO"}`);
  console.log(`  Duration:           ${B(String(m.durationMs))}ms`);
  console.log("");
  console.log(`  Headers read:       ${B(String(m.transfersRead))}`);
  console.log(`  Headers created:    ${G(String(m.transfersCreated))}`);
  console.log(`  Headers updated:    ${Y(String(m.transfersUpdated))}`);
  console.log(`  Headers skipped:    ${String(m.transfersSkipped)}`);
  console.log("");
  console.log(`  Lines read:         ${B(String(m.linesRead))}`);
  console.log(`  Lines created:      ${G(String(m.linesCreated))}`);
  console.log(`  Lines updated:      ${Y(String(m.linesUpdated))}`);
  console.log(`  Lines skipped:      ${String(m.linesSkipped)}`);
  console.log("");

  if (m.errors.length > 0) {
    console.log(R(`  Errors: ${m.errors.length}`));
    for (const e of m.errors.slice(0, 10)) {
      console.log(R(`    ${e.erpMovId ?? ""} ${e.documentNumber ?? ""}: ${e.message}`));
    }
    console.log("");
  }

  if (mode === "dryrun") {
    console.log(Y("  DRY RUN — no data written. Use 'sync' to persist."));
    console.log("");
    await prisma.$disconnect();
    return;
  }

  // Post-sync counts
  const postCounts = {
    headers: await db.inventoryTransfer.count({ where: { organizationId: ORG } }),
    lines: await db.inventoryTransferLine.count({ where: { organizationId: ORG } }),
  };
  console.log(`  Post-sync: ${B(String(postCounts.headers))} headers, ${B(String(postCounts.lines))} lines`);
  console.log("");

  // Phase: Backfill warehouse codes from lines to headers
  console.log(B("  BACKFILLING WAREHOUSE CODES FROM LINES..."));
  const backfillResult = await backfillWarehouseCodes(db, ORG);
  console.log(`  Headers updated with warehouse codes: ${G(String(backfillResult))}`);
  console.log("");

  // Final validation
  console.log(B("  POST-SYNC VALIDATION"));
  console.log(B("═══════════════════════════════════════════════════════════════"));

  const byType: Array<{ transferType: string; status: string; cnt: number }> =
    await db.$queryRawUnsafe(
      `SELECT "transferType", "status", COUNT(*)::int as cnt
       FROM "InventoryTransfer" WHERE "organizationId" = $1
       GROUP BY "transferType", "status"
       ORDER BY "transferType", "status"`,
      ORG,
    );
  for (const r of byType) {
    console.log(`  ${r.transferType}/${r.status}: ${B(String(r.cnt))}`);
  }

  console.log("");
  const routes: Array<{
    origin: string | null;
    dest: string | null;
    transfer_type: string;
    cnt: number;
  }> = await db.$queryRawUnsafe(
    `SELECT "originWarehouseCode" as origin,
            "destinationWarehouseCode" as dest,
            "transferType" as transfer_type,
            COUNT(*)::int as cnt
     FROM "InventoryTransfer" WHERE "organizationId" = $1
       AND "originWarehouseCode" IS NOT NULL
     GROUP BY "originWarehouseCode", "destinationWarehouseCode", "transferType"
     ORDER BY cnt DESC LIMIT 15`,
    ORG,
  );
  console.log("  Top routes (with warehouse codes):");
  for (const r of routes) {
    console.log(`    B${r.origin ?? "?"}→B${r.dest ?? "?"} (${r.transfer_type}): ${r.cnt}`);
  }

  console.log("");
  await prisma.$disconnect();
}

/**
 * Backfill originWarehouseCode and destinationWarehouseCode on headers
 * from their line items' rawJson.
 *
 * MOVIMIENTOS header doesn't have ka_nl_bodega — it's on MOVIMIENTOS_ITEMS.
 * We take the most common origin and destination from lines.
 */
async function backfillWarehouseCodes(db: any, orgId: string): Promise<number> {
  // Find headers with NULL origin that have lines
  const headersToFix: Array<{ id: string; erpMovId: number }> =
    await db.$queryRawUnsafe(
      `SELECT it.id, it."erpMovId"
       FROM "InventoryTransfer" it
       WHERE it."organizationId" = $1
         AND (it."originWarehouseCode" IS NULL OR it."destinationWarehouseCode" IS NULL)
         AND EXISTS (
           SELECT 1 FROM "InventoryTransferLine" itl
           WHERE itl."inventoryTransferId" = it.id
         )`,
      orgId,
    );

  if (headersToFix.length === 0) return 0;

  let updated = 0;
  for (const header of headersToFix) {
    // Get warehouse codes from line rawJson
    const lineData: Array<{ raw: Record<string, unknown> }> =
      await db.$queryRawUnsafe(
        `SELECT "rawJson" as raw FROM "InventoryTransferLine"
         WHERE "inventoryTransferId" = $1 LIMIT 20`,
        header.id,
      );

    if (lineData.length === 0) continue;

    // Extract origin (ka_nl_bodega) and destination (ka_nl_bodega_destino_wms) from lines
    const origins: string[] = [];
    const dests: string[] = [];
    for (const line of lineData) {
      const raw = line.raw;
      const origin = raw?.ka_nl_bodega;
      const dest = raw?.ka_nl_bodega_destino_wms;
      if (origin != null && String(origin).trim()) origins.push(String(origin).trim());
      if (dest != null && String(dest).trim()) dests.push(String(dest).trim());
    }

    const mostFrequent = (arr: string[]): string | null => {
      if (arr.length === 0) return null;
      const freq = new Map<string, number>();
      for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
      let best = arr[0];
      let bestCount = 0;
      for (const [k, c] of freq) {
        if (c > bestCount) { best = k; bestCount = c; }
      }
      return best;
    };

    const originCode = mostFrequent(origins);
    const destCode = mostFrequent(dests);

    if (originCode || destCode) {
      await db.$executeRawUnsafe(
        `UPDATE "InventoryTransfer"
         SET "originWarehouseCode" = COALESCE($2, "originWarehouseCode"),
             "destinationWarehouseCode" = COALESCE($3, "destinationWarehouseCode"),
             "updatedAt" = NOW()
         WHERE id = $1`,
        header.id,
        originCode,
        destCode,
      );
      updated++;
    }
  }

  return updated;
}

main().catch((e) => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
