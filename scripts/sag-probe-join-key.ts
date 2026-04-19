/**
 * sag-probe-join-key.ts
 *
 * Probes the CustomerProfile.rawErpJson structure to confirm that
 * ka_nl_tercero is present and matches CustomerReceivable.customerNit,
 * enabling a bulk KPI refresh JOIN.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const { prisma } = await import("../lib/prisma");

  // 1) Sample CustomerProfile rawErpJson to confirm ka_nl_tercero presence
  const cpSamples = await prisma.$queryRaw<{
    slug: string;
    nit: string | null;
    erpId: string | null;
    tercero_pk: string | null;
    raw_keys: string | null;
  }[]>`
    SELECT
      slug,
      nit,
      "erpId",
      "rawErpJson"->'raw'->>'ka_nl_tercero' AS tercero_pk,
      (SELECT string_agg(key, ', ' ORDER BY key)
       FROM jsonb_object_keys("rawErpJson"->'raw') AS key
       LIMIT 1) AS raw_keys
    FROM "CustomerProfile"
    WHERE "organizationId" = ${ORG_ID}
      AND "erpId" IS NOT NULL
      AND "rawErpJson" IS NOT NULL
      AND "rawErpJson" != '{}'
    LIMIT 5
  `;

  console.log("\n── CustomerProfile rawErpJson sample ──");
  for (const r of cpSamples) {
    console.log(`  slug=${r.slug}  nit=${r.nit}  erpId=${r.erpId}  ka_nl_tercero=${r.tercero_pk}`);
  }

  // 2) Sample CustomerReceivable customerNit values
  const crSamples = await prisma.$queryRaw<{
    erpId: string | null;
    customerNit: string | null;
    customerName: string;
  }[]>`
    SELECT "erpId", "customerNit", "customerName"
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
    LIMIT 5
  `;

  console.log("\n── CustomerReceivable sample (customerNit) ──");
  for (const r of crSamples) {
    console.log(`  erpId=${r.erpId}  customerNit=${r.customerNit}  name=${r.customerName}`);
  }

  // 3) Test join: how many CustomerReceivable rows can be matched to CustomerProfile via ka_nl_tercero?
  const joinTest = await prisma.$queryRaw<{ matched: bigint; total: bigint }[]>`
    SELECT
      COUNT(DISTINCT cr."erpId") FILTER (
        WHERE cp.id IS NOT NULL
      ) AS matched,
      COUNT(DISTINCT cr."erpId") AS total
    FROM "CustomerReceivable" cr
    LEFT JOIN "CustomerProfile" cp
      ON cp."organizationId" = cr."organizationId"
     AND cp."rawErpJson"->'raw'->>'ka_nl_tercero' = cr."customerNit"
    WHERE cr."organizationId" = ${ORG_ID}
  `;

  const { matched, total } = joinTest[0];
  console.log(`\n── Join test (CustomerReceivable → CustomerProfile via ka_nl_tercero) ──`);
  console.log(`  Total CustomerReceivable rows : ${total}`);
  console.log(`  Matched via ka_nl_tercero     : ${matched}`);
  console.log(`  Match rate                    : ${(Number(matched) / Number(total) * 100).toFixed(1)}%`);

  // 4) How many distinct customerNit values exist in CustomerReceivable?
  const nitDist = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(DISTINCT "customerNit") AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" IS NOT NULL
  `;
  console.log(`\n  Distinct customerNit values   : ${nitDist[0].cnt}`);

  // 5) How many CustomerProfile rows have the ka_nl_tercero key in rawErpJson?
  const cpWithKey = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt
    FROM "CustomerProfile"
    WHERE "organizationId" = ${ORG_ID}
      AND "rawErpJson"->'raw'->>'ka_nl_tercero' IS NOT NULL
  `;
  console.log(`  CustomerProfile with ka_nl_tercero in rawErpJson: ${cpWithKey[0].cnt}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
