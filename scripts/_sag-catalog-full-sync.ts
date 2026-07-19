/**
 * _sag-catalog-full-sync.ts
 *
 * SAG-CATALOG-FULL-SYNC-03 Phases 3+6+7+8 — Definitive commercial catalog sync.
 *
 * Modes:
 *   MODE=dryrun   (default) — fetch, filter, report, no writes
 *   MODE=sync     — full commercial sync with ConnectorRun audit
 *   MODE=validate — show top 50 synced products for visual verification
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-full-sync.ts
 *   MODE=sync npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-full-sync.ts
 *   MODE=validate npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-full-sync.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

const CASTILLITOS_ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const mode = (process.env.MODE ?? "dryrun").toLowerCase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  console.log("");
  console.log(B("  SAG-CATALOG-FULL-SYNC-03 — SYNC COMERCIAL DEFINITIVO"));
  console.log(`  Mode: ${C(mode)}`);
  console.log("");

  if (mode === "validate") {
    await runValidation(prisma);
  } else {
    await runSync(prisma, mode === "sync");
  }

  await prisma.$disconnect();
  pool.end();
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function runSync(prisma: PrismaClient, persist: boolean) {
  const orgId = CASTILLITOS_ORG_ID;

  // Dynamic import to avoid server-only at module level
  const { syncSagArticlesToProductEntity } = await import(
    "../lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync"
  );

  // Resolve SAG config (same pattern as _sag-catalog-forensics.ts)
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("  FATAL: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required"));
    process.exit(1);
  }

  const config = { token, endpointUrl, database };

  console.log(`  SAG endpoint: ${C(endpointUrl)}`);
  console.log(`  Org: ${C(orgId)}`);
  console.log(`  Persist: ${persist ? G("YES") : Y("NO (dry run)")}`);
  console.log("");

  // Pre-sync: check existing products
  const existingCount = await (prisma as any).productEntity.count({
    where: { organizationId: orgId, externalSource: "sag" },
  });
  console.log(`  Existing SAG products in DB: ${B(String(existingCount))}`);

  // Run sync
  const t0 = Date.now();
  const result = await syncSagArticlesToProductEntity(orgId, config, {
    dryRun: !persist,
  });
  const elapsed = Date.now() - t0;

  // Report
  console.log("");
  console.log(B("  ═══════════════════════════════════════════════════════════"));
  console.log(B("  RESULTADO SYNC"));
  console.log(B("  ═══════════════════════════════════════════════════════════"));
  console.log(`  Status:               ${result.status === "success" ? G(result.status) : Y(result.status)}`);
  console.log(`  SAG rows read:        ${B(String(result.totalRows))}`);
  console.log(`  Valid (normalized):    ${B(String(result.validRows + (result.excluded ?? 0)))}`);
  console.log(`  Commercial (filtered): ${G(String(result.validRows))}`);
  console.log(`  Excluded (non-comm):  ${Y(String(result.excluded ?? 0))}`);
  console.log(`  Invalid (errors):     ${result.invalidRows > 0 ? R(String(result.invalidRows)) : String(result.invalidRows)}`);
  console.log(`  Created:              ${G(String(result.created))}`);
  console.log(`  Updated:              ${C(String(result.updated))}`);
  console.log(`  Skipped (no change):  ${String(result.skipped)}`);
  console.log(`  Duration:             ${B(String(elapsed))}ms`);
  console.log(`  Dry run:              ${result.dryRun ? Y("YES") : G("NO")}`);
  console.log(B("  ═══════════════════════════════════════════════════════════"));

  if (result.validationErrors.length > 0) {
    console.log("");
    console.log(R(`  Validation errors (${result.validationErrors.length}):`));
    for (const e of result.validationErrors.slice(0, 10)) {
      console.log(`    Row ${e.rowIndex}: ${e.codigo ?? "—"} → ${e.reason}`);
    }
  }

  if (result.error) {
    console.log(R(`  Error: ${result.error}`));
  }

  // Phase 6: ConnectorRun audit (only on real sync)
  if (persist && result.status !== "error") {
    try {
      const connector = await (prisma as any).connector.findFirst({
        where: { organizationId: orgId, source: "sag_pya" },
        select: { id: true },
      });

      if (connector) {
        await (prisma as any).connectorRun.create({
          data: {
            connectorId: connector.id,
            status: result.status === "success" ? "SUCCESS" : result.status === "partial" ? "PARTIAL" : "FAILED",
            module: "articles",
            recordsRead: result.totalRows,
            recordsWritten: result.created + result.updated,
            recordsSkipped: result.skipped + (result.excluded ?? 0),
            recordsFailed: result.invalidRows,
            meta: {
              sprint: "SAG-CATALOG-FULL-SYNC-03",
              commercial: result.validRows,
              excluded: result.excluded ?? 0,
              created: result.created,
              updated: result.updated,
              durationMs: elapsed,
            },
          },
        });
        console.log(G("\n  ConnectorRun audit record created."));
      } else {
        console.log(Y("\n  No sag_pya Connector found — ConnectorRun audit skipped."));
      }
    } catch (e) {
      console.log(Y(`\n  ConnectorRun audit failed: ${(e as Error).message}`));
    }
  }

  // Post-sync count
  if (persist) {
    const postCount = await (prisma as any).productEntity.count({
      where: { organizationId: orgId, externalSource: "sag" },
    });
    console.log(`\n  Post-sync SAG products in DB: ${G(String(postCount))}`);
  }

  console.log("");
}

// ── Validation ────────────────────────────────────────────────────────────────

async function runValidation(prisma: PrismaClient) {
  const orgId = CASTILLITOS_ORG_ID;

  const total = await (prisma as any).productEntity.count({
    where: { organizationId: orgId, externalSource: "sag" },
  });

  console.log(`  Total SAG products in DB: ${B(String(total))}`);

  if (total === 0) {
    console.log(Y("  No products to validate. Run MODE=sync first."));
    console.log("");
    return;
  }

  // Stats
  const active = await (prisma as any).productEntity.count({
    where: { organizationId: orgId, externalSource: "sag", commercialStatus: "active" },
  });
  const withPrice = await (prisma as any).productEntity.count({
    where: { organizationId: orgId, externalSource: "sag", price: { not: null, gt: 0 } },
  });
  const withSku = await (prisma as any).productEntity.count({
    where: { organizationId: orgId, externalSource: "sag", sku: { not: null } },
  });

  console.log(`  Active:               ${G(String(active))}`);
  console.log(`  With price > 0:       ${G(String(withPrice))}`);
  console.log(`  With SKU:             ${G(String(withSku))}`);
  console.log("");

  // Top 50 by price
  const top50 = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, externalSource: "sag" },
    select: { sku: true, name: true, price: true, category: true, productLine: true, description: true, commercialStatus: true },
    orderBy: { price: "desc" },
    take: 50,
  });

  console.log(B("  TOP 50 PRODUCTOS POR PRECIO:"));
  console.log(`  ${"SKU".padEnd(18)} ${"NOMBRE".padEnd(40)} ${"PRECIO".padStart(12)} ${"GRUPO".padEnd(6)} ${"LÍNEA".padEnd(6)} STATUS`);
  console.log(`  ${"─".repeat(18)} ${"─".repeat(40)} ${"─".repeat(12)} ${"─".repeat(6)} ${"─".repeat(6)} ${"─".repeat(12)}`);

  for (const p of top50 as any[]) {
    const price = p.price ? `$${Number(p.price).toLocaleString("es-CO")}` : "—";
    console.log(
      `  ${(p.sku ?? "—").padEnd(18)} ${(p.name ?? "—").slice(0, 38).padEnd(40)} ${price.padStart(12)} ${(p.category ?? "—").padEnd(6)} ${(p.productLine ?? "—").padEnd(6)} ${p.commercialStatus ?? "—"}`
    );
  }

  // Variant readiness
  const withVariants = await (prisma as any).productEntity.count({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      description: { contains: "Talla/Color: Sí" },
    },
  });

  console.log("");
  console.log(B("  VARIANT READINESS:"));
  console.log(`  Products with Talla/Color metadata: ${G(String(withVariants))} / ${total}`);
  console.log(`  Ready for SAG-VARIANTS-01:          ${withVariants > 0 ? G("YES") : Y("NO")}`);

  // Final metrics
  console.log("");
  console.log(B("  ═══════════════════════════════════════════════════════════"));
  console.log(B("  MÉTRICAS FINALES"));
  console.log(B("  ═══════════════════════════════════════════════════════════"));
  console.log(`  Total productos comerciales:  ${G(String(total))}`);
  console.log(`  Activos:                      ${G(String(active))}`);
  console.log(`  Con precio > 0:               ${G(String(withPrice))}`);
  console.log(`  Con SKU:                      ${G(String(withSku))}`);
  console.log(`  Con metadata variantes:       ${G(String(withVariants))}`);
  console.log(`  Listos para inventario:       ${withPrice > 0 ? G("SÍ") : R("NO")}`);
  console.log(B("  ═══════════════════════════════════════════════════════════"));
  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
