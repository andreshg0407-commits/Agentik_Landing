/**
 * lib/copilot/insights/insight-types.ts
 *
 * Agentik Copilot — Insight Layer Types
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Base types for the Insights layer.
 *
 * Insights answer "why should you act?" —
 * contextual explanations for suggestions, not data assertions.
 *
 * Insights without real evidence speak in terms of contextual possibility.
 * Insights with evidence (signals, facts, metrics) can make stronger statements.
 */

import type { DomainId }         from "../knowledge/domain-registry";
import type { CapabilityId }     from "../knowledge/capability-registry";
import type { ActionId }         from "../knowledge/action-registry";
import type { KnowledgeAgentId } from "../knowledge/agent-definition";

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * What kind of insight this represents.
 */
export type InsightType =
  | "observation"   // Something notable worth surfacing
  | "anomaly"       // A deviation from expected patterns
  | "opportunity"   // A potential positive action to take
  | "risk"          // A potential negative outcome to prevent
  | "trend"         // A directional change over time
  | "alert"         // Something that requires immediate attention
  | "explanation"   // Contextual "why" behind a suggestion
  | "summary";      // High-level rollup of a domain or module state

/**
 * How urgent or important this insight is.
 */
export type InsightSeverity =
  | "critical"  // Must act now — significant business impact
  | "high"      // Important — act today
  | "medium"    // Relevant — act this week
  | "low"       // Informational — awareness only
  | "info";     // Background context — no urgency

/**
 * What generated this insight.
 */
export type InsightSource =
  | "signal"      // Generated from a detected business signal
  | "capability"  // Derived from available domain capabilities
  | "domain"      // Derived from active domain context
  | "action"      // Linked to a recommended action
  | "suggestion"; // Linked to a Copilot suggestion

/**
 * Current lifecycle state of the insight.
 */
export type InsightStatus =
  | "active"    // Currently valid and visible
  | "pending"   // Generated but not yet confirmed
  | "resolved"  // The underlying condition was addressed
  | "dismissed" // Deliberately dismissed by user
  | "stale";    // No longer relevant due to context change

// ── Supporting structures ─────────────────────────────────────────────────────

/**
 * A piece of evidence supporting the insight.
 * Evidence is structural (no real values) until signals with facts are wired.
 */
export interface InsightEvidence {
  /** Evidence category */
  type:        "capability_match" | "signal_detected" | "domain_active" | "action_available";
  /** Reference ID (capabilityId, signalId, domainId, actionId) */
  ref:         string;
  /** Human-readable description of why this constitutes evidence */
  description: string;
}

/**
 * A metric reference — structural only.
 * No values until real data sources are connected.
 */
export interface InsightMetric {
  id:          string;
  name:        string;
  description: string;
  unit?:       string;
}

/**
 * A business signal that triggered or contributed to this insight.
 */
export interface InsightSignal {
  signalId:    string;
  detectedAt?: Date;
  strength?:   "weak" | "moderate" | "strong";
}

/**
 * Timeframe context for the insight.
 */
export interface InsightTimeframe {
  period: "real_time" | "today" | "last_7_days" | "last_30_days" | "current_month" | "current_quarter";
  label:  string;
}

/**
 * Link between an insight and a related suggestion.
 * Enables the "why" → "what" connection in Copilot UI.
 */
export interface InsightRecommendationLink {
  suggestionId: string;
  actionRef?:   ActionId;
  label:        string;
}

// ── Core insight ──────────────────────────────────────────────────────────────

export interface CopilotInsight {
  /** Stable deterministic ID: ins:{type}:{domain}:{index} */
  id:              string;

  /** Short user-facing title (max ~70 chars) */
  title:           string;

  /**
   * Explanation of why this is relevant.
   * Without evidence: contextual possibility language.
   * With signals/facts: stronger observational language.
   */
  description:     string;

  type:            InsightType;
  severity:        InsightSeverity;
  source:          InsightSource;
  status:          InsightStatus;

  /** Primary domain this insight belongs to */
  domainId?:       DomainId;

  /** Entity types involved in this insight */
  entityIds?:      string[];

  /** Capability IDs that support this insight */
  capabilityIds?:  CapabilityId[];

  /** Business signals that triggered this insight */
  signals?:        InsightSignal[];

  /** Supporting evidence for this insight */
  evidence?:       InsightEvidence[];

  /**
   * Confidence level 0–1.
   * Structural insights (no evidence): 0.3–0.5
   * Signal-backed insights: 0.6–0.8
   * Fact-backed insights: 0.9–1.0
   */
  confidence:      number;

  /** Related suggestion IDs (links "why" → "what") */
  relatedSuggestionIds?: string[];

  /** Related action IDs */
  relatedActionIds?:     ActionId[];

  /** Agent that surfaced this insight */
  agentRef?:       KnowledgeAgentId;

  /** Timeframe context */
  timeframe?:      InsightTimeframe;

  /** Composite ranking score (computed by ranker) */
  score:           number;

  createdAt:       Date;
}

// ── Group ─────────────────────────────────────────────────────────────────────

export type InsightGroupKey =
  | "summary"       // High-level context summary
  | "risks"         // Risk and alert insights
  | "opportunities" // Opportunity insights
  | "attention"     // Items requiring human review
  | "explanation";  // Explanatory context

export interface InsightGroup {
  key:         InsightGroupKey;
  label:       string;
  descripcion: string;
  insights:    CopilotInsight[];
}

// ── Engine output ─────────────────────────────────────────────────────────────

export interface InsightEngineResult {
  /** All insights, ranked */
  insights:        CopilotInsight[];
  /** Grouped for UI consumption */
  groupedInsights: InsightGroup[];
  /** Diagnostics */
  meta: {
    totalInsights:  number;
    totalGroups:    number;
    leadAgent:      KnowledgeAgentId | null;
    activeDomains:  DomainId[];
    signalCount:    number;
    snapshotId:     string;
    generatedAt:    Date;
  };
}

// ── Slim suggestion reference (decoupled from suggestions layer) ──────────────

/**
 * Minimal reference to a suggestion for insight linkage.
 * Uses ID and domain only — does not import full CopilotSuggestion type.
 */
export interface SuggestionRef {
  id:        string;
  domainRef?: DomainId;
  actionRef?: ActionId;
}
