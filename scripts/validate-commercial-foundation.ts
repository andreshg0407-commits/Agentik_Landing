/**
 * COMMERCIAL-DATA-FOUNDATION-01 Phase 9 — Validation Script
 * Run against Castillitos real data.
 *
 * Usage: npx tsx scripts/validate-commercial-foundation.ts
 */
import { prisma } from "@/lib/prisma";
import { resolveDaneCode } from "@/lib/comercial/foundation/dane-municipios";
import { getTrustSummary } from "@/lib/comercial/foundation/control-commercial-trust-matrix";

async function main() {
  const db = prisma as any;

  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: castillitos org not found"); return; }
  const orgId = org.id;
  console.log(`\n=== COMMERCIAL FOUNDATION VALIDATION — ${org.slug} (${orgId}) ===\n`);

  // 1. Seller Directory
  console.log("--- 1. SELLER DIRECTORY ---");
  const quotes = await db.cRMQuote.findMany({
    where: { organizationId: orgId },
    select: { sellerName: true, rawCrmJson: true, issuedAt: true },
  });
  const sellerSet = new Set<string>();
  for (const q of quotes) {
    if (q.sellerName) sellerSet.add(q.sellerName);
  }
  console.log(`Total CRM quotes: ${quotes.length}`);
  console.log(`Distinct sellers: ${sellerSet.size}`);
  console.log(`Sellers: ${[...sellerSet].join(", ")}`);

  // 2. Client-Seller Linking
  console.log("\n--- 2. CLIENT-SELLER LINKING ---");
  const profiles = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { id: true, crmId: true },
  });
  const profileCrmSet = new Set(profiles.filter((p: any) => p.crmId).map((p: any) => p.crmId));
  let linkedCustomers = 0;
  const customerSellers = new Map<string, Map<string, number>>();
  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const billingId = raw.billing_account_id;
    const seller = q.sellerName;
    if (!billingId || !seller || !profileCrmSet.has(billingId)) continue;
    const sellers = customerSellers.get(billingId) ?? new Map();
    sellers.set(seller, (sellers.get(seller) ?? 0) + 1);
    customerSellers.set(billingId, sellers);
  }
  let highConf = 0, medConf = 0, lowConf = 0;
  for (const [, sellers] of customerSellers) {
    const total = [...sellers.values()].reduce((a, b) => a + b, 0);
    const max = Math.max(...sellers.values());
    const conf = Math.round((max / total) * 100);
    if (conf >= 80) highConf++;
    else if (conf >= 60) medConf++;
    else lowConf++;
    if (conf >= 60) linkedCustomers++;
  }
  console.log(`Customers with CRM quotes: ${customerSellers.size}`);
  console.log(`Linked to seller (>=60% confidence): ${linkedCustomers}`);
  console.log(`  High confidence (>=80%): ${highConf}`);
  console.log(`  Medium confidence (60-79%): ${medConf}`);
  console.log(`  Low confidence (<60%, not linked): ${lowConf}`);
  console.log(`Customers without quotes: ${profiles.length - customerSellers.size}`);

  // 3. Order Traceability
  console.log("\n--- 3. ORDER TRACEABILITY ---");
  const sagOrderIds = new Set<string>();
  const sagOrders = await db.customerOrderRecord.findMany({
    where: { organizationId: orgId },
    select: { erpMovId: true },
  });
  for (const o of sagOrders) if (o.erpMovId) sagOrderIds.add(String(o.erpMovId));

  let withSagId = 0, matchedSag = 0;
  const stageCount = new Map<string, number>();
  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const sagId = raw.id_sag_c;
    const stage = raw.stage || "unknown";
    stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
    if (sagId && sagId !== "") {
      withSagId++;
      if (sagOrderIds.has(String(sagId))) matchedSag++;
    }
  }
  console.log(`CRM quotes with id_sag_c: ${withSagId}/${quotes.length} (${Math.round(withSagId/quotes.length*100)}%)`);
  console.log(`id_sag_c matched to SAG order: ${matchedSag}/${withSagId} (${withSagId > 0 ? Math.round(matchedSag/withSagId*100) : 0}%)`);
  console.log(`SAG orders total: ${sagOrders.length}`);
  console.log(`Stage distribution:`);
  for (const [stage, count] of [...stageCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${stage}: ${count}`);
  }

  // 4. City Resolution (DANE)
  console.log("\n--- 4. CITY RESOLUTION (DANE) ---");
  const profilesWithCity = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { city: true, rawCrmJson: true },
  });
  let sagCodes = 0, daneCodes = 0, cityNames = 0, noCity = 0;
  for (const p of profilesWithCity) {
    const city = (p.city as string)?.trim();
    const crmCity = ((p.rawCrmJson as any)?.raw ?? {}).billing_address_city as string | undefined;
    if (!city && !crmCity) { noCity++; continue; }
    if (city && !/^\d+$/.test(city)) { cityNames++; continue; }
    if (city && resolveDaneCode(city)) { daneCodes++; continue; }
    if (crmCity && resolveDaneCode(crmCity.trim())) { daneCodes++; continue; }
    if (city && /^\d+$/.test(city)) { sagCodes++; continue; }
    noCity++;
  }
  console.log(`Total profiles: ${profilesWithCity.length}`);
  console.log(`Resolved via DANE: ${daneCodes} (${Math.round(daneCodes/profilesWithCity.length*100)}%)`);
  console.log(`Already city names: ${cityNames}`);
  console.log(`SAG codes (unresolvable): ${sagCodes}`);
  console.log(`No city data: ${noCity}`);

  // 5. Trust Matrix Summary
  console.log("\n--- 5. TRUST MATRIX SUMMARY ---");
  const trust = getTrustSummary();
  console.log(`Total KPIs tracked: ${trust.total}`);
  console.log(`  ALTA: ${trust.alta}`);
  console.log(`  MEDIA: ${trust.media}`);
  console.log(`  BAJA: ${trust.baja}`);
  console.log(`Dashboard allowed: ${trust.allowed}`);
  console.log(`Dashboard blocked: ${trust.blocked}`);

  console.log("\n=== VALIDATION COMPLETE ===\n");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
