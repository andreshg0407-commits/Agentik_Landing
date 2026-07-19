/**
 * Reconciliation shared types.
 *
 * Source-agnostic data structures used by the reconciliation engine
 * and all reconciliation adapters (orders vs sales, import sources, etc.).
 */

export type ReconStatus =
  | "MATCH"
  | "MISMATCH_AMOUNT"
  | "ONLY_IN_A"
  | "ONLY_IN_B"
  | "POSSIBLE_DUPLICATE";

export interface ReconRecord {
  key:          string;             // natural match key
  label:        string;             // human-readable description
  status:       ReconStatus;
  amountA:      number | null;
  amountB:      number | null;
  delta:        number | null;      // amountB - amountA, null when only in one side
  deltaPercent: number | null;      // (delta / amountA) * 100
  rowsA:        number;
  rowsB:        number;
  metaA?:       Record<string, unknown>;
  metaB?:       Record<string, unknown>;
}

export interface ReconSummary {
  total:              number;
  matched:            number;
  mismatchAmount:     number;
  onlyInA:            number;
  onlyInB:            number;
  possibleDuplicates: number;
  totalAmountA:       number;
  totalAmountB:       number;
  deltaTotal:         number;     // totalAmountB - totalAmountA
  matchRate:          number;     // matched / total * 100
}

export interface ReconResult {
  reconType:    string;           // "orders_vs_sales"
  scope:        string;           // "period:YYYYMM" or similar description
  sourceALabel: string;
  sourceBLabel: string;
  summary:      ReconSummary;
  records:      ReconRecord[];
  runAt:        string;           // ISO timestamp
}

export interface ReconSide {
  key:    string;
  label:  string;
  amount: number;
  rows:   number;
  meta?:  Record<string, unknown>;
}

export interface ReconOptions {
  /** Fractional tolerance for MATCH vs MISMATCH_AMOUNT. Default: 0.001 (0.1%) */
  amountTolerance?: number;
  /** If true, detect rows with same key appearing multiple times in one side */
  detectDuplicates?: boolean;
}
