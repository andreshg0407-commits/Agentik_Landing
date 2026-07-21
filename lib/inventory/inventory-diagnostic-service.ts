/**
 * lib/inventory/inventory-diagnostic-service.ts
 *
 * COMERCIAL-INVENTORY-LIFECYCLE-AND-WAREHOUSE-INTELLIGENCE-02 — FASE 5
 *
 * Diagnostic dashboard service. No page — just service layer.
 * Returns lifecycle distribution counts grouped by line/grupo/subgrupo.
 *
 * server-only — uses Prisma.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  resolveLifecycleState,
  type ReferenceLifecycleState,
} from "./reference-lifecycle";

const db = prisma as any;

export interface LifecycleDistribution {
  total: number;
  active: number;
  lowActivity: number;
  dormant: number;
  archiveReview: number;
  noActivityData: number;
}

export interface GroupedDistribution {
  label: string;
  counts: LifecycleDistribution;
}

export interface InventoryDiagnosticReport {
  overall: LifecycleDistribution;
  byLine: GroupedDistribution[];
  byGrupo: GroupedDistribution[];
  bySubgrupo: GroupedDistribution[];
  byBucket: Record<string, number>;
}

/**
 * Build a diagnostic report of lifecycle state distribution.
 */
export async function getInventoryDiagnosticReport(
  organizationId: string,
): Promise<InventoryDiagnosticReport> {
  const now = new Date();

  const products = await db.productEntity.findMany({
    where: {
      organizationId,
      status: { not: "archived" },
    },
    select: {
      productLine: true,
      lineaSag: true,
      grupoSag: true,
      subgrupoSag: true,
      lastModifiedSag: true,
      lastSaleSag: true,
    },
  });

  const overall = emptyDist();
  const byLineMap = new Map<string, LifecycleDistribution>();
  const byGrupoMap = new Map<string, LifecycleDistribution>();
  const bySubgrupoMap = new Map<string, LifecycleDistribution>();
  const byBucket: Record<string, number> = {};

  for (const p of products) {
    const lifecycle = resolveLifecycleState(
      { lastModifiedAt: p.lastModifiedSag, lastSaleDate: p.lastSaleSag },
      now,
    );

    incrementDist(overall, lifecycle.lifecycleState);

    const lineLabel = p.lineaSag ?? p.productLine ?? "SIN_LINEA";
    const grupoLabel = p.grupoSag ?? "SIN_GRUPO";
    const subgrupoLabel = p.subgrupoSag ?? "SIN_SUBGRUPO";

    if (!byLineMap.has(lineLabel)) byLineMap.set(lineLabel, emptyDist());
    incrementDist(byLineMap.get(lineLabel)!, lifecycle.lifecycleState);

    if (!byGrupoMap.has(grupoLabel)) byGrupoMap.set(grupoLabel, emptyDist());
    incrementDist(byGrupoMap.get(grupoLabel)!, lifecycle.lifecycleState);

    if (!bySubgrupoMap.has(subgrupoLabel)) bySubgrupoMap.set(subgrupoLabel, emptyDist());
    incrementDist(bySubgrupoMap.get(subgrupoLabel)!, lifecycle.lifecycleState);

    if (lifecycle.activityRecencyBucket) {
      byBucket[lifecycle.activityRecencyBucket] = (byBucket[lifecycle.activityRecencyBucket] ?? 0) + 1;
    }
  }

  return {
    overall,
    byLine: mapToGrouped(byLineMap),
    byGrupo: mapToGrouped(byGrupoMap),
    bySubgrupo: mapToGrouped(bySubgrupoMap),
    byBucket,
  };
}

function emptyDist(): LifecycleDistribution {
  return { total: 0, active: 0, lowActivity: 0, dormant: 0, archiveReview: 0, noActivityData: 0 };
}

function incrementDist(dist: LifecycleDistribution, state: ReferenceLifecycleState): void {
  dist.total++;
  switch (state) {
    case "ACTIVE": dist.active++; break;
    case "LOW_ACTIVITY": dist.lowActivity++; break;
    case "DORMANT": dist.dormant++; break;
    case "ARCHIVE_REVIEW": dist.archiveReview++; break;
    case "NO_ACTIVITY_DATA": dist.noActivityData++; break;
  }
}

function mapToGrouped(map: Map<string, LifecycleDistribution>): GroupedDistribution[] {
  return Array.from(map.entries())
    .map(([label, counts]) => ({ label, counts }))
    .sort((a, b) => b.counts.total - a.counts.total);
}
