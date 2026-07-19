/**
 * availability-types.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Types for Commercial Availability Intelligence.
 *
 * Disponible Real = Inventario Bodega 01+04 (textile) - Pedidos Pendientes
 *
 * Grouping hierarchy: SubLinea → SubGrupo → Referencia → Variantes
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

// ── Input: SAG raw data ──────────────────────────────────────────────────────

/** Raw inventory record from SAG for a single reference+variant+bodega. */
export interface SagAvailabilityRecord {
  /** SAG reference code (UPPERCASE). */
  reference: string;
  /** Product description. */
  description: string;
  /** SAG SubLinea — commercial line (LATIN KIDS, CASTILLITOS, IMPORTACION). */
  subLinea: string;
  /** SAG SubGrupo — product type within the line. */
  subGrupo: string;
  /** How subGrupo was resolved (COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 4) */
  subGrupoInferred?: boolean;
  /** Bodega code (e.g. "01" for main warehouse). */
  bodega: string;
  /** Size (optional — variant level). */
  size?: string;
  /** Color (optional — variant level). */
  color?: string;
  /** Inventory quantity in this bodega. */
  inventarioBodega: number;
  /** Pending orders consuming this reference. */
  pedidosPendientes: number;
}

// ── Output: Availability Report ──────────────────────────────────────────────

/** Availability state for a single reference. */
export type AvailabilityStatus =
  | "disponible"        // disponibleReal > 0
  | "comprometido"      // disponibleReal = 0 (all consumed by orders)
  | "sobre_comprometido" // disponibleReal < 0 (orders exceed inventory)
  | "sin_existencia"    // inventarioBodega01 = 0
  | "sin_datos";        // No SAG data

/** A single reference in the availability report. */
export interface AvailabilityRow {
  /** SAG reference code. */
  reference: string;
  /** Product description. */
  description: string;
  /** SubGrupo (product type). */
  subGrupo: string;
  /** SubLinea (commercial line). */
  subLinea: string;
  /** Inventory in Bodega 01 (main warehouse). */
  existenciaBodega01: number;
  /** Pending orders consuming this reference. */
  pedidosPendientes: number;
  /** Disponible Real = existenciaBodega01 - pedidosPendientes. */
  disponibleReal: number;
  /** Computed status. */
  status: AvailabilityStatus;
  /** Variants (if variant-level data available). */
  variants: AvailabilityVariant[];
}

/** Variant-level availability (size × color). */
export interface AvailabilityVariant {
  size: string;
  color: string;
  existenciaBodega01: number;
  pedidosPendientes: number;
  disponibleReal: number;
  status: AvailabilityStatus;
}

/** Summary for a SubGrupo within a SubLinea. */
export interface AvailabilitySubGrupoSummary {
  subGrupo: string;
  totalReferences: number;
  totalExistencia: number;
  totalPedidos: number;
  totalDisponible: number;
  disponibleCount: number;
  comprometidoCount: number;
  sobreComprometidoCount: number;
  sinExistenciaCount: number;
  rows: AvailabilityRow[];
}

/** Summary for a SubLinea. */
export interface AvailabilitySubLineaSummary {
  subLinea: string;
  totalReferences: number;
  totalExistencia: number;
  totalPedidos: number;
  totalDisponible: number;
  disponibleCount: number;
  comprometidoCount: number;
  sobreComprometidoCount: number;
  sinExistenciaCount: number;
  subGrupos: AvailabilitySubGrupoSummary[];
}

/** Complete availability report. */
export interface CommercialAvailabilityReport {
  /** Organization ID. */
  orgSlug: string;
  /** When this report was computed. */
  computedAt: string;
  /** Source bodega for inventory. */
  sourceBodega: string;
  /** Total unique references analyzed. */
  totalReferences: number;
  /** Grand totals. */
  totalExistencia: number;
  totalPedidos: number;
  totalDisponible: number;
  /** Counts by status. */
  disponibleCount: number;
  comprometidoCount: number;
  sobreComprometidoCount: number;
  sinExistenciaCount: number;
  /** Breakdown by SubLinea. */
  subLineas: AvailabilitySubLineaSummary[];
  /** Flat rows (all references, sorted). */
  rows: AvailabilityRow[];
  /** Data confidence (0-100). */
  confidence: number;
  /** Reason for confidence level. */
  confidenceReason: string;
}

// ── Maleta Replacement ───────────────────────────────────────────────────────

/** Seller warehouse mapping. */
export interface SellerWarehouse {
  sellerId: string;
  sellerName: string;
  bodegaCode: string;
}

/** Maleta replacement threshold rule. */
export interface MaletaReplacementRule {
  subLinea: string;
  threshold: number;
}

/** A reference that needs maleta replacement. */
export interface MaletaReplacementItem {
  reference: string;
  description: string;
  existenciaActual: number;
  subLinea: string;
  subGrupo: string;
  /** Sellers who currently have this reference in their maletas. */
  vendedoresAfectados: string[];
  /** Why this needs replacement. */
  motivo: string;
  /** Suggested action (text, not executable). */
  recomendacion: string;
  /** Which rule triggered this. */
  ruleSubLinea: string;
  ruleThreshold: number;
}

/** Complete maleta replacement report. */
export interface MaletaReplacementReport {
  orgSlug: string;
  computedAt: string;
  totalItemsReviewed: number;
  totalRequiringReplacement: number;
  items: MaletaReplacementItem[];
  rules: MaletaReplacementRule[];
}
