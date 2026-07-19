/**
 * lib/comercial/maletas/maletas-intelligence-types.ts
 *
 * Extended type system for the Maletas intelligence layer.
 * Covers: sales signals, coverage, production urgency, dead stock,
 * sales rep profiles, copilot signals, and temporal evolution.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type { CommercialCaseLine } from "./maletas-types";

// ─── SAG Sales Input ──────────────────────────────────────────────────────────

/**
 * Thin slice of SAG SaleRecord fields needed for maletas intelligence.
 * Maps directly from Prisma SaleRecord fields.
 */
export interface SagSaleHint {
  refCode: string;         // SaleRecord.productCode → case ref (e.g. "L-2407")
  sellerSagName: string;   // SaleRecord.sellerName (used to join with SalesRep.sagName)
  saleDate: string;        // ISO date string (UTC midnight)
  amount: number;          // SaleRecord.amount (as number, Decimal converted at query)
  units: number | null;    // SaleRecord.units (null for AGGREGATED grain without count)
  sourceType: "OFICIAL" | "REMISION" | "PD"; // SaleRecord.sagSourceType
  // AP (limpieza de pedidos) is NEVER a sale hint — filtered at normalizer level
}

// ─── Operational Availability ─────────────────────────────────────────────────

/**
 * Explicit operational availability record derived from SAG.
 * availableForCases = initialWarehouseQty - reservedQty
 *
 * This is the canonical "disponible" value for Maletas coverage calculations.
 * NEVER use initialWarehouseQty alone — reservas reduce commercial availability.
 */
export interface OperationalAvailability {
  reference:          string;
  initialWarehouseQty: number;  // SAG "bodega" or "inventario" column
  reservedQty:         number;  // SAG "pedidos" or "reservas" column
  availableForCases:   number;  // = initialWarehouseQty - reservedQty
  source:              "SAG" | "Excel";
}

// ─── Reference Velocity ───────────────────────────────────────────────────────

export type RefTrend =
  | "acelerando"          // velocity increasing vs prior 7d window
  | "estable"             // velocity stable (< ±20% change)
  | "desacelerando"       // velocity decreasing vs prior 7d window
  | "sin_datos";          // no SAG sale hints provided

export type RefClassification =
  | "caliente"            // high velocity, > 1 unit/day
  | "activa"              // steady sales, 0.1–1 unit/day
  | "lenta"               // slow sales, 0.01–0.1 unit/day
  | "muerta"              // 0 units sold in available window
  | "sin_rotacion_conocida"; // no SAG data for this ref

export interface RefVelocity {
  refCode: string;
  description: string;
  line: CommercialCaseLine;
  units7d: number | null;          // total units sold in last 7 days
  units30d: number | null;         // total units sold in last 30 days
  txCount7d: number;               // transaction count last 7d
  txCount30d: number;              // transaction count last 30d
  dailyVelocity: number | null;    // units/day (30d rolling average); null = no data
  trend: RefTrend;
  classification: RefClassification;
  topSellerIds: string[];          // salesRep ids with highest velocity for this ref
}

// ─── Coverage ─────────────────────────────────────────────────────────────────

export type CoverageStatus =
  | "cobertura_alta"       // > 30 days at current velocity
  | "cobertura_estable"    // 15–30 days
  | "cobertura_baja"       // 7–14 days
  | "ruptura_inminente"    // < 7 days
  | "sin_rotacion"         // velocity = 0 (no sales movement)
  | "sin_datos_velocidad"  // velocity unknown (no SAG sales for this ref)
  | "sin_stock";           // disponible <= 0

export interface CoverageSignal {
  refCode: string;
  description: string;
  line: CommercialCaseLine;
  disponible: number;              // = availableForCases (bodega inicial - reservas)
  dailyVelocity: number | null;
  coverageDays: number | null;     // null = cannot compute (unknown velocity)
  status: CoverageStatus;
  affectedSalesRepIds: string[];   // salesRep ids that carry this ref
  operationalScore: number;        // 0–100 (100 = highest urgency)
  pendingOrdersQty?: number;       // SAG PD source: pending orders for this ref
}

// ─── Dead Stock ───────────────────────────────────────────────────────────────

export type DeadStockReason =
  | "sin_ventas_30d"         // no sales in 30 days, has stock
  | "cobertura_excesiva"     // disponible >> expected (> 90 days at velocity)
  | "sin_rotacion_conocida"  // no SAG data + high disponible
  | "linea_discontinuada";   // placeholder: ref removed from derrotero

export type DeadStockDisposal =
  | "revisar"         // needs human review
  | "reubicar"        // move to active maleta or other channel
  | "descontinuar";   // remove from maleta catalogue

export interface DeadStockSignal {
  refCode: string;
  description: string;
  line: CommercialCaseLine;
  disponible: number;
  lastSaleDate: string | null;       // ISO date of last known sale
  daysSinceLastSale: number | null;  // null = no sale history
  assignedSalesRepIds: string[];
  reason: DeadStockReason;
  disposalSuggestion: DeadStockDisposal;
  commercialRisk: number;            // 0–100 (100 = highest risk of wasted capital)
}

// ─── Production Intelligence ──────────────────────────────────────────────────

export type ProductionUrgency =
  | "normal"       // coverage > 14 days, no batch needed yet
  | "importante"   // coverage 7–14 days
  | "alta"         // coverage 3–7 days
  | "urgente"      // coverage < 3 days OR already stockout
  | "critica";     // stockout + no batch in process + multi-vendor affected

export interface ProductionSignal {
  reference: string;
  description: string;
  line: CommercialCaseLine;
  affectedSalesRepIds: string[];
  affectedSalesRepCount: number;
  totalMissing: number;
  coverageDaysRemaining: number | null;
  batchInProcess: boolean;
  batchLabel: string | null;
  availableToReplenish: number;
  urgency: ProductionUrgency;
  priority: number;                    // 0 = highest; lower = more critical
  suggestedQty: number;
  reasoning: string;                   // human-readable, non-AI, purely computed
  // SAG PD demand fields (AGENTIK-SAG-PD-DEMAND-LAYER-01)
  pendingOrdersQty?: number;           // SAG PD pending orders for this ref
  demandPressureScore?: number;        // 0–100 combined pressure score
}

// ─── Sales Rep Operational Profile ───────────────────────────────────────────

export type CommercialRisk =
  | "bajo"     // > 80% refs at OK coverage
  | "medio"    // 60–80% OK
  | "alto"     // 40–60% OK
  | "critico"; // < 40% OK

export interface SalesRepOperationalProfile {
  salesRepId: string;
  salesRepName: string;
  line: CommercialCaseLine;

  // Case health
  refsTotal: number;
  refsOk: number;
  refsAgotadas: number;     // sin_stock + sobre_comprometido
  refsBajoMinimo: number;
  refsEnProceso: number;

  // Coverage
  coverageAvgDays: number | null;
  coverageMinDays: number | null;
  coverageWeakRefs: string[];        // refs with coverageDays < 7

  // Lines
  lineasFuertes: string[];           // garment categories with hot/active refs
  lineasDebiles: string[];           // garment categories with dead/slow refs

  // Pressure
  presionOperacional: number;        // 0–100: % refs below minimum
  dependenciaProduccion: number;     // 0–100: % refs needing production
  dependenciaReposicion: number;     // 0–100: % refs ready to replenish (stock exists)

  // Risk
  riesgoComercial: CommercialRisk;
  riesgoScore: number;               // 0–100 (100 = highest risk)
}

// ─── Copilot Signals ──────────────────────────────────────────────────────────

export type CopilotSignalType =
  | "cobertura_critica"          // a ref is about to rupture
  | "linea_agotandose"           // an entire garment category is low across vendors
  | "vendedor_en_riesgo"         // a sales rep has > 30% of refs below minimum
  | "produccion_insuficiente"    // production backlog insufficient for demand velocity
  | "referencia_caliente"        // hot ref with low coverage — replenish immediately
  | "referencia_muerta"          // dead stock ref occupying commercial space
  | "dependencia_alta_reposicion" // case depends heavily on replenishment decisions
  // SAG PD Demand Layer signals (AGENTIK-SAG-PD-DEMAND-LAYER-01)
  | "pedidos_sin_cobertura"      // PD pending orders exist for refs with no/low stock
  | "linea_caliente_pedidos";    // line has 3+ refs with PD demand pressure + low coverage

export type CopilotSignalSeverity = "info" | "warning" | "critical";

export interface CopilotSignal {
  id: string;
  type: CopilotSignalType;
  severity: CopilotSignalSeverity;
  title: string;                     // short operational label
  body: string;                      // computed explanation (not AI-generated)
  context: Record<string, string | number | boolean | null>; // serializable
  refCode?: string;
  salesRepId?: string;
  line?: CommercialCaseLine;
  generatedAt: string;               // ISO timestamp
}

// ─── Temporal Intelligence ────────────────────────────────────────────────────

export interface CoverageSnapshot {
  snapshotAt: string;          // ISO timestamp
  refCode: string;
  coverageDays: number | null;
  disponible: number;
  status: CoverageStatus;
}

export type CoverageEvolutionTrend =
  | "mejorando"     // coverage days increasing vs prior snapshot
  | "estable"       // < ±15% change
  | "degradando"    // coverage days decreasing
  | "sin_datos";    // only one snapshot, no comparison possible

export interface CoverageEvolution {
  refCode: string;
  description: string;
  line: CommercialCaseLine;
  snapshots: CoverageSnapshot[];
  trend: CoverageEvolutionTrend;
  degradationPct: number | null;     // positive = degrading, negative = recovering
  alertMessage: string | null;       // e.g. "Degradándose 38% en 7d" or null
}

// ─── Extended Operational Summary ────────────────────────────────────────────

export interface MaletasIntelligenceSummary {
  coverageCritical: number;          // refs with ruptura_inminente or sin_stock
  coverageLow: number;               // refs with cobertura_baja
  hotRefs: number;                   // refs classified as "caliente"
  deadStockRefs: number;             // refs with dead stock signals
  avgCoverageDays: number | null;    // across all refs with known velocity
  strongestLine: string | null;      // line/category with highest velocity refs
  weakestLine: string | null;        // line/category with most dead stock
  operationalPressure: number;       // 0–100 aggregate pressure score
}
