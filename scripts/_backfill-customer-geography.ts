/**
 * scripts/_backfill-customer-geography.ts
 *
 * CUSTOMER-GEOGRAPHY-RECOVERY-01 — Backfill city + department from CRM rawCrmJson.
 *
 * Strategy:
 *   1. Read billing_address_city (DANE 5-digit) from rawCrmJson
 *   2. Resolve via dane-municipios.ts → city name
 *   3. Read billing_address_state (DANE 2-digit) → department name
 *   4. Update CustomerProfile.city + CustomerProfile.department
 *
 * Safety:
 *   - Only updates profiles where rawCrmJson has a valid DANE code
 *   - Dry-run mode by default (set DRY_RUN=false to execute)
 *   - Batched updates (50 per batch)
 *
 * Run:
 *   DRY_RUN=true  npx tsx scripts/_backfill-customer-geography.ts   # preview
 *   DRY_RUN=false npx tsx scripts/_backfill-customer-geography.ts   # execute
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveDaneCode, resolveDaneDepartment } from "../lib/comercial/foundation/dane-municipios";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN !== "false";

async function main() {
  console.log(`\n${ DRY_RUN ? "🔍 DRY RUN — no changes will be made" : "⚡ LIVE RUN — updating database" }\n`);

  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, name: true },
  });
  if (!org) { console.log("Org not found"); return; }
  console.log(`Org: ${org.name} — ID: ${org.id}\n`);

  const customers = await prisma.customerProfile.findMany({
    where: { organizationId: org.id },
    select: {
      id: true,
      city: true,
      department: true,
      rawCrmJson: true,
    },
  });

  console.log(`Total customers: ${customers.length}\n`);

  // Classify and prepare updates
  let resolved = 0;
  let alreadyCorrect = 0;
  let noCrmData = 0;
  let daneNotFound = 0;
  let noBillingCity = 0;

  const updates: Array<{ id: string; city: string; department: string | null }> = [];

  for (const c of customers) {
    const raw = c.rawCrmJson as any;
    if (!raw) { noCrmData++; continue; }

    const rawObj = raw.raw ?? raw;
    const billingCity = String(rawObj.billing_address_city ?? "").trim();
    const billingState = String(rawObj.billing_address_state ?? "").trim();

    if (!billingCity) { noBillingCity++; continue; }

    const cityName = resolveDaneCode(billingCity);
    if (!cityName) { daneNotFound++; continue; }

    const deptName = resolveDaneDepartment(billingState);

    // Check if already correct
    if (c.city === cityName && (c.department === deptName || (!deptName && !c.department))) {
      alreadyCorrect++;
      continue;
    }

    resolved++;
    updates.push({
      id: c.id,
      city: cityName,
      department: deptName,
    });
  }

  console.log(`─── Classification ───`);
  console.log(`  Already correct:   ${alreadyCorrect}`);
  console.log(`  Will update:       ${resolved}`);
  console.log(`  No CRM raw data:   ${noCrmData}`);
  console.log(`  No billing city:   ${noBillingCity}`);
  console.log(`  DANE not found:    ${daneNotFound}`);
  console.log(`  Total:             ${alreadyCorrect + resolved + noCrmData + noBillingCity + daneNotFound}\n`);

  // Show sample of updates
  console.log(`─── Sample updates (first 20) ───`);
  for (const u of updates.slice(0, 20)) {
    const c = customers.find(cc => cc.id === u.id);
    console.log(`  ${c?.city?.padEnd(10) ?? "(null)    "} → ${u.city.padEnd(25)} dept: ${u.department ?? "—"}`);
  }

  // Group by city for summary
  const byCityTarget = new Map<string, number>();
  for (const u of updates) {
    byCityTarget.set(u.city, (byCityTarget.get(u.city) ?? 0) + 1);
  }
  console.log(`\n─── Top 15 target cities ───`);
  for (const [city, count] of [...byCityTarget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${city.padEnd(30)} ${count}`);
  }

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN complete. ${updates.length} updates would be applied.`);
    console.log(`   Run with DRY_RUN=false to execute.\n`);
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Execute updates one at a time (Neon free tier has low transaction timeouts)
  let updated = 0;
  let failed = 0;

  for (const u of updates) {
    try {
      await prisma.customerProfile.update({
        where: { id: u.id },
        data: {
          city: u.city,
          ...(u.department ? { department: u.department } : {}),
        },
      });
      updated++;
    } catch (e) {
      failed++;
      if (failed <= 5) console.error(`  Failed: ${u.id} — ${(e as Error).message.substring(0, 80)}`);
    }
    if (updated % 1000 === 0) {
      console.log(`  Updated ${updated}/${updates.length}...`);
    }
  }

  console.log(`\n✅ Backfill complete: ${updated} updated, ${failed} failed.\n`);

  // Verification
  const verifyCount = await prisma.customerProfile.count({
    where: {
      organizationId: org.id,
      city: { not: null },
      NOT: { city: "" },
    },
  });

  // Count non-numeric cities (resolved names)
  const allProfiles = await prisma.customerProfile.findMany({
    where: { organizationId: org.id },
    select: { city: true },
  });
  const textCities = allProfiles.filter(p => p.city && !/^\d+$/.test(p.city.trim())).length;

  console.log(`─── Verification ───`);
  console.log(`  Profiles with city:       ${verifyCount}`);
  console.log(`  Profiles with text city:  ${textCities}`);
  console.log(`  Profiles total:           ${allProfiles.length}\n`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
