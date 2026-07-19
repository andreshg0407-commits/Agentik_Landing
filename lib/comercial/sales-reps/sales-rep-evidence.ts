/**
 * lib/comercial/sales-reps/sales-rep-evidence.ts
 *
 * FASE 13 — Evidence bridge to CommercialDomainEvidence.
 * Converts SalesRepEvidenceItem into CommercialDomainEvidence entries.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import type { SalesRepEvidenceItem, SalesRepDailyState } from "./sales-rep-decision-types";

// ── Commercial evidence bridge ─────────────────────────────────────────────

export interface SalesRepCommercialEvidence {
  domain: "SALES_REP";
  entityType: "sales_rep" | "customer" | "mallet" | "order";
  entityId: string;
  tenantId: string;
  field: string;
  rawValue: unknown;
  confidence: number;
  source: string;
  traceId: string;
  evaluatedAt: string;
}

export function bridgeToCommercialEvidence(
  tenantId: string,
  evidence: SalesRepEvidenceItem,
  entityType: SalesRepCommercialEvidence["entityType"],
  entityId: string,
): SalesRepCommercialEvidence {
  return {
    domain: "SALES_REP",
    entityType,
    entityId,
    tenantId,
    field: evidence.policyType,
    rawValue: evidence.dataUsed,
    confidence: evidence.confidence,
    source: `SalesRepPolicyPack:${evidence.policyId}`,
    traceId: evidence.traceId,
    evaluatedAt: evidence.evaluatedAt,
  };
}

// ── Daily state evidence summary ───────────────────────────────────────────

export interface DailyStateEvidenceSummary {
  tenantId: string;
  salesRepId: string;
  totalEvidence: number;
  byDomain: Record<string, number>;
  highConfidence: number;
  lowConfidence: number;
  missingData: number;
  traceIds: string[];
  generatedAt: string;
}

export function summarizeDailyEvidence(
  dailyState: SalesRepDailyState,
): DailyStateEvidenceSummary {
  const allEvidence: SalesRepEvidenceItem[] = [];

  if (dailyState.malletState) allEvidence.push(dailyState.malletState.evidence);
  for (const a of dailyState.overdueReceivableAlerts) allEvidence.push(a.evidence);
  for (const c of dailyState.inactiveCustomers) allEvidence.push(c.evidence);
  for (const o of dailyState.orderFollowUps) allEvidence.push(o.evidence);
  for (const s of dailyState.outOfStockAlerts) allEvidence.push(s.evidence);
  for (const p of dailyState.priorities) allEvidence.push(p.evidence);

  const byDomain: Record<string, number> = {};
  for (const e of allEvidence) {
    byDomain[e.policyType] = (byDomain[e.policyType] ?? 0) + 1;
  }

  return {
    tenantId: dailyState.tenantId,
    salesRepId: dailyState.salesRep.salesRepId,
    totalEvidence: allEvidence.length,
    byDomain,
    highConfidence: allEvidence.filter(e => e.confidence >= 0.8).length,
    lowConfidence: allEvidence.filter(e => e.confidence < 0.5).length,
    missingData: allEvidence.filter(e => e.missingData.length > 0).length,
    traceIds: allEvidence.map(e => e.traceId),
    generatedAt: new Date().toISOString(),
  };
}

// ── Evidence validation ────────────────────────────────────────────────────

export interface EvidenceValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateEvidence(evidence: SalesRepEvidenceItem): EvidenceValidationResult {
  const issues: string[] = [];

  if (!evidence.policyType) issues.push("Missing policyType");
  if (!evidence.policyId) issues.push("Missing policyId");
  if (!evidence.policyName) issues.push("Missing policyName");
  if (!evidence.activationReason) issues.push("Missing activationReason (why activated?)");
  if (!evidence.dataUsed || Object.keys(evidence.dataUsed).length === 0) issues.push("Missing dataUsed (what data?)");
  if (!evidence.recommendedAction) issues.push("Missing recommendedAction (what action?)");
  if (!evidence.actionRationale) issues.push("Missing actionRationale (why this action?)");
  if (evidence.confidence < 0 || evidence.confidence > 1) issues.push(`Confidence out of range: ${evidence.confidence}`);
  if (!evidence.traceId) issues.push("Missing traceId");
  if (!evidence.evaluatedAt) issues.push("Missing evaluatedAt");

  return { valid: issues.length === 0, issues };
}

export function validateAllEvidence(items: SalesRepEvidenceItem[]): {
  totalChecked: number;
  validCount: number;
  invalidCount: number;
  allIssues: string[];
} {
  let validCount = 0;
  let invalidCount = 0;
  const allIssues: string[] = [];

  for (const item of items) {
    const result = validateEvidence(item);
    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
      allIssues.push(...result.issues.map(i => `${item.policyId}: ${i}`));
    }
  }

  return { totalChecked: items.length, validCount, invalidCount, allIssues };
}
