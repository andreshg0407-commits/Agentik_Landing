/**
 * lib/comercial/business-policy/business-decision-types.ts
 *
 * Shared BusinessDecision universal contract.
 * Every commercial decision engine emits BusinessDecision objects
 * for uniform consumption by Torre de Control, Copilot, and UI.
 *
 * Pure types — no runtime logic, no Prisma.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

// ── Priority ────────────────────────────────────────────────────────────────

export type BusinessDecisionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ── Severity ────────────────────────────────────────────────────────────────

export type BusinessDecisionSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

// ── Status ──────────────────────────────────────────────────────────────────

export type BusinessDecisionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

// ── Commercial Domain ───────────────────────────────────────────────────────

export type CommercialDomain =
  | "MALETAS"
  | "TIENDAS"
  | "PEDIDOS"
  | "VENDEDORES"
  | "IMPORTACIONES"
  | "PRODUCCION";

// ── Evidence envelope ───────────────────────────────────────────────────────

export interface BusinessDecisionEvidence {
  policyId: string;
  policyName: string;
  activationReason: string;
  dataUsed: Record<string, unknown>;
  recommendedAction: string;
  actionRationale: string;
  confidence: number;
  severity: BusinessDecisionSeverity;
  evaluatedAt: string;
  missingData?: string[];
  traceId?: string;
}

// ── BusinessDecision ────────────────────────────────────────────────────────

export interface BusinessDecision {
  decisionId: string;
  tenantId: string;
  domain: CommercialDomain;
  engine: string;
  policy: string;
  severity: BusinessDecisionSeverity;
  priority: BusinessDecisionPriority;
  title: string;
  summary: string;
  recommendedAction: string;
  status: BusinessDecisionStatus;
  confidence: number;
  evidence: BusinessDecisionEvidence;
  generatedAt: string;
  expiresAt: string | null;
}

// ── Aggregated result ───────────────────────────────────────────────────────

export interface CommercialDecisionGroup {
  domain: CommercialDomain;
  engine: string;
  decisions: BusinessDecision[];
  totalCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface CommercialDecisionSummary {
  tenantId: string;
  groups: CommercialDecisionGroup[];
  totalDecisions: number;
  criticalDecisions: number;
  highDecisions: number;
  domains: CommercialDomain[];
  generatedAt: string;
}
