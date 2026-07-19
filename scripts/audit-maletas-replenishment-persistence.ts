/**
 * scripts/audit-maletas-replenishment-persistence.ts
 *
 * MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01 — FASE 13
 *
 * Read-only audit of MaletaReplenishmentPlan, MaletaReplenishmentItem,
 * and MaletaReplenishmentEvent tables.
 *
 * Usage:
 *   npx tsx scripts/audit-maletas-replenishment-persistence.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("=== MALETAS REPLENISHMENT PERSISTENCE AUDIT ===\n");

  // ── Plans ──────────────────────────────────────────────────────────────────
  const plans = await (prisma as any).maletaReplenishmentPlan.findMany({
    include: {
      items: true,
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total plans: ${plans.length}`);

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const p of plans) {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  }
  console.log("Status distribution:", statusCounts);

  // Vendor distribution
  const vendorCounts: Record<string, number> = {};
  for (const p of plans) {
    const key = `${p.vendorName} (${p.vendorId})`;
    vendorCounts[key] = (vendorCounts[key] || 0) + 1;
  }
  console.log("Vendor distribution:", vendorCounts);

  // ── Items ──────────────────────────────────────────────────────────────────
  const totalItems = await (prisma as any).maletaReplenishmentItem.count();
  console.log(`\nTotal items across all plans: ${totalItems}`);

  // ── Events ─────────────────────────────────────────────────────────────────
  const totalEvents = await (prisma as any).maletaReplenishmentEvent.count();
  console.log(`Total events across all plans: ${totalEvents}`);

  // ── Per-plan detail ────────────────────────────────────────────────────────
  console.log("\n--- Per-plan detail ---\n");
  for (const p of plans) {
    const itemCount = p.items?.length ?? 0;
    const eventCount = p.events?.length ?? 0;
    const doc = p.documentNumber ?? "(no document)";
    console.log(
      `[${p.status.toUpperCase().padEnd(18)}] ${doc.padEnd(20)} ` +
      `vendor=${p.vendorName.padEnd(20)} items=${itemCount} events=${eventCount} ` +
      `summaryAdded=${p.summaryAddedRefs} summaryRemoved=${p.summaryRemovedRefs}`
    );

    // Validate summary matches actual count
    const actualAdded = itemCount;
    const actualRemoved = p.items?.filter((i: any) => i.removedReference).length ?? 0;
    if (actualAdded !== p.summaryAddedRefs || actualRemoved !== p.summaryRemovedRefs) {
      console.log(
        `  !! SUMMARY MISMATCH: actual added=${actualAdded} removed=${actualRemoved} ` +
        `vs stored added=${p.summaryAddedRefs} removed=${p.summaryRemovedRefs}`
      );
    }
  }

  // ── Orphan checks ──────────────────────────────────────────────────────────
  console.log("\n--- Integrity checks ---\n");

  // Items without valid plan
  const allItems = await (prisma as any).maletaReplenishmentItem.findMany({
    select: { id: true, planId: true },
  });
  const planIds = new Set(plans.map((p: any) => p.id));
  const orphanItems = allItems.filter((i: any) => !planIds.has(i.planId));
  console.log(`Orphan items (no matching plan): ${orphanItems.length}`);

  // Events without valid plan
  const allEvents = await (prisma as any).maletaReplenishmentEvent.findMany({
    select: { id: true, planId: true },
  });
  const orphanEvents = allEvents.filter((e: any) => !planIds.has(e.planId));
  console.log(`Orphan events (no matching plan): ${orphanEvents.length}`);

  // Duplicate drafts per vendor
  const draftPlans = plans.filter((p: any) => p.status === "draft");
  const draftVendors: Record<string, number> = {};
  for (const p of draftPlans) {
    const key = `${p.organizationId}:${p.vendorId}`;
    draftVendors[key] = (draftVendors[key] || 0) + 1;
  }
  const duplicateDrafts = Object.entries(draftVendors).filter(([, c]) => c > 1);
  if (duplicateDrafts.length > 0) {
    console.log(`!! DUPLICATE DRAFTS (same org+vendor):`, duplicateDrafts);
  } else {
    console.log("No duplicate drafts per org+vendor. OK.");
  }

  // Document number uniqueness
  const docNumbers = plans
    .map((p: any) => p.documentNumber)
    .filter(Boolean);
  const docSet = new Set(docNumbers);
  if (docSet.size !== docNumbers.length) {
    console.log(`!! DUPLICATE DOCUMENT NUMBERS detected.`);
  } else {
    console.log(`Document numbers unique: ${docNumbers.length} documents. OK.`);
  }

  console.log("\n=== AUDIT COMPLETE ===");
}

main()
  .catch((err) => {
    console.error("Audit failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
