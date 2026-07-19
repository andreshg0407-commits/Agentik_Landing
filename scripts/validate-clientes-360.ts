/**
 * CLIENTES-360-01 Validation — Test 5 diverse clients from Castillitos.
 *
 * Usage: npx tsx scripts/validate-clientes-360.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: castillitos not found"); return; }
  const orgId = org.id;
  console.log(`\n=== CLIENTES 360 VALIDATION — ${org.slug} ===\n`);

  // Find 5 diverse profiles
  // 1. Client with cartera
  const withCartera = await db.customerReceivable.findFirst({
    where: { organizationId: orgId, balanceDue: { gt: 0 }, customerId: { not: null } },
    select: { customerId: true },
  });

  // 2. Client with CRM quotes (via billing_account_id → crmId, not customerId which is null)
  const sampleQuote = await db.cRMQuote.findFirst({
    where: { organizationId: orgId },
    select: { rawCrmJson: true },
  });
  const billingId = (sampleQuote?.rawCrmJson as any)?.raw?.billing_account_id;
  const withCrmQuote = billingId
    ? await db.customerProfile.findFirst({
        where: { organizationId: orgId, crmId: billingId },
        select: { id: true },
      })
    : null;

  // 3. Client with SAG orders (via NIT)
  const sagOrder = await db.customerOrderRecord.findFirst({
    where: { organizationId: orgId, customerNit: { not: null } },
    select: { customerNit: true },
  });
  const withSagOrder = sagOrder
    ? await db.customerProfile.findFirst({
        where: { organizationId: orgId, nit: sagOrder.customerNit },
        select: { id: true },
      })
    : null;

  // 4. Client without city (SAG-sourced, no CRM)
  const withoutCity = await db.customerProfile.findFirst({
    where: { organizationId: orgId, crmId: null, city: null },
    select: { id: true },
  });

  // 5. Client without confident seller (no CRM quotes)
  const withoutSeller = await db.customerProfile.findFirst({
    where: {
      organizationId: orgId,
      id: { notIn: await db.cRMQuote.findMany({ where: { organizationId: orgId }, select: { customerId: true } }).then((qs: any[]) => qs.map((q: any) => q.customerId).filter(Boolean)) },
    },
    select: { id: true },
  });

  const testCases = [
    { label: "Con cartera", id: withCartera?.customerId },
    { label: "Con pedido CRM", id: withCrmQuote?.id },
    { label: "Con pedido SAG", id: withSagOrder?.id },
    { label: "Sin ciudad", id: withoutCity?.id },
    { label: "Sin vendedor", id: withoutSeller?.id },
  ];

  for (const tc of testCases) {
    console.log(`--- ${tc.label} ---`);
    if (!tc.id) {
      console.log("  SKIP: No matching profile found\n");
      continue;
    }

    const profile = await db.customerProfile.findFirst({
      where: { id: tc.id },
      select: { id: true, name: true, nit: true, city: true, crmId: true, status: true },
    });

    if (!profile) {
      console.log("  SKIP: Profile not found\n");
      continue;
    }

    console.log(`  Profile: ${profile.name} (${profile.id.slice(0, 8)})`);
    console.log(`  NIT: ${profile.nit ?? "null"} | City: ${profile.city ?? "null"} | CRM ID: ${profile.crmId ? "yes" : "no"}`);

    // CRM quotes (via billing_account_id → crmId, not customerId which is null)
    let quotes = 0;
    if (profile.crmId) {
      const allQ = await db.cRMQuote.findMany({ where: { organizationId: orgId }, select: { rawCrmJson: true } });
      quotes = allQ.filter((q: any) => (q.rawCrmJson as any)?.raw?.billing_account_id === profile.crmId).length;
    }
    console.log(`  CRM quotes: ${quotes}`);

    // SAG orders
    const sagOrders = profile.nit
      ? await db.customerOrderRecord.count({ where: { organizationId: orgId, customerNit: profile.nit } })
      : 0;
    console.log(`  SAG orders: ${sagOrders}`);

    // Receivables
    const receivables = await db.customerReceivable.count({ where: { organizationId: orgId, customerId: tc.id } });
    console.log(`  Receivables: ${receivables}`);

    // Sales
    const sales = profile.nit
      ? await db.saleRecord.count({ where: { organizationId: orgId, customerNit: profile.nit } })
      : 0;
    console.log(`  Sale records: ${sales}`);

    // Collections
    const collections = await db.collectionRecord.count({ where: { organizationId: orgId, customerId: tc.id } });
    console.log(`  Collections: ${collections}`);

    console.log(`  URL: /castillitos/comercial/clientes/${tc.id}\n`);
  }

  console.log("=== VALIDATION COMPLETE ===\n");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
