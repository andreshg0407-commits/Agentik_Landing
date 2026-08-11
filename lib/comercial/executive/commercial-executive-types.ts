/**
 * lib/comercial/executive/commercial-executive-types.ts
 *
 * Client-safe types for Commercial Executive Presentation.
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01 / B02 / B02.1
 *
 * RULE: No Prisma, no React, no viewport. Pure domain types.
 * All business math computed server-side by the assembler.
 */

// ── Low rotation classification ──────────────────────────────────────────────

/**
 * 8-calendar-month low rotation classification.
 *
 * BUSINESS LAW: "Referencias que lleven más de 8 meses sin registrar
 * recompra o reingreso desde China y aún tengan inventario."
 *
 * IMPORTANT: 8 CALENDAR MONTHS, NOT a fixed 240-day threshold.
 */
export type LowRotationStatus =
  | "LOW_ROTATION"                         // stock > 0 AND lastActivity < 8 calendar months ago
  | "NORMAL"                               // stock > 0 AND lastActivity within 8 calendar months
  | "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION"   // stock > 0 but source = UNAVAILABLE
  | "SIN_STOCK";                           // stock = 0 — not applicable

/**
 * Import activity evidence source hierarchy.
 *
 * 1. SAG_RECEIPT_C1_C2 — actual purchase receipt / warehouse re-entry
 * 2. SAG_LAST_PURCHASE — d_ultima_compra (NOT a physical warehouse receipt)
 * 3. UNAVAILABLE — insufficient source evidence
 */
export type ImportActivitySource =
  | "SAG_RECEIPT_C1_C2"
  | "SAG_LAST_PURCHASE"
  | "UNAVAILABLE";

// ── Low rotation item (thin query output) ────────────────────────────────────

export interface LowRotationImportItem {
  reference: string;
  description: string;
  currentInventory: number;
  lastImportActivityDate: string | null;
  lastImportActivitySource: ImportActivitySource;
  monthsSinceLastActivity: number | null;
  inventoryValue: number | null;
  lastSaleDate: string | null;
  sales90d: number;
  sales180d: number;
  rotationStatus: LowRotationStatus;
  costo: number | null;

  // Raw evidence — both dates preserved for audit/drill-down
  lastReceiptDate: string | null;
  lastPurchaseDate: string | null;
}

// ── Executive Insight (B02) ──────────────────────────────────────────────────

/**
 * Normalized executive insight — client-safe presentation contract.
 *
 * Maps deterministic signals from existing domain engines into a
 * uniform card format for mobile/tablet intelligence views.
 *
 * NO LLM determines severity or ranking. All fields computed server-side.
 */

export type InsightDomain =
  | "ventas"
  | "cartera"
  | "clientes"
  | "vendedores"
  | "importaciones"
  | "inventario"
  | "tiendas"
  | "pedidos";

export type InsightSeverity = "critical" | "warning" | "info";

/**
 * Business nature of the insight — independent of severity.
 *
 * B02.1: severity = urgency/materiality. kind = business nature.
 * A RISK can be info-severity (low urgency). An OBSERVATION can be
 * warning-severity (material but not actionable). Never derive kind
 * from severity or vice-versa.
 */
export type InsightKind = "RISK" | "OPPORTUNITY" | "OBSERVATION";

export type InsightTruthStatus = "CONFIRMED" | "PARTIAL" | "ESTIMATED";

export interface ExecutiveInsight {
  id: string;
  domain: InsightDomain;
  kind: InsightKind;
  severity: InsightSeverity;
  what: string;
  why: string;
  evidence: string;
  suggestedNextStep: string | null;
  deepLink: string | null;
  asOf: string;
  truthStatus: InsightTruthStatus;
}

// ── Executive Report (B02) ──────────────────────────────────────────────────

export type ReportId =
  | "resumen-ejecutivo"
  | "ventas-ritmo"
  | "cartera"
  | "vendedores"
  | "tiendas"
  | "importaciones";

export interface ExecutiveReport {
  id: ReportId;
  title: string;
  description: string;
  domain: InsightDomain;
  deepLink: string;
  available: boolean;
}

// ── Executive Presentation Assembly (PA) ─────────────────────────────────────

export interface CommercialExecutivePA {
  // Meta
  asOf: string;           // ISO 8601
  loadedAt: string;       // ISO 8601
  source: "PRODUCTION";

  // Resumen
  ventas: ExecutiveVentasSection | null;
  pedidos: ExecutivePedidosSection | null;
  cartera: ExecutiveCarteraSection | null;
  clientes: ExecutiveClientesSection | null;
  vendedores: ExecutiveVendedoresSection | null;
  importaciones: ExecutiveImportacionesSection;
  inventario: ExecutiveInventarioSection | null;

  // Inteligencia (B02)
  insights: ExecutiveInsight[];

  // Informes (B02)
  reports: ExecutiveReport[];
}

// ── Section types ────────────────────────────────────────────────────────────

export interface ExecutiveVentasSection {
  ventasMes: number;
  ventasSemana: number;
  ventasHoy: number;
  periodo: string;
  asOf: string;
}

export interface ExecutivePedidosSection {
  pedidosMes: number;
  pedidosTotal: number;
  ticketPromedio: number;
  periodo: string;
  asOf: string;
}

export interface ExecutiveCarteraSection {
  totalCartera: number;
  carteraVencida: number;
  porcentajeVencido: number;
  asOf: string;
}

export interface ExecutiveClientesSection {
  clientesActivos: number;
  clientesNuevos: number;
  asOf: string;
}

export interface ExecutiveVendedoresSection {
  vendedoresOperativos: number;
  asOf: string;
}

export interface ExecutiveImportacionesSection {
  totalRefs: number;
  refsEnBajaRotacion: number;
  capitalEnBajaRotacion: number | null;
  capitalEnBajaRotacionCertified: boolean;
  refsAtencionRecompra: number;
  lowRotationItems: LowRotationImportItem[];
  lowRotationMonthsThreshold: number;
  asOf: string;
}

export interface ExecutiveInventarioSection {
  refsTotales: number;
  refsCriticas: number;
  refsAgotadas: number;
  asOf: string;
}
