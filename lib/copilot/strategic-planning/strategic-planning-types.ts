// AGENTIK-STRATEGIC-PLANNING-01
// Phase 1 — Strategic Planning Domain Types
// All types serializable. No class instances, no Date objects, no functions.
// Plans are structured proposals — never executions, never task assignments.

import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";

export type { StrategicDomain };

// ── Enumerations ──────────────────────────────────────────────────────────────

export type PlanningPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PlanningStatus   = "DRAFT" | "ACTIVE" | "COMPLETED" | "BLOCKED" | "ARCHIVED";
export type PlanningHorizon  = "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";
export type PlanningConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const PLANNING_PRIORITIES:  PlanningPriority[]  = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const PLANNING_STATUSES:    PlanningStatus[]    = ["DRAFT", "ACTIVE", "COMPLETED", "BLOCKED", "ARCHIVED"];
export const PLANNING_HORIZONS:    PlanningHorizon[]   = ["IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"];
export const PLANNING_CONFIDENCES: PlanningConfidence[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];

export const PLANNING_PRIORITY_RANK: Record<PlanningPriority, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};

export const PLANNING_CONFIDENCE_SCORE: Record<PlanningConfidence, number> = {
  LOW: 0.25, MEDIUM: 0.50, HIGH: 0.75, VERY_HIGH: 0.90,
};

// ── Initiative types ──────────────────────────────────────────────────────────

export type InitiativeType =
  | "PROCESS_IMPROVEMENT"
  | "COST_REDUCTION"
  | "REVENUE_GROWTH"
  | "RISK_MITIGATION"
  | "COMPLIANCE"
  | "TECHNOLOGY"
  | "PEOPLE"
  | "MARKET_EXPANSION"
  | "PRODUCT_DEVELOPMENT"
  | "PARTNERSHIP"
  | "CUSTOM";

export const INITIATIVE_TYPES: InitiativeType[] = [
  "PROCESS_IMPROVEMENT", "COST_REDUCTION", "REVENUE_GROWTH", "RISK_MITIGATION",
  "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "MARKET_EXPANSION", "PRODUCT_DEVELOPMENT",
  "PARTNERSHIP", "CUSTOM",
];

// ── Dependency types ──────────────────────────────────────────────────────────

export type DependencyType = "REQUIRES" | "BLOCKS" | "RELATED" | "CONFLICTS";
export const DEPENDENCY_TYPES: DependencyType[] = ["REQUIRES", "BLOCKS", "RELATED", "CONFLICTS"];

// ── Canonical plan types ──────────────────────────────────────────────────────

export type CanonicalPlanType =
  | "REDUCIR_CARTERA"
  | "MEJORAR_LIQUIDEZ"
  | "INCREMENTAR_VENTAS"
  | "EXPANDIR_MERCADO"
  | "ABRIR_SUCURSAL"
  | "OPTIMIZAR_INVENTARIO"
  | "REDUCIR_COSTOS"
  | "MEJORAR_MARKETING"
  | "DIGITALIZACION_OPERATIVA"
  | "MEJORAR_COBRANZA"
  | "INCREMENTAR_RENTABILIDAD"
  | "EXPANDIR_CANALES"
  | "FORTALECER_RETENCION"
  | "AUMENTAR_PRODUCTIVIDAD"
  | "EXPANSION_INTERNACIONAL";

export const CANONICAL_PLAN_TYPES: CanonicalPlanType[] = [
  "REDUCIR_CARTERA", "MEJORAR_LIQUIDEZ", "INCREMENTAR_VENTAS", "EXPANDIR_MERCADO",
  "ABRIR_SUCURSAL", "OPTIMIZAR_INVENTARIO", "REDUCIR_COSTOS", "MEJORAR_MARKETING",
  "DIGITALIZACION_OPERATIVA", "MEJORAR_COBRANZA", "INCREMENTAR_RENTABILIDAD",
  "EXPANDIR_CANALES", "FORTALECER_RETENCION", "AUMENTAR_PRODUCTIVIDAD",
  "EXPANSION_INTERNACIONAL",
];

// ── Core entities ─────────────────────────────────────────────────────────────

export interface StrategicObjective {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly description:    string;
  readonly domain:         StrategicDomain;
  readonly priority:       PlanningPriority;
  readonly status:         PlanningStatus;
  readonly horizon:        PlanningHorizon;
  readonly confidenceScore: number;           // 0–1
  readonly impactScore:    number;            // 0–1
  readonly alignmentScore: number;            // 0–1: alignment with strategic memory
  readonly evidenceIds:    string[];
  readonly relatedGoalIds: string[];
  readonly metadata:       Record<string, unknown>;
  readonly createdAt:      string;            // ISO
}

export interface StrategicInitiative {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly objectiveId:    string;            // parent objective
  readonly title:          string;
  readonly description:    string;
  readonly type:           InitiativeType;
  readonly domain:         StrategicDomain;
  readonly priority:       PlanningPriority;
  readonly status:         PlanningStatus;
  readonly horizon:        PlanningHorizon;
  readonly effortScore:    number;            // 0–1: estimated effort
  readonly impactScore:    number;            // 0–1
  readonly confidenceScore: number;
  readonly playbookIds:    string[];
  readonly evidenceIds:    string[];
  readonly suggestedOnly:  true;              // NEVER assigns real tasks
  readonly metadata:       Record<string, unknown>;
  readonly createdAt:      string;
}

export interface StrategicMilestone {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly initiativeId:    string;
  readonly title:           string;
  readonly description:     string;
  readonly successCriteria: string;           // measurable success definition
  readonly estimatedDate:   PlanningHorizon;  // relative horizon
  readonly priority:        PlanningPriority;
  readonly status:          PlanningStatus;
  readonly dependencyIds:   string[];
  readonly evidenceIds:     string[];
  readonly metadata:        Record<string, unknown>;
  readonly createdAt:       string;
}

export interface StrategicDependency {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly fromId:        string;             // initiative or milestone ID
  readonly toId:          string;             // what it depends on
  readonly type:          DependencyType;
  readonly description:   string;
  readonly isBlocking:    boolean;
  readonly metadata:      Record<string, unknown>;
}

export interface StrategicRisk {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly planId:        string;
  readonly title:         string;
  readonly description:   string;
  readonly domain:        StrategicDomain;
  readonly level:         "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  readonly likelihood:    number;             // 0–1
  readonly impact:        number;             // 0–1
  readonly compositeRisk: number;             // 0–1
  readonly mitigations:   string[];
  readonly evidenceIds:   string[];
  readonly metadata:      Record<string, unknown>;
}

export interface StrategicOpportunity {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly planId:        string;
  readonly title:         string;
  readonly description:   string;
  readonly domain:        StrategicDomain;
  readonly magnitude:     "SMALL" | "MEDIUM" | "LARGE" | "TRANSFORMATIONAL";
  readonly captureScore:  number;             // 0–1
  readonly confidenceScore: number;
  readonly horizon:       PlanningHorizon;
  readonly evidenceIds:   string[];
  readonly metadata:      Record<string, unknown>;
}

export interface StrategicRoadmap {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly planId:         string;
  readonly title:          string;
  readonly description:    string;
  readonly objectives:     StrategicObjective[];
  readonly initiatives:    StrategicInitiative[];
  readonly milestones:     StrategicMilestone[];
  readonly dependencies:   StrategicDependency[];
  readonly horizon:        PlanningHorizon;
  readonly confidence:     PlanningConfidence;
  readonly confidenceScore: number;
  readonly metadata:       Record<string, unknown>;
  readonly builtAt:        string;
}

export interface StrategicExecutionCandidate {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly initiativeId:   string;
  readonly title:          string;
  readonly rationale:      string;
  readonly readinessScore: number;            // 0–1: how ready to be actioned
  readonly blockers:       string[];
  readonly suggestedOnly:  true;
  readonly metadata:       Record<string, unknown>;
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export interface StrategicPlan {
  readonly id:               string;
  readonly orgSlug:          string;
  readonly title:            string;
  readonly description:      string;
  readonly rationale:        string;
  readonly domain:           StrategicDomain;
  readonly priority:         PlanningPriority;
  readonly status:           PlanningStatus;
  readonly horizon:          PlanningHorizon;
  readonly objectives:       StrategicObjective[];
  readonly initiatives:      StrategicInitiative[];
  readonly milestones:       StrategicMilestone[];
  readonly dependencies:     StrategicDependency[];
  readonly risks:            StrategicRisk[];
  readonly opportunities:    StrategicOpportunity[];
  readonly roadmap:          StrategicRoadmap | null;
  readonly narrative:        string;
  readonly planScore:        number;            // 0–1 overall quality
  readonly confidence:       PlanningConfidence;
  readonly confidenceScore:  number;
  readonly alignmentScore:   number;
  readonly riskCoverage:     number;            // 0–1: % of identified risks mitigated
  readonly evidenceIds:      string[];
  readonly sourceIds:        string[];          // IDs of inputs that generated this plan
  readonly suggestedOnly:    true;              // NEVER executes
  readonly metadata:         Record<string, unknown>;
  readonly createdAt:        string;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface StrategicPlanSnapshot {
  readonly id:        string;
  readonly planId:    string;
  readonly orgSlug:   string;
  readonly snapshotAt: string;
  readonly planScore: number;
  readonly status:    PlanningStatus;
  readonly metadata:  Record<string, unknown>;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface StrategicPlanningContext {
  readonly orgSlug:            string;
  readonly domain:             StrategicDomain;
  readonly canonicalType?:     CanonicalPlanType;
  readonly horizonOverride?:   PlanningHorizon;
  readonly priorityOverride?:  PlanningPriority;
  readonly sourceRecommendationIds?: string[];
  readonly sourceSimulationIds?:     string[];
  readonly metadata?:          Record<string, unknown>;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface StrategicPlanningResult {
  readonly status:       "OK" | "PARTIAL" | "FAILED";
  readonly orgSlug:      string;
  readonly plan:         StrategicPlan | null;
  readonly runId:        string;
  readonly durationMs:   number;
  readonly warnings:     string[];
  readonly limitations:  string[];
  readonly error?:       string;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

export function planningConfidenceFromScore(score: number): PlanningConfidence {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function planningPriorityFromScore(score: number): PlanningPriority {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function riskLevelFromScore(score: number): StrategicRisk["level"] {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.50) return "HIGH";
  if (score >= 0.25) return "MODERATE";
  return "LOW";
}
