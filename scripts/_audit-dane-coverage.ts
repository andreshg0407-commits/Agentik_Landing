/**
 * scripts/_audit-dane-coverage.ts
 *
 * Extracts all distinct DANE codes from rawCrmJson.billing_address_city
 * and checks which ones are missing from dane-municipios.ts.
 *
 * Run: npx tsx scripts/_audit-dane-coverage.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { DANE_MUNICIPIOS } from "../lib/comercial/foundation/dane-municipios";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) { console.log("Org not found"); return; }

  const customers = await prisma.customerProfile.findMany({
    where: { organizationId: org.id },
    select: { rawCrmJson: true },
  });

  // Extract all DANE codes from CRM raw
  const daneCodes = new Map<string, number>();
  const stateCodes = new Map<string, number>();

  for (const c of customers) {
    const raw = c.rawCrmJson as any;
    if (!raw) continue;
    const rawObj = raw.raw ?? raw;

    const bc = String(rawObj.billing_address_city ?? "").trim();
    const bs = String(rawObj.billing_address_state ?? "").trim();

    if (bc && /^\d+$/.test(bc)) {
      const norm = bc.padStart(5, "0");
      daneCodes.set(norm, (daneCodes.get(norm) ?? 0) + 1);
    }
    if (bs && /^\d+$/.test(bs)) {
      const norm = bs.padStart(2, "0");
      stateCodes.set(norm, (stateCodes.get(norm) ?? 0) + 1);
    }
  }

  // Check coverage
  const sorted = [...daneCodes.entries()].sort((a, b) => b[1] - a[1]);
  let covered = 0;
  let missing = 0;
  const missingCodes: [string, number][] = [];

  for (const [code, count] of sorted) {
    if (DANE_MUNICIPIOS[code]) {
      covered++;
    } else {
      missing++;
      missingCodes.push([code, count]);
    }
  }

  console.log(`\nTotal DANE codes in CRM data: ${sorted.length}`);
  console.log(`Covered by dane-municipios.ts: ${covered}`);
  console.log(`Missing from dane-municipios.ts: ${missing}`);
  console.log(`\nClientes cubiertos: ${sorted.filter(([c]) => DANE_MUNICIPIOS[c]).reduce((s, [, n]) => s + n, 0)}`);
  console.log(`Clientes sin cobertura: ${missingCodes.reduce((s, [, n]) => s + n, 0)}`);

  // Print missing codes sorted by frequency
  console.log(`\n─── Missing DANE codes (${missing}) ───`);
  console.log("CODE   COUNT");
  for (const [code, count] of missingCodes.sort((a, b) => b[1] - a[1])) {
    console.log(`${code}  ${count}`);
  }

  // Print department codes
  console.log(`\n─── Department codes (${stateCodes.size}) ───`);
  for (const [code, count] of [...stateCodes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${code}  ${count}`);
  }

  // Print existing catalog size
  console.log(`\nExisting dane-municipios.ts entries: ${Object.keys(DANE_MUNICIPIOS).length}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
