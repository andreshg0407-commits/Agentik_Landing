/**
 * lib/comercial/business-policy/policy-evidence.ts
 *
 * Evidence integration (FASE 6).
 * Bridges Business Policy resolutions to the Commercial Evidence Engine.
 *
 * Every resolution must explain:
 *   - What policy it found
 *   - Why it won
 *   - Which were discarded
 *   - Priority
 *   - Version
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type {
  BusinessPolicyEvidence,
  PolicyResolutionResult,
  PolicyCategory,
} from "./policy-types";

import type { CommercialDomainEvidence } from "@/lib/comercial/data-layer/shared/domain-evidence";

// ── Evidence Builder ────────────────────────────────────────────────────────

export function buildPolicyResolutionEvidence(
  result: PolicyResolutionResult,
  tenantId: string,
  category: PolicyCategory,
): BusinessPolicyEvidence {
  const traceId = `bp-ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    domain: "BUSINESS_POLICY",
    traceId,
    tenantId,
    category,
    selectedPolicyId: result.selectedPolicy?.id ?? null,
    selectedPolicyName: result.selectedPolicy?.name ?? null,
    selectedPolicyVersion: result.selectedPolicy?.versionInfo.version ?? null,
    selectedPriority: result.selectedPolicy?.priority ?? null,
    candidateCount: result.candidates.length,
    discardedCount: result.discarded.length,
    discardReasons: [...new Set(result.discarded.map(d => d.reason))],
    resolutionPath: result.evidence.resolutionPath,
    confidence: result.evidence.confidence,
    observedAt: new Date(),
    note: result.resolved
      ? `Policy "${result.selectedPolicy!.name}" v${result.selectedPolicy!.versionInfo.version} selected from ${result.candidates.length} candidates`
      : `No policy matched for category=${category}`,
  };
}

// ── Bridge to Commercial Domain Evidence ────────────────────────────────────

export function policyEvidenceToCommercialEvidence(
  policyEvidence: BusinessPolicyEvidence,
  entityId: string,
): CommercialDomainEvidence {
  return {
    domain: "BUSINESS_POLICY",
    entityType: "PolicyResolution",
    entityId,
    tenantId: policyEvidence.tenantId,
    field: `policy.${policyEvidence.category}`,
    rawValue: {
      policyId: policyEvidence.selectedPolicyId,
      policyName: policyEvidence.selectedPolicyName,
      version: policyEvidence.selectedPolicyVersion,
      candidates: policyEvidence.candidateCount,
      discarded: policyEvidence.discardedCount,
    },
    canonicalValue: policyEvidence.selectedPolicyId,
    confidence: policyEvidence.confidence,
    observedAt: policyEvidence.observedAt,
    traceId: policyEvidence.traceId,
    note: policyEvidence.note,
    resolution: policyEvidence.selectedPolicyId ? "CONFIRMED" : "UNKNOWN",
    qualityImpact: policyEvidence.selectedPolicyId ? "NEUTRAL" : "DEGRADES",
  };
}

// ── Discard Summary ─────────────────────────────────────────────────────────

export function summarizeDiscardReasons(result: PolicyResolutionResult): string {
  if (result.discarded.length === 0) return "No policies were discarded.";

  const grouped: Record<string, number> = {};
  for (const d of result.discarded) {
    grouped[d.reason] = (grouped[d.reason] ?? 0) + 1;
  }

  const parts = Object.entries(grouped)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ");

  return `Discarded ${result.discarded.length}: ${parts}.`;
}

// ── Resolution Narrative ────────────────────────────────────────────────────

export function buildResolutionNarrative(result: PolicyResolutionResult): string {
  const lines: string[] = [];

  if (!result.resolved) {
    lines.push("No matching policy was found for the given context.");
    if (result.discarded.length > 0) {
      lines.push(summarizeDiscardReasons(result));
    }
    return lines.join(" ");
  }

  const p = result.selectedPolicy!;
  lines.push(`Selected policy "${p.name}" (v${p.versionInfo.version}, priority=${p.priority}).`);

  if (result.candidates.length > 1) {
    lines.push(`Evaluated ${result.candidates.length} candidates.`);
  }

  if (result.discarded.length > 0) {
    lines.push(summarizeDiscardReasons(result));
  }

  const scopes = p.scopes.map(s => `${s.scope}${s.scopeValue ? `=${s.scopeValue}` : ""}`).join(", ");
  if (scopes) {
    lines.push(`Scope: ${scopes}.`);
  }

  return lines.join(" ");
}
