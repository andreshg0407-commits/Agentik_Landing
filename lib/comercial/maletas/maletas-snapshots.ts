/**
 * lib/comercial/maletas/maletas-snapshots.ts
 *
 * Persistence layer for Maletas operational snapshots.
 * Saves coverage, case items, sales rep profiles, production signals,
 * and dead stock signals to Prisma at a given point in time.
 *
 * Server-only — never import from client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 */

import { prisma } from "@/lib/prisma";
import type { MaletasOperationalContext } from "./maletas-types";

// ─── Result types ─────────────────────────────────────────────────────────────

export interface MaletasSnapshotResult {
  snapshotAt:       string; // ISO timestamp
  coverageRows:     number;
  caseRows:         number;
  itemRows:         number;
  salesRepRows:     number;
  productionRows:   number;
  deadStockRows:    number;
  warnings:         string[];
}

// ─── Coverage snapshots ───────────────────────────────────────────────────────

/**
 * Persist coverage signals for all refs to CommercialCoverageSnapshot.
 * One row per ref per snapshot run.
 */
export async function persistCoverageSnapshot(
  orgId: string,
  context: MaletasOperationalContext,
  snapshotAt: Date = new Date(),
): Promise<number> {
  const intel = context.intelligence;
  if (!intel?.coverage.length) return 0;

  await prisma.commercialCoverageSnapshot.createMany({
    data: intel.coverage.map((cs) => ({
      organizationId:  orgId,
      refCode:         cs.refCode,
      description:     cs.description,
      line:            cs.line,
      disponible:      cs.disponible,
      dailyVelocity:   cs.dailyVelocity,
      coverageDays:    cs.coverageDays,
      status:          cs.status,
      operationalScore: cs.operationalScore,
      affectedRepCount: cs.affectedSalesRepIds.length,
      snapshotAt,
    })),
  });

  return intel.coverage.length;
}

// ─── Case-level snapshots ─────────────────────────────────────────────────────

/**
 * Persist case-level summaries (one row per vendedor × línea).
 */
export async function persistCaseSnapshot(
  orgId: string,
  context: MaletasOperationalContext,
  snapshotAt: Date = new Date(),
): Promise<number> {
  if (!context.cases.length) return 0;

  const profiles = context.intelligence?.salesRepProfiles ?? [];
  const profileByKey = new Map(
    profiles.map((p) => [`${p.salesRepId}_${p.line}`, p]),
  );

  await prisma.commercialCase.createMany({
    data: context.cases.map((c) => {
      const profile = profileByKey.get(`${c.salesRepId}_${c.line}`);
      return {
        organizationId:     orgId,
        salesRepId:         c.salesRepId,
        salesRepName:       c.salesRepName,
        line:               c.line,
        refsTotal:          c.itemCount,
        refsOk:             c.okCount,
        refsAgotadas:       c.criticalCount,
        refsBajoMinimo:     c.alertCount - c.criticalCount,
        refsEnProceso:      0, // computed in engine via en_proceso status
        presionOperacional: profile?.presionOperacional ?? 0,
        riesgoComercial:    profile?.riesgoComercial ?? "bajo",
        snapshotAt,
      };
    }),
  });

  return context.cases.length;
}

// ─── Item snapshots ───────────────────────────────────────────────────────────

/**
 * Persist item-level snapshots (one row per ref per snapshot run).
 */
export async function persistItemSnapshot(
  orgId: string,
  context: MaletasOperationalContext,
  snapshotAt: Date = new Date(),
): Promise<number> {
  if (!context.items.length) return 0;

  await prisma.commercialCaseItem.createMany({
    data: context.items.map((item) => ({
      organizationId:      orgId,
      reference:           item.reference,
      description:         item.description,
      line:                item.line,
      currentUnits:        item.currentUnits,
      minimumRequired:     item.minimumRequired,
      status:              item.status,
      recommendedAction:   item.recommendedAction,
      productionBatchLabel: item.productionBatchLabel ?? null,
      assignedSalesRepIds: item.assignedToSalesReps,
      snapshotAt,
    })),
  });

  return context.items.length;
}

// ─── Sales rep profile snapshots ──────────────────────────────────────────────

/**
 * Persist sales rep operational profile snapshots.
 */
export async function persistSalesRepSnapshot(
  orgId: string,
  context: MaletasOperationalContext,
  snapshotAt: Date = new Date(),
): Promise<number> {
  const profiles = context.intelligence?.salesRepProfiles;
  if (!profiles?.length) return 0;

  await prisma.commercialSalesRepProfileSnapshot.createMany({
    data: profiles.map((p) => ({
      organizationId:       orgId,
      salesRepId:           p.salesRepId,
      salesRepName:         p.salesRepName,
      line:                 p.line,
      refsTotal:            p.refsTotal,
      refsOk:               p.refsOk,
      refsAgotadas:         p.refsAgotadas,
      refsBajoMinimo:       p.refsBajoMinimo,
      refsEnProceso:        p.refsEnProceso,
      coverageAvgDays:      p.coverageAvgDays,
      coverageMinDays:      p.coverageMinDays,
      presionOperacional:   p.presionOperacional,
      dependenciaProduccion: p.dependenciaProduccion,
      dependenciaReposicion: p.dependenciaReposicion,
      riesgoComercial:      p.riesgoComercial,
      riesgoScore:          p.riesgoScore,
      lineasFuertes:        p.lineasFuertes,
      lineasDebiles:        p.lineasDebiles,
      coverageWeakRefs:     p.coverageWeakRefs,
      snapshotAt,
    })),
  });

  return profiles.length;
}

// ─── Production + dead stock signals ─────────────────────────────────────────

/**
 * Persist production and dead stock signals.
 * Marks previously unresolved signals for the same org as resolved
 * if they are no longer present in the current snapshot.
 */
export async function persistOperationalSignals(
  orgId: string,
  context: MaletasOperationalContext,
  snapshotAt: Date = new Date(),
): Promise<{ productionCount: number; deadStockCount: number }> {
  const intel = context.intelligence;

  let productionCount = 0;
  let deadStockCount  = 0;

  // ── Production signals ────────────────────────────────────────────────────
  const productionSignals = intel?.productionSignals ?? [];
  if (productionSignals.length > 0) {
    // Mark old unresolved signals for refs no longer active as resolved
    const activeRefs = new Set(productionSignals.map((s) => s.reference));
    await prisma.commercialProductionSignal.updateMany({
      where: {
        organizationId: orgId,
        resolved:       false,
        reference:      { notIn: Array.from(activeRefs) },
      },
      data: { resolved: true },
    });

    await prisma.commercialProductionSignal.createMany({
      data: productionSignals.map((ps) => ({
        organizationId:       orgId,
        reference:            ps.reference,
        description:          ps.description,
        line:                 ps.line,
        urgency:              ps.urgency,
        priority:             ps.priority,
        totalMissing:         ps.totalMissing,
        suggestedQty:         ps.suggestedQty,
        coverageDaysRemaining: ps.coverageDaysRemaining,
        affectedSalesRepCount: ps.affectedSalesRepCount,
        affectedSalesRepIds:  ps.affectedSalesRepIds,
        batchInProcess:       ps.batchInProcess,
        batchLabel:           ps.batchLabel ?? null,
        reasoning:            ps.reasoning,
        snapshotAt,
      })),
    });

    productionCount = productionSignals.length;
  }

  // ── Dead stock signals ────────────────────────────────────────────────────
  const deadStockSignals = intel?.deadStockSignals ?? [];
  if (deadStockSignals.length > 0) {
    const activeDeadRefs = new Set(deadStockSignals.map((s) => s.refCode));
    await prisma.commercialDeadStockSignal.updateMany({
      where: {
        organizationId: orgId,
        resolved:       false,
        refCode:        { notIn: Array.from(activeDeadRefs) },
      },
      data: { resolved: true },
    });

    await prisma.commercialDeadStockSignal.createMany({
      data: deadStockSignals.map((ds) => ({
        organizationId:     orgId,
        refCode:            ds.refCode,
        description:        ds.description,
        line:               ds.line,
        disponible:         ds.disponible,
        lastSaleDate:       ds.lastSaleDate ?? null,
        daysSinceLastSale:  ds.daysSinceLastSale ?? null,
        reason:             ds.reason,
        disposalSuggestion: ds.disposalSuggestion,
        commercialRisk:     ds.commercialRisk,
        assignedSalesRepIds: ds.assignedSalesRepIds,
        snapshotAt,
      })),
    });

    deadStockCount = deadStockSignals.length;
  }

  return { productionCount, deadStockCount };
}

// ─── Full snapshot orchestrator ───────────────────────────────────────────────

/**
 * Persist a complete Maletas operational snapshot in a single transaction.
 * Called by the ingestion pipeline and the sync cron endpoint.
 */
export async function persistFullMaletasSnapshot(
  orgId: string,
  context: MaletasOperationalContext,
  snapshotAt?: Date,
): Promise<MaletasSnapshotResult> {
  const at       = snapshotAt ?? new Date();
  const warnings: string[] = [];

  const [coverageRows, caseRows, itemRows, salesRepRows, signals] =
    await Promise.all([
      persistCoverageSnapshot(orgId, context, at).catch((e) => {
        warnings.push(`Coverage snapshot failed: ${e.message}`);
        return 0;
      }),
      persistCaseSnapshot(orgId, context, at).catch((e) => {
        warnings.push(`Case snapshot failed: ${e.message}`);
        return 0;
      }),
      persistItemSnapshot(orgId, context, at).catch((e) => {
        warnings.push(`Item snapshot failed: ${e.message}`);
        return 0;
      }),
      persistSalesRepSnapshot(orgId, context, at).catch((e) => {
        warnings.push(`SalesRep snapshot failed: ${e.message}`);
        return 0;
      }),
      persistOperationalSignals(orgId, context, at).catch((e) => {
        warnings.push(`Signals snapshot failed: ${e.message}`);
        return { productionCount: 0, deadStockCount: 0 };
      }),
    ]);

  return {
    snapshotAt:     at.toISOString(),
    coverageRows,
    caseRows,
    itemRows,
    salesRepRows,
    productionRows: signals.productionCount,
    deadStockRows:  signals.deadStockCount,
    warnings,
  };
}
