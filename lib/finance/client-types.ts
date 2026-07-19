/**
 * lib/finance/client-types.ts
 *
 * Client-safe finance types and pure formatters.
 *
 * RULES:
 *   - No Prisma imports
 *   - No pg / fs / Node-only modules
 *   - No runtime services
 *   - Only TypeScript interfaces, string unions, and pure functions
 *
 * Import this file from Client Components instead of server barrels.
 *
 * Sprint: AGENTIK-FINANCIAL-CLIENT-SERVER-BOUNDARY-FIX-01
 */

// ── Banking DTO ────────────────────────────────────────────────────────────────

export type BankingHealthLevel =
  | "healthy"
  | "attention"
  | "critical"
  | "no_data";

export interface BankAccountDTO {
  id:               string;
  name:             string;
  /** Total available balance */
  availableBalance: number;
  /** Current balance (ledger) */
  currentBalance:   number;
}

export interface BankingHealthDTO {
  level:   BankingHealthLevel;
  label:   string;
}

export interface BankingIntegrityIssueDTO {
  severity:    "critical" | "warning" | "info";
  description: string;
}

export interface BankingBalancesDTO {
  totalAvailable:         number;
  totalCurrentBalance:    number;
  totalCreditToday:       number;
  pendingConsignaciones:  number;
  accounts:               BankAccountDTO[];
}

/**
 * Client-safe banking snapshot DTO.
 * Mirror of BankingSnapshot from banking-runtime.ts — safe for client props.
 */
export interface BankingSnapshotDTO {
  orgId:           string;
  computedAt:      string; // ISO string — Date stripped for serialization
  hasRealData:     boolean;
  balances:        BankingBalancesDTO;
  health:          BankingHealthDTO;
  integrityIssues: BankingIntegrityIssueDTO[];
}

// ── Pure formatter (same logic as banking-status.ts fmtBankAmount) ─────────────

/**
 * Format a monetary amount in COP format.
 * Pure function — no DB, no imports.
 */
export function fmtBankAmount(amount: number): string {
  if (Math.abs(amount) >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `$${amount.toLocaleString("es-CO")}`;
}

// ── Runtime event DTO (safe — mirrors FinancialRuntimeEventType/Severity) ──────

export type FinancialEventSeverityDTO = "critical" | "warning" | "info";

export interface FinancialRuntimeEventDTO {
  id:                  string;
  type:                string;
  severity:            FinancialEventSeverityDTO;
  title:               string;
  summary:             string;
  source?:             string;
  confidence?:         number;
  previousConfidence?: number;
  ageMinutes:          number;
  createdAtIso:        string;
}
