/**
 * domains/customer/customer-entities.ts
 *
 * Canonical entities for the Customer Domain.
 * These represent business concepts of "customer", "branch", "receivable",
 * "behavior", "vendor", "collection", "commercial assignment", and
 * "credit profile" regardless of source ERP.
 *
 * Data sources: SAG TERCEROS (~55 fields), SuiteCRM (billing account),
 * SAG orders (via customerNit).
 *
 * Sprint: CUSTOMER-DOMAIN-01 (foundation)
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02 (commercial enrichment)
 *
 * This domain does NOT compute scoring, segmentation intelligence,
 * credit risk, or churn prediction.
 */

import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";

// ── Customer Profile ────────────────────────────────────────────────────────

export interface CustomerProfile {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Tax identification number (NIT/CC/CE) */
  readonly taxId: string;

  /** Tax ID type */
  readonly taxIdType: TaxIdType;

  /** Legal or commercial name */
  readonly name: string;

  /** Trade name / doing business as */
  readonly tradeName: string | null;

  /** Customer classification / segment */
  readonly segment: CustomerSegment;

  /** Credit terms in days (0 = cash only) */
  readonly creditTermDays: number;

  /** Contact information */
  readonly contact: CustomerContact;

  /** Geographic location */
  readonly location: CustomerLocation;

  /** Fiscal classification */
  readonly fiscal: CustomerFiscal;

  /** Administrative status (Agentik-owned) */
  readonly adminStatus: CustomerAdminStatus;

  /** Operational status (sync-derived) */
  readonly operationalStatus: CustomerOperationalStatus;

  /** Third-party type from TERCEROS (customer, vendor, employee, etc.) */
  readonly thirdPartyType: ThirdPartyType;

  /** CRM external identifier (billing_account_id from SuiteCRM) */
  readonly crmId: string | null;
}

// ── Tax ID Types ─────────────────────────────────────────────────────────────

export type TaxIdType =
  | "NIT"
  | "CC"
  | "CE"
  | "PASSPORT"
  | "OTHER"
  | "UNKNOWN";

// ── Customer Segment ─────────────────────────────────────────────────────────

export interface CustomerSegment {
  /** Segment code from ERP */
  readonly code: string;
  /** Segment display name */
  readonly name: string | null;
  /** Whether this is a key/strategic account */
  readonly isKeyAccount: boolean;
}

// ── Customer Contact ─────────────────────────────────────────────────────────

export interface CustomerContact {
  readonly primaryPhone: string | null;
  readonly secondaryPhone: string | null;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly contactPerson: string | null;
}

// ── Customer Location ────────────────────────────────────────────────────────

export interface CustomerLocation {
  readonly address: string | null;
  readonly city: string | null;
  readonly cityCode: string | null;
  readonly department: string | null;
  readonly departmentCode: string | null;
  readonly country: string;
  readonly postalCode: string | null;
  /** Zone / route for sales coverage */
  readonly zone: string | null;
}

// ── Customer Fiscal ──────────────────────────────────────────────────────────

export interface CustomerFiscal {
  /** Fiscal regime (Responsable IVA, No Responsable, Gran Contribuyente, etc.) */
  readonly regime: string | null;
  /** Fiscal responsibilities (list of DIAN codes) */
  readonly responsibilities: string[];
  /** Withholding agent flag */
  readonly isWithholdingAgent: boolean;
  /** Self-withholding agent flag */
  readonly isSelfWithholding: boolean;
}

// ── Administrative Status (Agentik-owned) ────────────────────────────────────

export type CustomerAdminStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "ARCHIVED"
  | "UNKNOWN";

// ── Operational Status (sync-derived) ────────────────────────────────────────

export type CustomerOperationalStatus =
  | "NEVER_SYNCED"
  | "SYNCED"
  | "SYNC_ERROR";

// ── Third Party Type ─────────────────────────────────────────────────────────

export type ThirdPartyType =
  | "CUSTOMER"
  | "VENDOR"
  | "EMPLOYEE"
  | "MIXED"
  | "UNKNOWN";

// ── Customer Branch ──────────────────────────────────────────────────────────

export interface CustomerBranch {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Parent customer tax ID */
  readonly customerTaxId: string;

  /** Branch code within the customer */
  readonly branchCode: string;

  /** Branch name */
  readonly name: string;

  /** Branch contact */
  readonly contact: CustomerContact;

  /** Branch location */
  readonly location: CustomerLocation;

  /** Whether this is the main/default branch */
  readonly isMain: boolean;

  /** Whether this branch is active */
  readonly active: boolean;
}

// ── Customer Receivable ──────────────────────────────────────────────────────

export interface CustomerReceivable {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Customer tax ID */
  readonly customerTaxId: string;

  /** Document type (invoice, note, advance, etc.) */
  readonly documentType: ReceivableDocumentType;

  /** Document number */
  readonly documentNumber: string;

  /** Original document amount */
  readonly originalAmount: number;

  /** Current outstanding balance */
  readonly currentBalance: number;

  /** Currency code */
  readonly currency: string;

  /** Issue date */
  readonly issuedAt: Date;

  /** Due date */
  readonly dueAt: Date;

  /** Days past due (0 = not yet due, negative = not due) */
  readonly daysPastDue: number;

  /** Aging bracket */
  readonly agingBracket: ReceivableAgingBracket;

  /** Payment status */
  readonly paymentStatus: ReceivablePaymentStatus;
}

// ── Receivable Document Type ────────────────────────────────────────────────

export type ReceivableDocumentType =
  | "INVOICE"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "ADVANCE"
  | "OTHER";

// ── Receivable Aging Bracket ────────────────────────────────────────────────

export type ReceivableAgingBracket =
  | "CURRENT"
  | "PAST_DUE_1_30"
  | "PAST_DUE_31_60"
  | "PAST_DUE_61_90"
  | "PAST_DUE_91_PLUS"
  | "UNKNOWN";

export function deriveAgingBracket(daysPastDue: number | null): ReceivableAgingBracket {
  if (daysPastDue == null) return "UNKNOWN";
  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue <= 30) return "PAST_DUE_1_30";
  if (daysPastDue <= 60) return "PAST_DUE_31_60";
  if (daysPastDue <= 90) return "PAST_DUE_61_90";
  return "PAST_DUE_91_PLUS";
}

// ── Receivable Payment Status ───────────────────────────────────────────────

export type ReceivablePaymentStatus =
  | "OPEN"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "WRITTEN_OFF"
  | "IN_DISPUTE";

// ── Customer Behavior ───────────────────────────────────────────────────────

export interface CustomerBehavior {
  readonly identity: CommercialIdentity;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Customer tax ID */
  readonly customerTaxId: string;

  /** Purchase frequency pattern */
  readonly purchaseFrequency: PurchaseFrequency;

  /** Date of last purchase */
  readonly lastPurchaseDate: Date | null;

  /** Date of first purchase */
  readonly firstPurchaseDate: Date | null;

  /** Total number of orders (lifetime) */
  readonly totalOrders: number;

  /** Average order value (lifetime) */
  readonly averageOrderValue: number;

  /** Currency for monetary values */
  readonly currency: string;

  /** Payment behavior pattern */
  readonly paymentBehavior: PaymentBehavior;

  /** Average days to pay */
  readonly averageDaysToPay: number | null;
}

// ── Purchase Frequency ──────────────────────────────────────────────────────

export type PurchaseFrequency =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SPORADIC"
  | "INACTIVE"
  | "NEW"
  | "UNKNOWN";

// ── Payment Behavior ────────────────────────────────────────────────────────

export type PaymentBehavior =
  | "EARLY_PAYER"
  | "ON_TIME"
  | "OCCASIONAL_LATE"
  | "CHRONIC_LATE"
  | "DEFAULTER"
  | "UNKNOWN";

// ── Vendor Profile ──────────────────────────────────────────────────────────

export interface VendorProfile {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Vendor code */
  readonly vendorCode: string;

  /** Vendor name */
  readonly name: string;

  /** Contact information */
  readonly contact: CustomerContact;

  /** Assigned zone/territory */
  readonly zone: string | null;

  /** Whether the vendor is active */
  readonly active: boolean;

  /** Associated customer tax IDs (portfolio) */
  readonly assignedCustomerCount: number;
}

// ── Collection Record ───────────────────────────────────────────────────────

export interface CollectionRecord {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Customer tax ID */
  readonly customerTaxId: string;

  /** Receivable document number this collection applies to */
  readonly receivableDocumentNumber: string | null;

  /** Payment method */
  readonly paymentMethod: PaymentMethod;

  /** Amount collected */
  readonly amount: number;

  /** Currency */
  readonly currency: string;

  /** Collection date */
  readonly collectedAt: Date;

  /** Reference number (check number, transfer reference, etc.) */
  readonly referenceNumber: string | null;

  /** Collection status */
  readonly status: CollectionStatus;
}

// ── Payment Method ──────────────────────────────────────────────────────────

export type PaymentMethod =
  | "CASH"
  | "CHECK"
  | "BANK_TRANSFER"
  | "CREDIT_CARD"
  | "NETTING"
  | "OTHER";

// ── Collection Status ───────────────────────────────────────────────────────

export type CollectionStatus =
  | "APPLIED"
  | "PENDING"
  | "REVERSED"
  | "BOUNCED";

// ── Derive Operational Status ───────────────────────────────────────────────

export function deriveCustomerOperationalStatus(
  lastSyncAt: Date | null,
  syncError: boolean
): CustomerOperationalStatus {
  if (!lastSyncAt) return "NEVER_SYNCED";
  if (syncError) return "SYNC_ERROR";
  return "SYNCED";
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER-SAG-ENRICHMENT-02 — Commercial enrichment entities
// ══════════════════════════════════════════════════════════════════════════════

// ── Field Evidence (per-field traceability) ──────────────────────────────────

export type EvidenceSource = "SAG" | "CRM" | "MANUAL" | "DERIVED" | "UNKNOWN";
export type FieldQuality = "CONFIRMED" | "PARTIAL" | "ESTIMATED" | "UNAVAILABLE" | "CONFLICTED";

export interface FieldEvidence {
  readonly source: EvidenceSource;
  readonly quality: FieldQuality;
  readonly observedAt: Date;
  readonly rawValue: unknown;
  readonly confidence: number;
  readonly note: string | null;
}

// ── Resolved Lookup (code + name pair) ───────────────────────────────────────

export interface ResolvedLookup {
  readonly code: string;
  readonly name: string | null;
  readonly resolved: boolean;
}

// ── Assignment Conflict ──────────────────────────────────────────────────────

export interface AssignmentConflict {
  readonly field: string;
  readonly sources: Array<{ source: EvidenceSource; value: unknown }>;
  readonly resolution: "SAG_WINS" | "CRM_WINS" | "MOST_RECENT" | "UNRESOLVED";
  readonly resolvedValue: unknown;
  readonly note: string;
}

// ── Customer Commercial Assignment ──────────────────────────────────────────

export interface CustomerCommercialAssignment {
  readonly identity: CommercialIdentity;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Customer tax ID (links to CustomerProfile) */
  readonly customerTaxId: string;

  // Sales rep
  readonly salesRepName: string | null;
  readonly salesRepCode: string | null;
  readonly salesRepTaxId: string | null;
  readonly salesRepEvidence: FieldEvidence | null;

  // Supervisor
  readonly supervisorName: string | null;
  readonly supervisorCode: string | null;
  readonly supervisorEvidence: FieldEvidence | null;

  // Channel
  readonly channel: ResolvedLookup | null;
  readonly channelEvidence: FieldEvidence | null;

  // Zone
  readonly zone: ResolvedLookup | null;
  readonly zoneEvidence: FieldEvidence | null;

  // Territory
  readonly territory: ResolvedLookup | null;
  readonly territoryEvidence: FieldEvidence | null;

  // Segment
  readonly segment: ResolvedLookup | null;
  readonly segmentEvidence: FieldEvidence | null;

  // Price list
  readonly priceList: ResolvedLookup | null;
  readonly priceListEvidence: FieldEvidence | null;

  // Route
  readonly route: ResolvedLookup | null;
  readonly routeEvidence: FieldEvidence | null;

  // Classification
  readonly classification: ResolvedLookup | null;
  readonly classificationEvidence: FieldEvidence | null;

  // Conflicts detected during resolution
  readonly conflicts: AssignmentConflict[];
}

// ── Customer Credit Profile ─────────────────────────────────────────────────

export type CreditStatus =
  | "APPROVED"
  | "BLOCKED"
  | "PENDING"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export interface CustomerCreditProfile {
  readonly identity: CommercialIdentity;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Customer tax ID (links to CustomerProfile) */
  readonly customerTaxId: string;

  /** Credit term in days (0 = cash only) */
  readonly creditTermDays: number;

  /** Credit limit amount (null = not configured) */
  readonly creditLimit: number | null;

  /** Currency for credit limit */
  readonly creditLimitCurrency: string;

  /** Whether credit is commercially blocked */
  readonly isBlocked: boolean;

  /** Credit status */
  readonly creditStatus: CreditStatus;

  /** Conditions / notes about credit terms */
  readonly conditions: string | null;

  /** Evidence for credit configuration */
  readonly creditTermEvidence: FieldEvidence | null;
  readonly creditLimitEvidence: FieldEvidence | null;
  readonly blockEvidence: FieldEvidence | null;
}

// ── Active Status Resolution ────────────────────────────────────────────────

export interface ActiveStatusInput {
  /** SAG ACTIVO field */
  readonly sagActivo: boolean | null;
  /** SAG credit blocked */
  readonly sagCreditBlocked: boolean | null;
  /** SAG third party type */
  readonly sagTipoTercero: string | null;
  /** CRM account status */
  readonly crmAccountStatus: string | null;
}

/**
 * Derives admin status from multiple SAG/CRM indicators.
 *
 * Logic:
 * - sagActivo === false → INACTIVE
 * - sagCreditBlocked === true → BLOCKED (credit block, not admin suspension)
 * - crmAccountStatus === "Inactive" → INACTIVE
 * - sagActivo === true → ACTIVE
 * - No indicators available → UNKNOWN
 */
export function deriveCustomerAdminStatus(input: ActiveStatusInput): CustomerAdminStatus {
  // Explicit inactive from SAG
  if (input.sagActivo === false) return "INACTIVE";

  // Credit block
  if (input.sagCreditBlocked === true) return "BLOCKED";

  // CRM inactive
  if (input.crmAccountStatus != null) {
    const upper = input.crmAccountStatus.toUpperCase().trim();
    if (upper === "INACTIVE" || upper === "CLOSED" || upper === "DISABLED") return "INACTIVE";
    if (upper === "SUSPENDED") return "SUSPENDED";
  }

  // Explicit active from SAG
  if (input.sagActivo === true) return "ACTIVE";

  // No indicators
  return "UNKNOWN";
}

// ── Sales Rep Resolution ────────────────────────────────────────────────────

export interface SalesRepInput {
  readonly sagVendedorName: string | null;
  readonly sagVendedorNit: string | null;
  readonly crmAssignedUserName: string | null;
  readonly crmAssignedUserId: string | null;
}

export interface SalesRepResolution {
  readonly salesRepName: string | null;
  readonly salesRepCode: string | null;
  readonly salesRepTaxId: string | null;
  readonly evidence: FieldEvidence | null;
  readonly conflict: AssignmentConflict | null;
}

/**
 * Resolves sales representative from SAG and CRM sources.
 * If both exist and differ, records a conflict with evidence.
 */
export function resolveSalesRep(input: SalesRepInput, observedAt: Date): SalesRepResolution {
  const hasSag = input.sagVendedorName != null && input.sagVendedorName.trim().length > 0;
  const hasCrm = input.crmAssignedUserName != null && input.crmAssignedUserName.trim().length > 0;

  if (!hasSag && !hasCrm) {
    return { salesRepName: null, salesRepCode: null, salesRepTaxId: null, evidence: null, conflict: null };
  }

  // Both exist — check for conflict
  if (hasSag && hasCrm) {
    const sagName = input.sagVendedorName!.trim();
    const crmName = input.crmAssignedUserName!.trim();
    const match = sagName.toUpperCase() === crmName.toUpperCase();

    if (!match) {
      const conflict: AssignmentConflict = {
        field: "salesRepName",
        sources: [
          { source: "SAG", value: sagName },
          { source: "CRM", value: crmName },
        ],
        resolution: "CRM_WINS",
        resolvedValue: crmName,
        note: `SAG VENDEDOR="${sagName}" differs from CRM assigned_user="${crmName}". CRM wins (more recent assignment).`,
      };

      return {
        salesRepName: crmName,
        salesRepCode: input.crmAssignedUserId ?? null,
        salesRepTaxId: input.sagVendedorNit ?? null,
        evidence: {
          source: "CRM",
          quality: "CONFLICTED",
          observedAt,
          rawValue: { sag: sagName, crm: crmName },
          confidence: 0.7,
          note: conflict.note,
        },
        conflict,
      };
    }

    // Both agree
    return {
      salesRepName: sagName,
      salesRepCode: input.crmAssignedUserId ?? null,
      salesRepTaxId: input.sagVendedorNit ?? null,
      evidence: {
        source: "SAG",
        quality: "CONFIRMED",
        observedAt,
        rawValue: sagName,
        confidence: 1.0,
        note: "SAG and CRM agree on sales rep assignment.",
      },
      conflict: null,
    };
  }

  // Only SAG
  if (hasSag) {
    return {
      salesRepName: input.sagVendedorName!.trim(),
      salesRepCode: null,
      salesRepTaxId: input.sagVendedorNit ?? null,
      evidence: {
        source: "SAG",
        quality: "CONFIRMED",
        observedAt,
        rawValue: input.sagVendedorName,
        confidence: 0.85,
        note: "Sales rep from SAG VENDEDOR field.",
      },
      conflict: null,
    };
  }

  // Only CRM
  return {
    salesRepName: input.crmAssignedUserName!.trim(),
    salesRepCode: input.crmAssignedUserId ?? null,
    salesRepTaxId: null,
    evidence: {
      source: "CRM",
      quality: "CONFIRMED",
      observedAt,
      rawValue: input.crmAssignedUserName,
      confidence: 0.8,
      note: "Sales rep from CRM assigned_user.",
    },
    conflict: null,
  };
}

// ── Lookup Resolver ─────────────────────────────────────────────────────────

export interface LookupTable {
  readonly entries: ReadonlyMap<string, string>;
}

/**
 * Resolves a raw code against a lookup table.
 * Returns both code and name. If lookup is unavailable, name is null.
 */
export function resolveLookup(
  code: string | null,
  lookup: LookupTable | null,
  source: EvidenceSource,
  observedAt: Date
): { lookup: ResolvedLookup | null; evidence: FieldEvidence | null } {
  if (code == null || code.trim().length === 0) {
    return { lookup: null, evidence: null };
  }

  const normalizedCode = code.trim().toUpperCase();

  if (lookup != null && lookup.entries.has(normalizedCode)) {
    return {
      lookup: { code: normalizedCode, name: lookup.entries.get(normalizedCode)!, resolved: true },
      evidence: {
        source,
        quality: "CONFIRMED",
        observedAt,
        rawValue: code,
        confidence: 1.0,
        note: null,
      },
    };
  }

  // Code exists but name could not be resolved
  return {
    lookup: { code: normalizedCode, name: null, resolved: false },
    evidence: {
      source,
      quality: "PARTIAL",
      observedAt,
      rawValue: code,
      confidence: 0.6,
      note: lookup == null
        ? "Lookup table not available — code preserved without resolution."
        : `Code "${normalizedCode}" not found in lookup table.`,
    },
  };
}

// ── CRM Join Resolution ─────────────────────────────────────────────────────

export interface CrmJoinInput {
  readonly customerTaxId: string;
  readonly crmId: string | null;
  readonly billingAccountId: string | null;
}

export interface CrmJoinResult {
  readonly crmId: string | null;
  readonly joinMethod: "DIRECT" | "BILLING_ACCOUNT" | "NONE";
  readonly confidence: number;
}

/**
 * Resolves the CRM link for a customer.
 * Handles the known bug where CRMQuote.customerId is NULL
 * by falling back to billing_account_id from rawCrmJson.
 */
export function resolveCrmJoin(input: CrmJoinInput): CrmJoinResult {
  // Direct crmId link (strongest)
  if (input.crmId != null && input.crmId.trim().length > 0) {
    return { crmId: input.crmId.trim(), joinMethod: "DIRECT", confidence: 1.0 };
  }

  // Fallback: billing_account_id from CRM raw JSON
  if (input.billingAccountId != null && input.billingAccountId.trim().length > 0) {
    return { crmId: input.billingAccountId.trim(), joinMethod: "BILLING_ACCOUNT", confidence: 0.85 };
  }

  return { crmId: null, joinMethod: "NONE", confidence: 0 };
}
