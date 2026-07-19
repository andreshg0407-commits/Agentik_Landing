/**
 * lib/finance/intelligence/financial-intelligence-types.ts
 *
 * Financial Intelligence Layer — Core type contracts.
 *
 * Every financial fact has:
 *   - source: where it came from (Prisma model or runtime)
 *   - confidence: 0–1 deterministic score
 *   - state: REAL | PARTIAL | STALE | MISSING | BROKEN
 *   - syncAt: when data was last loaded
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

// ── Fundamental evidence types ─────────────────────────────────────────────────

export type FinancialDataState = "REAL" | "PARTIAL" | "STALE" | "MISSING" | "BROKEN";

export interface EvidenceEntry {
  /** Human label (e.g. "CollectionRecord · hoy") */
  label:       string;
  /** Prisma model or runtime name (e.g. "CollectionRecord", "BankingRuntime") */
  source:      string;
  /** Prisma model name for deep tracing */
  model:       string;
  /** Number of records/documents backing this entry */
  count:       number;
  /** 0–1 deterministic confidence */
  confidence:  number;
  state:       FinancialDataState;
  /** ISO string — last time source was synced/queried */
  syncAt:      string | null;
  /** Any notes about partial coverage or gaps */
  notes?:      string;
}

export interface EvidenceIndex {
  [key: string]: EvidenceEntry;
}

export interface MissingEvidence {
  /** What is missing */
  what:     string;
  /** Which domain it affects */
  affects:  string[];
  /** How critical is the absence */
  severity: "critical" | "high" | "medium" | "low";
  /** Recommended action to fill the gap */
  action:   string;
}

// ── Freshness ─────────────────────────────────────────────────────────────────

export interface SourceFreshness {
  source:       string;
  lastSyncAt:   Date | null;
  ageMinutes:   number | null;
  isStale:      boolean;
  staleSince:   Date | null;
  threshold:    number; // minutes before stale
}

export interface DataFreshnessReport {
  orgId:            string;
  evaluatedAt:      Date;
  sources:          SourceFreshness[];
  staleSources:     string[];
  missingSources:   string[];
  overallFreshness: "FRESH" | "PARTIAL" | "STALE" | "UNKNOWN";
}

// ── Sub-state shapes ─────────────────────────────────────────────────────────

export interface BusinessState {
  orgId:            string;
  evaluatedAt:      Date;
  financialHealth:  "healthy" | "attention" | "critical" | "no_data";
  activeSignals:    number;
  criticalSignals:  number;
  summary:          string;
}

export interface LiquidityState {
  state:                  FinancialDataState;
  availableCash:          number | null;
  bankBalance:            number | null;
  hasBankData:            boolean;
  receivableDueThisWeek:  number | null;
  pendingConsignaciones:  number;
  cashConfidenceLevel:    "HIGH" | "MEDIUM" | "LOW";
  cashConfidenceReasons:  string[];
  runway:                 number | null; // estimated days
  evidence:               EvidenceEntry[];
}

export interface ReceivablesState {
  state:            FinancialDataState;
  totalReceivable:  number | null;
  overdueReceivable: number | null;
  overdueRatio:     number | null;
  overdueClients:   number | null;
  maxDpd:           number | null;
  top5Debtors:      Array<{ name: string; amount: number; daysOverdue: number }>;
  evidence:         EvidenceEntry[];
}

export interface CollectionsState {
  state:            FinancialDataState;
  todayAmount:      number | null;
  todayCount:       number | null;
  totalAmount:      number | null;
  /** Payments received but not crossed against invoices */
  uncrossedAmount:  number | null;
  uncrossedCount:   number | null;
  bySource:         Record<string, { amount: number; count: number }>;
  evidence:         EvidenceEntry[];
}

export interface BankingState {
  state:              FinancialDataState;
  accountCount:       number;
  totalAvailable:     number | null;
  totalCreditToday:   number | null;
  unreconciledCount:  number;
  staleAccounts:      number;
  healthLevel:        "healthy" | "attention" | "critical" | "no_data";
  unmatchedMovements: number;
  evidence:           EvidenceEntry[];
}

export interface ReconciliationState {
  state:            FinancialDataState;
  total:            number;
  conciliado:       number;
  pendiente:        number;
  inconsistente:    number;
  parcial:          number;
  /** % reconciled */
  conciliadoPct:    number;
  graphIssues:      number;
  unresolvedNodes:  number;
  evidence:         EvidenceEntry[];
}

export interface CloseState {
  state:       FinancialDataState;
  canClose:    boolean;
  score:       number | null;
  grade:       string | null;
  blockers:    string[];
  warnings:    string[];
  graphBlockers: number;
  evidence:    EvidenceEntry[];
}

export interface PlanningState {
  state:           FinancialDataState;
  budgetCount:     number;
  totalBudget:     number | null;
  totalExecuted:   number | null;
  executionPct:    number | null;
  budgetsAtRisk:   number;
  evidence:        EvidenceEntry[];
}

export interface FinancialGraphState {
  state:           FinancialDataState;
  totalNodes:      number;
  totalEdges:      number;
  unresolvedCount: number;
  orphanCount:     number;
  criticalIssues:  number;
  warningIssues:   number;
  evidence:        EvidenceEntry[];
}

// ── Recommended focus area ────────────────────────────────────────────────────

export interface IntelligenceFocusArea {
  area:       string;
  reason:     string;
  severity:   "critical" | "high" | "medium" | "low";
  action:     string;
  traceable:  boolean;
}

// ── Main output shape ─────────────────────────────────────────────────────────

/**
 * The unified Financial Intelligence Context.
 * All fields are org-scoped and evidence-backed.
 * Diego, module pages, and the signal engine consume this.
 */
export interface FinancialIntelligenceContext {
  orgId:              string;
  builtAt:            Date;

  businessState:      BusinessState;
  dataFreshness:      DataFreshnessReport;
  financialGraphState: FinancialGraphState;
  liquidityState:     LiquidityState;
  receivablesState:   ReceivablesState;
  collectionsState:   CollectionsState;
  bankingState:       BankingState;
  reconciliationState: ReconciliationState;
  closeState:         CloseState;
  planningState:      PlanningState;

  evidenceIndex:       EvidenceIndex;
  missingEvidence:     MissingEvidence[];
  recommendedFocusAreas: IntelligenceFocusArea[];
}

// ── Question routing types ────────────────────────────────────────────────────

export type FinancialQuestion =
  | "que_paso_hoy"
  | "sin_conciliar"
  | "afecta_liquidez"
  | "clientes_cartera"
  | "movimientos_sin_relacion"
  | "kpis_no_confiables"
  | "bloquea_cierre";

export interface RoutedAnswer {
  question:    FinancialQuestion;
  answered:    boolean;
  /** null when there is no evidence to answer */
  summary:     string | null;
  evidence:    EvidenceEntry[];
  dataState:   FinancialDataState;
  confidence:  number;
  focusPath:   string | null; // route to relevant workspace
}
