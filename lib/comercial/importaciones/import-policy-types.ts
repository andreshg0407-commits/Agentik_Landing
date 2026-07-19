/**
 * lib/comercial/importaciones/import-policy-types.ts
 *
 * Domain types for the Import Policy Pack.
 * Pure types — no runtime logic, no Prisma.
 *
 * Importacion es un mundo independiente del Textil.
 * Nunca mezclar reglas textiles con reglas de importacion.
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

// ── Policy types ────────────────────────────────────────────────────────────

export type ImportPolicyType =
  | "LOW_ROTATION"
  | "REPURCHASE"
  | "NEXT_CONTAINER"
  | "INVENTORY_AGING"
  | "IMPORT_HEALTH";

// ── Evidence item ───────────────────────────────────────────────────────────

export interface ImportEvidenceItem {
  policyType: ImportPolicyType;
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

// ── FASE 2: Low rotation ────────────────────────────────────────────────────

export interface LowRotationResult {
  reference: string;
  description: string;
  group: string;
  subgroup: string | null;
  size: string | null;
  currentInventory: number;
  lastEntryDate: string | null;
  monthsSinceLastEntry: number | null;
  daysSinceLastEntry: number | null;
  isLowRotation: boolean;
  reason: string;
  evidence: ImportEvidenceItem;
  confidence: number;
}

// ── FASE 3: Repurchase ──────────────────────────────────────────────────────

export type RepurchaseDecision = "REBUY" | "WATCH" | "DO_NOT_REBUY" | "INSUFFICIENT_DATA";

export interface RepurchaseFactor {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
  signal: "positive" | "neutral" | "negative";
  reason: string;
}

export interface RepurchaseResult {
  reference: string;
  description: string;
  decision: RepurchaseDecision;
  totalScore: number;
  factors: RepurchaseFactor[];
  currentInventory: number;
  totalSold: number;
  sales6m: number;
  monthsSinceLastEntry: number | null;
  trend: "accelerating" | "stable" | "decelerating" | "insufficient_data";
  suggestedQty: number | null;
  recommendedAction: string;
  evidence: ImportEvidenceItem;
  confidence: number;
}

// ── FASE 4: Next container ──────────────────────────────────────────────────

export interface NextContainerItem {
  reference: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  priorityScore: number;
  currentInventory: number;
  sales6m: number;
  monthsSinceLastEntry: number | null;
  repurchaseDecision: RepurchaseDecision;
  suggestedQty: number | null;
  reason: string;
  evidence: ImportEvidenceItem;
  confidence: number;
}

export interface NextContainerRecommendation {
  tenantId: string;
  totalItems: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  items: NextContainerItem[];
  generatedAt: string;
}

// ── FASE 5: Inventory aging ─────────────────────────────────────────────────

export type InventoryAgingStatus =
  | "NEW"
  | "NORMAL"
  | "AGING"
  | "LOW_ROTATION"
  | "OBSOLETE_CANDIDATE";

export interface InventoryAgingResult {
  reference: string;
  description: string;
  currentInventory: number;
  daysSinceLastEntry: number | null;
  monthsSinceLastEntry: number | null;
  sales6m: number;
  agingStatus: InventoryAgingStatus;
  reason: string;
  evidence: ImportEvidenceItem;
  confidence: number;
}

// ── FASE 6: Import health ───────────────────────────────────────────────────

export interface ImportHealthSummary {
  tenantId: string;
  totalReferences: number;
  healthyCount: number;
  atRiskCount: number;
  lowRotationCount: number;
  requiresReviewCount: number;
  rebuyCount: number;
  watchCount: number;
  doNotRebuyCount: number;
  insufficientDataCount: number;
  agingBreakdown: Record<InventoryAgingStatus, number>;
  overallHealth: "HEALTHY" | "AT_RISK" | "CRITICAL" | "NO_DATA";
  evidence: ImportEvidenceItem;
  generatedAt: string;
}

// ── FASE 7: Alert types ─────────────────────────────────────────────────────

export type ImportAlertType =
  | "LOW_ROTATION"
  | "REBUY_CANDIDATE"
  | "NO_REPURCHASE"
  | "AGING_INVENTORY"
  | "DATA_QUALITY";

export type ImportAlertSeverity = "info" | "warning" | "critical";

export interface ImportAlertRelatedEntity {
  type: "reference" | "container" | "import_batch";
  id: string;
  name: string;
}

export interface ImportAlert {
  alertId: string;
  tenantId: string;
  type: ImportAlertType;
  severity: ImportAlertSeverity;
  title: string;
  message: string;
  relatedEntity: ImportAlertRelatedEntity;
  recommendedAction: string;
  evidence: ImportEvidenceItem;
  createdAt: string;
  deduplicationKey: string;
}

// ── Input types ─────────────────────────────────────────────────────────────

export interface ImportPolicyContext {
  tenantId: string;
}

export interface ImportReferenceInput {
  reference: string;
  description: string;
  group: string;
  subgroup: string | null;
  size: string | null;
  currentInventory: number;
  totalSold: number;
  sales6m: number;
  sales6mMonthly: number[];
  lastEntryDate: string | null;
  daysSinceLastEntry: number | null;
  batchCount: number;
  percentSold: number | null;
  pricePV3: number | null;
  pricePV4: number | null;
  dominantChannel: "detal" | "mayorista" | "equilibrado" | "sin_datos";
}
