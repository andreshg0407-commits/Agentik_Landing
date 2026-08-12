/**
 * lib/comercial/maletas/portfolio-copilot-domain-types.ts
 *
 * AGENTIK-COPILOT-SALES-PORTFOLIO-READINESS-01
 *
 * Client-safe types for Sales Portfolio / Maletas Copilot domain tools.
 * Pure types only. No runtime, no Prisma, no server-only.
 *
 * These types define the structured result contracts for domain tools.
 * Every result includes provenance (source, freshness, limitations).
 */

// ── Provenance ──────────────────────────────────────────────────────────────

export interface DataProvenance {
  source: string;
  asOf: string;
  limitations?: string[];
}

// ── Tool classification ──────────────────────────────────────────────────────

export type ToolCategory = "READ" | "ANALYZE" | "PREPARE" | "WRITE" | "APPROVAL_REQUIRED";

// ── Tool definition ──────────────────────────────────────────────────────────

export interface DomainToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  approvalRequired: boolean;
  permission: string;
  inputSchema: Record<string, unknown>;
  outputType: string;
}

// ── World / line classification ─────────────────────────────────────────────

export type PortfolioWorld = "CASTILLITOS" | "LATIN_KIDS" | "IMPORTACION";

export type PortfolioDimension =
  | { world: "CASTILLITOS"; group: string; subgroup: string }
  | { world: "LATIN_KIDS"; subgroup: string }
  | { world: "IMPORTACION"; sizeClass: "SMALL" | "MEDIUM" };

// ── Portfolio list ──────────────────────────────────────────────────────────

export interface PortfolioListItem {
  vendorId: string;
  vendorName: string;
  isActive: boolean;
  totalRefs: number;
  totalUnits: number;
  health: "saludable" | "riesgo" | "critico" | "sin_datos";
  replaceRefs: number;
  healthyRefs: number;
  provenance: DataProvenance;
}

export interface PortfolioListResult {
  portfolios: PortfolioListItem[];
  provenance: DataProvenance;
}

// ── Portfolio detail ────────────────────────────────────────────────────────

export interface PortfolioDetailResult {
  vendorId: string;
  vendorName: string;
  isActive: boolean;
  totalRefs: number;
  totalUnits: number;
  estimatedValue: number;
  health: string;
  healthyRefs: number;
  replaceRefs: number;
  sinDatosRefs: number;
  riesgoAgotamientoRefs: number;
  lines: string[];
  provenance: DataProvenance;
}

// ── Portfolio references ────────────────────────────────────────────────────

export interface PortfolioReferenceItem {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;
  grupoSag: string | null;
  sizeClass: string | null;
  centralAvailable: number;
  stockDataState: string;
  sampleState: string;
  commercialHealth: string;
  suggestedAction: string | null;
  suggestedActionExplanation: string | null;
  imageUrl: string | null;
}

export interface PortfolioReferencesResult {
  vendorId: string;
  vendorName: string;
  references: PortfolioReferenceItem[];
  provenance: DataProvenance;
}

// ── Withdrawal items ────────────────────────────────────────────────────────

export interface WithdrawalItem {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;
  centralAvailable: number;
  removalReason: string;
  removalDomain: string;
  imageUrl: string | null;
}

export interface WithdrawalResult {
  vendorId: string;
  vendorName: string;
  items: WithdrawalItem[];
  provenance: DataProvenance;
}

// ── Derrotero coverage ──────────────────────────────────────────────────────

export interface DerroteroCoverageLineEntry {
  line: string;
  completionPct: number;
  totalEntries: number;
  completeEntries: number;
  missingEntries: number;
  excessEntries: number;
}

export interface DerroteroCoverageResult {
  vendorId: string;
  vendorName: string;
  lines: DerroteroCoverageLineEntry[];
  overallCompletionPct: number;
  provenance: DataProvenance;
}

// ── Supply needs ────────────────────────────────────────────────────────────

export interface SupplyNeedItem {
  subgroupName: string;
  brand: string | null;
  commercialWorld: string;
  missingReferences: number;
  bestAction: string;
  bestActionExplanation: string;
  candidateCount: number;
}

export interface SupplyNeedsResult {
  vendorId: string;
  vendorName: string;
  needs: SupplyNeedItem[];
  provenance: DataProvenance;
}

// ── Supply candidates ───────────────────────────────────────────────────────

export interface SupplyCandidateItem {
  reference: string;
  description: string;
  action: string;
  source: string;
  availableQty: number | null;
  pendingQty: number | null;
  pendingQtyQuality: "CONFIRMED" | "ESTIMATED" | null;
  opNumber: string | null;
  confidence: string;
  explanation: string;
}

export interface SupplyCandidatesResult {
  vendorId: string;
  subgroupName: string;
  candidates: SupplyCandidateItem[];
  provenance: DataProvenance;
}

// ── Production signals ──────────────────────────────────────────────────────

export interface ProductionSignalItem {
  subgrupoSag: string;
  line: string;
  centralAvailable: number;
  minimumRequired: number;
  shortfall: number;
  suggestedQty: number;
  urgency: string;
  affectedVendorCount: number;
  reason: string;
}

export interface ProductionSignalsResult {
  signals: ProductionSignalItem[];
  provenance: DataProvenance;
}

// ── Coverage opportunities ──────────────────────────────────────────────────

export interface CoverageOpportunityItem {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;
  grupoSag: string | null;
  sizeClass: string | null;
  centralAvailable: number;
  eligibleVendorCount: number;
}

export interface CoverageOpportunitiesResult {
  textileOpportunities: CoverageOpportunityItem[];
  importOpportunities: CoverageOpportunityItem[];
  provenance: DataProvenance;
}

// ── Attention signals ───────────────────────────────────────────────────────

export type AttentionSeverity = "critical" | "warning" | "info";

export interface PortfolioAttentionItem {
  type: string;
  severity: AttentionSeverity;
  sellerId: string | null;
  portfolioId: string | null;
  world: string | null;
  line: string | null;
  title: string;
  evidence: Record<string, unknown>;
  suggestedAction: string;
  suggestedDestination: string | null;
  deduplicationKey: string;
  createdAt: string;
}

export interface PortfolioAttentionResult {
  items: PortfolioAttentionItem[];
  provenance: DataProvenance;
}

// ── Analytic: cross-portfolio comparison ────────────────────────────────────

export interface PortfolioComparisonItem {
  vendorId: string;
  vendorName: string;
  derroteroCompletionPct: number;
  missingPositions: number;
  retiroCount: number;
  retiroPct: number;
}

export interface PortfolioComparisonResult {
  portfolios: PortfolioComparisonItem[];
  provenance: DataProvenance;
}

// ── Analytic: shared supply needs ───────────────────────────────────────────

export interface SharedNeedItem {
  subgroupName: string;
  brand: string | null;
  world: string;
  vendorIds: string[];
  vendorCount: number;
  bestAction: string;
}

export interface SharedNeedsResult {
  needs: SharedNeedItem[];
  provenance: DataProvenance;
}

// ── Analytic: multi-vendor candidates ───────────────────────────────────────

export interface MultiVendorCandidateItem {
  reference: string;
  description: string;
  centralAvailable: number;
  eligibleVendorCount: number;
  eligibleVendorIds: string[];
  subgroupName: string;
}

export interface MultiVendorCandidatesResult {
  candidates: MultiVendorCandidateItem[];
  provenance: DataProvenance;
}

// ── Analytic: OP-dependent needs ────────────────────────────────────────────

export interface OpDependentNeedItem {
  vendorId: string;
  vendorName: string;
  subgroupName: string;
  opNumber: string | null;
  pendingQty: number | null;
  pendingQtyQuality: "CONFIRMED" | "ESTIMATED" | null;
  explanation: string;
}

export interface OpDependentNeedsResult {
  needs: OpDependentNeedItem[];
  provenance: DataProvenance;
}
