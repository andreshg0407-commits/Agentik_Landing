/**
 * lib/comercial/tiendas/store-intelligence-types.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-MVP-01 — Store Intelligence types & constants
 *
 * Client-safe: NO "server-only" import.
 * Types used by both server service and client UI.
 *
 * Period: 2026 only (orderDate >= 2026-01-01 AND < 2027-01-01).
 */

// ── Period constant ─────────────────────────────────────────────────────────

export const INTELLIGENCE_YEAR = 2026;

// ── Top reference (most sold) ───────────────────────────────────────────────

export interface StoreTopReference {
  referenceCode: string;
  articleName:   string;
  imageUrl:      string | null;
  unitsSold:     number;
  revenue:       number;
  orderCount:    number;
  lastSaleDate:  string | null;  // ISO date string YYYY-MM-DD
  currentQty:    number;         // current store inventory
  rotationSpeed: string;         // "ALTA" | "MEDIA" | "BAJA" | "SIN_DATOS"
}

// ── Monthly sales ───────────────────────────────────────────────────────────

export interface StoreMonthSales {
  month:      string;   // YYYY-MM
  label:      string;   // "Ene", "Feb", etc.
  unitsSold:  number;
  returned:   number;
  revenue:    number;
  uniqueRefs: number;
}

// ── Month labels ────────────────────────────────────────────────────────────

export const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

// ── Low rotation reference ──────────────────────────────────────────────────

export interface StoreLowRotationRef {
  referenceCode:    string;
  articleName:      string;
  imageUrl:         string | null;
  daysInStore:      number | null;
  currentQty:       number;
  unitsSold2026:    number;
  revenue2026:      number;
  lastSaleDate:     string | null;  // ISO date string YYYY-MM-DD
  daysSinceLastSale: number | null;
  discountPercent:  number;         // suggested discount (0, 10, 30, 50, 70)
  discountTier:     string;         // from discount service
}

// ── Intelligence KPIs ───────────────────────────────────────────────────────

export interface StoreIntelligenceKpis {
  totalRevenue:      number;
  totalUnitsSold:    number;
  uniqueReferences:  number;
  dataMonths:        number;   // how many distinct months have data in 2026
  avgMonthlyRevenue: number;   // totalRevenue / dataMonths (or 0)
}

// ── Full intelligence response ──────────────────────────────────────────────

// ── Sales source certification ────────────────────────────────────────────────

export type SalesSourceStatus =
  | "CERTIFIED"                // fuente code maps reliably to this store
  | "NOT_CERTIFIED"            // no reliable store mapping in SAG
  | "PENDING_SYNC";           // data exists in SAG but not yet synced

// ── Certified sales month (from SaleRecord via fuente code) ──────────────────

export interface StoreCertifiedMonth {
  month:     string;   // YYYY-MM
  label:     string;   // "Ene", "Feb", etc.
  invoices:  number;   // factura count
  credits:   number;   // nota credito count
  revenue:   number;   // net revenue (facturas - notas)
  grossRev:  number;   // factura revenue only
  creditRev: number;   // nota credito revenue (negative)
}

// ── Certified sales KPIs ─────────────────────────────────────────────────────

export interface StoreCertifiedKpis {
  totalRevenue:      number;
  totalGrossRev:     number;
  totalCreditRev:    number;
  invoiceCount:      number;
  creditNoteCount:   number;
  dataMonths:        number;
  avgMonthlyRevenue: number;
}

export interface StoreIntelligenceResponse {
  storeId:         string;
  storeName:       string;
  year:            number;
  kpis:            StoreIntelligenceKpis;
  topReferences:   StoreTopReference[];   // sorted by unitsSold DESC, max 20
  monthlySales:    StoreMonthSales[];     // sorted by month ASC, 2026 only
  lowRotation:     StoreLowRotationRef[]; // sorted by daysInStore DESC, max 30
  dataQuality:     "RICA" | "LIMITADA" | "MINIMA" | "SIN_DATOS";
  dataQualityNote: string;
  salesSourceStatus: SalesSourceStatus;
  salesSourceNote:   string;
  // Certified sales from SaleRecord (fuente code → store mapping)
  certifiedSales:    StoreCertifiedKpis | null;
  certifiedMonthly:  StoreCertifiedMonth[];
}

// ── Data quality thresholds ─────────────────────────────────────────────────

export function resolveDataQuality(
  dataMonths: number,
  uniqueRefs: number,
): { quality: StoreIntelligenceResponse["dataQuality"]; note: string } {
  if (dataMonths === 0 || uniqueRefs === 0) {
    return { quality: "SIN_DATOS", note: "Sin ventas facturadas registradas en 2026." };
  }
  if (dataMonths >= 6 && uniqueRefs >= 20) {
    return { quality: "RICA", note: `Datos parciales de 2026. ${dataMonths} meses con informacion, ${uniqueRefs} referencias.` };
  }
  if (dataMonths >= 3 || uniqueRefs >= 10) {
    return { quality: "LIMITADA", note: `Datos parciales de 2026. ${dataMonths} meses con informacion, ${uniqueRefs} referencias.` };
  }
  return { quality: "MINIMA", note: `Datos parciales de 2026. ${dataMonths} meses con informacion, ${uniqueRefs} referencias.` };
}

// ── Rotation speed ──────────────────────────────────────────────────────────

export function resolveRotationSpeed(unitsSold: number, dataMonths: number): string {
  if (dataMonths === 0) return "SIN_DATOS";
  const perMonth = unitsSold / dataMonths;
  if (perMonth >= 5) return "ALTA";
  if (perMonth >= 2) return "MEDIA";
  return "BAJA";
}

export const ROTATION_SPEED_LABEL: Record<string, string> = {
  ALTA: "Alta rotacion",
  MEDIA: "Media rotacion",
  BAJA: "Baja rotacion",
  SIN_DATOS: "Sin datos",
};

export const ROTATION_SPEED_COLOR: Record<string, string> = {
  ALTA: "#22c55e",
  MEDIA: "#f59e0b",
  BAJA: "#ef4444",
  SIN_DATOS: "#9ca3af",
};

// ── Display constants ───────────────────────────────────────────────────────

export const DATA_QUALITY_COLOR: Record<StoreIntelligenceResponse["dataQuality"], string> = {
  RICA:      "#22c55e",
  LIMITADA:  "#f59e0b",
  MINIMA:    "#ef4444",
  SIN_DATOS: "#9ca3af",
};

export const DATA_QUALITY_LABEL: Record<StoreIntelligenceResponse["dataQuality"], string> = {
  RICA:      "Datos 2026",
  LIMITADA:  "Datos parciales 2026",
  MINIMA:    "Datos minimos 2026",
  SIN_DATOS: "Sin datos 2026",
};
