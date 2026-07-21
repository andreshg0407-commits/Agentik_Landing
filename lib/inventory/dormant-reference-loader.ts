/**
 * lib/inventory/dormant-reference-loader.ts
 *
 * COMERCIAL-INVENTORY-LIFECYCLE-AND-WAREHOUSE-INTELLIGENCE-02 — FASE 6
 *
 * Loads references for review vault with expanded fields.
 * Conserves references — never deletes.
 * Excludes from active commercial inventory.
 *
 * server-only — uses Prisma.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  resolveLifecycleState,
  computeActivityIntelligence,
  isCommerciallyEligibleReference,
  type DormantReferenceRecord,
  type ReferenceLifecycleState,
  type CommercialEligibilityInput,
} from "./reference-lifecycle";
import {
  resolveWarehouseByPk,
  isCommercialTextileWarehouse,
  isCommercialAvailableImportWarehouse,
  isProductionOnlyWarehouse,
  isImportStagingWarehouse,
  isImportContainerWarehouse,
  isAnyImportWarehouse,
  isExcludedWarehouse,
} from "./warehouse-master";

const db = prisma as any;

/** Expanded vault record with full commercial context (FASE 6) */
export interface VaultReferenceRecord extends DormantReferenceRecord {
  stockComercial: number;
  stockProduccion: number;
  stockStaging: number;
  stockContenedores: number;
  numBodegas: number;
  apareceEnMaletas: boolean;
  tieneOP: boolean;
  tienePedidosPendientes: boolean;
  motivo: string;
  commercialEligible: boolean;
  commercialIneligibilityReasons: string[];
}

export interface DormantReferenceSummary {
  totalReferences: number;
  active: number;
  lowActivity: number;
  dormant: number;
  archiveReview: number;
  noActivityData: number;
  vaultRecords: VaultReferenceRecord[];
  byLine: Record<string, { active: number; lowActivity: number; dormant: number; archiveReview: number; noData: number }>;
  byBucket: Record<string, number>;
}

/**
 * Load all product references and classify their lifecycle state.
 * Returns non-ACTIVE references for review + summary counts.
 */
export async function getDormantReferencesForReview(
  organizationId: string,
): Promise<DormantReferenceSummary> {
  const now = new Date();

  // 1. Load all non-archived products
  const products = await db.productEntity.findMany({
    where: {
      organizationId,
      status: { not: "archived" },
    },
    select: {
      id: true,
      externalId: true,
      name: true,
      sku: true,
      productLine: true,
      grupoSag: true,
      subgrupoSag: true,
      lineaSag: true,
      lastModifiedSag: true,
      lastSaleSag: true,
      createdAtSag: true,
    },
  });

  // 2. Load inventory levels for all products
  const productIds = products.map((p: any) => p.id);
  const inventoryLevels = await db.productInventoryLevel.findMany({
    where: {
      organizationId,
      productId: { in: productIds },
    },
    select: {
      productId: true,
      warehouseId: true,
      externalRef: true,
      quantity: true,
    },
  });

  // Build inventory map
  const inventoryMap = new Map<string, {
    total: number;
    stockComercial: number;
    stockProduccion: number;
    stockStaging: number;
    stockContenedores: number;
    warehouseIds: string[];
    breakdown: { warehouseId: string; ssCodigo: string | null; ssNombre: string | null; qty: number }[];
  }>();

  for (const lvl of inventoryLevels) {
    const qty = Number(lvl.quantity ?? 0);
    if (!inventoryMap.has(lvl.productId)) {
      inventoryMap.set(lvl.productId, {
        total: 0, stockComercial: 0, stockProduccion: 0,
        stockStaging: 0, stockContenedores: 0, warehouseIds: [], breakdown: [],
      });
    }
    const entry = inventoryMap.get(lvl.productId)!;
    if (qty > 0) {
      entry.total += qty;
      if (isCommercialTextileWarehouse(lvl.warehouseId) || isCommercialAvailableImportWarehouse(lvl.warehouseId)) {
        entry.stockComercial += qty;
      } else if (isProductionOnlyWarehouse(lvl.warehouseId)) {
        entry.stockProduccion += qty;
      } else if (isImportStagingWarehouse(lvl.warehouseId)) {
        entry.stockStaging += qty;
      } else if (isImportContainerWarehouse(lvl.warehouseId)) {
        entry.stockContenedores += qty;
      }
    }

    if (!entry.warehouseIds.includes(lvl.warehouseId)) {
      entry.warehouseIds.push(lvl.warehouseId);
    }

    const wh = resolveWarehouseByPk(lvl.warehouseId);
    entry.breakdown.push({
      warehouseId: lvl.warehouseId,
      ssCodigo: wh?.ssCodigo ?? lvl.externalRef ?? null,
      ssNombre: wh?.ssNombre ?? null,
      qty,
    });
  }

  // 3. Load maleta presence (batch)
  const maletaSet = new Set<string>();
  try {
    const bagItems = await db.vendorBagItem.findMany({
      where: { productId: { in: productIds }, bag: { organizationId } },
      select: { productId: true },
    });
    for (const bi of bagItems) maletaSet.add(bi.productId);
  } catch { /* VendorBagItem may not exist */ }

  // 4. Load active OPs (batch)
  const opSet = new Set<string>();
  try {
    const opEvents = await db.productionEvent.findMany({
      where: {
        organizationId,
        eventType: "OP",
        status: { in: ["ABIERTA", "EN_PROCESO", "PENDIENTE"] },
      },
      select: { rawJson: true },
      take: 1000,
    });
    for (const e of opEvents) {
      const raw = e.rawJson as any;
      if (raw?.items) {
        for (const item of raw.items) {
          if (item.k_sc_codigo_articulo) {
            // Match against externalId
            opSet.add(item.k_sc_codigo_articulo);
          }
        }
      }
      if (raw?.k_sc_codigo_articulo) opSet.add(raw.k_sc_codigo_articulo);
    }
  } catch { /* ProductionEvent may not exist */ }

  // 5. Load pending orders (batch)
  const pendingSet = new Set<string>();
  try {
    const pendingLines = await db.customerOrderLine.findMany({
      where: {
        organizationId,
        order: { status: { in: ["PENDIENTE", "APROBADO", "EN_PROCESO"] } },
      },
      select: { referenceCode: true },
    });
    for (const l of pendingLines) {
      if (l.referenceCode) pendingSet.add(l.referenceCode);
    }
  } catch { /* CustomerOrderLine may not exist */ }

  // 6. Classify each product
  let active = 0;
  let lowActivity = 0;
  let dormant = 0;
  let archiveReview = 0;
  let noActivityData = 0;
  const vaultRecords: VaultReferenceRecord[] = [];
  const byLine: Record<string, { active: number; lowActivity: number; dormant: number; archiveReview: number; noData: number }> = {};
  const byBucket: Record<string, number> = {};

  for (const p of products) {
    const lifecycle = resolveLifecycleState(
      { lastModifiedAt: p.lastModifiedSag, lastSaleDate: p.lastSaleSag },
      now,
    );

    const inv = inventoryMap.get(p.id);
    const available = inv?.total ?? 0;
    const lineLabel = p.lineaSag ?? p.productLine ?? "SIN_LINEA";
    if (!byLine[lineLabel]) byLine[lineLabel] = { active: 0, lowActivity: 0, dormant: 0, archiveReview: 0, noData: 0 };

    if (lifecycle.activityRecencyBucket) {
      byBucket[lifecycle.activityRecencyBucket] = (byBucket[lifecycle.activityRecencyBucket] ?? 0) + 1;
    }

    const extId = p.externalId ?? "";
    const hasOP = opSet.has(extId);
    const hasPending = pendingSet.has(extId);
    const apareceEnMaletas = maletaSet.has(p.id);

    switch (lifecycle.lifecycleState) {
      case "ACTIVE":
        active++;
        byLine[lineLabel].active++;
        break;
      case "LOW_ACTIVITY":
        lowActivity++;
        byLine[lineLabel].lowActivity++;
        break;
      case "DORMANT":
        dormant++;
        byLine[lineLabel].dormant++;
        break;
      case "ARCHIVE_REVIEW":
        archiveReview++;
        byLine[lineLabel].archiveReview++;
        break;
      case "NO_ACTIVITY_DATA":
        noActivityData++;
        byLine[lineLabel].noData++;
        break;
    }

    // Build vault record for non-ACTIVE references
    if (lifecycle.lifecycleState !== "ACTIVE") {
      const eligibilityInput: CommercialEligibilityInput = {
        lifecycleState: lifecycle.lifecycleState,
        productLine: p.productLine,
        status: "active",
        totalPositiveStock: inv?.stockComercial ?? 0,
        warehouseIds: inv?.warehouseIds ?? [],
        hasActiveOP: hasOP,
        hasPendingOrders: hasPending,
      };
      const eligibility = isCommerciallyEligibleReference(eligibilityInput);

      const flags: string[] = [];
      if (!p.lastModifiedSag) flags.push("MISSING_LAST_MODIFIED");
      if (!p.lastSaleSag) flags.push("MISSING_LAST_SALE");
      if (available === 0 && inv && inv.breakdown.length > 0) flags.push("ZERO_POSITIVE_STOCK");

      let motivo: string;
      switch (lifecycle.lifecycleState) {
        case "LOW_ACTIVITY":
          motivo = `Baja actividad: ${lifecycle.inactivityDays} dias sin actividad relevante (limite: 180)`;
          break;
        case "DORMANT":
          motivo = `Dormante: ${lifecycle.inactivityDays} dias sin actividad relevante (limite: 365)`;
          break;
        case "ARCHIVE_REVIEW":
          motivo = `Revision de archivo: ${lifecycle.inactivityDays} dias sin actividad (>730 dias)`;
          break;
        default:
          motivo = `Sin datos de actividad`;
          break;
      }

      vaultRecords.push({
        productId: p.id,
        reference: p.sku ?? p.externalId ?? p.id,
        description: p.name,
        line: lineLabel,
        group: p.grupoSag ?? null,
        subgroup: p.subgrupoSag ?? null,
        available,
        warehouseBreakdown: inv?.breakdown ?? [],
        lastModifiedAt: p.lastModifiedSag,
        lastSaleDate: p.lastSaleSag,
        lastRelevantActivityAt: lifecycle.lastRelevantActivityAt,
        inactivityDays: lifecycle.inactivityDays,
        lifecycleState: lifecycle.lifecycleState,
        reason: motivo,
        dataQualityFlags: flags,
        stockComercial: inv?.stockComercial ?? 0,
        stockProduccion: inv?.stockProduccion ?? 0,
        stockStaging: inv?.stockStaging ?? 0,
        stockContenedores: inv?.stockContenedores ?? 0,
        numBodegas: inv?.warehouseIds.length ?? 0,
        apareceEnMaletas,
        tieneOP: hasOP,
        tienePedidosPendientes: hasPending,
        motivo,
        commercialEligible: eligibility.eligible,
        commercialIneligibilityReasons: eligibility.reasons,
      });
    }
  }

  return {
    totalReferences: products.length,
    active,
    lowActivity,
    dormant,
    archiveReview,
    noActivityData,
    vaultRecords,
    byLine,
    byBucket,
  };
}
