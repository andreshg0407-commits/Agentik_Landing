/**
 * _audit-tenants.ts — full tenant audit before cleanup
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const db = prisma as any;

  // 1. All organizations
  const orgs = await db.organization.findMany({
    select: { id: true, slug: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  process.stdout.write("\n═══════════════════════════════════════════════════════\n");
  process.stdout.write(" AUDIT: TENANTS\n");
  process.stdout.write("═══════════════════════════════════════════════════════\n\n");

  process.stdout.write("1. Organizations:\n");
  for (const o of orgs) {
    process.stdout.write(
      `   slug=${o.slug.padEnd(20)} id=${o.id}  status=${o.status}  created=${o.createdAt.toISOString().slice(0,10)}  name="${o.name}"\n`
    );
  }

  // 2. Connectors per org
  const connectors = await db.connector.findMany({
    select: { id: true, source: true, organizationId: true, name: true, status: true },
    orderBy: [{ organizationId: "asc" }, { source: "asc" }],
  });

  process.stdout.write("\n2. Connectors:\n");
  for (const c of connectors) {
    const org = orgs.find((o: any) => o.id === c.organizationId);
    process.stdout.write(
      `   org=${org?.slug?.padEnd(20) ?? c.organizationId.padEnd(20)}  source=${c.source.padEnd(20)}  status=${c.status}  id=${c.id}  name="${c.name}"\n`
    );
  }

  // 3. Row counts per org for critical tables
  const tables = [
    { label: "SaleRecord",            model: "saleRecord",            dateField: "saleDate"    },
    { label: "CustomerReceivable",    model: "customerReceivable",    dateField: "issueDate"   },
    { label: "CustomerOrderRecord",   model: "customerOrderRecord",   dateField: "orderDate"   },
    { label: "PaymentRecord",         model: "paymentRecord",         dateField: "paymentDate" },
    { label: "BusinessAlert",         model: "businessAlert",         dateField: "createdAt"   },
    { label: "Alert",                 model: "alert",                 dateField: "createdAt"   },
    { label: "ActionTask",            model: "actionTask",            dateField: "createdAt"   },
    { label: "Rule",                  model: "rule",                  dateField: "createdAt"   },
    { label: "CustomerProfile",       model: "customerProfile",       dateField: "createdAt"   },
  ];

  process.stdout.write("\n3. Row counts per org:\n");
  process.stdout.write(`   ${"Table".padEnd(24)}` + orgs.map((o: any) => o.slug.padEnd(16)).join("") + "\n");
  process.stdout.write("   " + "─".repeat(24 + orgs.length * 16) + "\n");

  for (const t of tables) {
    const counts = await Promise.all(
      orgs.map((o: any) =>
        db[t.model].count({ where: { organizationId: o.id } }).catch(() => "ERR")
      )
    );
    process.stdout.write(
      `   ${t.label.padEnd(24)}` + counts.map((c: any) => String(c).padEnd(16)).join("") + "\n"
    );
  }

  // 4. Confirm SAG data lives in Castillitos
  const castillitos = orgs.find((o: any) => o.slug === "castillitos");
  process.stdout.write("\n4. SAG data confirmation:\n");
  if (castillitos) {
    const saleCount  = await db.saleRecord.count({ where: { organizationId: castillitos.id } });
    const orderCount = await db.customerOrderRecord.count({ where: { organizationId: castillitos.id } });
    const rxCount    = await db.customerReceivable.count({ where: { organizationId: castillitos.id } });
    process.stdout.write(`   Castillitos orgId: ${castillitos.id}\n`);
    process.stdout.write(`   SaleRecord:            ${saleCount}\n`);
    process.stdout.write(`   CustomerOrderRecord:   ${orderCount}\n`);
    process.stdout.write(`   CustomerReceivable:    ${rxCount}\n`);
  } else {
    process.stdout.write("   CASTILLITOS ORG NOT FOUND\n");
  }

  // 5. Do Jeans data check
  const doJeans = orgs.find((o: any) => o.slug === "do-jeans");
  if (doJeans) {
    const doJeansConnectors = connectors.filter((c: any) => c.organizationId === doJeans.id);
    process.stdout.write(`\n5. Do Jeans (${doJeans.id}):\n`);
    process.stdout.write(`   status: ${doJeans.status}\n`);
    process.stdout.write(`   connectors: ${doJeansConnectors.length > 0 ? doJeansConnectors.map((c: any) => c.source).join(", ") : "none"}\n`);
    const djSales  = await db.saleRecord.count({ where: { organizationId: doJeans.id } });
    const djOrders = await db.customerOrderRecord.count({ where: { organizationId: doJeans.id } }).catch(() => 0);
    process.stdout.write(`   SaleRecord:          ${djSales}\n`);
    process.stdout.write(`   CustomerOrderRecord: ${djOrders}\n`);
  }

  // 6. OrgStatus enum values available
  process.stdout.write("\n6. OrgStatus enum values in DB (distinct):\n");
  const statuses = [...new Set(orgs.map((o: any) => o.status))];
  process.stdout.write(`   ${statuses.join(", ")}\n`);

  process.stdout.write("\n═══════════════════════════════════════════════════════\n");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
