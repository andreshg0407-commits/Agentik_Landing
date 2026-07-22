/**
 * lib/comercial/importaciones/import-intelligence-service.ts
 *
 * Supply intelligence layer for Importaciones.
 * Orchestrates existing services + decision engine to produce
 * fully classified, KPI-ready data for the UI.
 *
 * Rules:
 *   - No Prisma imports (delegates to import-service)
 *   - No React imports
 *   - All business calculations here, never in React components
 *   - Consumes listImportedReferences(), never queries PIL directly
 *
 * Sprint: AGENTIK-IMPORTS-AUDIT-01
 */

import { prisma } from "@/lib/prisma";
import { listImportedReferences } from "./import-service";
import { evaluateInventoryAging, evaluateLowRotation, evaluateRepurchase } from "./import-decision-engine";
import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "./import-policy-pack-config";
import type { ImportedReference, ImportSupplyIntelligenceItem, ImportSupplyKpis, SaludComercial, RecompraClassification, RotacionClassification, EnvejecimientoClassification, BajaRotacionClassification, Prioridad, InventoryAgingStatusLite } from "./import-types";
import type { ImportReferenceInput, ImportPolicyContext, InventoryAgingStatus } from "./import-policy-types";
import { resolveLifecycleState } from "@/lib/inventory/reference-lifecycle";

// ── Constants ────────────────────────────────────────────────────────────────

const HIGH_ROTATION_THRESHOLD = 50; // salesTotal6m >= 50 for KPI "Alta rotacion"

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

  // 2. Load costo from ProductEntity
  const productIds = references.map(r => r.productId);
  const costoMap = await loadCostoMap(orgId, productIds);

  // 3. Load lifecycle state inputs
  const lifecycleMap = await loadLifecycleInputs(orgId, productIds);

  // 4. Run decision engine evaluations
  const ctx: ImportPolicyContext = { tenantId: "castillitos" };
  const config = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;
  const engineInputs = references.map(r => toEngineInput(r));

  const agingResults = evaluateInventoryAging(ctx, engineInputs, config);
  const agingMap = new Map(agingResults.map(r => [r.reference, r]));

  const repurchaseResults = engineInputs.map(input => evaluateRepurchase(ctx, input, config));
  const repurchaseMap = new Map(repurchaseResults.map(r => [r.reference, r]));

  // 5. Compute rotation rankings for classification
  const sortedByVolume = [...references].filter(r => r.soldNet > 0).sort((a, b) => b.soldNet - a.soldNet);
  const topVolumeRefs = new Set(sortedByVolume.slice(0, Math.max(10, Math.ceil(sortedByVolume.length * 0.15))).map(r => r.reference));

  const sortedBySpeed = [...references].filter(r => r.salesTotal6m > 0).sort((a, b) => (b.salesTotal6m / 6) - (a.salesTotal6m / 6));
  const topSpeedRefs = new Set(sortedBySpeed.slice(0, Math.max(10, Math.ceil(sortedBySpeed.length * 0.15))).map(r => r.reference));

  // 6. Build intelligence items
  const items: ImportSupplyIntelligenceItem[] = references.map(ref => {
    const costo = costoMap.get(ref.productId) ?? null;
    const aging = agingMap.get(ref.reference);
    const repurchase = repurchaseMap.get(ref.reference);
    const lifecycle = lifecycleMap.get(ref.productId);

    const agingStatus: InventoryAgingStatusLite = aging?.agingStatus ?? "NORMAL";
    const ritmoPromedioVentas = ref.salesTotal6m > 0 ? Math.round((ref.salesTotal6m / 6) * 10) / 10 : null;
    const coberturaPromedioDias = ritmoPromedioVentas && ritmoPromedioVentas > 0
      ? Math.round(ref.remaining / (ref.salesTotal6m / 180))
      : null;
    const capitalInmovilizado = costo !== null && ref.remaining > 0
      ? Math.round(ref.remaining * costo)
      : null;

    // Lifecycle state
    const lifecycleState = lifecycle
      ? resolveLifecycleState(lifecycle).lifecycleState
      : "NO_ACTIVITY_DATA";

    // Commercial health badge
    const { saludComercial, saludComercialRazon } = classifySaludComercial(ref, agingStatus);

    // Classifications
    const recompraClassification = classifyRecompra(ref.repurchaseStatus);
    const rotacionClassification = classifyRotacion(ref, topVolumeRefs, topSpeedRefs);
    const envejecimientoClassification = classifyEnvejecimiento(ref.daysSinceLastEntry);
    const bajaRotacionClassification = classifyBajaRotacion(ref, agingStatus);

    // Priority
    const { prioridad, prioridadRazon } = classifyPrioridad(ref, saludComercial);

    // Decision engine evidence
    const repurchaseActionRationale = repurchase?.evidence.actionRationale ?? null;
    const repurchaseRecommendedAction = repurchase?.recommendedAction ?? null;

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
      rotacionClassification,
      envejecimientoClassification,
      bajaRotacionClassification,
      prioridad,
      prioridadRazon,
      repurchaseActionRationale,
      repurchaseRecommendedAction,
    };
  });

  // 7. Compute KPIs
  const kpis = computeKpis(items);

  return { items, kpis };
}

// ── Classification functions ─────────────────────────────────────────────────

function classifySaludComercial(
  ref: ImportedReference,
  agingStatus: InventoryAgingStatusLite,
): { saludComercial: SaludComercial; saludComercialRazon: string } {
  // SIN_DATOS
  if (ref.daysSinceLastEntry === null && ref.soldNet === 0) {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin fecha de ingreso ni ventas registradas." };
  }

  // CRITICA
  if (agingStatus === "LOW_ROTATION" || agingStatus === "OBSOLETE_CANDIDATE") {
    const meses = ref.daysSinceLastEntry !== null ? Math.round(ref.daysSinceLastEntry / 30) : null;
    return {
      saludComercial: "CRITICA",
      saludComercialRazon: meses !== null
        ? `Inventario de ${meses} meses sin reposicion${ref.salesTotal6m > 0 ? " con demanda activa" : ""}.`
        : `Sin fecha de ingreso con ${ref.remaining} und en inventario.`,
    };
  }
  if (ref.remaining === 0 && ref.salesTotal6m > 10) {
    return { saludComercial: "CRITICA", saludComercialRazon: `Agotado con demanda activa (${ref.salesTotal6m} und en 6M).` };
  }

  // EN_RIESGO
  if (agingStatus === "AGING") {
    return { saludComercial: "EN_RIESGO", saludComercialRazon: "Inventario envejeciendo — supera 6 meses sin ingreso." };
  }
  if (ref.remaining > 0 && ref.remaining <= 20 && ref.salesTotal6m > 0) {
    return { saludComercial: "EN_RIESGO", saludComercialRazon: `Stock bajo (${ref.remaining} und) con demanda activa.` };
  }

  // SANA
  if (ref.salesTotal6m > 0) {
    return { saludComercial: "SANA", saludComercialRazon: "Inventario saludable con ventas activas." };
  }

  return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin ventas en los ultimos 6 meses." };
}

function classifyRecompra(status: ImportedReference["repurchaseStatus"]): RecompraClassification {
  switch (status) {
    case "RECOMPRAR": return "INMEDIATA";
    case "VIGILAR": return "VIGILAR";
    case "NO_RECOMPRAR": return "NO_RECOMPRAR";
    case "SIN_DATOS": return "SIN_DATOS";
  }
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

function classifyEnvejecimiento(daysSinceLastEntry: number | null): EnvejecimientoClassification {
  if (daysSinceLastEntry === null) return "12M_PLUS";
  if (daysSinceLastEntry <= 90) return "0_3M";
  if (daysSinceLastEntry <= 180) return "3_6M";
  if (daysSinceLastEntry <= 240) return "6_8M";
  if (daysSinceLastEntry <= 365) return "8_12M";
  return "12M_PLUS";
}

function classifyBajaRotacion(
  ref: ImportedReference,
  agingStatus: InventoryAgingStatusLite,
): BajaRotacionClassification | null {
  if (ref.salesTotal6m === 0 && ref.remaining > 0) return "SIN_MOVIMIENTO";
  if (ref.remaining > 100 && ref.salesTotal6m < 10) return "SOBRESTOCK";
  if (agingStatus === "OBSOLETE_CANDIDATE") return "REVISAR_CONTINUIDAD";
  return null;
}

function classifyPrioridad(
  ref: ImportedReference,
  saludComercial: SaludComercial,
): { prioridad: Prioridad; prioridadRazon: string } {
  if (ref.repurchaseStatus === "RECOMPRAR" || saludComercial === "CRITICA") {
    const razones: string[] = [];
    if (ref.repurchaseStatus === "RECOMPRAR") razones.push("recompra sugerida");
    if (saludComercial === "CRITICA") razones.push("salud critica");
    return { prioridad: "ALTA", prioridadRazon: `Requiere decision inmediata: ${razones.join(", ")}.` };
  }
  if (ref.repurchaseStatus === "VIGILAR" || saludComercial === "EN_RIESGO") {
    return { prioridad: "MEDIA", prioridadRazon: "Monitorear esta semana." };
  }
  if (saludComercial === "SANA" && ref.salesTotal6m > 0) {
    return { prioridad: "BAJA", prioridadRazon: "Sin accion requerida." };
  }
  return { prioridad: "SIN_ACCION", prioridadRazon: "Verificar datos." };
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function computeKpis(items: ImportSupplyIntelligenceItem[]): ImportSupplyKpis {
  const recompraInmediata = items.filter(i => i.recompraClassification === "INMEDIATA").length;
  const altaRotacion = items.filter(i => i.salesTotal6m >= HIGH_ROTATION_THRESHOLD).length;
  const bajaRotacion = items.filter(i =>
    i.agingStatus === "LOW_ROTATION" || i.agingStatus === "OBSOLETE_CANDIDATE",
  ).length;
  const inventarioMas8Meses = items.filter(i =>
    i.daysSinceLastEntry !== null && i.daysSinceLastEntry > 240 && i.remaining > 0,
  ).length;

  // Cobertura promedio (only refs with 6M sales)
  const refsConVentas = items.filter(i => i.coberturaPromedioDias !== null);
  const coberturaPromedioDias = refsConVentas.length > 0
    ? Math.round(refsConVentas.reduce((s, i) => s + i.coberturaPromedioDias!, 0) / refsConVentas.length)
    : null;

  // Capital en inventario lento (aging != NEW/NORMAL, with costo)
  const refsLentas = items.filter(i =>
    i.agingStatus !== "NEW" && i.agingStatus !== "NORMAL" && i.capitalInmovilizado !== null,
  );
  const capitalInventarioLento = refsLentas.length > 0
    ? refsLentas.reduce((s, i) => s + i.capitalInmovilizado!, 0)
    : null;
  const refsConCosto = items.filter(i => i.costo !== null).length;
  const capitalInventarioLentoCobertura = items.length > 0
    ? Math.round((refsConCosto / items.length) * 100)
    : 0;

  return {
    recompraInmediata,
    altaRotacion,
    bajaRotacion,
    inventarioMas8Meses,
    coberturaPromedioDias,
    capitalInventarioLento,
    capitalInventarioLentoCobertura,
  };
}

function emptyKpis(): ImportSupplyKpis {
  return {
    recompraInmediata: 0,
    altaRotacion: 0,
    bajaRotacion: 0,
    inventarioMas8Meses: 0,
    coberturaPromedioDias: null,
    capitalInventarioLento: null,
    capitalInventarioLentoCobertura: 0,
  };
}

// ── Data loaders ─────────────────────────────────────────────────────────────

async function loadCostoMap(orgId: string, productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, id: { in: productIds } },
    select: { id: true, costo: true },
  });

  for (const p of products) {
    const costo = p.costo !== null && p.costo !== undefined ? Number(p.costo) : null;
    if (costo !== null && costo > 0) {
      map.set(p.id, costo);
    }
  }

  return map;
}

async function loadLifecycleInputs(
  orgId: string,
  productIds: string[],
): Promise<Map<string, { lastModifiedAt: Date | null; lastSaleDate: Date | null }>> {
  const map = new Map<string, { lastModifiedAt: Date | null; lastSaleDate: Date | null }>();
  if (productIds.length === 0) return map;

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, id: { in: productIds } },
    select: { id: true, lastModifiedSag: true, lastSaleSag: true },
  });

  for (const p of products) {
    map.set(p.id, {
      lastModifiedAt: p.lastModifiedSag ? new Date(p.lastModifiedSag) : null,
      lastSaleDate: p.lastSaleSag ? new Date(p.lastSaleSag) : null,
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
