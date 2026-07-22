/**
 * lib/comercial/importaciones/import-types.ts
 *
 * Domain types for the Importaciones intelligence module.
 *
 * Sources:
 *   Products:  ProductEntity (SAG LINEA "5" = imported accessories)
 *   Inventory: ProductInventoryLevel (import warehouses: 24, 42-46)
 *   Sales:     CustomerOrderLine + CustomerOrderRecord (product-level)
 *   Prices:    CommercialProductDataSource (SAG v_articulos PV3/PV4)
 *   Receipts:  CommercialProductDataSource (SAG MOVIMIENTOS C1/C2)
 *
 * Sprint: AGENTIK-IMPORTS-SIMPLIFICATION-01
 */

// ── Data quality ────────────────────────────────────────────────────────────

export type DataQuality = "CONFIRMED" | "ESTIMATED" | "UNAVAILABLE";

// ── Stock data quality ──────────────────────────────────────────────────────

/**
 * Distinguishes "confirmed zero stock" (PIL record exists with qty=0)
 * from "no data" (no PIL record in B24 at all).
 */
export type StockDataQuality = "CONFIRMED" | "NO_PIL_RECORD";

/**
 * Source of the entry date used for aging calculations.
 */
export type EntryDateSource = "SAG_RECEIPT" | "NONE";

/**
 * Whether the sales pipeline ran successfully for this reference.
 * SYNCED = CustomerOrderLine query succeeded (zero is a valid confirmed result).
 * UNAVAILABLE = query failed or was not attempted.
 */
export type SalesDataQuality = "SYNCED" | "UNAVAILABLE";

// ── Last inbound source (simplified aging with fallback) ────────────────────

/**
 * Source of the last inbound date used for aging/inventario-lento.
 *   SAG_RECEIPT_C1_C2  = MOVIMIENTOS receipt date (highest quality)
 *   LAST_PURCHASE_SAG  = ProductEntity.lastPurchaseSag (d_ultima_compra, 97% coverage)
 *   UNAVAILABLE        = no date from either source
 */
export type ImportLastInboundSource = "SAG_RECEIPT_C1_C2" | "LAST_PURCHASE_SAG" | "UNAVAILABLE";

// ── Import size class ──────────────────────────────────────────────────────

export type ImportSizeClass = "PEQUENO" | "MEDIANO" | "GRANDE";

// ── Imported reference row ──────────────────────────────────────────────────

export interface ImportedReference {
  productId:       string;
  reference:       string;
  description:     string;
  /** Hero image URL from ProductAssetLink (role="hero") → GeneratedAsset.assetUrl */
  imageUrl:        string | null;
  entryDate:       string | null;
  entryDateQuality: DataQuality;
  lastEntryDate:   string | null;
  container:       string | null;
  /** PV4 — precio mayorista/maleta */
  pricePV4:        number | null;
  /** PV3 — precio detal */
  pricePV3:        number | null;
  totalImported:   number | null;
  totalImportedQuality: DataQuality;

  // ── Sales: gross / returns / net ────────────────────────────────────────
  /** Gross positive units sold (all time) */
  soldGross:       number;
  /** Units returned (all time, absolute value) */
  returns:         number;
  /** Net units sold = soldGross - returns */
  soldNet:         number;
  /** Legacy alias for soldNet */
  sold:            number;
  remaining:       number;
  /** Whether B24 PIL record exists — distinguishes confirmed zero from no data */
  stockDataQuality: StockDataQuality;
  /** Total positive stock across ALL warehouses (stores + import + production) */
  totalStock:      number;
  percentSold:     number | null;
  /** Days since last confirmed SAG receipt */
  daysSinceLastEntry: number | null;
  /** Source of entry date: SAG_RECEIPT or NONE */
  entryDateSource: EntryDateSource;
  /** Legacy alias for daysSinceLastEntry */
  daysInWarehouse: number | null;
  repurchaseStatus: RepurchaseStatus;
  repurchaseMotivo: RepurchaseMotivo;

  // ── Sales data quality ──────────────────────────────────────────────────
  /** Whether the sales sync pipeline ran successfully */
  salesDataQuality: SalesDataQuality;

  // ── 6M sales: gross / returns / net ─────────────────────────────────────
  sales6mGross:    number;
  returns6m:       number;
  sales6mNet:      number;
  /** Legacy alias for sales6mNet */
  salesTotal6m:    number;

  // ── Channel classification ──────────────────────────────────────────────
  /** Units classified as detal (summed per classified line) */
  salesDetal6m:    number;
  /** Units classified as mayorista (summed per classified line) */
  salesMayorista6m: number;
  /** Units not classifiable */
  salesNoDet6m:    number;
  /** All-time units by channel */
  soldDetal:       number;
  soldMayorista:   number;
  soldNoDet:       number;
  /** Channel classification quality */
  channelQuality:  DataQuality;
  channelPending:  boolean;
  /** Confidence (0-1) weighted by units */
  channelConfidence: number;
  /** Number of distinct import batches from SAG receipts */
  batchCount:      number;
  /** Dominant sales channel */
  dominantChannel: "detal" | "mayorista" | "equilibrado" | "sin_datos";

  // ── Receipt history ─────────────────────────────────────────────────────
  receiptCount:    number;
  receipts:        ImportReceiptSummary[];

  // ── Monetary values ───────────────────────────────────────────────────
  /** Total gross revenue all time */
  revenueAll:      number;
  /** Total gross revenue last 6 months */
  revenue6m:       number;
  /** Detal revenue last 6 months */
  revenueDetal6m:  number;
  /** Mayorista revenue last 6 months */
  revenueMayorista6m: number;
}

// ── Receipt summary (for UI) ────────────────────────────────────────────────

export interface ImportReceiptSummary {
  documentNumber: string;
  date:           string;
  quantity:       number;
  providerName:   string | null;
  fuenteCode:     string;
}

// ── Repurchase status ───────────────────────────────────────────────────────

export type RepurchaseStatus = "RECOMPRAR" | "VIGILAR" | "NO_RECOMPRAR" | "SIN_DATOS";

export type RepurchaseMotivo =
  | "desabastecimiento"
  | "alta_rotacion"
  | "exito_historico"
  | "recompra_recurrente"
  | "stock_suficiente"
  | "baja_rotacion"
  | "sin_datos";

// ── Executive summary ───────────────────────────────────────────────────────

export interface ImportSummary {
  totalReferences:     number;
  totalUnitsImported:  number | null;
  totalRemaining:      number;
  repurchaseSuggested: number;
  topVentasActuales:   number;
  refsCriticas:        number;
  sagValidated:        boolean;
}

// ── Monthly sales breakdown ─────────────────────────────────────────────────

export interface MonthlySale {
  month:      string;
  detal:      number;
  mayorista:  number;
  noDet:      number;
  total:      number;
}

// ── Detail for drawer ───────────────────────────────────────────────────────

export interface ImportReferenceDetail extends ImportedReference {
  monthlySales: MonthlySale[];
}

// ── Supply Intelligence ─────────────────────────────────────────────────────

export type SaludComercial = "SANA" | "EN_RIESGO" | "CRITICA" | "SIN_DATOS";
export type RecompraClassification = "INMEDIATA" | "VIGILAR" | "NO_RECOMPRAR" | "SIN_DATOS";
export type RotacionClassification = "MAS_VENDIDA" | "MAS_RAPIDA" | "NORMAL" | "SIN_VENTAS";
export type EnvejecimientoClassification = "0_3M" | "3_6M" | "6_8M" | "8_12M" | "12M_PLUS" | "SIN_DATOS";
export type BajaRotacionClassification = "SOBRESTOCK" | "SIN_MOVIMIENTO" | "REVISAR_CONTINUIDAD";
export type Prioridad = "ALTA" | "MEDIA" | "BAJA" | "SIN_ACCION";

export type InventoryAgingStatusLite = "NEW" | "NORMAL" | "AGING" | "LOW_ROTATION" | "OBSOLETE_CANDIDATE";

export interface ImportSupplyIntelligenceItem extends ImportedReference {
  // Cost
  costo: number | null;
  capitalInmovilizado: number | null;

  // Derived metrics
  coberturaPromedioDias: number | null;
  ritmoPromedioVentas: number | null;

  // Aging & lifecycle (internal — not displayed as badges)
  agingStatus: InventoryAgingStatusLite;
  lifecycleState: string;

  // Commercial health (internal — used for logic, not displayed as badge)
  saludComercial: SaludComercial;
  saludComercialRazon: string;

  // Classifications
  recompraClassification: RecompraClassification;
  /** Human-readable reason for the recompra classification (size-aware) */
  recompraReason: string;
  rotacionClassification: RotacionClassification;
  envejecimientoClassification: EnvejecimientoClassification;
  bajaRotacionClassification: BajaRotacionClassification | null;

  // Priority (internal — no Prioridades tab, but used for sorting)
  prioridad: Prioridad;
  prioridadRazon: string;

  // Decision engine evidence (exposed for drawer)
  repurchaseActionRationale: string | null;
  repurchaseRecommendedAction: string | null;

  // SAG informational dates (for drawer secondary section)
  createdAtSag: string | null;
  lastModifiedSag: string | null;
  lastPurchaseSag: string | null;
  lastSaleSag: string | null;

  // ── Simplification sprint additions ────────────────────────────────────
  /** Unified last inbound date (C1/C2 receipt → lastPurchaseSag fallback) */
  lastInboundDate: string | null;
  lastInboundSource: ImportLastInboundSource;
  daysSinceLastInbound: number | null;

  /** Canonical size from ProductEntity.handlingUnit */
  sizeClass: ImportSizeClass | null;
}

/** Simplified KPIs — 4 clickable metrics only */
export interface ImportSupplyKpis {
  /** "Comprar ahora" — refs with recompraClassification === INMEDIATA */
  comprarAhora: number;
  /** "Revisar recompra" — refs with recompraClassification === VIGILAR */
  revisarRecompra: number;
  /** "No recomprar" — refs with recompraClassification === NO_RECOMPRAR */
  noRecomprar: number;
  /** "Inventario lento" — refs with daysSinceLastInbound > 240 && remaining > 0 */
  inventarioLento: number;
  /** Total references for context */
  totalRefs: number;
}

/** Data quality summary — kept for internal diagnostics, not shown in UI */
export interface ImportDataQualitySummary {
  totalRefs: number;
  refsWithConfirmedStock: number;
  refsWithoutB24Record: number;
  refsWithConfirmedEntryDate: number;
  refsWithoutEntryDate: number;
  refsWithSyncedSales: number;
  refsWithPricePV3: number;
  refsWithPricePV4: number;
  refsWithCosto: number;
  refsWithClassifiableChannel: number;
  refsEligibleForRecompra: number;
  refsEligibleForEnvejecimiento: number;
  refsRequiringDataReview: number;
  /** How many refs have any inbound date (C1/C2 or lastPurchaseSag) */
  refsWithAnyInboundDate: number;
}
