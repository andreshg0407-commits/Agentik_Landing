/**
 * lib/finance/banking/index.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Public API barrel for the banking domain.
 *
 * Consumers import from this file only.
 * Internal files are implementation details.
 *
 * Resolved relations (requires BankAccount + BankMovement data):
 *   BANK_TO_CONSIGNACION  — BankMovement (credit) ↔ consignación node
 *   BANK_TO_RECEIPT       — BankMovement (credit) ↔ recibo de caja
 *   BANK_TO_EGRESO        — BankMovement (debit)  ↔ egreso/gasto
 *   BANK_TO_FACTURA       — BankMovement (credit) ↔ factura (direct payment)
 *   BANK_TO_PAYMENT       — BankMovement (credit) ↔ anticipo
 *
 * When no BankAccount rows exist:
 *   computeBankBalances()  → hasRealData = false
 *   computeBankingHealth() → level = "no_data"
 *   getAvailableCashBalance() → null
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  BankAccountType,
  BankAccountStatus,
  BankCurrency,
  BankAccountSummary,
  MovementDirection,
  MovementSource,
  BankMovementRecord,
  SyncSessionStatus,
  BankSyncSessionRecord,
  ReconciliationStatus,
  BankReconciliationRecord,
  StatementFileFormat,
  StatementUploadStatus,
  BankStatementUploadRecord,
  BankBalanceReport,
  AccountBalance,
  BankMatchType,
  BankMatchCandidate,
  BankIntegrityIssueType,
  BankIntegritySeverity,
  BankIntegrityIssue,
  ImportedMovementRow,
  BankQueryOptions,
} from "./banking-types";

// ── Status ────────────────────────────────────────────────────────────────────
export type { BankingHealthLevel, BankingHealthSummary } from "./banking-status";
export { computeBankingHealth, fmtBankAmount } from "./banking-status";

// ── Balances ──────────────────────────────────────────────────────────────────
export { computeBankBalances, getAvailableCashBalance } from "./banking-balances";

// ── Runtime ───────────────────────────────────────────────────────────────────
export {
  getBankAccounts,
  getBankMovements,
  getBankingSnapshot,
  getPendingConsignacionesAmount,
} from "./banking-runtime";

// ── Sync ──────────────────────────────────────────────────────────────────────
export { importMovements, recomputeAccountBalance, getSyncHistory } from "./banking-sync";
export type { ImportResult } from "./banking-sync";

// ── Reconciliation ────────────────────────────────────────────────────────────
export {
  runBankReconciliation,
  confirmReconciliation,
  rejectReconciliation,
  getPendingReconciliations,
} from "./banking-reconciliation";

// ── Matchers ──────────────────────────────────────────────────────────────────
export { findBestMatch, findAllCandidates } from "./banking-matchers";

// ── Integrity ─────────────────────────────────────────────────────────────────
export {
  runBankIntegrityChecks,
  detectDuplicateMovements,
  detectUnmatchedConsignaciones,
  detectOrphanTransfers,
  detectInvalidBalances,
  detectMissingReferences,
} from "./banking-integrity";

// ── Traceability ──────────────────────────────────────────────────────────────
export type { BalanceTraceStep, BalanceTrace, OrgBalanceTrace } from "./banking-trace";
export { buildBankingTrace } from "./banking-trace";

// ── Graph bridge ──────────────────────────────────────────────────────────────
export { bankMovementToNode, augmentGraphWithBankMovements } from "./banking-graph-bridge";
