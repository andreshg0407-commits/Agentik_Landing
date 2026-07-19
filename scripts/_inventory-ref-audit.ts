/**
 * _inventory-ref-audit.ts
 * INVENTORY-REFERENCE-TRUTH-AUDIT-01 — FASE 1-3: Locate references and compare values.
 * READ ONLY.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B", "C7-J-004", "C8-K004"];
const ADMIN_VALUES: Record<string, number> = {
  "L-1367": 64,
  "L-8467": 511,
  "CJ-1126012": 79,
  "CJ-2026004B": 164,
  "C7-J-004": 350,
  "C8-K004": 1230,
};

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, name: true },
  });
  if (!org) {
    console.log("Organization not found");
    process.exit(1);
  }
  console.log(`Org: ${org.name} (${org.id})\n`);

  // ── Latest snapshot info ──
  const latest = await db.commercialCoverageSnapshot.findFirst({
    where: { organizationId: org.id },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });
  console.log("=".repeat(80));
  console.log("FASE 1-3: REFERENCE LOCATION & VALUES");
  console.log("=".repeat(80));
  if (latest) {
    console.log(`Latest snapshot: ${latest.snapshotAt.toISOString()}`);
    const totalInSnap = await db.commercialCoverageSnapshot.count({
      where: { organizationId: org.id, snapshotAt: latest.snapshotAt },
    });
    console.log(`Records in latest snapshot: ${totalInSnap}`);

    const lines = await db.commercialCoverageSnapshot.findMany({
      where: { organizationId: org.id, snapshotAt: latest.snapshotAt },
      distinct: ["line"],
      select: { line: true },
    });
    console.log(`Distinct lines: ${lines.map((l: any) => l.line).join(", ")}`);
  } else {
    console.log("NO SNAPSHOTS FOUND");
  }

  // ── Search each reference ──
  console.log("\n" + "=".repeat(80));
  console.log("REFERENCE SEARCH IN CommercialCoverageSnapshot");
  console.log("=".repeat(80));
  for (const ref of REFS) {
    // Exact match
    const exact = await db.commercialCoverageSnapshot.findMany({
      where: { organizationId: org.id, refCode: ref },
      orderBy: { snapshotAt: "desc" },
      take: 1,
      select: { refCode: true, description: true, line: true, disponible: true, pendingOrdersQty: true, snapshotAt: true, status: true },
    });
    if (exact.length > 0) {
      const r = exact[0];
      console.log(`\n[FOUND] ${ref}`);
      console.log(`  line=${r.line}, disponible=${r.disponible}, pendingOrders=${r.pendingOrdersQty ?? 0}, snapshotAt=${r.snapshotAt.toISOString()}`);
      console.log(`  description: ${r.description}`);
      console.log(`  status: ${r.status}`);
    } else {
      console.log(`\n[NOT FOUND] ${ref}`);
      // Try partial match
      const stripped = ref.replace(/^(L-|CJ-|C7-J-|C8-)/, "");
      const partial = await db.commercialCoverageSnapshot.findMany({
        where: { organizationId: org.id, refCode: { contains: stripped } },
        orderBy: { snapshotAt: "desc" },
        take: 5,
        select: { refCode: true, disponible: true, line: true, snapshotAt: true },
      });
      if (partial.length > 0) {
        console.log(`  Similar refs (containing "${stripped}"):`);
        for (const p of partial) {
          console.log(`    ${p.refCode} line=${p.line} disponible=${p.disponible}`);
        }
      } else {
        console.log(`  No similar refs found (searched "${stripped}")`);
      }
    }
  }

  // ── Search in ProductEntity ──
  console.log("\n" + "=".repeat(80));
  console.log("REFERENCE SEARCH IN ProductEntity");
  console.log("=".repeat(80));
  for (const ref of REFS) {
    const products = await db.productEntity.findMany({
      where: { organizationId: org.id, sku: ref },
      select: { id: true, name: true, sku: true, status: true },
      take: 3,
    });
    if (products.length > 0) {
      for (const p of products) {
        console.log(`[FOUND] ${ref} → ProductEntity(${p.id}) name="${p.name}" status=${p.status}`);
      }
    } else {
      // Try partial
      const partial = await db.productEntity.findMany({
        where: { organizationId: org.id, sku: { contains: ref.replace(/^(L-|CJ-|C7-J-|C8-)/, "") } },
        select: { id: true, name: true, sku: true },
        take: 3,
      });
      if (partial.length > 0) {
        console.log(`[NOT EXACT] ${ref} — similar SKUs:`);
        for (const p of partial) console.log(`  ${p.sku} → ${p.name}`);
      } else {
        console.log(`[NOT FOUND] ${ref} in ProductEntity`);
      }
    }
  }

  // ── Search in ProductInventoryLevel ──
  console.log("\n" + "=".repeat(80));
  console.log("REFERENCE SEARCH IN ProductInventoryLevel");
  console.log("=".repeat(80));
  for (const ref of REFS) {
    const levels = await db.productInventoryLevel.findMany({
      where: {
        organizationId: org.id,
        product: { sku: ref },
      },
      select: { quantity: true, reservedQty: true, warehouseId: true, source: true, externalRef: true, syncedAt: true },
      take: 5,
    });
    if (levels.length > 0) {
      console.log(`[FOUND] ${ref} in ProductInventoryLevel:`);
      for (const l of levels) {
        console.log(`  warehouse=${l.warehouseId} qty=${l.quantity} reserved=${l.reservedQty} source=${l.source} ext=${l.externalRef} synced=${l.syncedAt?.toISOString() ?? "null"}`);
      }
    } else {
      console.log(`[NOT FOUND] ${ref} in ProductInventoryLevel`);
    }
  }

  // ── Search in ProductSnapshot ──
  console.log("\n" + "=".repeat(80));
  console.log("REFERENCE SEARCH IN ProductSnapshot");
  console.log("=".repeat(80));
  for (const ref of REFS) {
    const snaps = await db.productSnapshot.findMany({
      where: { organizationId: org.id, sku: ref },
      select: { sku: true, name: true, sourceSystem: true, syncedAt: true },
      orderBy: { syncedAt: "desc" },
      take: 1,
    });
    if (snaps.length > 0) {
      const s = snaps[0];
      console.log(`[FOUND] ${ref} in ProductSnapshot: source=${s.sourceSystem} synced=${s.syncedAt.toISOString()}`);
    } else {
      console.log(`[NOT FOUND] ${ref} in ProductSnapshot`);
    }
  }

  // ── FASE 5: Comparison Table ──
  console.log("\n" + "=".repeat(80));
  console.log("FASE 5: COMPARISON TABLE");
  console.log("=".repeat(80));
  console.log(`${"Ref".padEnd(16)} | ${"Admin".padStart(6)} | ${"Agentik".padStart(8)} | ${"Diff".padStart(6)} | ${"Diff%".padStart(6)} | Status`);
  console.log("-".repeat(72));

  for (const ref of REFS) {
    const adminQty = ADMIN_VALUES[ref];
    const snap = await db.commercialCoverageSnapshot.findFirst({
      where: { organizationId: org.id, refCode: ref, snapshotAt: latest?.snapshotAt },
      select: { disponible: true, pendingOrdersQty: true },
    });

    if (snap) {
      const agentikQty = snap.disponible;
      const diff = agentikQty - adminQty;
      const diffPct = adminQty > 0 ? Math.round(Math.abs(diff) / adminQty * 100) : 999;
      let status = "OK";
      if (diffPct > 30) status = "CRITICA";
      else if (diffPct > 15) status = "DESVIACION MAYOR";
      else if (diffPct > 5) status = "REVISAR";
      else if (diffPct > 0) status = "VARIACION NORMAL";
      console.log(`${ref.padEnd(16)} | ${String(adminQty).padStart(6)} | ${String(agentikQty).padStart(8)} | ${String(diff).padStart(6)} | ${String(diffPct + "%").padStart(6)} | ${status}`);
    } else {
      console.log(`${ref.padEnd(16)} | ${String(adminQty).padStart(6)} | ${"N/A".padStart(8)} | ${"N/A".padStart(6)} | ${"N/A".padStart(6)} | NO DATA`);
    }
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
