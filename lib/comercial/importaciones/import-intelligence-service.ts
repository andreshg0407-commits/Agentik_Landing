/**
 * lib/comercial/importaciones/import-intelligence-service.ts
 *
 * Supply intelligence layer for Importaciones.
 * Orchestrates existing services + decision engine to produce
 * fully classified, KPI-ready data for the UI.
 *
 * Rules:
 *   - No React imports
 *   - All business calculations here, never in React components
 *   - Consumes listImportedReferences(), never queries PIL directly
 *
 * Sprint: AGENTIK-IMPORTS-SIMPLIFICATION-01
 */

import { prisma } from "@/lib/prisma";
import { listImportedReferences } from "./import-service";
import { evaluateInventoryAging, evaluateRepurchase } from "./import-decision-engine";
import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "./import-policy-pack-config";
import type {
  ImportedReference,
  ImportSupplyIntelligenceItem,
  ImportSupplyKpis,
  ImportLastInboundSource,
  ImportSizeClass,
  SaludComercial,
  RecompraClassification,
  RotacionClassification,
  EnvejecimientoClassification,
  BajaRotacionClassification,
  Prioridad,
  InventoryAgingStatusLite,
} from "./import-types";
import type { ImportReferenceInput, ImportPolicyContext } from "./import-policy-types";
import { resolveLifecycleState } from "@/lib/inventory/reference-lifecycle";

import type { StockDataQuality, SalesDataQuality } from "./import-types";

// ── Constants ────────────────────────────────────────────────────────────────

const INVENTARIO_LENTO_DAYS = 240;  // >8 months
const CANONICAL_SIZE_CLASSES = new Set<string>(["PEQUENO", "MEDIANO", "GRANDE"]);

// ── Size-aware reorder thresholds (Castillitos initial calibration) ──────────
// salesTotal6m must be STRICTLY GREATER THAN threshold for INMEDIATA.
// These will move to import-policy-pack-config.ts when formalized.

const SIZE_REORDER_THRESHOLDS: Record<ImportSizeClass, number> = {
  PEQUENO: 100,
  MEDIANO: 50,
  GRANDE: 10,
};

const LOW_COVERAGE_DAYS = 60;         // cobertura <= 60d = supply emergency
const MIN_SALES_SIN_CLASIFICAR = 5;   // minimum 6M sales for VIGILAR without size

const SIZE_DISPLAY_LABELS: Record<ImportSizeClass, string> = {
  PEQUENO: "Pequeno",
  MEDIANO: "Mediano",
  GRANDE: "Grande",
};

// ── Main entry point ─────────────────────────────────────────────────────────

export interface ImportSupplyIntelligenceResult {
  items: ImportSupplyIntelligenceItem[];
  kpis: ImportSupplyKpis;
}

export async function buildImportSupplyIntelligence(
  orgId: string,
): Promise<ImportSupplyIntelligenceResult> {
  // 1. Get all imported references (existing pipeline)
  const references = await listImportedReferences(orgId);
  if (references.length === 0) {
    return { items: [], kpis: emptyKpis() };
  }

  // 2. Load costo + handlingUnit + SAG dates from ProductEntity
  const productIds = references.map(r => r.productId);
  const productDataMap = await loadProductData(orgId, productIds);

  // 3. Run decision engine evaluations
  const ctx: ImportPolicyContext = { tenantId: "castillitos" };
  const config = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;
  const engineInputs = references.map(r => toEngineInput(r));

  const agingResults = evaluateInventoryAging(ctx, engineInputs, config);
  const agingMap = new Map(agingResults.map(r => [r.reference, r]));

  const repurchaseResults = engineInputs.map(input => evaluateRepurchase(ctx, input, config));
  const repurchaseMap = new Map(repurchaseResults.map(r => [r.reference, r]));

  // 4. Compute rotation rankings for classification
  const sortedByVolume = [...references].filter(r => r.soldNet > 0).sort((a, b) => b.soldNet - a.soldNet);
  const topVolumeRefs = new Set(sortedByVolume.slice(0, Math.max(10, Math.ceil(sortedByVolume.length * 0.15))).map(r => r.reference));

  const sortedBySpeed = [...references].filter(r => r.salesTotal6m > 0).sort((a, b) => (b.salesTotal6m / 6) - (a.salesTotal6m / 6));
  const topSpeedRefs = new Set(sortedBySpeed.slice(0, Math.max(10, Math.ceil(sortedBySpeed.length * 0.15))).map(r => r.reference));

  // 5. Build intelligence items
  const items: ImportSupplyIntelligenceItem[] = references.map(ref => {
    const pd = productDataMap.get(ref.productId);
    const costo = pd?.costo ?? null;
    const aging = agingMap.get(ref.reference);
    const repurchase = repurchaseMap.get(ref.reference);

    const agingStatus: InventoryAgingStatusLite = aging?.agingStatus ?? "NORMAL";
    const ritmoPromedioVentas = ref.salesTotal6m > 0 ? Math.round((ref.salesTotal6m / 6) * 10) / 10 : null;
    const coberturaPromedioDias = ritmoPromedioVentas && ritmoPromedioVentas > 0
      ? Math.round(ref.remaining / (ref.salesTotal6m / 180))
      : null;
    const capitalInmovilizado = costo !== null && ref.remaining > 0
      ? Math.round(ref.remaining * costo)
      : null;

    // Lifecycle state
    const lifecycleState = pd
      ? resolveLifecycleState({
          lastModifiedAt: pd.lastModifiedSag ? new Date(pd.lastModifiedSag) : null,
          lastSaleDate: pd.lastSaleSag ? new Date(pd.lastSaleSag) : null,
        }).lifecycleState
      : "NO_ACTIVITY_DATA";

    // ── Last inbound date: C1/C2 receipt → lastPurchaseSag fallback ──
    const { lastInboundDate, lastInboundSource, daysSinceLastInbound } =
      resolveLastInbound(ref, pd?.lastPurchaseSag ?? null);

    // Size class from handlingUnit
    const sizeClass = resolveSizeClass(pd?.handlingUnit ?? null);

    // Commercial health badge (internal)
    const { saludComercial, saludComercialRazon } = classifySaludComercial(ref, agingStatus);

    // Classifications — size-aware calibration replaces simple status mapping
    const { classification: recompraClassification, reason: recompraReason } = calibrateRecompra({
      sizeClass,
      salesTotal6m: ref.salesTotal6m,
      soldNet: ref.soldNet,
      remaining: ref.remaining,
      stockDataQuality: ref.stockDataQuality,
      salesDataQuality: ref.salesDataQuality,
      coberturaPromedioDias,
    });
    const rotacionClassification = classifyRotacion(ref, topVolumeRefs, topSpeedRefs);
    const envejecimientoClassification = classifyEnvejecimiento(ref);
    const bajaRotacionClassification = classifyBajaRotacion(ref, agingStatus);

    // Priority (internal)
    const { prioridad, prioridadRazon } = classifyPrioridad(ref, saludComercial);

    // Decision engine evidence
    const repurchaseActionRationale = repurchase?.evidence.actionRationale ?? null;
    const repurchaseRecommendedAction = repurchase?.recommendedAction ?? null;

    const fmtDate = (d: unknown) => d ? new Date(d as string).toISOString().split("T")[0] : null;

    return {
      ...ref,
      costo,
      capitalInmovilizado,
      coberturaPromedioDias,
      ritmoPromedioVentas,
      agingStatus,
      lifecycleState,
      saludComercial,
      saludComercialRazon,
      recompraClassification,
      recompraReason,
      rotacionClassification,
      envejecimientoClassification,
      bajaRotacionClassification,
      prioridad,
      prioridadRazon,
      repurchaseActionRationale,
      repurchaseRecommendedAction,
      createdAtSag: fmtDate(pd?.createdAtSag),
      lastModifiedSag: fmtDate(pd?.lastModifiedSag),
      lastPurchaseSag: fmtDate(pd?.lastPurchaseSag),
      lastSaleSag: fmtDate(pd?.lastSaleSag),
      lastInboundDate,
      lastInboundSource,
      daysSinceLastInbound,
      sizeClass,
    };
  });

  // 6. Compute KPIs
  const kpis = computeKpis(items);

  return { items, kpis };
}

// ── Last inbound resolver ────────────────────────────────────────────────────

function resolveLastInbound(
  ref: ImportedReference,
  lastPurchaseSag: string | null,
): { lastInboundDate: string | null; lastInboundSource: ImportLastInboundSource; daysSinceLastInbound: number | null } {
  // Priority 1: C1/C2 receipt date (highest quality)
  if (ref.entryDateSource === "SAG_RECEIPT" && ref.lastEntryDate) {
    return {
      lastInboundDate: ref.lastEntryDate,
      lastInboundSource: "SAG_RECEIPT_C1_C2",
      daysSinceLastInbound: ref.daysSinceLastEntry,
    };
  }

  // Priority 2: ProductEntity.lastPurchaseSag (d_ultima_compra)
  if (lastPurchaseSag) {
    const purchaseDate = new Date(lastPurchaseSag);
    const days = Math.floor((Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      lastInboundDate: purchaseDate.toISOString().split("T")[0],
      lastInboundSource: "LAST_PURCHASE_SAG",
      daysSinceLastInbound: days,
    };
  }

  return { lastInboundDate: null, lastInboundSource: "UNAVAILABLE", daysSinceLastInbound: null };
}

// ── Size class resolver ──────────────────────────────────────────────────────

function resolveSizeClass(handlingUnit: string | null): ImportSizeClass | null {
  if (handlingUnit && CANONICAL_SIZE_CLASSES.has(handlingUnit)) {
    return handlingUnit as ImportSizeClass;
  }
  return null;
}

// ── Classification functions ─────────────────────────────────────────────────

function classifySaludComercial(
  ref: ImportedReference,
  agingStatus: InventoryAgingStatusLite,
): { saludComercial: SaludComercial; saludComercialRazon: string } {
  const hasConfirmedStock = ref.stockDataQuality === "CONFIRMED";
  const hasConfirmedDate = ref.entryDateSource === "SAG_RECEIPT";

  // SIN_DATOS — insufficient data for any classification
  if (!hasConfirmedDate && ref.soldNet === 0) {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin fecha de ingreso ni ventas registradas." };
  }
  if (!hasConfirmedStock && !hasConfirmedDate && ref.salesTotal6m === 0) {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin datos confirmados de stock ni fecha de ingreso." };
  }

  // CRITICA — only with confirmed data backing the classification
  if (hasConfirmedDate && (agingStatus === "LOW_ROTATION" || agingStatus === "OBSOLETE_CANDIDATE")) {
    const meses = Math.round(ref.daysSinceLastEntry! / 30);
    return {
      saludComercial: "CRITICA",
      saludComercialRazon: `Inventario de ${meses} meses sin reposicion${ref.salesTotal6m > 0 ? ` (${ref.salesTotal6m} und vendidas en 6M)` : ""}.`,
    };
  }
  if (hasConfirmedStock && ref.remaining === 0 && ref.salesTotal6m > 0) {
    return { saludComercial: "CRITICA", saludComercialRazon: `Stock agotado con ${ref.salesTotal6m} und vendidas en 6M.` };
  }

  // EN_RIESGO
  if (hasConfirmedDate && agingStatus === "AGING") {
    const meses = Math.round(ref.daysSinceLastEntry! / 30);
    return { saludComercial: "EN_RIESGO", saludComercialRazon: `Inventario envejeciendo — ${meses} meses sin ingreso.` };
  }
  if (hasConfirmedStock && ref.remaining > 0 && ref.remaining <= 20 && ref.salesTotal6m > 0) {
    return { saludComercial: "EN_RIESGO", saludComercialRazon: `Stock bajo (${ref.remaining} und) con demanda activa (${ref.salesTotal6m} und en 6M).` };
  }

  // SANA — requires confirmed stock WITH positive remaining
  if (hasConfirmedStock && ref.remaining > 0 && ref.salesTotal6m > 0) {
    return { saludComercial: "SANA", saludComercialRazon: `Stock confirmado (${ref.remaining} und) con ventas activas.` };
  }
  if (!hasConfirmedStock && ref.salesTotal6m > 0) {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: `Ventas activas (${ref.salesTotal6m} und en 6M) pero sin datos de stock B24.` };
  }

  // Distinguish confirmed zero sales from unavailable
  if (ref.salesDataQuality === "SYNCED") {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin ventas confirmadas en los ultimos 6 meses." };
  }
  return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin datos de ventas disponibles." };
}

// ── Size-aware recompra calibration ───────────────────────────────────────────
//
// Replaces the simple status mapper with demand-calibrated logic.
// INMEDIATA requires: known size + sales > threshold + confirmed stock + depleted/low coverage.
// VIGILAR: meaningful sales below threshold, or adequate stock, or missing size.
// NO_RECOMPRAR: negligible demand for the size category.
// SIN_DATOS: no sales history or sync failure.

function calibrateRecompra(input: {
  sizeClass: ImportSizeClass | null;
  salesTotal6m: number;
  soldNet: number;
  remaining: number;
  stockDataQuality: StockDataQuality;
  salesDataQuality: SalesDataQuality;
  coberturaPromedioDias: number | null;
}): { classification: RecompraClassification; reason: string } {
  const { sizeClass, salesTotal6m, soldNet, remaining, stockDataQuality, salesDataQuality, coberturaPromedioDias } = input;

  // Gate: no sales history
  if (soldNet === 0) {
    return { classification: "SIN_DATOS", reason: "Sin historial de ventas." };
  }
  if (salesDataQuality !== "SYNCED") {
    return { classification: "SIN_DATOS", reason: "Datos de ventas no disponibles." };
  }

  const stockConfirmed = stockDataQuality === "CONFIRMED";
  const isDepleted = stockConfirmed && remaining === 0;
  const isLowCoverage = coberturaPromedioDias !== null && coberturaPromedioDias <= LOW_COVERAGE_DAYS;
  const needsStock = isDepleted || isLowCoverage;

  // ── Sized references ──
  if (sizeClass !== null) {
    const threshold = SIZE_REORDER_THRESHOLDS[sizeClass];
    const sizeLabel = SIZE_DISPLAY_LABELS[sizeClass];
    const vigilarFloor = Math.max(Math.ceil(threshold * 0.2), 3);

    if (salesTotal6m > threshold) {
      // Above threshold — check stock conditions
      if (!stockConfirmed) {
        return { classification: "VIGILAR", reason: `Ventas superan umbral pero sin dato de stock en B24.` };
      }
      if (needsStock) {
        if (isDepleted) {
          return { classification: "INMEDIATA", reason: `${sizeLabel} agotado; ${salesTotal6m} unidades vendidas en 6 meses.` };
        }
        return { classification: "INMEDIATA", reason: `${sizeLabel} con cobertura de ${coberturaPromedioDias} dias; ${salesTotal6m} unidades vendidas en 6 meses.` };
      }
      // Stock sufficient
      return { classification: "VIGILAR", reason: `Stock disponible suficiente para ${coberturaPromedioDias ?? "?"} dias.` };
    }

    // Below threshold but meaningful sales OR stock available with demand
    if (salesTotal6m >= vigilarFloor) {
      return { classification: "VIGILAR", reason: `Ventas por debajo del umbral de recompra para producto ${sizeLabel.toLowerCase()} (${salesTotal6m}/${threshold}).` };
    }

    // Stock available with some demand — always VIGILAR (product is alive)
    if (salesTotal6m > 0 && stockConfirmed && remaining > 0) {
      return { classification: "VIGILAR", reason: `Stock disponible (${remaining} und) con demanda activa (${salesTotal6m} und en 6M).` };
    }

    // Negligible demand + depleted or no stock confirmation
    if (salesTotal6m > 0) {
      if (isDepleted) {
        return { classification: "NO_RECOMPRAR", reason: `Agotado, pero solo vendio ${salesTotal6m} unidad${salesTotal6m > 1 ? "es" : ""} en 6 meses.` };
      }
      return { classification: "NO_RECOMPRAR", reason: `Ventas insuficientes para justificar importacion (${salesTotal6m} und en 6M).` };
    }

    // Zero recent sales
    if (isDepleted) {
      return { classification: "NO_RECOMPRAR", reason: "Agotado sin ventas en los ultimos 6 meses." };
    }
    return { classification: "NO_RECOMPRAR", reason: "Sin ventas en los ultimos 6 meses." };
  }

  // ── Unsized references ──
  if (salesTotal6m >= MIN_SALES_SIN_CLASIFICAR) {
    return { classification: "VIGILAR", reason: "Sin tamano clasificado; revisar antes de comprar." };
  }
  if (salesTotal6m > 0) {
    return { classification: "NO_RECOMPRAR", reason: `Solo ${salesTotal6m} unidad${salesTotal6m > 1 ? "es" : ""} vendida${salesTotal6m > 1 ? "s" : ""} en 6M; sin tamano clasificado.` };
  }

  return { classification: "NO_RECOMPRAR", reason: "Sin ventas recientes." };
}

function classifyRotacion(
  ref: ImportedReference,
  topVolumeRefs: Set<string>,
  topSpeedRefs: Set<string>,
): RotacionClassification {
  if (ref.soldNet === 0 && ref.salesTotal6m === 0) return "SIN_VENTAS";
  if (topSpeedRefs.has(ref.reference)) return "MAS_RAPIDA";
  if (topVolumeRefs.has(ref.reference)) return "MAS_VENDIDA";
  return "NORMAL";
}

function classifyEnvejecimiento(ref: ImportedReference): EnvejecimientoClassification {
  if (ref.entryDateSource === "NONE" || ref.daysSinceLastEntry === null) return "SIN_DATOS";
  if (ref.daysSinceLastEntry <= 90) return "0_3M";
  if (ref.daysSinceLastEntry <= 180) return "3_6M";
  if (ref.daysSinceLastEntry <= 240) return "6_8M";
  if (ref.daysSinceLastEntry <= 365) return "8_12M";
  return "12M_PLUS";
}

function classifyBajaRotacion(
  ref: ImportedReference,
  agingStatus: InventoryAgingStatusLite,
): BajaRotacionClassification | null {
  const hasConfirmedStock = ref.stockDataQuality === "CONFIRMED";
  const hasConfirmedDate = ref.entryDateSource === "SAG_RECEIPT";
  const isOldEnough = hasConfirmedDate && ref.daysSinceLastEntry !== null && ref.daysSinceLastEntry > 240;

  // All baja rotacion categories require: confirmed date > 240 days + confirmed stock > 0
  if (!isOldEnough || !hasConfirmedStock || ref.remaining <= 0) return null;

  if (ref.salesTotal6m === 0) return "SIN_MOVIMIENTO";
  if (ref.remaining > 100 && ref.salesTotal6m < 10) return "SOBRESTOCK";
  if (agingStatus === "OBSOLETE_CANDIDATE") return "REVISAR_CONTINUIDAD";
  return null;
}

function classifyPrioridad(
  ref: ImportedReference,
  saludComercial: SaludComercial,
): { prioridad: Prioridad; prioridadRazon: string } {
  // ALTA — with data-specific reasons
  if (ref.repurchaseStatus === "RECOMPRAR" || saludComercial === "CRITICA") {
    const razones: string[] = [];
    if (ref.repurchaseStatus === "RECOMPRAR") {
      if (ref.repurchaseMotivo === "desabastecimiento") {
        razones.push(`Stock agotado${ref.salesTotal6m > 0 ? `; ${ref.salesTotal6m} und vendidas en 6M` : ""}`);
      } else if (ref.repurchaseMotivo === "alta_rotacion") {
        razones.push(`Alta rotacion (${ref.percentSold !== null ? ref.percentSold + "% vendido" : "demanda activa"})`);
      } else if (ref.repurchaseMotivo === "exito_historico") {
        razones.push(`Exito historico (${ref.soldNet} und vendidas)`);
      } else if (ref.repurchaseMotivo === "recompra_recurrente") {
        razones.push(`Recompra recurrente (${ref.batchCount} lotes)`);
      } else {
        razones.push("recompra sugerida");
      }
    }
    if (saludComercial === "CRITICA" && ref.repurchaseStatus !== "RECOMPRAR") {
      razones.push("salud critica");
    }
    return { prioridad: "ALTA", prioridadRazon: razones.join(". ") + "." };
  }

  // MEDIA
  if (ref.repurchaseStatus === "VIGILAR" || saludComercial === "EN_RIESGO") {
    if (saludComercial === "EN_RIESGO" && ref.stockDataQuality === "CONFIRMED" && ref.remaining <= 20) {
      return { prioridad: "MEDIA", prioridadRazon: `Stock bajo (${ref.remaining} und) con demanda activa.` };
    }
    if (ref.repurchaseStatus === "VIGILAR") {
      return { prioridad: "MEDIA", prioridadRazon: `Stock suficiente (${ref.remaining} und); monitorear demanda.` };
    }
    return { prioridad: "MEDIA", prioridadRazon: "Monitorear esta semana." };
  }

  // BAJA
  if (saludComercial === "SANA" && ref.salesTotal6m > 0) {
    return { prioridad: "BAJA", prioridadRazon: "Sin accion requerida." };
  }

  return { prioridad: "SIN_ACCION", prioridadRazon: "Verificar datos." };
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function computeKpis(items: ImportSupplyIntelligenceItem[]): ImportSupplyKpis {
  const comprarAhora = items.filter(i => i.recompraClassification === "INMEDIATA").length;
  const revisarRecompra = items.filter(i => i.recompraClassification === "VIGILAR").length;
  const noRecomprar = items.filter(i => i.recompraClassification === "NO_RECOMPRAR").length;
  const inventarioLento = items.filter(i =>
    i.daysSinceLastInbound !== null && i.daysSinceLastInbound > INVENTARIO_LENTO_DAYS && i.remaining > 0,
  ).length;

  return {
    comprarAhora,
    revisarRecompra,
    noRecomprar,
    inventarioLento,
    totalRefs: items.length,
  };
}

function emptyKpis(): ImportSupplyKpis {
  return {
    comprarAhora: 0,
    revisarRecompra: 0,
    noRecomprar: 0,
    inventarioLento: 0,
    totalRefs: 0,
  };
}

// ── Data loader ──────────────────────────────────────────────────────────────

interface ProductData {
  costo: number | null;
  handlingUnit: string | null;
  createdAtSag: string | null;
  lastModifiedSag: string | null;
  lastPurchaseSag: string | null;
  lastSaleSag: string | null;
}

async function loadProductData(
  orgId: string,
  productIds: string[],
): Promise<Map<string, ProductData>> {
  const map = new Map<string, ProductData>();
  if (productIds.length === 0) return map;

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, id: { in: productIds } },
    select: {
      id: true,
      costo: true,
      handlingUnit: true,
      createdAtSag: true,
      lastModifiedSag: true,
      lastPurchaseSag: true,
      lastSaleSag: true,
    },
  });

  for (const p of products) {
    const costo = p.costo !== null && p.costo !== undefined ? Number(p.costo) : null;
    map.set(p.id, {
      costo: costo !== null && costo > 0 ? costo : null,
      handlingUnit: p.handlingUnit ?? null,
      createdAtSag: p.createdAtSag ?? null,
      lastModifiedSag: p.lastModifiedSag ?? null,
      lastPurchaseSag: p.lastPurchaseSag ?? null,
      lastSaleSag: p.lastSaleSag ?? null,
    });
  }

  return map;
}

// ── Adapter: ImportedReference → ImportReferenceInput ─────────────────────────

function toEngineInput(ref: ImportedReference): ImportReferenceInput {
  return {
    reference: ref.reference,
    description: ref.description,
    group: "IMPORTACION",
    subgroup: null,
    size: null,
    currentInventory: ref.remaining,
    totalSold: ref.soldNet,
    sales6m: ref.salesTotal6m,
    sales6mMonthly: [], // Monthly breakdown not available at list level
    lastEntryDate: ref.lastEntryDate,
    daysSinceLastEntry: ref.daysSinceLastEntry,
    batchCount: ref.batchCount,
    percentSold: ref.percentSold,
    pricePV3: ref.pricePV3,
    pricePV4: ref.pricePV4,
    dominantChannel: ref.dominantChannel,
  };
}
