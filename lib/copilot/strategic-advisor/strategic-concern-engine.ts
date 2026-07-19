// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 3 — Strategic Concern Engine

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicConcern, StrategicDomain, StrategicAdvicePriority } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore, prioritySaFromScore, STRATEGIC_PRIORITY_RANK } from "./strategic-advisor-types";

// ── Main exports ──────────────────────────────────────────────────────────────

export function identifyConcerns(ctx: StrategicAdvisorContext): StrategicConcern[] {
  const concerns: StrategicConcern[] = [];

  // From strategic memory active risks
  for (const risk of ctx.activeRisks) {
    const score = risk.confidenceScore * (risk.priority === "CRITICAL" ? 1 : risk.priority === "HIGH" ? 0.75 : 0.5);
    concerns.push({
      id:             generateSaId("concern"),
      orgSlug:        ctx.orgSlug,
      title:          risk.title,
      description:    risk.description,
      domain:         risk.domain as StrategicDomain,
      severity:       risk.priority as StrategicAdvicePriority,
      confidence:     confidenceSaFromScore(risk.confidenceScore),
      confidenceScore: risk.confidenceScore,
      isEmergent:     false,
      isLatent:       risk.priority === "LOW" || risk.priority === "MEDIUM",
      rationale:      risk.rationale,
      evidenceIds:    risk.evidenceIds,
      relatedGoals:   ctx.activeGoals.filter((g) => g.domain === risk.domain).map((g) => g.id),
      metadata:       { source: "STRATEGIC_MEMORY", entryId: risk.id },
      detectedAt:     new Date().toISOString(),
    });
  }

  // From anomaly signals
  for (const sig of ctx.anomalySignals) {
    const score = sig.confidence;
    const severity = prioritySaFromScore(sig.severity === "CRITICAL" ? 0.9 : sig.severity === "HIGH" ? 0.7 : 0.45);
    concerns.push({
      id:             generateSaId("concern"),
      orgSlug:        ctx.orgSlug,
      title:          `Anomalía detectada: ${sig.label}`,
      description:    sig.description,
      domain:         _mapSignalDomain(sig.domain),
      severity,
      confidence:     confidenceSaFromScore(score),
      confidenceScore: score,
      isEmergent:     true,
      isLatent:       false,
      rationale:      `Señal de anomalía cross-módulo: ${sig.type}`,
      evidenceIds:    [sig.id],
      relatedGoals:   [],
      metadata:       { source: "REASONING_SIGNAL", signalId: sig.id },
      detectedAt:     new Date().toISOString(),
    });
  }

  // From threshold breaches
  for (const sig of ctx.thresholdBreachSignals) {
    concerns.push({
      id:             generateSaId("concern"),
      orgSlug:        ctx.orgSlug,
      title:          `Umbral excedido: ${sig.label}`,
      description:    sig.description,
      domain:         _mapSignalDomain(sig.domain),
      severity:       prioritySaFromScore(sig.confidence * 0.8),
      confidence:     confidenceSaFromScore(sig.confidence),
      confidenceScore: sig.confidence,
      isEmergent:     true,
      isLatent:       false,
      rationale:      `Umbral superado detectado en módulo cross-función`,
      evidenceIds:    [sig.id],
      relatedGoals:   [],
      metadata:       { source: "THRESHOLD_BREACH", signalId: sig.id },
      detectedAt:     new Date().toISOString(),
    });
  }

  // From metric drops
  for (const sig of ctx.metricDropSignals) {
    concerns.push({
      id:             generateSaId("concern"),
      orgSlug:        ctx.orgSlug,
      title:          `Caída de métrica: ${sig.label}`,
      description:    sig.description,
      domain:         _mapSignalDomain(sig.domain),
      severity:       prioritySaFromScore(sig.confidence * 0.7),
      confidence:     confidenceSaFromScore(sig.confidence * 0.8),
      confidenceScore: sig.confidence * 0.8,
      isEmergent:     false,
      isLatent:       true,
      rationale:      `Tendencia descendente detectada en indicador clave`,
      evidenceIds:    [sig.id],
      relatedGoals:   [],
      metadata:       { source: "METRIC_DROP", signalId: sig.id },
      detectedAt:     new Date().toISOString(),
    });
  }

  // From executive priorities (CRITICAL ones become concerns)
  for (const ep of ctx.executivePriorities.filter((p) => p.level === "CRITICAL")) {
    if (concerns.some((c) => c.title === ep.title)) continue;
    concerns.push({
      id:             generateSaId("concern"),
      orgSlug:        ctx.orgSlug,
      title:          ep.title,
      description:    ep.description,
      domain:         ep.domain as StrategicDomain,
      severity:       "CRITICAL",
      confidence:     confidenceSaFromScore(ep.confidenceScore),
      confidenceScore: ep.confidenceScore,
      isEmergent:     false,
      isLatent:       false,
      rationale:      ep.rationale,
      evidenceIds:    ep.evidenceIds,
      relatedGoals:   [],
      metadata:       { source: "EXECUTIVE_BRAIN", priorityId: ep.id },
      detectedAt:     new Date().toISOString(),
    });
  }

  return rankConcerns(concerns);
}

export function rankConcerns(concerns: StrategicConcern[]): StrategicConcern[] {
  return [...concerns].sort((a, b) => {
    const rankDiff = STRATEGIC_PRIORITY_RANK[b.severity] - STRATEGIC_PRIORITY_RANK[a.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.confidenceScore - a.confidenceScore;
  });
}

export function groupConcerns(concerns: StrategicConcern[]): Record<StrategicDomain, StrategicConcern[]> {
  const groups: Partial<Record<StrategicDomain, StrategicConcern[]>> = {};
  for (const c of concerns) {
    if (!groups[c.domain]) groups[c.domain] = [];
    groups[c.domain]!.push(c);
  }
  return groups as Record<StrategicDomain, StrategicConcern[]>;
}

function _mapSignalDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", COMPLIANCE: "COMPLIANCE", TECHNOLOGY: "TECHNOLOGY",
    COLLECTIONS: "FINANCE", MEMORY: "CROSS_DOMAIN", GRAPH: "CROSS_DOMAIN",
    PLAYBOOKS: "CROSS_DOMAIN", EXECUTIVE: "EXECUTIVE",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
