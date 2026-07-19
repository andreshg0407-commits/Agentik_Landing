// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 8 — Executive Risk Engine
// Consumes Cross Module Reasoning, Strategic Memory, Compliance, Anomaly Detection

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { ReasoningSignal } from "../cross-module-reasoning/cross-module-types";
import type {
  ExecutiveRisk,
  ExecutiveDomain,
  ExecutiveRiskLevel,
} from "./executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  riskLevelFromScore,
} from "./executive-brain-types";

// ── Risk Engine Input ─────────────────────────────────────────────────────────

export interface RiskEngineInput {
  readonly orgSlug: string;
  readonly strategicEntries: StrategicMemoryEntry[];
  readonly reasoningSignals?: ReasoningSignal[];
  readonly complianceFindingCount?: number;
  readonly complianceSeverity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly anomalyCount?: number;
  readonly anomalySeverity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

// ── Risk Engine API ───────────────────────────────────────────────────────────

export function detectExecutiveRisks(input: RiskEngineInput): ExecutiveRisk[] {
  const risks: ExecutiveRisk[] = [];

  risks.push(..._fromStrategicMemory(input));
  risks.push(..._fromReasoningSignals(input));
  risks.push(..._fromComplianceFindings(input));
  risks.push(..._fromAnomalyDetection(input));

  return _deduplicate(risks).sort((a, b) => b.compositeRisk - a.compositeRisk);
}

export function getTopRisks(
  risks: ExecutiveRisk[],
  orgSlug: string,
  n = 5
): ExecutiveRisk[] {
  return risks
    .filter((r) => r.orgSlug === orgSlug)
    .sort((a, b) => b.compositeRisk - a.compositeRisk)
    .slice(0, n);
}

export function getRisksByLevel(
  risks: ExecutiveRisk[],
  orgSlug: string,
  level: ExecutiveRiskLevel
): ExecutiveRisk[] {
  return risks.filter((r) => r.orgSlug === orgSlug && r.level === level);
}

export function computeRiskExposureScore(risks: ExecutiveRisk[]): number {
  if (risks.length === 0) return 0;
  const criticalCount = risks.filter((r) => r.level === "CRITICAL").length;
  const highCount = risks.filter((r) => r.level === "HIGH").length;
  const exposure = Math.min(criticalCount * 0.25 + highCount * 0.1, 1);
  return Math.round(exposure * 100) / 100;
}

// ── Private detectors ─────────────────────────────────────────────────────────

function _fromStrategicMemory(input: RiskEngineInput): ExecutiveRisk[] {
  const { orgSlug, strategicEntries } = input;
  return strategicEntries
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        e.status === "ACTIVE" &&
        e.type === "RISK"
    )
    .map((e) => {
      const impact = e.priority === "CRITICAL" ? 0.95 : e.priority === "HIGH" ? 0.75 : e.priority === "MEDIUM" ? 0.5 : 0.25;
      const likelihood = e.confidenceScore;
      const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;
      return {
        id: generateEbv2Id("risk"),
        orgSlug,
        title: e.title,
        description: e.description,
        domain: e.domain as ExecutiveDomain,
        level: riskLevelFromScore(compositeRisk),
        confidence: confidenceFromScore(e.confidenceScore),
        confidenceScore: e.confidenceScore,
        likelihood,
        impact,
        compositeRisk,
        rationale: e.rationale,
        evidenceIds: e.evidenceIds,
        mitigationSuggestions: _buildMitigations(e),
        metadata: { source: "STRATEGIC_MEMORY", entryId: e.id, priority: e.priority },
      };
    });
}

function _fromReasoningSignals(input: RiskEngineInput): ExecutiveRisk[] {
  const { orgSlug, reasoningSignals = [] } = input;
  return reasoningSignals
    .filter(
      (s) =>
        s.orgSlug === orgSlug &&
        (s.type === "ANOMALY" || s.type === "THRESHOLD_BREACH" || s.type === "METRIC_DROP") &&
        (s.severity === "HIGH" || s.severity === "CRITICAL")
    )
    .map((s) => {
      const impact = s.severity === "CRITICAL" ? 0.9 : 0.7;
      const likelihood = s.confidence;
      const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;
      return {
        id: generateEbv2Id("risk"),
        orgSlug,
        title: `Señal de riesgo: ${s.label}`,
        description: s.description,
        domain: _mapDomain(s.domain),
        level: riskLevelFromScore(compositeRisk),
        confidence: confidenceFromScore(s.confidence),
        confidenceScore: s.confidence,
        likelihood,
        impact,
        compositeRisk,
        rationale: `Señal cross-module detectada: ${s.type} en dominio ${s.domain}`,
        evidenceIds: [s.id],
        mitigationSuggestions: [`Revisar dominio ${s.domain}`, "Escalar a responsable de área"],
        metadata: { source: "CROSS_MODULE_REASONING", signalId: s.id, signalType: s.type },
      };
    });
}

function _fromComplianceFindings(input: RiskEngineInput): ExecutiveRisk[] {
  const { orgSlug, complianceFindingCount, complianceSeverity } = input;
  if (!complianceFindingCount || complianceFindingCount === 0) return [];

  const impact = complianceSeverity === "CRITICAL" ? 0.95 : complianceSeverity === "HIGH" ? 0.8 : 0.55;
  const likelihood = Math.min(complianceFindingCount / 10, 0.95);
  const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;

  return [
    {
      id: generateEbv2Id("risk"),
      orgSlug,
      title: `Riesgo de cumplimiento: ${complianceFindingCount} hallazgo(s)`,
      description: `Se detectaron ${complianceFindingCount} hallazgos de cumplimiento con severidad ${complianceSeverity ?? "desconocida"}.`,
      domain: "COMPLIANCE" as ExecutiveDomain,
      level: riskLevelFromScore(compositeRisk),
      confidence: "HIGH",
      confidenceScore: 0.8,
      likelihood,
      impact,
      compositeRisk,
      rationale: "Derivado de la capa de Compliance de Agentik",
      evidenceIds: [],
      mitigationSuggestions: [
        "Revisar hallazgos de compliance",
        "Escalar a responsable de cumplimiento",
        "Actualizar políticas afectadas",
      ],
      metadata: { source: "COMPLIANCE", findingCount: complianceFindingCount, severity: complianceSeverity },
    },
  ];
}

function _fromAnomalyDetection(input: RiskEngineInput): ExecutiveRisk[] {
  const { orgSlug, anomalyCount, anomalySeverity } = input;
  if (!anomalyCount || anomalyCount === 0) return [];

  const impact = anomalySeverity === "CRITICAL" ? 0.9 : anomalySeverity === "HIGH" ? 0.7 : 0.45;
  const likelihood = Math.min(anomalyCount / 5, 0.95);
  const compositeRisk = Math.round((likelihood * 0.45 + impact * 0.55) * 100) / 100;

  return [
    {
      id: generateEbv2Id("risk"),
      orgSlug,
      title: `Anomalías detectadas: ${anomalyCount} evento(s)`,
      description: `La capa de detección de anomalías reportó ${anomalyCount} evento(s) con severidad ${anomalySeverity ?? "desconocida"}.`,
      domain: "CROSS_DOMAIN" as ExecutiveDomain,
      level: riskLevelFromScore(compositeRisk),
      confidence: "MEDIUM",
      confidenceScore: 0.65,
      likelihood,
      impact,
      compositeRisk,
      rationale: "Derivado del motor de detección de anomalías de Agentik",
      evidenceIds: [],
      mitigationSuggestions: [
        "Investigar anomalías recientes",
        "Revisar accesos y operaciones inusuales",
      ],
      metadata: { source: "ANOMALY_DETECTION", anomalyCount, severity: anomalySeverity },
    },
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildMitigations(entry: StrategicMemoryEntry): string[] {
  const suggestions: string[] = [];
  if (entry.priority === "CRITICAL") {
    suggestions.push("Escalar a nivel ejecutivo inmediatamente");
    suggestions.push("Revisar plan de contingencia");
  }
  if (entry.domain === "FINANCE") suggestions.push("Revisar indicadores de liquidez y flujo de caja");
  if (entry.domain === "COMMERCIAL") suggestions.push("Revisar pipeline comercial y cobertura de cartera");
  if (entry.domain === "COMPLIANCE") suggestions.push("Consultar con área legal y regulatoria");
  if (suggestions.length === 0) suggestions.push("Monitorear evolución del riesgo en próximos días");
  return suggestions;
}

function _mapDomain(domain: string): ExecutiveDomain {
  const map: Record<string, ExecutiveDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", COLLECTIONS: "FINANCE",
    MARKETING: "MARKETING", EXECUTIVE: "EXECUTIVE", PLAYBOOKS: "CROSS_DOMAIN",
    MEMORY: "CROSS_DOMAIN", GRAPH: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}

function _deduplicate(risks: ExecutiveRisk[]): ExecutiveRisk[] {
  const seen = new Set<string>();
  return risks.filter((r) => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
}
