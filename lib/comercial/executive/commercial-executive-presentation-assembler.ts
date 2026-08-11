/**
 * lib/comercial/executive/commercial-executive-presentation-assembler.ts
 *
 * AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01 / B02 — PresentationAssembler.
 *
 * Transformation:
 *   ControlComercialSnapshot + ImportSupplyIntelligenceResult
 *     → CommercialExecutivePA
 *
 * PURE and client-safe: no Prisma, no clock (asOf injected), no React,
 * no queries, no viewport. React does NOT calculate business facts.
 *
 * Pattern: certified by store-intelligence-presentation-assembler.
 */

import type { ControlComercialSnapshot } from "../control/control-comercial-loader";
import type { ImportSupplyIntelligenceResult } from "../importaciones/import-intelligence-service";
import type {
  CommercialExecutivePA,
  ExecutiveVentasSection,
  ExecutivePedidosSection,
  ExecutiveCarteraSection,
  ExecutiveClientesSection,
  ExecutiveVendedoresSection,
  ExecutiveImportacionesSection,
  ExecutiveInventarioSection,
} from "./commercial-executive-types";
import { getLowRotationImportedProducts } from "./commercial-executive-low-rotation";
import { assembleExecutiveInsights } from "./commercial-executive-intelligence";
import { assembleExecutiveReports } from "./commercial-executive-reports";

// ── Constants ────────────────────────────────────────────────────────────────

const LOW_ROTATION_MONTHS = 8;

// ── Main assembler ──────────────────────────────────────────────────────────

export interface AssemblerInput {
  snapshot: ControlComercialSnapshot;
  importIntelligence: ImportSupplyIntelligenceResult | null;
  orgSlug?: string;
  asOf?: Date;
}

/**
 * Assembles the CommercialExecutivePA from domain data.
 *
 * DETERMINISTIC: same input → same output.
 * No side effects, no DB calls, no viewport dependency.
 */
export function assembleCommercialExecutivePA(
  input: AssemblerInput,
): CommercialExecutivePA {
  const now = input.asOf ?? new Date();
  const asOfStr = now.toISOString();
  const orgSlug = input.orgSlug ?? "org";

  const importaciones = assembleImportaciones(input.importIntelligence, now, asOfStr);

  const insights = assembleExecutiveInsights({
    snapshot: input.snapshot,
    importIntelligence: input.importIntelligence,
    lowRotationItems: importaciones.lowRotationItems,
    orgSlug,
    asOf: asOfStr,
  });

  const reports = assembleExecutiveReports(input.snapshot, orgSlug);

  return {
    asOf: asOfStr,
    loadedAt: input.snapshot.loadedAt,
    source: "PRODUCTION",

    ventas: assembleVentas(input.snapshot, asOfStr),
    pedidos: assemblePedidos(input.snapshot, asOfStr),
    cartera: assembleCartera(input.snapshot, asOfStr),
    clientes: assembleClientes(input.snapshot, asOfStr),
    vendedores: assembleVendedores(input.snapshot, asOfStr),
    importaciones,
    inventario: assembleInventario(input.snapshot, asOfStr),

    insights,
    reports,
  };
}

// ── Section assemblers ──────────────────────────────────────────────────────

function assembleVentas(
  s: ControlComercialSnapshot,
  asOf: string,
): ExecutiveVentasSection | null {
  if (s.ventasMes === 0 && s.ventasSemana === 0 && s.ventasHoy === 0) return null;
  return {
    ventasMes: s.ventasMes,
    ventasSemana: s.ventasSemana,
    ventasHoy: s.ventasHoy,
    periodo: s.periodoVentas,
    asOf,
  };
}

function assemblePedidos(
  s: ControlComercialSnapshot,
  asOf: string,
): ExecutivePedidosSection | null {
  if (s.pedidosMes === 0 && s.pedidosTotal === 0) return null;
  return {
    pedidosMes: s.pedidosMes,
    pedidosTotal: s.pedidosTotal,
    ticketPromedio: s.ticketPromedio,
    periodo: s.periodoPedidos,
    asOf,
  };
}

function assembleCartera(
  s: ControlComercialSnapshot,
  asOf: string,
): ExecutiveCarteraSection | null {
  const total = s.cartera.carteraTotal;
  const vencida = s.cartera.carteraVencida;
  if (total === 0) return null;
  return {
    totalCartera: total,
    carteraVencida: vencida,
    porcentajeVencido: total > 0 ? Math.round((vencida / total) * 100) : 0,
    asOf,
  };
}

function assembleClientes(
  s: ControlComercialSnapshot,
  asOf: string,
): ExecutiveClientesSection | null {
  if (s.clientesActivos === 0) return null;
  return {
    clientesActivos: s.clientesActivos,
    clientesNuevos: s.clientesNuevos,
    asOf,
  };
}

function assembleVendedores(
  s: ControlComercialSnapshot,
  asOf: string,
): ExecutiveVendedoresSection | null {
  if (s.vendedoresOperativos === 0) return null;
  return {
    vendedoresOperativos: s.vendedoresOperativos,
    asOf,
  };
}

function assembleImportaciones(
  intel: ImportSupplyIntelligenceResult | null,
  asOf: Date,
  asOfStr: string,
): ExecutiveImportacionesSection {
  if (!intel || intel.items.length === 0) {
    return {
      totalRefs: 0,
      refsEnBajaRotacion: 0,
      capitalEnBajaRotacion: null,
      capitalEnBajaRotacionCertified: false,
      refsAtencionRecompra: 0,
      lowRotationItems: [],
      lowRotationMonthsThreshold: LOW_ROTATION_MONTHS,
      asOf: asOfStr,
    };
  }

  const lowRotationItems = getLowRotationImportedProducts(intel.items, {
    asOf,
    monthsWithoutActivity: LOW_ROTATION_MONTHS,
  });

  const lowRotationOnly = lowRotationItems.filter(i => i.rotationStatus === "LOW_ROTATION");

  // Capital in low rotation — only count items with certified costo
  const capitalItems = lowRotationOnly.filter(i => i.inventoryValue !== null);
  const capitalEnBajaRotacion = capitalItems.length > 0
    ? capitalItems.reduce((sum, i) => sum + (i.inventoryValue ?? 0), 0)
    : null;

  return {
    totalRefs: intel.items.length,
    refsEnBajaRotacion: lowRotationOnly.length,
    capitalEnBajaRotacion,
    capitalEnBajaRotacionCertified: capitalItems.length > 0 &&
      capitalItems.length === lowRotationOnly.length,
    refsAtencionRecompra: intel.kpis.comprarAhora,
    lowRotationItems,
    lowRotationMonthsThreshold: LOW_ROTATION_MONTHS,
    asOf: asOfStr,
  };
}

function assembleInventario(
  s: ControlComercialSnapshot,
  asOf: string,
): ExecutiveInventarioSection | null {
  if (s.refsTotales === 0) return null;
  return {
    refsTotales: s.refsTotales,
    refsCriticas: s.refsCriticas,
    refsAgotadas: s.refsAgotadas,
    asOf,
  };
}
