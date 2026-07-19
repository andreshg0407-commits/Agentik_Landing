/**
 * lib/comercial/produccion/production-planning-types.ts
 *
 * Domain types for the Production Planning Policy Pack.
 * Pure types — no runtime logic, no Prisma.
 *
 * Produccion textil: evaluar qué producir, no ejecutar producción.
 * No crear OP. No consumir MRP. Sólo recomendaciones.
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

// ── Policy types ────────────────────────────────────────────────────────────

export type ProductionPlanningPolicyType =
  | "TEXTILE_REORDER"
  | "ACTIVE_OP"
  | "PRODUCTION_PRIORITY"
  | "SHORTAGE"
  | "PRODUCTION_HEALTH";

// ── Evidence item ───────────────────────────────────────────────────────────

export interface ProductionEvidenceItem {
  policyType: ProductionPlanningPolicyType;
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

// ── FASE 2: Textile reorder ─────────────────────────────────────────────────

export type ProductionNeedDecision =
  | "PRODUCE"
  | "WAIT_EXISTING_OP"
  | "SUFFICIENT_STOCK"
  | "INSUFFICIENT_DATA";

export interface ProductionNeedResult {
  subgroup: string;
  brand: string;
  availableInventory: number;
  threshold: number;
  deficit: number;
  hasActiveOP: boolean;
  activeOPCount: number;
  activeOPQuantity: number;
  decision: ProductionNeedDecision;
  reason: string;
  evidence: ProductionEvidenceItem;
  confidence: number;
}

// ── FASE 3: Active OP check ─────────────────────────────────────────────────

export interface ActiveOPInfo {
  documentNumber: string;
  status: "open" | "closed" | "unknown";
  quantity: number;
  documentDate: string | null;
  warehouseCode: string | null;
}

export interface ActiveOPResult {
  subgroup: string;
  brand: string;
  hasActiveOP: boolean;
  activeOPs: ActiveOPInfo[];
  totalActiveQuantity: number;
  decision: "WAIT_EXISTING_OP" | "NO_ACTIVE_OP";
  reason: string;
  evidence: ProductionEvidenceItem;
  confidence: number;
}

// ── FASE 4: Priority ────────────────────────────────────────────────────────

export type ProductionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface PriorityFactor {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
  signal: "positive" | "neutral" | "negative";
  reason: string;
}

export interface ProductionPriorityResult {
  subgroup: string;
  brand: string;
  priority: ProductionPriority;
  totalScore: number;
  factors: PriorityFactor[];
  availableInventory: number;
  threshold: number;
  deficit: number;
  sales6m: number;
  coverageDays: number | null;
  pendingOrders: number;
  maletas: number;
  tiendas: number;
  reason: string;
  evidence: ProductionEvidenceItem;
  confidence: number;
}

// ── FASE 5: Shortage ────────────────────────────────────────────────────────

export interface ShortageResult {
  subgroup: string;
  brand: string;
  availableInventory: number;
  threshold: number;
  deficit: number;
  priority: ProductionPriority;
  hasActiveOP: boolean;
  reason: string;
  evidence: ProductionEvidenceItem;
  confidence: number;
}

// ── FASE 6: Production health ───────────────────────────────────────────────

export interface ProductionHealthSummary {
  tenantId: string;
  totalSubgroups: number;
  needsProductionCount: number;
  waitingOPCount: number;
  healthyCount: number;
  criticalCount: number;
  shortageCount: number;
  priorityBreakdown: Record<ProductionPriority, number>;
  overallHealth: "HEALTHY" | "AT_RISK" | "CRITICAL" | "NO_DATA";
  evidence: ProductionEvidenceItem;
  generatedAt: string;
}

// ── FASE 7: Alert types ─────────────────────────────────────────────────────

export type ProductionAlertType =
  | "PRODUCTION_REQUIRED"
  | "WAIT_EXISTING_OP"
  | "LOW_STOCK"
  | "CRITICAL_SHORTAGE"
  | "DATA_QUALITY";

export type ProductionAlertSeverity = "info" | "warning" | "critical";

export interface ProductionAlertRelatedEntity {
  type: "subgroup" | "brand" | "op";
  id: string;
  name: string;
}

export interface ProductionAlert {
  alertId: string;
  tenantId: string;
  type: ProductionAlertType;
  severity: ProductionAlertSeverity;
  title: string;
  message: string;
  relatedEntity: ProductionAlertRelatedEntity;
  recommendedAction: string;
  evidence: ProductionEvidenceItem;
  createdAt: string;
  deduplicationKey: string;
}

// ── Input types ─────────────────────────────────────────────────────────────

export interface ProductionPlanningContext {
  tenantId: string;
}

export interface SubgroupInput {
  subgroup: string;
  brand: string;
  availableInventory: number;
  sales6m: number;
  sales6mMonthly: number[];
  pendingOrders: number;
  maletasCount: number;
  tiendasCount: number;
  coverageDays: number | null;
  activeOPs: ActiveOPInfo[];
}

// ── FASE 12: Production Queue ───────────────────────────────────────────────

export interface ProductionQueueItem {
  subgroup: string;
  brand: string;
  priority: ProductionPriority;
  priorityScore: number;
  decision: ProductionNeedDecision;
  availableInventory: number;
  threshold: number;
  deficit: number;
  hasActiveOP: boolean;
  activeOPCount: number;
  activeOPQuantity: number;
  sales6m: number;
  coverageDays: number | null;
  pendingOrders: number;
  recommendedAction: string;
  evidence: ProductionEvidenceItem;
  confidence: number;
}

export interface ProductionQueue {
  tenantId: string;
  totalItems: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  waitingOPCount: number;
  items: ProductionQueueItem[];
  generatedAt: string;
}

// ── BusinessDecision universal contract ─────────────────────────────────────

export interface BusinessDecision {
  decisionId: string;
  tenantId: string;
  engine: string;
  policy: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  priority: ProductionPriority;
  title: string;
  summary: string;
  recommendedAction: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "superseded";
  confidence: number;
  evidence: ProductionEvidenceItem;
  generatedAt: string;
  expiresAt: string | null;
}
