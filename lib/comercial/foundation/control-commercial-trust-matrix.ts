/**
 * control-commercial-trust-matrix.ts
 *
 * COMMERCIAL-DATA-FOUNDATION-01 — Phase 7
 *
 * Trust classification for every commercial KPI.
 * Only ALTA and MEDIA can appear in the dashboard.
 * BAJA remains blocked until data source is fixed.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrustLevel = "ALTA" | "MEDIA" | "BAJA";

export interface KpiTrustEntry {
  kpiId: string;
  kpiLabel: string;
  module: string;
  trustLevel: TrustLevel;
  source: string;
  reason: string;
  dashboardAllowed: boolean;
  fixRequired: string | null;
}

// ── Trust Matrix ──────────────────────────────────────────────────────────────

export const COMMERCIAL_TRUST_MATRIX: KpiTrustEntry[] = [
  // ── Inventario (SAG-backed, reliable) ───────────────────────────────────
  {
    kpiId: "inv_refs_totales",
    kpiLabel: "Refs Totales",
    module: "Inventario",
    trustLevel: "ALTA",
    source: "CommercialCoverageSnapshot (SAG)",
    reason: "Dato real de bodega SAG, actualizado via sync.",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "inv_refs_criticas",
    kpiLabel: "Refs Criticas",
    module: "Inventario",
    trustLevel: "ALTA",
    source: "CommercialCoverageSnapshot.disponible <= 20",
    reason: "Derivado de stock real SAG.",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "inv_refs_agotadas",
    kpiLabel: "Refs Agotadas",
    module: "Inventario",
    trustLevel: "ALTA",
    source: "CommercialCoverageSnapshot.disponible <= 0",
    reason: "Derivado de stock real SAG.",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "inv_refs_con_op",
    kpiLabel: "Refs con OP",
    module: "Inventario",
    trustLevel: "BAJA",
    source: "CommercialCoverageSnapshot.pendingOrdersQty",
    reason: "Solo 1% poblado (30 de 3,071 refs).",
    dashboardAllowed: false,
    fixRequired: "Completar pendingOrdersQty desde SAG PD demand.",
  },
  {
    kpiId: "inv_daily_velocity",
    kpiLabel: "Velocidad Diaria",
    module: "Inventario",
    trustLevel: "BAJA",
    source: "CommercialCoverageSnapshot.dailyVelocity",
    reason: "Nunca calculado. 76% de refs muestran 'sin_datos_velocidad'.",
    dashboardAllowed: false,
    fixRequired: "Calcular desde SaleRecord o CustomerOrderLine por referencia.",
  },

  // ── Clientes ──────────────────────────────────────────────────────────
  {
    kpiId: "cli_totales",
    kpiLabel: "Clientes Totales",
    module: "Clientes",
    trustLevel: "ALTA",
    source: "CustomerProfile.count()",
    reason: "33,203 registros reales de SAG + CRM.",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "cli_activos",
    kpiLabel: "Clientes Activos",
    module: "Clientes",
    trustLevel: "MEDIA",
    source: "CustomerProfile.status = ACTIVE",
    reason: "Todos son ACTIVE (sin segmentacion por recencia). Numero correcto pero no discriminante.",
    dashboardAllowed: true,
    fixRequired: "Implementar segmentacion ACTIVE/INACTIVE por recencia de compra.",
  },
  {
    kpiId: "cli_con_cartera",
    kpiLabel: "Clientes con Cartera",
    module: "Clientes",
    trustLevel: "MEDIA",
    source: "CustomerReceivable (balanceDue > 0, daysOverdue > 0)",
    reason: "98% overdue es sospechoso. Dato puede estar inflado.",
    dashboardAllowed: true,
    fixRequired: "Investigar calculo de daysOverdue y actualizacion de pagos.",
  },
  {
    kpiId: "cli_con_vendedor",
    kpiLabel: "Clientes con Vendedor",
    module: "Clientes",
    trustLevel: "BAJA",
    source: "CustomerProfile.sellerName",
    reason: "Solo 0.1% poblado (18 de 33,203). CRM sync no escribe sellerName.",
    dashboardAllowed: false,
    fixRequired: "CRM sync debe escribir sellerSlug desde CRMQuote history.",
  },
  {
    kpiId: "cli_ventas_l12",
    kpiLabel: "Ventas L12",
    module: "Clientes",
    trustLevel: "BAJA",
    source: "CustomerProfile.totalSalesL12",
    reason: "0% poblado. Nunca calculado.",
    dashboardAllowed: false,
    fixRequired: "Cron de consolidacion desde CRMQuote/SaleRecord.",
  },
  {
    kpiId: "cli_ciudad",
    kpiLabel: "Ciudad",
    module: "Clientes",
    trustLevel: "MEDIA",
    source: "CRM billing_address_city (DANE codes)",
    reason: "29,856 de 30,235 CRM profiles tienen codigo DANE. Requiere tabla de lookup para nombres.",
    dashboardAllowed: true,
    fixRequired: "Implementar DANE→nombre lookup desde divipola.json.",
  },

  // ── Pedidos ──────────────────────────────────────────────────────────
  {
    kpiId: "ped_crm_totales",
    kpiLabel: "Pedidos CRM",
    module: "Pedidos",
    trustLevel: "MEDIA",
    source: "CRMQuote (285 registros, Ene-Mar 2026)",
    reason: "Datos reales pero sync detenido desde Marzo 2026.",
    dashboardAllowed: true,
    fixRequired: "Reactivar CRM sync.",
  },
  {
    kpiId: "ped_crm_status",
    kpiLabel: "Estado Pedido CRM",
    module: "Pedidos",
    trustLevel: "ALTA",
    source: "rawCrmJson.raw.stage (real CRM stage)",
    reason: "142 Facturado, 48 Gestionado, 46 No_Gestionado, 31 Remisionado, 12 Anulado.",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "ped_crm_to_sag",
    kpiLabel: "Trazabilidad CRM→SAG",
    module: "Pedidos",
    trustLevel: "ALTA",
    source: "rawCrmJson.raw.id_sag_c → CustomerOrderRecord.erpMovId",
    reason: "272 de 285 quotes (95.4%) tienen id_sag_c. 272 match a SAG.",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "ped_sag_totales",
    kpiLabel: "Pedidos SAG",
    module: "Pedidos",
    trustLevel: "ALTA",
    source: "CustomerOrderRecord (9,522 registros, 2020-2026)",
    reason: "Datos completos de SAG con lineas detalladas.",
    dashboardAllowed: true,
    fixRequired: null,
  },

  // ── Vendedores ─────────────────────────────────────────────────────────
  {
    kpiId: "vend_directorio",
    kpiLabel: "Directorio Vendedores",
    module: "Vendedores",
    trustLevel: "MEDIA",
    source: "CRMQuote.sellerName (8 distintos)",
    reason: "Fuente CRM confiable pero sin modelo Prisma dedicado.",
    dashboardAllowed: true,
    fixRequired: "Crear CommercialSalesRep model o wire seller-directory.ts a UI.",
  },
  {
    kpiId: "vend_pedidos",
    kpiLabel: "Pedidos por Vendedor",
    module: "Vendedores",
    trustLevel: "MEDIA",
    source: "CRMQuote agrupado por sellerName",
    reason: "Conteo correcto pero solo CRM (no SAG).",
    dashboardAllowed: true,
    fixRequired: null,
  },
  {
    kpiId: "vend_clientes",
    kpiLabel: "Clientes por Vendedor",
    module: "Vendedores",
    trustLevel: "MEDIA",
    source: "CRMQuote.billing_account_id → CustomerProfile.crmId",
    reason: "281 de 285 quotes vinculan a un perfil (98.6%).",
    dashboardAllowed: true,
    fixRequired: null,
  },

  // ── Maletas ──────────────────────────────────────────────────────────
  {
    kpiId: "mal_vendedores_activos",
    kpiLabel: "Vendedores Activos",
    module: "Maletas",
    trustLevel: "BAJA",
    source: "CommercialCase (0 registros)",
    reason: "Tabla vacia. persistFullMaletasSnapshot() nunca invocado.",
    dashboardAllowed: false,
    fixRequired: "Invocar persistFullMaletasSnapshot() en pipeline de maletas.",
  },
  {
    kpiId: "mal_en_riesgo",
    kpiLabel: "Maletas en Riesgo",
    module: "Maletas",
    trustLevel: "BAJA",
    source: "CommercialCase (0 registros)",
    reason: "Tabla vacia.",
    dashboardAllowed: false,
    fixRequired: "Persistir snapshots de maletas.",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getAllowedKpis(): KpiTrustEntry[] {
  return COMMERCIAL_TRUST_MATRIX.filter(k => k.dashboardAllowed);
}

export function getBlockedKpis(): KpiTrustEntry[] {
  return COMMERCIAL_TRUST_MATRIX.filter(k => !k.dashboardAllowed);
}

export function getKpiTrust(kpiId: string): KpiTrustEntry | undefined {
  return COMMERCIAL_TRUST_MATRIX.find(k => k.kpiId === kpiId);
}

export function getTrustSummary(): {
  total: number;
  alta: number;
  media: number;
  baja: number;
  allowed: number;
  blocked: number;
} {
  const total = COMMERCIAL_TRUST_MATRIX.length;
  const alta = COMMERCIAL_TRUST_MATRIX.filter(k => k.trustLevel === "ALTA").length;
  const media = COMMERCIAL_TRUST_MATRIX.filter(k => k.trustLevel === "MEDIA").length;
  const baja = COMMERCIAL_TRUST_MATRIX.filter(k => k.trustLevel === "BAJA").length;
  const allowed = COMMERCIAL_TRUST_MATRIX.filter(k => k.dashboardAllowed).length;
  const blocked = COMMERCIAL_TRUST_MATRIX.filter(k => !k.dashboardAllowed).length;
  return { total, alta, media, baja, allowed, blocked };
}
