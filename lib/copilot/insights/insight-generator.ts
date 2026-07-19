/**
 * lib/copilot/insights/insight-generator.ts
 *
 * Agentik Copilot — Insight Generator
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Generates CopilotInsight[] from three sources:
 *
 *   1. Structural domain insights   — from active domains + capabilities
 *   2. Signal-backed insights       — from detected business signals
 *   3. Suggestion-linked insights   — from available suggestions (when provided)
 *
 * Structural insights (no signal evidence) use possibility language:
 *   "El contexto actual permite revisar…"
 *   NOT "La cartera vencida aumentó…"
 *
 * Deduplication: stable ID-based — no insight appears twice.
 * No I/O. No DB. No external dependencies. Fully deterministic.
 */

import type { CopilotRuntimeSnapshot }   from "../runtime/runtime-snapshot";
import type { CopilotInsight, InsightEvidence, InsightSignal, SuggestionRef } from "./insight-types";
import type { SignalId }                  from "./insight-signal-registry";
import { getAllSignals, getSignalsForDomain } from "./insight-signal-registry";
import { getInsightTemplates }            from "./insight-registry";

// ── Generator input ───────────────────────────────────────────────────────────

export interface InsightGeneratorInput {
  snapshot:     CopilotRuntimeSnapshot;
  suggestions?: SuggestionRef[];
  signals?:     InsightSignal[];
}

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateInsights(input: InsightGeneratorInput): CopilotInsight[] {
  const { snapshot, suggestions = [], signals = [] } = input;

  if (!snapshot.context.isResolved) return [];

  const seen  = new Set<string>();
  const now   = new Date();
  const agent = snapshot.context.leadAgent?.id ?? undefined;
  const insights: CopilotInsight[] = [];

  // ─── 1. Structural domain insights ────────────────────────────────────────
  // For each active domain, surface contextual possibility insights based on
  // available capabilities. No evidence claimed — structural only.

  for (const domain of snapshot.context.domains) {
    const domainCapabilities = snapshot.capabilities.all
      .filter(r => r.capability.domain === domain)
      .map(r => r.capability.id);

    if (domainCapabilities.length === 0) continue;

    // Find signals for this domain as potential insight sources
    const domainSignals = getSignalsForDomain(domain);
    if (domainSignals.length === 0) continue;

    // Pick the most representative signal for structural insight
    const representativeSignal = domainSignals[0];
    const templates = getInsightTemplates(representativeSignal.id as SignalId);
    if (templates.length === 0) continue;

    // Use the first template as structural domain insight
    const template  = templates[0];
    const id        = `ins:domain:${domain}:0`;
    if (seen.has(id)) continue;
    seen.add(id);

    const evidence: InsightEvidence[] = [
      {
        type:        "domain_active",
        ref:         domain,
        description: `Dominio ${domain} activo en el módulo actual.`,
      },
      ...domainCapabilities.slice(0, 2).map(capId => ({
        type:        "capability_match" as const,
        ref:         capId,
        description: `Capacidad ${capId} disponible para este dominio.`,
      })),
    ];

    // Link to relevant suggestions if provided
    const relatedSuggestionIds = suggestions
      .filter(s => s.domainRef === domain)
      .map(s => s.id);

    insights.push({
      id,
      title:       template.title,
      description: template.description,
      type:        template.type,
      severity:    template.severity,
      source:      "domain",
      status:      "active",
      domainId:    domain,
      capabilityIds: domainCapabilities,
      evidence,
      confidence:  template.baseConfidence,
      relatedSuggestionIds: relatedSuggestionIds.length > 0 ? relatedSuggestionIds : undefined,
      agentRef:    agent,
      score:       0, // Ranker assigns final score
      createdAt:   now,
    });
  }

  // ─── 2. Signal-backed insights ────────────────────────────────────────────
  // When explicit signals are provided, generate stronger insights with evidence.

  const signalMap = new Map<string, InsightSignal>();
  for (const sig of signals) {
    signalMap.set(sig.signalId, sig);
  }

  for (const [signalId, signal] of signalMap) {
    const templates = getInsightTemplates(signalId as SignalId);
    if (templates.length === 0) continue;

    const signalDef = getAllSignals().find(s => s.id === signalId);
    if (!signalDef) continue;

    // Only generate if the domain is active in the snapshot
    if (!snapshot.context.domains.includes(signalDef.domainId)) continue;

    for (let idx = 0; idx < templates.length; idx++) {
      const template = templates[idx];
      const id = `ins:signal:${signalId}:${idx}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const evidence: InsightEvidence[] = [
        {
          type:        "signal_detected",
          ref:         signalId,
          description: `Señal detectada: ${signalDef.description}`,
        },
        ...signalDef.suggestedCapabilityIds.slice(0, 2).map(capId => ({
          type:        "capability_match" as const,
          ref:         capId,
          description: `Capacidad ${capId} respalda este insight.`,
        })),
      ];

      const strengthBonus: Record<string, number> = {
        strong:   0.3,
        moderate: 0.2,
        weak:     0.1,
      };
      const confidence = Math.min(
        template.baseConfidence + (strengthBonus[signal.strength ?? "weak"] ?? 0.1),
        0.95,
      );

      const relatedSuggestionIds = suggestions
        .filter(s => s.domainRef === signalDef.domainId)
        .map(s => s.id);

      insights.push({
        id,
        title:         template.title,
        description:   template.description,
        type:          template.type,
        severity:      template.severity,
        source:        "signal",
        status:        "active",
        domainId:      signalDef.domainId,
        capabilityIds: signalDef.suggestedCapabilityIds,
        signals:       [signal],
        evidence,
        confidence,
        relatedSuggestionIds: relatedSuggestionIds.length > 0 ? relatedSuggestionIds : undefined,
        relatedActionIds:     signalDef.suggestedActionIds,
        agentRef:      agent,
        score:         0,
        createdAt:     signal.detectedAt ?? now,
      });
    }
  }

  // ─── 3. Suggestion-linked explanation insights ─────────────────────────────
  // For each suggestion, generate a lightweight "why" explanation insight.
  // Only when suggestions are provided and not already covered by domain insights.

  for (const suggestion of suggestions) {
    if (!suggestion.domainRef) continue;

    // Skip if domain already has a structural insight
    const alreadyCovered = insights.some(
      i => i.domainId === suggestion.domainRef && i.source === "domain"
    );
    if (alreadyCovered) continue;

    const id = `ins:suggestion:${suggestion.id}:0`;
    if (seen.has(id)) continue;
    seen.add(id);

    insights.push({
      id,
      title:       "Contexto disponible para esta acción",
      description: "Las capacidades activas en este módulo soportan la ejecución de esta recomendación.",
      type:        "explanation",
      severity:    "info",
      source:      "suggestion",
      status:      "active",
      domainId:    suggestion.domainRef,
      evidence: [
        {
          type:        "domain_active",
          ref:         suggestion.domainRef,
          description: `Dominio ${suggestion.domainRef} activo y relevante para esta sugerencia.`,
        },
      ],
      confidence:           0.3,
      relatedSuggestionIds: [suggestion.id],
      relatedActionIds:     suggestion.actionRef ? [suggestion.actionRef] : undefined,
      agentRef:             agent,
      score:                0,
      createdAt:            now,
    });
  }

  return insights;
}
