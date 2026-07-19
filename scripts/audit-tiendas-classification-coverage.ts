/**
 * scripts/audit-tiendas-classification-coverage.ts
 *
 * FASE 14 — Classification coverage metrics for TIENDAS-ADAPTER-REAL-DATA-01
 *
 * Measures how many PIL records have real classification data after
 * switching from heuristic inference to ProductEntity.subgrupoSag/productLine.
 *
 * Usage: npx tsx scripts/audit-tiendas-classification-coverage.ts
 *
 * Read-only. No mutations.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== TIENDAS Classification Coverage Audit ===\n");

  const orgSlug = "castillitos";
  const org = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    console.log("Organization not found:", orgSlug);
    return;
  }
  const orgId = org.id;

  // Total PIL records
  const totalPil = await (prisma as any).productInventoryLevel.count({
    where: { organizationId: orgId },
  });
  console.log(`Total ProductInventoryLevel records: ${totalPil}\n`);

  // PIL with product join
  const pilWithProduct = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      product: {
        select: {
          subgrupoSag: true,
          productLine: true,
        },
      },
      variant: {
        select: {
          variantAttributes: {
            select: { key: true, value: true },
          },
        },
      },
    },
  });

  let withSubgrupo = 0;
  let withLine = 0;
  let withTalla = 0;
  let withColor = 0;
  let withBoth = 0;
  let withNone = 0;
  let tallaGen = 0;
  let colorGenerico = 0;

  const subgrupoDistinct = new Set<string>();
  const lineDistinct = new Set<string>();

  for (const pil of pilWithProduct) {
    const subgrupo = pil.product?.subgrupoSag;
    const line = pil.product?.productLine;
    const attrs = pil.variant?.variantAttributes ?? [];
    const talla = attrs.find((a: { key: string }) => a.key === "talla")?.value?.trim() ?? "";
    const color = attrs.find((a: { key: string }) => a.key === "color")?.value?.trim() ?? "";

    const hasSubgrupo = !!subgrupo;
    const hasLine = !!line;
    const hasTalla = !!talla;
    const hasColor = !!color;

    if (hasSubgrupo) { withSubgrupo++; subgrupoDistinct.add(subgrupo); }
    if (hasLine) { withLine++; lineDistinct.add(line); }
    if (hasTalla) withTalla++;
    if (hasColor) withColor++;
    if (hasSubgrupo && hasLine) withBoth++;
    if (!hasSubgrupo && !hasLine) withNone++;

    if (talla.toUpperCase() === "GEN") tallaGen++;
    if (color.toUpperCase() === "GENERICO") colorGenerico++;
  }

  const total = pilWithProduct.length;
  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

  console.log("── Classification Coverage ──\n");
  console.log(`| Dimension | Count | Coverage | Distinct |`);
  console.log(`|---|---|---|---|`);
  console.log(`| subgrupoSag | ${withSubgrupo} | ${pct(withSubgrupo)} | ${subgrupoDistinct.size} |`);
  console.log(`| productLine | ${withLine} | ${pct(withLine)} | ${lineDistinct.size} |`);
  console.log(`| talla | ${withTalla} | ${pct(withTalla)} | — |`);
  console.log(`| color | ${withColor} | ${pct(withColor)} | — |`);
  console.log(`| subgrupo + line | ${withBoth} | ${pct(withBoth)} | — |`);
  console.log(`| sin clasificacion | ${withNone} | ${pct(withNone)} | — |`);
  console.log();

  console.log("── Sentinel Values ──\n");
  console.log(`| Sentinel | Count | % |`);
  console.log(`|---|---|---|`);
  console.log(`| talla = GEN | ${tallaGen} | ${pct(tallaGen)} |`);
  console.log(`| color = GENERICO | ${colorGenerico} | ${pct(colorGenerico)} |`);
  console.log(`| SIN_SUBGRUPO_SAG (will be) | ${total - withSubgrupo} | ${pct(total - withSubgrupo)} |`);
  console.log(`| SIN_LINEA_SAG (will be) | ${total - withLine} | ${pct(total - withLine)} |`);
  console.log();

  console.log("── Distinct subgrupoSag values (top 20) ──\n");
  const sgSorted = [...subgrupoDistinct].sort();
  for (const sg of sgSorted.slice(0, 20)) {
    console.log(`  ${sg}`);
  }
  if (sgSorted.length > 20) console.log(`  ... and ${sgSorted.length - 20} more`);

  console.log("\n── Distinct productLine values ──\n");
  for (const ln of [...lineDistinct].sort()) {
    console.log(`  ${ln}`);
  }

  console.log("\n=== Audit complete ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
