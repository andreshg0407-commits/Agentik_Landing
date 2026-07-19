/**
 * lib/comercial/sales-reps/sales-rep-decision-types.ts
 *
 * Domain types for the SalesRep Policy Pack.
 * Pure types — no runtime logic, no Prisma.
 *
 * Nomenclature: SalesRep = vendedor comercial. Never "Vendor" for sellers.
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

// ── Policy types ────────────────────────────────────────────────────────────

export type SalesRepPolicyType =
  | "MALLET_OUT_OF_STOCK"
  | "MALLET_REPLACEMENT"
  | "CUSTOMER_OVERDUE_RECEIVABLE"
  | "CUSTOMER_INACTIVE"
  | "CUSTOMER_PRIORITY"
  | "MALLET_STATUS"
  | "ORDER_FULFILLMENT";

// ── Evidence item (three-question rule) ─────────────────────────────────────

export interface SalesRepEvidenceItem {
  policyType: SalesRepPolicyType;
  policyId: string;
  policyName: string;
  activationReason: string;
  dataUsed: Record<string, unknown>;
  recommendedAction: string;
  actionRationale: string;
  confidence: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  missingData: string[];
  evaluatedAt: string;
  traceId: string;
}

// ── FASE 2: Mallet out-of-stock ─────────────────────────────────────────────

export interface MalletOutOfStockResult {
  salesRepId: string;
  malletId: string;
  productId: string;
  reference: string;
  productName: string;
  photoUrl: string | null;
  currentMalletUnits: number;
  availableInventory: number;
  reason: string;
  recommendedAction: string;
  replacementSuggestions: MalletReplacementSuggestion[];
  evidence: SalesRepEvidenceItem;
  confidence: number;
}

// ── FASE 3: Replacement suggestion ──────────────────────────────────────────

export interface MalletReplacementSuggestion {
  suggestedReference: string;
  productName: string;
  photoUrl: string | null;
  availableUnits: number;
  suggestedUnits: number;
  groupCode: string | null;
  subgroupCode: string | null;
  sizeClass: string | null;
  reason: string;
  evidence: SalesRepEvidenceItem;
  confidence: number;
}

// ── FASE 4: Overdue receivable alert ────────────────────────────────────────

export type ReceivableDataStatus = "AVAILABLE" | "INSUFFICIENT_DATA" | "NOT_AVAILABLE";

export interface OverdueReceivableResult {
  salesRepId: string;
  customerId: string;
  customerName: string;
  totalReceivable: number;
  overdueReceivable: number;
  maxDaysPastDue: number;
  oldestOverdueDocument: string | null;
  oldestOverdueAmount: number;
  overdueDocumentCount: number;
  dataStatus: ReceivableDataStatus;
  alertSeverity: "info" | "warning" | "critical";
  allowOrder: boolean;
  requireAcknowledgement: boolean;
  recommendedAction: string;
  evidence: SalesRepEvidenceItem;
  confidence: number;
}

// ── FASE 5: Inactive customer ───────────────────────────────────────────────

export type CustomerActivityStatus =
  | "ACTIVE"
  | "AT_RISK"
  | "INACTIVE"
  | "NEVER_PURCHASED"
  | "INSUFFICIENT_DATA";

export interface InactiveCustomerResult {
  customerId: string;
  customerName: string;
  assignedSalesRepId: string;
  lastPurchaseAt: string | null;
  inactiveDays: number | null;
  purchaseCount: number;
  lifetimeSales: number | null;
  recentReceivablesSummary: {
    totalBalance: number;
    overdueBalance: number;
    documentCount: number;
  } | null;
  activityStatus: CustomerActivityStatus;
  priority: "HIGH" | "MEDIUM" | "LOW";
  recommendedAction: string;
  evidence: SalesRepEvidenceItem;
  confidence: number;
}

// ── FASE 6: Customer priority ───────────────────────────────────────────────

export type CustomerPriorityLevel = "HIGH" | "MEDIUM" | "LOW" | "UNRESOLVED";

export interface CustomerPriorityFactor {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
  reason: string;
}

export interface CustomerPriorityResult {
  customerId: string;
  customerName: string;
  salesRepId: string;
  priority: CustomerPriorityLevel;
  totalScore: number;
  factors: CustomerPriorityFactor[];
  recommendedAction: string;
  evidence: SalesRepEvidenceItem;
  confidence: number;
}

// ── FASE 7: SalesRep mallet state (read model) ─────────────────────────────

export type MalletHealthStatus = "COMPLETE" | "INCOMPLETE" | "CRITICAL" | "NO_DATA";

export interface SalesRepMalletState {
  salesRepId: string;
  malletId: string;
  completionPercentage: number;
  completeGroups: number;
  missingGroups: number;
  missingEntries: number;
  excessEntries: number;
  outOfStockItems: MalletOutOfStockResult[];
  replacementSuggestions: MalletReplacementSuggestion[];
  unresolvedItems: number;
  status: MalletHealthStatus;
  evidence: SalesRepEvidenceItem;
  asOf: string;
}

// ── FASE 8: Order fulfillment state (read model) ────────────────────────────

export type OrderFulfillmentStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "INVOICED"
  | "PARTIALLY_INVOICED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"
  | "BLOCKED"
  | "UNKNOWN";

export interface OrderFulfillmentMilestone {
  status: OrderFulfillmentStatus;
  reachedAt: string | null;
  confirmed: boolean;
  source: string;
}

export interface OrderFulfillmentBlocker {
  dimension: string;
  message: string;
  severity: "warning" | "critical";
}

export type DataFreshnessLabel = "HOY" | "RECIENTE" | "DESACTUALIZADO" | "SIN_DATOS";

export interface OrderFulfillmentState {
  orderId: string;
  customer: string;
  branch: string | null;
  createdAt: string;
  requestedUnits: number;
  fulfilledUnits: number;
  invoicedUnits: number;
  dispatchedUnits: number;
  deliveredUnits: number;
  currentStatus: OrderFulfillmentStatus;
  milestones: OrderFulfillmentMilestone[];
  blockers: OrderFulfillmentBlocker[];
  evidence: SalesRepEvidenceItem;
  freshness: DataFreshnessLabel;
}

// ── FASE 9: SalesRep daily state ────────────────────────────────────────────

export interface SalesRepProfile {
  salesRepId: string;
  salesRepName: string;
  zone: string | null;
  active: boolean;
}

export interface SalesRepDailyState {
  tenantId: string;
  salesRep: SalesRepProfile;
  malletState: SalesRepMalletState | null;
  customerAlerts: OverdueReceivableResult[];
  overdueReceivableAlerts: OverdueReceivableResult[];
  inactiveCustomers: InactiveCustomerResult[];
  orderFollowUps: OrderFulfillmentState[];
  outOfStockAlerts: MalletOutOfStockResult[];
  priorities: CustomerPriorityResult[];
  alerts: SalesRepAlert[];
  evidenceSummary: {
    totalEvidenceItems: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
    missingDataCount: number;
    traceIds: string[];
  };
  generatedAt: string;
}

// ── FASE 10: Alert definitions ──────────────────────────────────────────────

export type SalesRepAlertType =
  | "MALLET_ITEM_OUT_OF_STOCK"
  | "MALLET_REPLACEMENT_AVAILABLE"
  | "CUSTOMER_OVERDUE_RECEIVABLE"
  | "CUSTOMER_INACTIVE"
  | "ORDER_FOLLOW_UP_REQUIRED"
  | "ORDER_BLOCKED"
  | "DATA_QUALITY_WARNING";

export type SalesRepAlertSeverity = "info" | "warning" | "critical";

export interface SalesRepAlertRelatedEntity {
  type: "customer" | "order" | "product" | "mallet";
  id: string;
  name: string;
}

export interface SalesRepAlert {
  alertId: string;
  tenantId: string;
  salesRepId: string;
  type: SalesRepAlertType;
  severity: SalesRepAlertSeverity;
  title: string;
  message: string;
  relatedEntity: SalesRepAlertRelatedEntity;
  recommendedAction: string;
  acknowledgementRequired: boolean;
  cooldownMinutes: number;
  evidence: SalesRepEvidenceItem;
  createdAt: string;
  expiresAt: string | null;
  deduplicationKey: string;
}

// ── FASE 15: Mobile app capability placeholders ─────────────────────────────

export type MobileCapabilityStatus = "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE";

export interface SalesRepMobileCapability {
  id: string;
  label: string;
  status: MobileCapabilityStatus;
  reason: string | null;
}

export interface SalesRepMobileContract {
  salesRepId: string;
  tenantId: string;
  capabilities: SalesRepMobileCapability[];
  dailyState: SalesRepDailyState;
  generatedAt: string;
}

// ── Input context ───────────────────────────────────────────────────────────

export interface SalesRepPolicyContext {
  tenantId: string;
  salesRepId: string;
  salesRepName: string;
}

export interface MalletItemInput {
  reference: string;
  productName: string;
  photoUrl: string | null;
  currentMalletUnits: number;
  availableInventory: number;
  groupCode: string | null;
  subgroupCode: string | null;
  sizeClass: string | null;
  line: string;
}

export interface CustomerInput {
  customerId: string;
  customerName: string;
  assignedSalesRepId: string;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  lifetimeSales: number | null;
  receivables: {
    totalBalance: number;
    overdueBalance: number;
    maxDaysPastDue: number;
    oldestOverdueDocument: string | null;
    oldestOverdueAmount: number;
    overdueDocumentCount: number;
    dataStatus: ReceivableDataStatus;
  } | null;
}

export interface ReplacementCandidateInput {
  reference: string;
  productName: string;
  photoUrl: string | null;
  availableUnits: number;
  groupCode: string | null;
  subgroupCode: string | null;
  sizeClass: string | null;
  line: string;
  quality: number;
  freshness: number;
  salesVelocity: number | null;
}

export interface OrderInput {
  orderId: string;
  customer: string;
  branch: string | null;
  createdAt: string;
  requestedUnits: number;
  fulfilledUnits: number;
  invoicedUnits: number;
  dispatchedUnits: number;
  deliveredUnits: number;
  status: string;
  blockers: OrderFulfillmentBlocker[];
  lastSyncAt: string | null;
}

export interface MalletStateInput {
  malletId: string;
  completionPercentage: number;
  completeGroups: number;
  totalGroups: number;
  missingEntries: number;
  excessEntries: number;
  unresolvedItems: number;
}
