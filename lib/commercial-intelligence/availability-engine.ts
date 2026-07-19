/**
 * availability-engine.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Commercial Availability Intelligence Engine.
 *
 * Disponible Real = Inventario Bodega 01+04 (textile) - Pedidos Pendientes
 *
 * This engine:
 * - Aggregates SAG raw records by reference
 * - Computes disponible real per reference
 * - Groups by SubLinea → SubGrupo → Referencia
 * - Sorts by SubLinea, SubGrupo, disponible real ascending
 * - Computes summary statistics at every level
 *
 * No Prisma. No React. No server-only. Pure domain logic.
 */

import type {
  SagAvailabilityRecord,
  AvailabilityRow,
  AvailabilityVariant,
  AvailabilityStatus,
  AvailabilitySubGrupoSummary,
  AvailabilitySubLineaSummary,
  CommercialAvailabilityReport,
} from "./availability-types";

// ── Status Derivation ────────────────────────────────────────────────────────

/** Derive availability status from quantities. */
export function deriveAvailabilityStatus(
  existencia: number,
  pedidos: number,
): AvailabilityStatus {
  if (existencia === 0 && pedidos === 0) return "sin_existencia";
  const disponible = existencia - pedidos;
  if (disponible < 0) return "sobre_comprometido";
  if (disponible === 0) return "comprometido";
  return "disponible";
}

// ── Build Availability Report ────────────────────────────────────────────────

/** Build the full commercial availability report from SAG records. */
export function buildAvailabilityReport(opts: {
  orgSlug: string;
  records: SagAvailabilityRecord[];
  sourceBodega?: string;
}): CommercialAvailabilityReport {
  const { orgSlug, records, sourceBodega = "01+04+14+15" } = opts;

  // Filter to source bodega only
  const filtered = records.filter(r => r.bodega === sourceBodega);

  // Aggregate by reference
  const refMap = new Map<string, {
    reference: string;
    description: string;
    subGrupo: string;
    subLinea: string;
    existencia: number;
    pedidos: number;
    variants: AvailabilityVariant[];
  }>();

  for (const rec of filtered) {
    const key = rec.reference;
    const existing = refMap.get(key);

    const variantStatus = deriveAvailabilityStatus(rec.inventarioBodega, rec.pedidosPendientes);
    const variant: AvailabilityVariant = {
      size: rec.size ?? "\u2014",
      color: rec.color ?? "\u2014",
      existenciaBodega01: rec.inventarioBodega,
      pedidosPendientes: rec.pedidosPendientes,
      disponibleReal: rec.inventarioBodega - rec.pedidosPendientes,
      status: variantStatus,
    };

    if (existing) {
      existing.existencia += rec.inventarioBodega;
      existing.pedidos += rec.pedidosPendientes;
      // Only add variant if size/color data present
      if (rec.size || rec.color) {
        existing.variants.push(variant);
      }
    } else {
      refMap.set(key, {
        reference: rec.reference,
        description: rec.description,
        subGrupo: rec.subGrupo,
        subLinea: rec.subLinea,
        existencia: rec.inventarioBodega,
        pedidos: rec.pedidosPendientes,
        variants: (rec.size || rec.color) ? [variant] : [],
      });
    }
  }

  // Build rows
  const rows: AvailabilityRow[] = Array.from(refMap.values()).map(r => {
    const disponibleReal = r.existencia - r.pedidos;
    return {
      reference: r.reference,
      description: r.description,
      subGrupo: r.subGrupo,
      subLinea: r.subLinea,
      existenciaBodega01: r.existencia,
      pedidosPendientes: r.pedidos,
      disponibleReal,
      status: deriveAvailabilityStatus(r.existencia, r.pedidos),
      variants: r.variants,
    };
  });

  // Sort: SubLinea → SubGrupo → disponibleReal ascending
  rows.sort((a, b) => {
    const sl = a.subLinea.localeCompare(b.subLinea);
    if (sl !== 0) return sl;
    const sg = a.subGrupo.localeCompare(b.subGrupo);
    if (sg !== 0) return sg;
    return a.disponibleReal - b.disponibleReal;
  });

  // Group by SubLinea → SubGrupo
  const subLineaMap = new Map<string, AvailabilityRow[]>();
  for (const row of rows) {
    const list = subLineaMap.get(row.subLinea) ?? [];
    list.push(row);
    subLineaMap.set(row.subLinea, list);
  }

  const subLineas: AvailabilitySubLineaSummary[] = [];
  for (const [subLinea, slRows] of subLineaMap) {
    // Group by SubGrupo within SubLinea
    const subGrupoMap = new Map<string, AvailabilityRow[]>();
    for (const row of slRows) {
      const list = subGrupoMap.get(row.subGrupo) ?? [];
      list.push(row);
      subGrupoMap.set(row.subGrupo, list);
    }

    const subGrupos: AvailabilitySubGrupoSummary[] = [];
    for (const [subGrupo, sgRows] of subGrupoMap) {
      subGrupos.push(buildSubGrupoSummary(subGrupo, sgRows));
    }

    subLineas.push({
      subLinea,
      totalReferences: slRows.length,
      totalExistencia: sum(slRows, r => r.existenciaBodega01),
      totalPedidos: sum(slRows, r => r.pedidosPendientes),
      totalDisponible: sum(slRows, r => r.disponibleReal),
      disponibleCount: slRows.filter(r => r.status === "disponible").length,
      comprometidoCount: slRows.filter(r => r.status === "comprometido").length,
      sobreComprometidoCount: slRows.filter(r => r.status === "sobre_comprometido").length,
      sinExistenciaCount: slRows.filter(r => r.status === "sin_existencia").length,
      subGrupos,
    });
  }

  // Confidence based on data completeness
  const confidence = filtered.length > 0 ? 85 : 0;
  const confidenceReason = filtered.length > 0
    ? `${filtered.length} registro(s) SAG de Bodega ${sourceBodega}`
    : "Sin datos SAG disponibles";

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    sourceBodega,
    totalReferences: rows.length,
    totalExistencia: sum(rows, r => r.existenciaBodega01),
    totalPedidos: sum(rows, r => r.pedidosPendientes),
    totalDisponible: sum(rows, r => r.disponibleReal),
    disponibleCount: rows.filter(r => r.status === "disponible").length,
    comprometidoCount: rows.filter(r => r.status === "comprometido").length,
    sobreComprometidoCount: rows.filter(r => r.status === "sobre_comprometido").length,
    sinExistenciaCount: rows.filter(r => r.status === "sin_existencia").length,
    subLineas,
    rows,
    confidence,
    confidenceReason,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSubGrupoSummary(subGrupo: string, rows: AvailabilityRow[]): AvailabilitySubGrupoSummary {
  return {
    subGrupo,
    totalReferences: rows.length,
    totalExistencia: sum(rows, r => r.existenciaBodega01),
    totalPedidos: sum(rows, r => r.pedidosPendientes),
    totalDisponible: sum(rows, r => r.disponibleReal),
    disponibleCount: rows.filter(r => r.status === "disponible").length,
    comprometidoCount: rows.filter(r => r.status === "comprometido").length,
    sobreComprometidoCount: rows.filter(r => r.status === "sobre_comprometido").length,
    sinExistenciaCount: rows.filter(r => r.status === "sin_existencia").length,
    rows,
  };
}

function sum<T>(arr: T[], fn: (item: T) => number): number {
  return arr.reduce((s, item) => s + fn(item), 0);
}
