/**
 * lib/finance/banking/banking-types.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Core type system for the banking domain.
 *
 * Consumers import from lib/finance/banking/index.ts only.
 */

// ── Account ───────────────────────────────────────────────────────────────────

export type BankAccountType = "checking" | "savings" | "investment" | "petty_cash";
export type BankAccountStatus = "active" | "inactive" | "closed";
export type BankCurrency = "COP" | "USD" | "EUR";

export interface BankAccountSummary {
  id:                  string;
  organizationId:      string;
  accountName:         string;
  bankName:            string;
  accountNumberMasked: string | null;
  accountType:         BankAccountType;
  currency:            BankCurrency;
  status:              BankAccountStatus;
  openingBalance:      number;
  currentBalance:      number;
  availableBalance:    number;
  lastMovementAt:      Date | null;
  lastSyncAt:          Date | null;
  metadata:            Record<string, unknown>;
  createdAt:           Date;
  updatedAt:           Date;
}

// ── Movement ──────────────────────────────────────────────────────────────────

export type MovementDirection = "credit" | "debit";
export type MovementSource   = "manual" | "csv_import" | "excel_import" | "api_sync" | "api_future";

export interface BankMovementRecord {
  id:                 string;
  organizationId:     string;
  bankAccountId:      string;
  movementDate:       Date;
  description:        string | null;
  reference:          string | null;
  amount:             number;
  direction:          MovementDirection;
  balanceAfter:       number | null;
  source:             MovementSource;
  sourceDocumentType: string | null;
  sourceDocumentRef:  string | null;
  matched:            boolean;
  matchedAt:          Date | null;
  graphNodeId:        string | null;
  rawPayload:         Record<string, unknown>;
  createdAt:          Date;
  updatedAt:          Date;
}

// ── Sync session ──────────────────────────────────────────────────────────────

export type SyncSessionStatus = "pending" | "running" | "completed" | "failed" | "partial";

export interface BankSyncSessionRecord {
  id:             string;
  organizationId: string;
  bankAccountId:  string;
  source:         MovementSource;
  status:         SyncSessionStatus;
  fromDate:       Date | null;
  toDate:         Date | null;
  importedCount:  number;
  duplicateCount: number;
  unresolvedCount:number;
  matchedCount:   number;
  errorMessages:  string[];
  startedAt:      Date | null;
  completedAt:    Date | null;
  createdAt:      Date;
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export type ReconciliationStatus = "pending" | "confirmed" | "rejected" | "under_review";

export interface BankReconciliationRecord {
  id:             string;
  organizationId: string;
  bankMovementId: string;
  bankAccountId:  string;
  graphNodeId:    string;
  confidence:     number;
  matchedBy:      string[];
  status:         ReconciliationStatus;
  explanation:    string | null;
  resolvedBy:     string | null;
  resolvedAt:     Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}

// ── Statement upload ──────────────────────────────────────────────────────────

export type StatementFileFormat = "csv" | "excel" | "pdf" | "ofx" | "other";
export type StatementUploadStatus = "pending" | "processing" | "completed" | "failed";

export interface BankStatementUploadRecord {
  id:             string;
  organizationId: string;
  bankAccountId:  string | null;
  fileName:       string;
  fileFormat:     StatementFileFormat;
  fileSize:       number | null;
  status:         StatementUploadStatus;
  rowsDetected:   number;
  rowsImported:   number;
  rowsSkipped:    number;
  errorMessages:  string[];
  uploadedBy:     string | null;
  processedAt:    Date | null;
  createdAt:      Date;
}

// ── Balance report ────────────────────────────────────────────────────────────

export interface BankBalanceReport {
  organizationId:       string;
  computedAt:           Date;
  accounts:             AccountBalance[];
  totalCurrentBalance:  number;
  totalAvailable:       number;
  totalCreditToday:     number;
  totalDebitToday:      number;
  netMovementToday:     number;
  pendingConsignaciones: number;
  reconciledBalance:    number;
  unreconciledBalance:  number;
  hasRealData:          boolean;
}

export interface AccountBalance {
  accountId:       string;
  accountName:     string;
  bankName:        string;
  currency:        BankCurrency;
  currentBalance:  number;
  availableBalance: number;
  creditToday:     number;
  debitToday:      number;
  lastMovementAt:  Date | null;
  lastSyncAt:      Date | null;
  movementCount:   number;
}

// ── Match result ──────────────────────────────────────────────────────────────

export type BankMatchType =
  | "BANK_TO_CONSIGNACION"
  | "BANK_TO_RECEIPT"
  | "BANK_TO_EGRESO"
  | "BANK_TO_FACTURA"
  | "BANK_TO_PAYMENT";

export interface BankMatchCandidate {
  graphNodeId:  string;
  matchType:    BankMatchType;
  confidence:   number;
  matchedBy:    string[];
  explanation:  string;
}

// ── Integrity issue ───────────────────────────────────────────────────────────

export type BankIntegrityIssueType =
  | "DUPLICATE_MOVEMENT"
  | "UNMATCHED_CONSIGNACION"
  | "ORPHAN_TRANSFER"
  | "INVALID_BALANCE"
  | "MISSING_REFERENCE"
  | "INCONSISTENT_BALANCE"
  | "RECONCILIATION_CONFLICT";

export type BankIntegritySeverity = "critical" | "warning" | "info";

export interface BankIntegrityIssue {
  id:          string;
  orgId:       string;
  type:        BankIntegrityIssueType;
  severity:    BankIntegritySeverity;
  movementIds: string[];
  message:     string;
  detectedAt:  Date;
  metadata:    Record<string, unknown>;
}

// ── Import row (normalized from CSV/Excel) ────────────────────────────────────

export interface ImportedMovementRow {
  movementDate:       Date;
  description:        string;
  reference:          string | null;
  amount:             number;
  direction:          MovementDirection;
  balanceAfter:       number | null;
  sourceDocumentType: string | null;
  sourceDocumentRef:  string | null;
  rawPayload:         Record<string, unknown>;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface BankQueryOptions {
  orgId:         string;
  accountId?:    string;
  fromDate?:     Date;
  toDate?:       Date;
  matched?:      boolean;
  direction?:    MovementDirection;
  limit?:        number;
}
