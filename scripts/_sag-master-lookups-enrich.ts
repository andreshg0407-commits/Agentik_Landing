/**
 * _sag-master-lookups-enrich.ts
 *
 * SAG-MASTER-LOOKUPS-01 Phases 5+6+8 — Sync master lookups and enrich ProductEntity.
 *
 * Modes:
 *   MODE=dryrun    (default) — fetch lookups, show maps, no writes
 *   MODE=enrich    — fetch lookups + update ProductEntity descriptions with resolved names
 *   MODE=validate  — show top 50 enriched products
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-master-lookups-enrich.ts
 *   MODE=enrich npx dotenv-cli -e .env -- npx tsx scripts/_sag-master-lookups-enrich.ts
 *   MODE=validate npx dotenv-cli -e .env -- npx tsx scripts/_sag-master-lookups-enrich.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const CASTILLITOS_ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const mode = (process.env.MODE ?? "dryrun").toLowerCase();

  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required."));
    process.exit(1);
  }

  const config = { token, endpointUrl, database };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  SAG-MASTER-LOOKUPS-01 — SYNC & ENRICH"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Mode: ${C(mode)}`);
  console.log("");

  // Dynamic import to avoid server-only
  const { syncSagMasterLookups } = await import(
    "../lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-sync"
  );

  // Phase 5: Sync master lookups
  console.log(B("  FASE 5: Syncing master lookups from SAG..."));
  const result = await syncSagMasterLookups(config, { dryRun: mode !== "enrich" });

  console.log("");
  console.log(B("  LOOKUP TABLES:"));
  for (const t of result.tables) {
    const status = t.normalized > 0 ? G("OK") : R("EMPTY");
    console.log(
      `    ${status} ${C(t.tableName.padEnd(14))} ${String(t.totalRows).padStart(5)} rows → ${G(String(t.normalized))} normalized, ${t.errors} errors`
    );
  }

  console.log("");
  console.log(B("  IN-MEMORY MAPS:"));
  console.log(`    Groups:     ${G(String(result.maps.groups.size))}`);
  console.log(`    Subgroups:  ${G(String(result.maps.subgroups.size))}`);
  console.log(`    Lines:      ${G(String(result.maps.lines.size))}`);
  console.log(`    Sizes:      ${G(String(result.maps.sizes.size))}`);
  console.log(`    Colors:     ${G(String(result.maps.colors.size))}`);
  console.log(`    Warehouses: ${G(String(result.maps.warehouses.size))}`);
  console.log(`    Brands:     ${G(String(result.maps.brands.size))}`);
  console.log(`    Duration:   ${B(String(result.durationMs))}ms`);

  // Show all group names
  console.log("");
  console.log(B("  GRUPOS (ID → Name):"));
  for (const [id, entry] of result.maps.groups) {
    console.log(`    ${id.padStart(4)} → ${entry.name}`);
  }

  console.log("");
  console.log(B("  LÍNEAS (ID → Name):"));
  for (const [id, entry] of result.maps.lines) {
    console.log(`    ${id.padStart(4)} → ${entry.name}`);
  }

  console.log("");
  console.log(B("  MARCAS (ID → Name):"));
  for (const [id, entry] of result.maps.brands) {
    console.log(`    ${id.padStart(4)} → ${entry.name}`);
  }

  if (mode === "enrich") {
    await enrichProducts(prisma, result.maps);
  } else if (mode === "validate") {
    await validateProducts(prisma);
  } else {
    console.log("");
    console.log(Y("  Dry run — no DB changes. Run MODE=enrich to update ProductEntity."));
  }

  // Phase 8: Final metrics
  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  MÉTRICAS FINALES"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  GRUPOS SINCRONIZADOS:                ${G(String(result.maps.groups.size))}`);
  console.log(`  SUBGRUPOS SINCRONIZADOS:             ${G(String(result.maps.subgroups.size))}`);
  console.log(`  LÍNEAS SINCRONIZADAS:                ${G(String(result.maps.lines.size))}`);
  console.log(`  TALLAS SINCRONIZADAS:                ${G(String(result.maps.sizes.size))}`);
  console.log(`  COLORES SINCRONIZADOS:               ${G(String(result.maps.colors.size))}`);
  console.log(`  BODEGAS SINCRONIZADAS:               ${G(String(result.maps.warehouses.size))}`);
  console.log(`  MARCAS SINCRONIZADAS:                ${G(String(result.maps.brands.size))}`);

  if (mode === "enrich") {
    const enrichedCount = await (prisma as any).productEntity.count({
      where: {
        organizationId: CASTILLITOS_ORG_ID,
        externalSource: "sag",
        description: { contains: "Grupo:" },
      },
    });
    const totalCount = await (prisma as any).productEntity.count({
      where: { organizationId: CASTILLITOS_ORG_ID, externalSource: "sag" },
    });
    const withoutMaster = totalCount - enrichedCount;

    console.log(`  PRODUCTOS ENRIQUECIDOS:              ${G(String(enrichedCount))}`);
    console.log(`  PRODUCTOS SIN MAESTRO:               ${withoutMaster > 0 ? Y(String(withoutMaster)) : G("0")}`);
    console.log(`  LISTO PARA INVENTARIO:               ${G("SÍ")}`);
  }

  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

// ── Enrich ProductEntity descriptions ───────────────────────────────────────

type LookupMaps = Awaited<ReturnType<typeof import("../lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-sync").syncSagMasterLookups>>["maps"];

async function enrichProducts(prisma: PrismaClient, maps: LookupMaps) {
  console.log("");
  console.log(B("  FASE 6: Enriching ProductEntity descriptions..."));

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: CASTILLITOS_ORG_ID, externalSource: "sag" },
    select: { id: true, category: true, productLine: true, description: true },
  });

  let enriched = 0;
  let skipped = 0;
  const BATCH = 200;

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);

    for (const p of batch as any[]) {
      const groupId = p.category ?? "";
      const lineId = p.productLine ?? "";

      const groupName = maps.groups.get(groupId)?.name ?? null;
      const lineName = maps.lines.get(lineId)?.name ?? null;

      // Parse existing description to preserve non-lookup fields
      const existing = (p.description ?? "") as string;
      const parts = existing.split(" | ").filter((s: string) => s.trim());

      // Remove old Grupo/Línea entries (they had numeric IDs)
      const cleaned = parts.filter(
        (s: string) => !s.startsWith("Grupo:") && !s.startsWith("Línea:")
      );

      // Add resolved names
      if (groupName) cleaned.unshift(`Grupo: ${groupName.trim()}`);
      if (lineName) cleaned.unshift(`Línea: ${lineName.trim()}`);

      // Also look for subgroup
      const subgroupMatch = existing.match(/SubGrupo:\s*(\d+)/);
      if (subgroupMatch) {
        const subgroupName = maps.subgroups.get(subgroupMatch[1])?.name ?? null;
        if (subgroupName) {
          const idx = cleaned.findIndex((s: string) => s.startsWith("SubGrupo:"));
          if (idx >= 0) {
            cleaned[idx] = `SubGrupo: ${subgroupName.trim()}`;
          }
        }
      }

      // Also resolve brand
      const brandMatch = existing.match(/Marca:\s*(\d+)/);
      if (brandMatch) {
        const brandName = maps.brands.get(brandMatch[1])?.name ?? null;
        if (brandName) {
          const idx = cleaned.findIndex((s: string) => s.startsWith("Marca:"));
          if (idx >= 0) {
            cleaned[idx] = `Marca: ${brandName.trim()}`;
          }
        }
      }

      const newDesc = cleaned.join(" | ");

      if (newDesc !== existing) {
        try {
          await (prisma as any).productEntity.update({
            where: { id: p.id },
            data: { description: newDesc },
          });
          enriched++;
        } catch (e) {
          console.error(`  Failed to update ${p.id}: ${(e as Error).message}`);
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    if ((i + BATCH) % 1000 === 0 || i + BATCH >= products.length) {
      process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, products.length)} / ${products.length}`);
    }
  }

  console.log("");
  console.log(G(`  Enriched: ${enriched} products`));
  console.log(`  Skipped (no change): ${skipped}`);
}

// ── Validate enriched products ──────────────────────────────────────────────

async function validateProducts(prisma: PrismaClient) {
  console.log("");
  console.log(B("  FASE 7: Validating enriched products..."));

  const top50 = await (prisma as any).productEntity.findMany({
    where: { organizationId: CASTILLITOS_ORG_ID, externalSource: "sag" },
    select: {
      sku: true, name: true, price: true, category: true,
      productLine: true, description: true, commercialStatus: true,
    },
    orderBy: { price: "desc" },
    take: 50,
  });

  console.log("");
  console.log(B("  TOP 50 — ENRICHED PRODUCTS:"));
  console.log(`  ${"SKU".padEnd(16)} ${"NOMBRE".padEnd(35)} ${"PRECIO".padStart(12)} ${"DESCRIPCIÓN (first 60 chars)"}`);
  console.log(`  ${"─".repeat(16)} ${"─".repeat(35)} ${"─".repeat(12)} ${"─".repeat(60)}`);

  for (const p of top50 as any[]) {
    const price = p.price ? `$${Number(p.price).toLocaleString("es-CO")}` : "—";
    const desc = (p.description ?? "—").slice(0, 60);
    console.log(
      `  ${(p.sku ?? "—").padEnd(16)} ${(p.name ?? "—").slice(0, 33).padEnd(35)} ${price.padStart(12)} ${D(desc)}`
    );
  }

  // Check how many have resolved group names
  const withResolvedGroup = await (prisma as any).productEntity.count({
    where: {
      organizationId: CASTILLITOS_ORG_ID,
      externalSource: "sag",
      description: { contains: "Grupo:" },
    },
  });
  const total = await (prisma as any).productEntity.count({
    where: { organizationId: CASTILLITOS_ORG_ID, externalSource: "sag" },
  });

  console.log("");
  console.log(`  Products with resolved Grupo: ${G(String(withResolvedGroup))} / ${total}`);
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
