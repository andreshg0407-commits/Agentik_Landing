/**
 * vendor-sample-service.ts
 *
 * VENDOR-SAMPLE-REPLACEMENT-INTELLIGENCE-01 — Builds vendor-centric sample snapshots
 * from the existing MaletasOperationalContext.
 *
 * 2-state model: SALUDABLE (disponible > minimo) | REEMPLAZAR (disponible <= minimo)
 *
 * Pure transformation layer. No DB, no SAG, no side effects.
 * Input: engine context (already loaded by runtime).
 * Output: per-vendor snapshots + executive summary + coverage gaps.
 */

import type { MaletasOperationalContext, CaseItem } from "./maletas-types";
import type {
  VendorSampleSnapshot,
  VendorSampleRef,
  VendorHealth,
  SampleState,
  MaletasExecutiveSummary,
  CoverageGapRef,
  ReplacementSuggestion,
  ProductionSuggestion,
} from "./vendor-sample-types";
import { getMinimumForLine, isEligibleForProductionSuggestion } from "./vendor-sample-types";

// ── RIESGO_AGOTAMIENTO_BUFFER
const RIESGO_BUFFER = 10;

// ── State derivation (2-state model) ────────────────────────────────────────

function deriveSampleState(
  centralAvailable: number,
  minimum: number,
  hasCoverageData = true,
): SampleState {
  // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 1:
  // Absence of a record does not mean zero inventory.
  if (!hasCoverageData) return "sin_datos";
  if (centralAvailable > minimum) return "saludable";
  return "reemplazar";
}

function deriveVendorHealth(refs: VendorSampleRef[]): VendorHealth {
  if (refs.length === 0) return "sin_datos";
  // Phase 10: Exclude sin_datos refs from health calculation
  const evaluableRefs = refs.filter((r) => r.state !== "sin_datos");
  if (evaluableRefs.length === 0) return "sin_datos";
  const replace = evaluableRefs.filter((r) => r.state === "reemplazar").length;
  const replacePct = replace / evaluableRefs.length;
  if (replacePct > 0.15 || replace >= 10) return "critico";
  if (replacePct > 0.05 || replace >= 5) return "riesgo";
  return "saludable";
}

// ── Replacement finder ──────────────────────────────────────────────────────

function findReplacement(
  ref: CaseItem,
  allItems: CaseItem[],
  minimum: number,
): { ref: string; desc: string; available: number; reason: string } | null {
  const candidates = allItems.filter(
    (other) =>
      other.reference !== ref.reference &&
      other.line === ref.line &&
      other.currentUnits >= minimum &&
      other.assignedToSalesReps.length < 4,
  );
  if (candidates.length === 0) return null;

  const refCategory = extractCategory(ref.description);
  const sameCategory = candidates.filter(
    (c) => extractCategory(c.description) === refCategory,
  );

  const best = sameCategory.length > 0
    ? sameCategory.sort((a, b) => b.currentUnits - a.currentUnits)[0]
    : candidates.sort((a, b) => b.currentUnits - a.currentUnits)[0];

  return {
    ref: best.reference,
    desc: best.description,
    available: best.currentUnits,
    reason: sameCategory.length > 0 ? "misma categoria" : "misma linea",
  };
}

function extractCategory(description: string): string {
  const d = description.toUpperCase();
  if (d.includes("PIJAMA")) return "PIJAMA";
  if (d.includes("CONJUNTO")) return "CONJUNTO";
  if (d.includes("VESTIDO")) return "VESTIDO";
  if (d.includes("CAMISETA")) return "CAMISETA";
  if (d.includes("BUZO") || d.includes("CHAQUETA")) return "ABRIGO";
  if (d.includes("BODY") || d.includes("MAMELUCOS")) return "BODY";
  if (d.includes("SHORT") || d.includes("BERMUDA")) return "SHORT";
  if (d.includes("PANTALON") || d.includes("LEGGINS")) return "PANTALON";
  return "OTRO";
}

// ── Main builders ───────────────────────────────────────────────────────────

export function buildVendorSnapshots(
  ctx: MaletasOperationalContext,
): VendorSampleSnapshot[] {
  const vendors: VendorSampleSnapshot[] = [];

  for (const rep of ctx.salesReps) {
    if (!rep.active) continue;

    const vendorItems = ctx.items.filter((item) =>
      item.assignedToSalesReps.includes(rep.id),
    );

    if (vendorItems.length === 0) {
      vendors.push({
        vendorId: rep.id,
        vendorName: rep.name,
        warehouseCode: getWarehouseCode(rep.id),
        warehouseName: getWarehouseName(rep.id),
        health: "sin_datos",
        isActive: true,
        totalRefs: 0,
        totalUnits: 0,
        estimatedValue: 0,
        replaceRefs: 0,
        healthyRefs: 0,
        sinDatosRefs: 0,
        riesgoAgotamientoRefs: 0,
        healthyCommercialRefs: 0,
        lowStockCommercialRefs: 0,
        outOfStockCommercialRefs: 0,
        accessoryRefs: 0,
        accessoryScarcityRefs: 0,
        refs: [],
        lines: [],
      });
      continue;
    }

    const refs: VendorSampleRef[] = vendorItems.map((item) => {
      const minimum = getMinimumForLine(item.line);
      const replacement = findReplacement(item, ctx.items, minimum);
      const state = deriveSampleState(item.currentUnits, minimum);
      const riesgoAgotamiento = state === "saludable" && item.currentUnits <= minimum + RIESGO_BUFFER;

      // MALETAS-GO-LIVE-01 Motor 1: agotados → "Retirar del mostrario"
      let suggestedAction: string | null = null;
      let replacementSource: string | null = null;
      if (state === "reemplazar") {
        suggestedAction = "Retirar del mostrario";
        if (replacement) {
          replacementSource = replacement.reason === "misma categoria" ? "mismo subgrupo" : "misma linea";
        }
      }

      const replacementRef = state === "reemplazar" ? replacement?.ref ?? null : null;
      const replacementDesc = state === "reemplazar" ? replacement?.desc ?? null : null;
      const replacementAvailable = state === "reemplazar" ? replacement?.available ?? null : null;

      // Build multi-option arrays from single replacement (service path)
      const replacementOptions = (state === "reemplazar" && replacement)
        ? [{
            reference: replacement.ref,
            description: replacement.desc,
            subgrupoId: null,
            subgrupoSag: extractCategory(item.description),
            line: item.line,
            available: replacement.available,
            source: "bodega_principal" as const,
          }]
        : [];

      const requiresProductionSuggestion =
        state === "reemplazar" &&
        !replacement &&
        (item.line === "LT" || item.line === "CS");

      return {
        reference: item.reference,
        description: item.description,
        line: item.line,
        subgrupoSag: extractCategory(item.description),
        subgrupoId: null,
        grupoSag: null,
        group: null,
        brand: null,
        sizeClass: null,
        imageUrl: null,
        present: true,
        centralAvailable: item.currentUnits,
        minimumRequired: minimum,
        state,
        commercialHealth: item.currentUnits <= 0 ? "OUT_OF_STOCK" as const
          : item.currentUnits <= minimum ? "LOW_STOCK" as const
          : "HEALTHY" as const,
        riesgoAgotamiento,
        suggestedAction,
        replacementRef,
        replacementDesc,
        replacementAvailable,
        replacementSource,
        replacementOptions,
        opReplacementOptions: [],
        requiresProductionSuggestion,
        supplyAction: requiresProductionSuggestion
          ? "PRODUCCION_SUGERIDA" as const
          : replacement
            ? "REEMPLAZAR_BODEGA" as const
            : state === "reemplazar"
              ? "RETIRAR_MOSTRARIO" as const
              : null,
        lastTransferDate: null,
        sourceWarehouse: null,
        isAccessory: false,
        centralImportAvailable: null,
        accessoryScarcityState: null,
        accessorySuggestedAction: null,
      };
    });

    const lines = [...new Set(refs.map((r) => r.line))];
    const health = deriveVendorHealth(refs);

    vendors.push({
      vendorId: rep.id,
      vendorName: rep.name,
      warehouseCode: getWarehouseCode(rep.id),
      warehouseName: getWarehouseName(rep.id),
      health,
      isActive: true,
      totalRefs: refs.length,
      totalUnits: refs.length,
      estimatedValue: 0,
      replaceRefs: refs.filter((r) => r.state === "reemplazar").length,
      healthyRefs: refs.filter((r) => r.state === "saludable").length,
      sinDatosRefs: refs.filter((r) => r.state === "sin_datos").length,
      riesgoAgotamientoRefs: refs.filter((r) => r.riesgoAgotamiento).length,
      healthyCommercialRefs: refs.filter((r) => r.commercialHealth === "HEALTHY").length,
      lowStockCommercialRefs: refs.filter((r) => r.commercialHealth === "LOW_STOCK").length,
      outOfStockCommercialRefs: refs.filter((r) => r.commercialHealth === "OUT_OF_STOCK").length,
      accessoryRefs: refs.filter((r) => r.isAccessory).length,
      accessoryScarcityRefs: refs.filter((r) => r.accessoryScarcityState === "escasez").length,
      refs,
      lines,
    });
  }

  return vendors;
}

export function buildExecutiveSummary(
  vendors: VendorSampleSnapshot[],
  coverageGaps: CoverageGapRef[],
): MaletasExecutiveSummary {
  const activeVendors = vendors.filter((v) => v.totalRefs > 0).length;
  return {
    activeVendors,
    totalDistributedRefs: vendors.reduce((s, v) => s + v.totalRefs, 0),
    replaceRefs: vendors.reduce((s, v) => s + v.replaceRefs, 0),
    riesgoAgotamientoRefs: vendors.reduce((s, v) => s + v.riesgoAgotamientoRefs, 0),
    coverageGapRefs: coverageGaps.length,
    totalDistributedUnits: vendors.reduce((s, v) => s + v.totalUnits, 0),
    estimatedTotalValue: vendors.reduce((s, v) => s + v.estimatedValue, 0),
    accessoryRefs: vendors.reduce((s, v) => s + v.accessoryRefs, 0),
    accessoryScarcityRefs: vendors.reduce((s, v) => s + v.accessoryScarcityRefs, 0),
  };
}

export function buildCoverageGaps(
  ctx: MaletasOperationalContext,
  minAvailableForGap: number = 20,
): CoverageGapRef[] {
  return ctx.items
    .filter(
      (item) =>
        item.currentUnits >= minAvailableForGap &&
        item.assignedToSalesReps.length === 0,
    )
    .sort((a, b) => b.currentUnits - a.currentUnits)
    .slice(0, 50)
    .map((item) => ({
      reference: item.reference,
      description: item.description,
      line: item.line,
      subgrupoId: null,
      subgrupoSag: null,
      centralAvailable: item.currentUnits,
      vendorPresence: 0,
      suggestedAction: "Agregar a maletas",
    }));
}

export function buildReplacementSuggestions(
  vendors: VendorSampleSnapshot[],
): ReplacementSuggestion[] {
  const suggestions: ReplacementSuggestion[] = [];
  for (const vendor of vendors) {
    for (const ref of vendor.refs) {
      if (ref.state === "reemplazar" && ref.replacementRef) {
        suggestions.push({
          vendorId: vendor.vendorId,
          currentRef: ref.reference,
          currentDesc: ref.description,
          currentAvailable: ref.centralAvailable,
          replacementRef: ref.replacementRef,
          replacementDesc: ref.replacementDesc ?? "",
          replacementAvailable: ref.replacementAvailable ?? 0,
          matchReason: ref.replacementSource ?? "misma linea",
        });
      }
    }
  }
  return suggestions;
}

export function buildProductionSuggestions(
  ctx: MaletasOperationalContext,
  vendors: VendorSampleSnapshot[],
): ProductionSuggestion[] {
  const refMap = new Map<string, {
    item: CaseItem;
    affectedVendors: string[];
    vendorsWithPresence: number;
  }>();

  for (const vendor of vendors) {
    for (const ref of vendor.refs) {
      if (!isEligibleForProductionSuggestion(ref)) continue;
      const existing = refMap.get(ref.reference);
      if (existing) {
        existing.affectedVendors.push(vendor.vendorName);
        existing.vendorsWithPresence += 1;
      } else {
        const item = ctx.items.find((i) => i.reference === ref.reference);
        if (item) {
          refMap.set(ref.reference, {
            item,
            affectedVendors: [vendor.vendorName],
            vendorsWithPresence: 1,
          });
        }
      }
    }
  }

  return [...refMap.values()]
    .sort((a, b) => {
      const shortA = Math.max(getMinimumForLine(a.item.line) - a.item.currentUnits, 0);
      const shortB = Math.max(getMinimumForLine(b.item.line) - b.item.currentUnits, 0);
      return shortB - shortA || b.affectedVendors.length - a.affectedVendors.length;
    })
    .slice(0, 30)
    .map((d): ProductionSuggestion => {
      const min = getMinimumForLine(d.item.line);
      const central = d.item.currentUnits;
      const shortfall = Math.max(min - central, 0);
      const urgency: "alta" | "media" | "baja" =
        central <= 0 ? "alta"
        : central < min / 2 ? "media"
        : "baja";
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subgrupoSag: (d.item as any).subgrupoSag ?? "SIN_SUBGRUPO_SAG",
        line: d.item.line,
        centralAvailable: central,
        minimumRequired: min,
        shortfall,
        suggestedQty: shortfall,
        urgency,
        affectedVendors: d.affectedVendors,
        vendorsWithPresence: d.vendorsWithPresence,
        evidenceRefs: [{ reference: d.item.reference, description: d.item.description, available: central }],
        reasonType: central <= 0 ? "central_stock_insufficient" : "no_replacement_available",
        reference: d.item.reference,
        description: d.item.description,
      };
    });
}

// ── Vendor → warehouse mapping ──────────────────────────────────────────────

const VENDOR_WAREHOUSE: Record<string, { code: string; name: string }> = {
  ORLANDO: { code: "45", name: "VEND ORLANDO" },
  CARLOS_LEON: { code: "46", name: "VEND CARLOS LEON" },
  LUIS: { code: "47", name: "VEND LUIS" },
  NESTOR: { code: "48", name: "VEND NESTOR" },
  CARLOS_VILLA: { code: "49", name: "VEND CARLOS VILLA" },
  FREDY: { code: "50", name: "VEND FREDY" },
};

function getWarehouseCode(vendorId: string): string {
  return VENDOR_WAREHOUSE[vendorId]?.code ?? "??";
}

function getWarehouseName(vendorId: string): string {
  return VENDOR_WAREHOUSE[vendorId]?.name ?? vendorId;
}
