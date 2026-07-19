/**
 * _sag-inventory-sync.ts
 *
 * SAG-INVENTORY-SYNC-01 — Phase 6: Initial inventory load for Castillitos.
 *
 * Modes:
 *   dryrun   — fetch + normalize only, no DB writes
 *   sync     — full sync: ProductVariant + ProductInventoryLevel upsert
 *   validate — show 20 products with variant+warehouse detail
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-inventory-sync.ts [dryrun|sync|validate]
 *
 * Requires NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs"
 */

import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { syncSagInventory } from "@/lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync";
import { getInventoryByProduct } from "@/lib/comercial/inventory/inventory-read-service";
import { computeInventoryCoverage } from "@/lib/comercial/inventory/inventory-coverage";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const CASTILLITOS_ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const mode = (process.argv[2] || "dryrun").toLowerCase();
  if (!["dryrun", "sync", "validate"].includes(mode)) {
    console.error(R("Usage: _sag-inventory-sync.ts [dryrun|sync|validate]"));
    process.exit(1);
  }

  const token = (process.env.PYA_SOAP_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B(`  SAG-INVENTORY-SYNC-01 — MODE: ${mode.toUpperCase()}`));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  if (mode === "validate") {
    await runValidation(CASTILLITOS_ORG_ID);
    return;
  }

  const dryRun = mode === "dryrun";
  const result = await syncSagInventory(CASTILLITOS_ORG_ID, config, { dryRun });

  console.log("");
  console.log(B("  RESULTADO DE SINCRONIZACIÓN"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Estado:                    ${result.status === "success" ? G(result.status) : result.status === "error" ? R(result.status) : Y(result.status)}`);
  console.log(`  Productos procesados:      ${B(String(result.productsProcessed))}`);
  console.log(`  Productos no encontrados:  ${result.productsNotFound > 0 ? Y(String(result.productsNotFound)) : G("0")}`);
  console.log(`  Variantes creadas:         ${G(String(result.variantsCreated))}`);
  console.log(`  Variantes actualizadas:    ${B(String(result.variantsUpdated))}`);
  console.log(`  Niveles creados:           ${G(String(result.levelsCreated))}`);
  console.log(`  Niveles actualizados:      ${B(String(result.levelsUpdated))}`);
  console.log(`  Niveles en cero:           ${result.levelsZeroed > 0 ? Y(String(result.levelsZeroed)) : "0"}`);
  console.log(`  Bodegas sincronizadas:     ${B(String(result.warehousesSynced))}`);
  console.log(`  Errores:                   ${result.errors > 0 ? R(String(result.errors)) : G("0")}`);
  console.log(`  Duración:                  ${B(String(result.durationMs))} ms`);
  console.log(`  Dry Run:                   ${result.dryRun ? Y("SÍ") : G("NO")}`);
  if (result.error) console.log(`  Error:                     ${R(result.error)}`);
  console.log("");

  // After real sync, show coverage
  if (!dryRun && result.status !== "error") {
    const coverage = await computeInventoryCoverage(CASTILLITOS_ORG_ID);
    console.log(B("  COBERTURA COMERCIAL"));
    console.log(B("═══════════════════════════════════════════════════════════════"));
    console.log(`  Productos con stock:       ${G(String(coverage.productsWithStock))} / ${coverage.productsTotal}`);
    console.log(`  Productos agotados:        ${coverage.productsOutOfStock > 0 ? R(String(coverage.productsOutOfStock)) : G("0")}`);
    console.log(`  Variantes con stock:       ${G(String(coverage.variantsInStock))} / ${coverage.variantsTotal}`);
    console.log(`  Variantes agotadas:        ${coverage.variantsOutOfStock > 0 ? Y(String(coverage.variantsOutOfStock)) : G("0")}`);
    console.log(`  Bodegas con stock:         ${G(String(coverage.warehousesWithStock))} / ${coverage.warehousesTotal}`);
    console.log(`  Registros snapshot:        ${B(String(coverage.snapshotRecords))}`);
    console.log(`  Cobertura comercial:       ${G((coverage.coverageRatio * 100).toFixed(1) + "%")}`);
    console.log("");
  }
}

async function runValidation(orgId: string) {
  console.log(B("  VALIDACIÓN — 20 productos con inventario por variante"));
  console.log("");

  // Get 20 products with inventory
  const { prisma } = await import("@/lib/prisma");

  const products = await (prisma as any).productEntity.findMany({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      commercialStatus: "active",
    },
    select: { id: true, externalId: true, name: true, price: true },
    orderBy: { price: "desc" },
    take: 20,
  });

  for (const prod of products) {
    const snapshot = await getInventoryByProduct(orgId, prod.id);
    if (!snapshot) {
      console.log(`  ${Y(prod.externalId?.padEnd(15) ?? "?")}  ${prod.name?.slice(0, 40)}  ${Y("Sin inventario")}`);
      continue;
    }

    console.log(B(`  ┌─ ${prod.externalId}  ${prod.name?.slice(0, 40)}  $${Number(prod.price || 0).toLocaleString("es-CO")}`));
    console.log(`  │  Total disponible: ${G(String(snapshot.totalAvailable))}  Variantes: ${snapshot.variantsInStock}/${snapshot.variantsTotal}`);

    if (snapshot.variants.length > 0) {
      console.log(`  │  ${"Talla".padEnd(10)} ${"Color".padEnd(16)} ${"Total".padStart(6)} ${"Bodegas"}`);
      console.log(`  │  ${"─".repeat(10)} ${"─".repeat(16)} ${"─".repeat(6)} ${"─".repeat(40)}`);

      for (const v of snapshot.variants.slice(0, 8)) {
        const totalStr = v.totalAvailable > 0
          ? G(String(v.totalAvailable).padStart(6))
          : v.totalAvailable < 0
            ? R(String(v.totalAvailable).padStart(6))
            : Y("0".padStart(6));
        const bodegaStr = v.warehouses
          .map(w => `${w.warehouseName.slice(0, 12)}:${w.available}`)
          .join(", ");
        console.log(`  │  ${v.sizeCode.padEnd(10)} ${v.colorName.slice(0, 14).padEnd(16)} ${totalStr} ${D(bodegaStr.slice(0, 55))}`);
      }
      if (snapshot.variants.length > 8) {
        console.log(`  │  ${D(`... +${snapshot.variants.length - 8} variantes más`)}`);
      }
    }
    console.log(`  └──`);
    console.log("");
  }

  // Coverage
  const coverage = await (await import("@/lib/comercial/inventory/inventory-coverage")).computeInventoryCoverage(orgId);
  console.log(B("  COBERTURA COMERCIAL"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Productos con stock:       ${G(String(coverage.productsWithStock))} / ${coverage.productsTotal}`);
  console.log(`  Productos agotados:        ${coverage.productsOutOfStock > 0 ? R(String(coverage.productsOutOfStock)) : G("0")}`);
  console.log(`  Variantes con stock:       ${G(String(coverage.variantsInStock))} / ${coverage.variantsTotal}`);
  console.log(`  Variantes agotadas:        ${coverage.variantsOutOfStock > 0 ? Y(String(coverage.variantsOutOfStock)) : G("0")}`);
  console.log(`  Bodegas con stock:         ${G(String(coverage.warehousesWithStock))} / ${coverage.warehousesTotal}`);
  console.log(`  Registros snapshot:        ${B(String(coverage.snapshotRecords))}`);
  console.log(`  Cobertura comercial:       ${G((coverage.coverageRatio * 100).toFixed(1) + "%")}`);
  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
