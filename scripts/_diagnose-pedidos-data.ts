/**
 * scripts/_diagnose-pedidos-data.ts
 * One-shot diagnostic: what real data exists for Pedidos module in Castillitos.
 * Usage: DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" npx tsx scripts/_diagnose-pedidos-data.ts
 */
import { prisma } from "../lib/prisma";

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true, name: true } });
  console.log("=== Organizations ===");
  for (const o of orgs) console.log(" ", o.slug, o.name);

  const cast = orgs.find((o) => o.slug === "castillitos");
  if (!cast) { console.log("No castillitos org found"); return; }
  const castId = cast.id;
  console.log("\nTarget org:", cast.slug, castId);

  // Count tables
  const tables: [string, string][] = [
    ["CustomerProfile", "customerProfile"],
    ["CRMCustomer", "cRMCustomer"],
    ["CRMQuoteLine", "cRMQuoteLine"],
    ["CRMQuote", "cRMQuote"],
    ["CommercialCoverageSnapshot", "commercialCoverageSnapshot"],
    ["CustomerReceivable", "customerReceivable"],
  ];

  console.log("\n=== Table counts (castillitos) ===");
  for (const [label, model] of tables) {
    try {
      const c = await (prisma as any)[model].count({ where: { organizationId: castId } });
      console.log(`  ${label}: ${c}`);
    } catch (e: any) {
      console.log(`  ${label} ERR: ${e.message?.slice(0, 100)}`);
    }
  }

  // AgentExecution comercial
  try {
    const ae = await (prisma as any).agentExecution.count({
      where: { organizationId: castId, module: "comercial" },
    });
    console.log(`  AgentExecution (comercial): ${ae}`);
  } catch (e: any) {
    console.log(`  AgentExecution ERR: ${e.message?.slice(0, 100)}`);
  }

  // ConnectorSync
  try {
    const sy = await (prisma as any).connectorSync.findMany({
      where: { connector: { organizationId: castId } },
      take: 5,
      orderBy: { finishedAt: "desc" },
      select: {
        status: true,
        recordsProcessed: true,
        finishedAt: true,
        connector: { select: { slug: true } },
      },
    });
    console.log(`\n=== ConnectorSync (last ${sy.length}) ===`);
    for (const x of sy) console.log(" ", JSON.stringify(x));
  } catch (e: any) {
    console.log(`  ConnectorSync ERR: ${e.message?.slice(0, 100)}`);
  }

  // Sample CRMCustomer
  try {
    const samples = await (prisma as any).cRMCustomer.findMany({
      where: { organizationId: castId },
      take: 5,
      select: { id: true, name: true, code: true, nit: true, city: true, sellerName: true },
    });
    if (samples.length > 0) {
      console.log("\n=== CRMCustomer samples ===");
      for (const s of samples) console.log(" ", JSON.stringify(s));
    }
  } catch {}

  // Sample CustomerProfile
  try {
    const samples = await (prisma as any).customerProfile.findMany({
      where: { organizationId: castId },
      take: 5,
      select: { id: true, name: true, slug: true, nit: true, sellerName: true, city: true, ltv: true },
    });
    if (samples.length > 0) {
      console.log("\n=== CustomerProfile samples ===");
      for (const s of samples) console.log(" ", JSON.stringify(s));
    }
  } catch {}

  // Sample CRMQuoteLine
  try {
    const samples = await (prisma as any).cRMQuoteLine.findMany({
      where: { organizationId: castId },
      take: 5,
      select: { reference: true, productName: true, unitPrice: true, size: true, color: true, quantity: true },
    });
    if (samples.length > 0) {
      console.log("\n=== CRMQuoteLine samples ===");
      for (const s of samples) console.log(" ", JSON.stringify(s));
    }
  } catch {}

  // Sample CommercialCoverageSnapshot
  try {
    const samples = await (prisma as any).commercialCoverageSnapshot.findMany({
      where: { organizationId: castId },
      take: 5,
      orderBy: { snapshotAt: "desc" },
      select: { refCode: true, description: true, disponible: true, line: true, snapshotAt: true },
    });
    if (samples.length > 0) {
      console.log("\n=== CommercialCoverageSnapshot samples ===");
      for (const s of samples) console.log(" ", JSON.stringify(s));
    }
  } catch {}

  // Sample CustomerReceivable
  try {
    const samples = await (prisma as any).customerReceivable.findMany({
      where: { organizationId: castId },
      take: 3,
      select: { customerName: true, customerCode: true, totalDebt: true },
    });
    if (samples.length > 0) {
      console.log("\n=== CustomerReceivable samples ===");
      for (const s of samples) console.log(" ", JSON.stringify(s));
    }
  } catch {}

  console.log("\n=== Diagnosis complete ===");
}

main()
  .then(() => (prisma as any).$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
