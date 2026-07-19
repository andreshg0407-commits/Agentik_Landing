// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 14 — Strategic Memory Integration

import type {
  StrategicMemoryEntry,
  StrategicMemoryContext,
  StrategicMemorySnapshot,
} from "../../strategic-memory/strategic-memory-types";
import type {
  ExecutiveObjective,
  ExecutiveConcern,
  ExecutiveDomain,
} from "../executive-brain-types";
import { generateEbv2Id, confidenceFromScore, riskLevelFromScore } from "../executive-brain-types";

export interface StrategicMemoryExecInput {
  readonly orgSlug: string;
  readonly entries: StrategicMemoryEntry[];
  readonly context?: StrategicMemoryContext;
  readonly snapshot?: StrategicMemorySnapshot;
}

export function extractExecutiveObjectivesFromMemory(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveObjective[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && (e.type === "GOAL" || e.type === "OBJECTIVE"))
    .map((e) => ({
      id: generateEbv2Id("obj"),
      orgSlug,
      title: e.title,
      description: e.description,
      domain: e.domain as ExecutiveDomain,
      priority: (e.priority === "CRITICAL" ? "CRITICAL" : e.priority === "HIGH" ? "HIGH" : e.priority === "MEDIUM" ? "MEDIUM" : "LOW") as ExecutiveObjective["priority"],
      confidence: confidenceFromScore(e.confidenceScore),
      confidenceScore: e.confidenceScore,
      progressScore: 0,
      strategicSourceId: e.id,
      evidenceIds: e.evidenceIds,
      metadata: { strategicMemoryId: e.id },
    }));
}

export function extractExecutiveConcernsFromMemory(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveConcern[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "RISK")
    .map((e) => ({
      id: generateEbv2Id("concern"),
      orgSlug,
      title: e.title,
      description: e.description,
      domain: e.domain as ExecutiveDomain,
      severity: (e.priority === "CRITICAL" ? "CRITICAL" : e.priority === "HIGH" ? "HIGH" : e.priority === "MEDIUM" ? "MEDIUM" : "LOW") as ExecutiveConcern["severity"],
      confidence: confidenceFromScore(e.confidenceScore),
      confidenceScore: e.confidenceScore,
      riskLevel: riskLevelFromScore(e.strategicScore),
      evidenceIds: e.evidenceIds,
      metadata: { strategicMemoryId: e.id },
    }));
}

export function getStrategicAlignmentScore(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): number {
  const active = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  if (active.length === 0) return 0;
  const goals = active.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  if (goals.length === 0) return 0.3;
  const avgScore = goals.reduce((acc, e) => acc + e.strategicScore, 0) / goals.length;
  return Math.round(avgScore * 100) / 100;
}

export function extractStrategicDecisions(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "DECISION");
}

export function extractStrategicCommitments(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "COMMITMENT");
}

export function extractStrategicPolicies(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "POLICY");
}
