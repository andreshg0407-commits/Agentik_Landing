/**
 * lib/comercial/maletas/maletas-types.ts
 *
 * Domain type system for the Maletas commercial module.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01
 */

// ─── Enumerations ──────────────────────────────────────────────────────────────

export type CommercialCaseLine = "LT" | "CS";

export type CaseItemStatus =
  | "ok"                  // currentUnits >= minimumRequired
  | "bajo_minimo"         // 0 < currentUnits < minimumRequired
  | "sin_stock"           // currentUnits <= 0, no production batch
  | "en_proceso"          // currentUnits <= 0, production batch exists
  | "sobre_comprometido"; // currentUnits < 0 (pedidos > inventario)

export type CaseAlertType =
  | "BAJO_MINIMO"         // stock exists but below threshold
  | "SIN_STOCK"           // zero stock, no replenishment path
  | "EN_PROCESO"          // zero stock but production batch pending
  | "SOBRE_COMPROMETIDO"; // negative disponible (over-sold)

export type CaseAlertSeverity = "urgente" | "alta" | "normal";

export type ReplenishmentAction =
  | "OK"               // no action needed
  | "REPONER_MALETA"   // stock available — restock case now
  | "PRODUCIR"         // no stock — trigger production request
  | "ESPERAR_LOTE"     // production batch exists — wait
  | "REVISAR";         // over-committed — manual review required

// ─── Core entities ─────────────────────────────────────────────────────────────

export interface SalesRep {
  id: string;           // "CARLOS_LEON" | "CARLOS_VILLA" | "NESTOR" | "ORLANDO"
  name: string;         // label as appears in Excel
  sagName: string | null; // exact name as appears in SAG invoices
  active: boolean;
}

export interface CommercialCase {
  id: string;            // "{salesRepId}_{line}"
  salesRepId: string;
  salesRepName: string;
  line: CommercialCaseLine;
  status: "active" | "inactive";
  itemCount: number;
  alertCount: number;
  criticalCount: number; // urgente alerts
  okCount: number;
}

export interface CaseItem {
  reference: string;
  description: string;
  line: CommercialCaseLine;
  assignedToSalesReps: string[];       // list of salesRep ids that carry this ref
  currentUnits: number;                // cantidad_disponible from SAG snapshot
  minimumRequired: number;             // always 1 at item level
  missingUnits: number;                // max(0, minimumRequired - currentUnits)
  availableToReplenish: number;        // from DISPONIBLE PARA MALETA (may differ from currentUnits)
  productionInProcess: boolean;        // a batch column had data for this ref
  productionBatchLabel: string | null; // "MAYO 20 EN PROCESO"
  status: CaseItemStatus;
  recommendedAction: ReplenishmentAction;
}

export interface ReplenishmentRule {
  line: CommercialCaseLine;
  category: string;         // "NIÑA BEBE" | "NIÑO KIDS" | "PIJAMAS BEBÉ" etc.
  garmentType: string;      // "PIJAMA CL" | "CONJUNTO CC" | "VESTIDO" etc.
  sizeRange: string | null; // "2-8" | "10-16" | "NIÑA 18-22" | null
  minimumRequired: number;
  priorityWeight: number;   // higher = more important
}

export interface CaseAlert {
  id: string;
  type: CaseAlertType;
  severity: CaseAlertSeverity;
  reference: string;
  description: string;
  salesRepId: string;
  salesRepName: string;
  line: CommercialCaseLine;
  reason: string;
  recommendedAction: ReplenishmentAction;
  currentUnits: number;
  minimumRequired: number;
  availableToReplenish: number;
}

export interface ProductionRecommendation {
  reference: string;
  description: string;
  line: CommercialCaseLine;
  affectedSalesReps: string[];     // salesRep ids with this ref below minimum
  totalMissing: number;            // sum of missingUnits across all affected reps
  availableToReplenish: number;    // current disponible (should be 0 if recommending production)
  suggestedProductionQty: number;  // totalMissing + safety stock (1.5x)
  priority: number;                // 0 = highest priority
}

// ─── Engine I/O ────────────────────────────────────────────────────────────────

/**
 * Raw availability record loaded from SAG or Excel bootstrap.
 *
 * Field semantics (confirmed by Castillitos administration):
 *   inventario = bodega inicial (initial warehouse quantity)
 *   pedidos    = reservas (quantities reserved via SAG PD source)
 *   disponible = availableForCases = inventario - pedidos
 *
 * ALWAYS use `disponible` for coverage calculations — never `inventario` alone.
 * `pedidos` is preserved here for commercial pressure signal extraction.
 */
export interface RawAvailabilityRecord {
  refCode:     string;
  description: string;
  inventario:  number; // bodega inicial (initial warehouse qty)
  pedidos:     number; // reservas (pending orders from PD source — netted from disponible)
  disponible:  number; // = inventario - pedidos = availableForCases
}

/** Raw case row from Excel LT/CS sheet */
export interface RawCaseRow {
  ref: string;
  desc: string;
  vendors: Record<string, boolean>; // vendorName → assigned
  batches: string[];                // active batch labels
}

/** Vendor → SAG name mapping (configurable per org) */
export interface VendorSagMapping {
  vendorName: string;   // as in Excel column header
  sagName: string | null;
}

/** Input to the engine */
export interface MaletasEngineInput {
  orgId: string;
  salesReps: SalesRep[];
  ltRows: RawCaseRow[];
  csRows: RawCaseRow[];
  availability: Map<string, RawAvailabilityRecord>;
  rules: ReplenishmentRule[];
  /** SAG sale hints for intelligence layer (optional — engine degrades gracefully) */
  salesHints?: import("./maletas-intelligence-types").SagSaleHint[];
  /** Historical coverage snapshots for temporal analysis (optional) */
  coverageSnapshots?: import("./maletas-intelligence-types").CoverageSnapshot[];
  /**
   * SAG PD (pedidos) quantities per ref — commercial demand pressure signal.
   * Key: UPPERCASE refCode. Value: total pending order units.
   * Extracted from RawAvailabilityRecord.pedidos or from direct PD source query.
   * When provided, refs with pending orders + low coverage get a score boost.
   * AP (limpieza de pedidos) must NEVER appear in this map.
   */
  pendingOrdersMap?: Map<string, number>;
}

/** Full operational context returned by the engine */
export interface MaletasOperationalContext {
  orgId: string;
  generatedAt: string; // ISO timestamp
  summary: {
    totalReferences: number;
    activeSalesReps: number;
    criticalCases: number;        // cases with at least 1 urgente alert
    lowStockItems: number;        // items with status bajo_minimo | sin_stock
    productionRecommendations: number;
    readyToReplenish: number;     // items with action REPONER_MALETA
  };
  salesReps: SalesRep[];
  cases: CommercialCase[];
  items: CaseItem[];
  alerts: CaseAlert[];
  productionRecommendations: ProductionRecommendation[];

  // ── Intelligence layer (AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01) ──────────
  intelligence?: MaletasIntelligenceContext;
}

/**
 * Intelligence context — extended operational signals.
 * Populated when intelligence engine runs with SAG hints or fallback data.
 */
export interface MaletasIntelligenceContext {
  coverage: import("./maletas-intelligence-types").CoverageSignal[];
  productionSignals: import("./maletas-intelligence-types").ProductionSignal[];
  deadStockSignals: import("./maletas-intelligence-types").DeadStockSignal[];
  salesRepProfiles: import("./maletas-intelligence-types").SalesRepOperationalProfile[];
  copilotSignals: import("./maletas-intelligence-types").CopilotSignal[];
  intelligenceSummary: import("./maletas-intelligence-types").MaletasIntelligenceSummary;
  operationalPressure: number; // 0–100 aggregate
  strongestDemandLines: string[];
  trends: import("./maletas-intelligence-types").CoverageEvolution[];
  /** SAG PD demand pressure signals — populated when pendingOrdersMap is non-empty */
  pdDemandSignals?: import("../demand/demand-types").DemandPressureSignal[];
}
