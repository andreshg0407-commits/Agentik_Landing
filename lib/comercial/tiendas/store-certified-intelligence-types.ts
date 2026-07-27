/**
 * lib/comercial/tiendas/store-certified-intelligence-types.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-CERTIFIED-MVP-01
 *
 * Contract for certified store intelligence.
 * Client-safe: NO "server-only" import.
 *
 * Combines sales KPIs, monthly trends, cross-store benchmarks,
 * discount opportunities, and deterministic executive insights
 * into a single certified response per store.
 */

// ── Period metadata ─────────────────────────────────────────────────────────

export interface CertifiedPeriod {
  year: number;                    // 2026
  dateFrom: string;                // "2026-01-01"
  dateTo: string;                  // current date ISO
  firstDataDate: string | null;    // first SaleRecord date for this store
  lastDataDate: string | null;     // last SaleRecord date for this store
  dataMonths: number;              // months with at least 1 document
  isPartialYear: boolean;          // true if dateTo < Dec 31
}

// ── Sales KPIs ──────────────────────────────────────────────────────────────

export interface CertifiedSalesKpis {
  grossSales: number;              // sum of positive amounts (facturas)
  creditNotes: number;             // sum of negative amounts (notas credito) — always negative or 0
  netSales: number;                // grossSales + creditNotes
  invoiceCount: number;            // count of factura documents
  creditNoteCount: number;         // count of nota credito documents
  documentCount: number;           // invoiceCount + creditNoteCount
  averageTicket: number;           // grossSales / invoiceCount (or 0)
  currentMonthSales: number;       // netSales of last month with data
  previousMonthSales: number;      // netSales of second-to-last month with data
  monthlyGrowthPct: number | null; // (current - previous) / |previous| * 100, null if no base
  yearProgressPct: number;         // dataMonths / 12 * 100
}

// ── Monthly breakdown ───────────────────────────────────────────────────────

export interface CertifiedMonthlySales {
  month: string;                          // "2026-01"
  monthLabel: string;                     // "Ene"
  invoiceCount: number;
  creditNoteCount: number;
  grossSales: number;
  creditNotes: number;
  netSales: number;
  averageTicket: number;                  // grossSales / invoiceCount (or 0)
  monthOverMonthGrowthPct: number | null; // vs previous month, null if first
}

// ── 6-month trend ───────────────────────────────────────────────────────────

export type TrendDirection = "CRECIENDO" | "ESTABLE" | "DECRECIENDO" | "SIN_DATOS";

export interface SixMonthTrend {
  months: number;                         // how many months in the window (max 6)
  firstMonthSales: number;
  lastMonthSales: number;
  accumulatedGrowthPct: number | null;
  averageMonthlySales: number;
  trend: TrendDirection;
}

// ── Store benchmark ─────────────────────────────────────────────────────────

export interface StoreBenchmark {
  storeNetSales: number;
  allStoresNetSales: number;
  participationPct: number;               // storeNetSales / allStoresNetSales * 100
  positionByNetSales: number;             // 1-4
  totalActiveStores: number;              // 4
}

// ── Discount opportunities summary ──────────────────────────────────────────

export interface DiscountOpportunitySummary {
  totalReferences: number;
  totalUnits: number;
  tier10: number;     // count of refs at 10%
  tier30: number;
  tier50: number;
  tier70: number;
  withoutDate: number; // SIN_FECHA tier
  topItems: DiscountOpportunityItem[];    // max 8, sorted by priority
}

export interface DiscountOpportunityItem {
  referenceCode: string;
  description: string;
  imageUrl: string | null;
  storeQty: number;
  daysInStore: number | null;
  discountPercent: number;
  discountTier: string;
  reason: string;
}

// ── Executive insight ───────────────────────────────────────────────────────

export type InsightSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ExecutiveInsight {
  severity: InsightSeverity;
  title: string;
  description: string;
  evidence: string;
}

// ── Full response ───────────────────────────────────────────────────────────

export interface CertifiedStoreIntelligenceResponse {
  store: {
    storeId: string;
    storeName: string;
  };
  period: CertifiedPeriod;
  salesKpis: CertifiedSalesKpis;
  monthlySales: CertifiedMonthlySales[];
  sixMonthTrend: SixMonthTrend;
  storeBenchmark: StoreBenchmark;
  discountOpportunities: DiscountOpportunitySummary;
  executiveInsights: ExecutiveInsight[];
  salesSourceStatus: "CERTIFIED";
  salesSourceNote: string;
  snapshotAt: string;
}

// ── Display constants ───────────────────────────────────────────────────────

export const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

export const TREND_LABEL: Record<TrendDirection, string> = {
  CRECIENDO: "Creciendo",
  ESTABLE: "Estable",
  DECRECIENDO: "Decreciendo",
  SIN_DATOS: "Sin datos",
};

export const TREND_COLOR: Record<TrendDirection, string> = {
  CRECIENDO: "#22c55e",
  ESTABLE: "#f59e0b",
  DECRECIENDO: "#ef4444",
  SIN_DATOS: "#9ca3af",
};

export const INTELLIGENCE_YEAR = 2026;
