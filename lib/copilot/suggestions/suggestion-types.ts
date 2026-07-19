/**
 * lib/copilot/suggestions/suggestion-types.ts
 *
 * Agentik Copilot — Suggestion Layer Types
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Base types for the deterministic suggestion system.
 * Suggestions are read-only recommendations — no side effects.
 */

import type { CapabilityId } from "../knowledge/capability-registry";
import type { ActionId } from "../knowledge/action-registry";
import type { DomainId } from "../knowledge/domain-registry";
import type { KnowledgeAgentId } from "../knowledge/agent-definition";

// ── Priority ──────────────────────────────────────────────────────────────────

/** Drives display order and visual emphasis. */
export type SuggestionPriority =
  | "critical"   // Requires immediate attention — risk signal present
  | "high"       // Important — should act today
  | "medium"     // Relevant — useful context
  | "low";       // Informational — background awareness

// ── Category ─────────────────────────────────────────────────────────────────

/** Describes the nature of the suggestion. */
export type SuggestionCategory =
  | "analysis"     // Analytical insight — look at this data
  | "review"       // Something to inspect or validate
  | "alert"        // Risk or exception that needs attention
  | "action"       // An executable step the agent can take
  | "opportunity"; // Growth or optimization potential

// ── Source ────────────────────────────────────────────────────────────────────

/** What generated this suggestion. */
export type SuggestionSource =
  | "capability"  // Derived from a discovered capability
  | "action"      // Derived from a recommended action
  | "domain"      // Derived from active domain context
  | "agent";      // Surfaced directly by the lead agent's knowledge

// ── Group key ─────────────────────────────────────────────────────────────────

/** Logical grouping for Copilot UI. */
export type SuggestionGroupKey =
  | "today"          // Urgent / critical items — act now
  | "recommended"    // High-value, ready to execute
  | "attention"      // Alerts and reviews pending
  | "opportunities"; // Medium-priority growth and analysis

// ── Core suggestion ───────────────────────────────────────────────────────────

export interface CopilotSuggestion {
  /** Stable deterministic ID: source:ref:index */
  id:             string;

  /** Short user-facing label (max ~60 chars) */
  title:          string;

  /** Descriptive sentence explaining the suggestion */
  descripcion:    string;

  priority:       SuggestionPriority;
  category:       SuggestionCategory;
  source:         SuggestionSource;

  /** Originating capability, if any */
  capabilityRef?: CapabilityId;

  /** Originating action, if any */
  actionRef?:     ActionId;

  /** Primary domain this suggestion relates to */
  domainRef?:     DomainId;

  /** Generating agent */
  agentRef?:      KnowledgeAgentId;

  /** Composite score for ranking (higher = more relevant) */
  score:          number;
}

// ── Suggestion group ──────────────────────────────────────────────────────────

export interface SuggestionGroup {
  key:          SuggestionGroupKey;
  label:        string;
  descripcion:  string;
  suggestions:  CopilotSuggestion[];
}

// ── Engine output ─────────────────────────────────────────────────────────────

export interface SuggestionEngineResult {
  /** All suggestions, ranked */
  suggestions:  CopilotSuggestion[];

  /** Grouped for UI presentation */
  groups:       SuggestionGroup[];

  /** Metadata for debugging and analytics */
  meta: {
    totalSuggestions:   number;
    totalGroups:        number;
    leadAgent:          KnowledgeAgentId | null;
    activeDomains:      DomainId[];
    snapshotId:         string;
    generatedAt:        Date;
  };
}
