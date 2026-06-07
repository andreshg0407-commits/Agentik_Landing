/**
 * lib/copilot/cross-module-reasoning/correlation-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Correlation Engine
 *
 * Detects related patterns, concurrent events, and connected behaviors
 * across signals and evidence. Deterministic. No AI.
 */

import type {
  ReasoningSignal,
  ReasoningEvidence,
  CorrelationRecord,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Domain correlation map ────────────────────────────────────────────────────

// Pairs of domains known to correlate
const DOMAIN_CORRELATION_PAIRS: Array<{
  domainA: string;
  domainB: string;
  strength: number;
  relationship: CorrelationRecord["relationship"];
  explanation: string;
}> = [
  {
    domainA: "FINANCE", domainB: "COMMERCIAL",
    strength: 0.8, relationship: "DIRECT",
    explanation: "Commercial performance directly affects financial metrics.",
  },
  {
    domainA: "FINANCE", domainB: "COLLECTIONS",
    strength: 0.85, relationship: "DIRECT",
    explanation: "Collections directly impact cash flow and financial health.",
  },
  {
    domainA: "COMMERCIAL", domainB: "MARKETING",
    strength: 0.75, relationship: "DIRECT",
    explanation: "Marketing effectiveness drives commercial volume.",
  },
  {
    domainA: "COMMERCIAL", domainB: "COLLECTIONS",
    strength: 0.7, relationship: "SEQUENTIAL",
    explanation: "Commercial orders generate receivables that become collections.",
  },
  {
    domainA: "MARKETING", domainB: "FINANCE",
    strength: 0.6, relationship: "DIRECT",
    explanation: "Marketing spend and ROI affect financial outcomes.",
  },
  {
    domainA: "COLLECTIONS", domainB: "FINANCE",
    strength: 0.9, relationship: "DIRECT",
    explanation: "Collection rates directly determine liquidity.",
  },
];

// ── Signal-to-signal correlation ──────────────────────────────────────────────

export function correlateSignals(
  orgSlug: string,
  signals: ReasoningSignal[],
): CorrelationRecord[] {
  const scoped = signals.filter(s => s.orgSlug === orgSlug);
  const records: CorrelationRecord[] = [];

  for (let i = 0; i < scoped.length; i++) {
    for (let j = i + 1; j < scoped.length; j++) {
      const a = scoped[i];
      const b = scoped[j];

      const record = _tryCorrelate(orgSlug, a, b);
      if (record) records.push(record);
    }
  }

  return records;
}

function _tryCorrelate(
  orgSlug: string,
  a: ReasoningSignal,
  b: ReasoningSignal,
): CorrelationRecord | null {
  // Same domain, same direction = direct correlation
  if (a.domain === b.domain && a.direction && b.direction && a.direction === b.direction) {
    return {
      id:           generateCmrId("cor"),
      orgSlug,
      signalIdA:    a.id,
      signalIdB:    b.id,
      strength:     0.7,
      relationship: "CONCURRENT",
      explanation:  `Both signals in ${a.domain} domain show ${a.direction} direction.`,
      confidence:   0.7,
      detectedAt:   new Date().toISOString(),
    };
  }

  // Check known domain pairs
  const pair = DOMAIN_CORRELATION_PAIRS.find(p =>
    (p.domainA === a.domain && p.domainB === b.domain) ||
    (p.domainA === b.domain && p.domainB === a.domain),
  );

  if (pair) {
    // Inverse if directions differ
    const relationship: CorrelationRecord["relationship"] =
      (a.direction && b.direction && a.direction !== b.direction)
        ? "INVERSE"
        : pair.relationship;

    return {
      id:           generateCmrId("cor"),
      orgSlug,
      signalIdA:    a.id,
      signalIdB:    b.id,
      strength:     pair.strength,
      relationship,
      explanation:  pair.explanation,
      confidence:   Math.min((a.confidence + b.confidence) / 2, 1),
      detectedAt:   new Date().toISOString(),
    };
  }

  return null;
}

// ── Evidence correlation ──────────────────────────────────────────────────────

export function correlateEvidence(
  orgSlug: string,
  evidence: ReasoningEvidence[],
): CorrelationRecord[] {
  const scoped = evidence.filter(e => e.orgSlug === orgSlug);
  const records: CorrelationRecord[] = [];

  // Group by domain and find multi-domain evidence
  const byDomain = new Map<string, ReasoningEvidence[]>();
  for (const ev of scoped) {
    const list = byDomain.get(ev.domain) ?? [];
    list.push(ev);
    byDomain.set(ev.domain, list);
  }

  const domains = [...byDomain.keys()];
  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const domainA = domains[i];
      const domainB = domains[j];
      const pair = DOMAIN_CORRELATION_PAIRS.find(p =>
        (p.domainA === domainA && p.domainB === domainB) ||
        (p.domainA === domainB && p.domainB === domainA),
      );
      if (!pair) continue;

      const aItems = byDomain.get(domainA) ?? [];
      const bItems = byDomain.get(domainB) ?? [];

      if (aItems.length > 0 && bItems.length > 0) {
        records.push({
          id:           generateCmrId("cor"),
          orgSlug,
          signalIdA:    aItems[0].sourceRef,
          signalIdB:    bItems[0].sourceRef,
          strength:     pair.strength,
          relationship: pair.relationship,
          explanation:  `Cross-domain evidence correlation: ${pair.explanation}`,
          confidence:   0.6,
          detectedAt:   new Date().toISOString(),
        });
      }
    }
  }

  return records;
}

// ── Pattern detection ─────────────────────────────────────────────────────────

export interface DetectedPattern {
  id:          string;
  orgSlug:     string;
  name:        string;
  description: string;
  signalIds:   string[];
  strength:    number;
  detectedAt:  string;
}

const PATTERN_RULES: Array<{
  name:        string;
  description: string;
  requires:    string[];  // domain list
  strength:    number;
}> = [
  {
    name:        "Cascada financiero-comercial",
    description: "Caída simultánea en métricas financieras y comerciales, indicando un problema sistémico.",
    requires:    ["FINANCE", "COMMERCIAL"],
    strength:    0.85,
  },
  {
    name:        "Presión de liquidez por cobranza",
    description: "Combinación de baja cobranza y caída de caja, generando presión de liquidez.",
    requires:    ["COLLECTIONS", "FINANCE"],
    strength:    0.9,
  },
  {
    name:        "Desconexión marketing-ventas",
    description: "Campañas activas sin impacto en ventas, indicando ineficiencia en conversión.",
    requires:    ["MARKETING", "COMMERCIAL"],
    strength:    0.75,
  },
  {
    name:        "Triple presión operativa",
    description: "Señales negativas en finanzas, cobranza y ventas simultáneamente.",
    requires:    ["FINANCE", "COLLECTIONS", "COMMERCIAL"],
    strength:    1.0,
  },
];

export function detectPatterns(
  orgSlug: string,
  signals: ReasoningSignal[],
): DetectedPattern[] {
  const scoped = signals.filter(s => s.orgSlug === orgSlug);
  const activeDomains = new Set(scoped.map(s => s.domain));
  const patterns: DetectedPattern[] = [];

  for (const rule of PATTERN_RULES) {
    if (rule.requires.every(d => activeDomains.has(d as ReasoningSignal["domain"]))) {
      const relevantSignals = scoped
        .filter(s => rule.requires.includes(s.domain))
        .map(s => s.id);

      patterns.push({
        id:          generateCmrId("pat"),
        orgSlug,
        name:        rule.name,
        description: rule.description,
        signalIds:   relevantSignals,
        strength:    rule.strength,
        detectedAt:  new Date().toISOString(),
      });
    }
  }

  return patterns;
}
