// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Main learning engine — fail-closed orchestrator

import type {
  LearningEvent,
  LearningPattern,
  LearningOutcome,
  LearningSignal,
  LearningAdjustment,
  LearningContext,
  LearningResult,
  LearningDomain,
} from "./learning-types";
import { generateLearningResultId, generateLearningPatternId } from "./learning-identity";
import { eventToLearningSignal } from "./learning-signal-engine";
import { trackOutcome } from "./outcome-tracker";
import {
  reinforcePattern,
  weakenPattern,
  createPattern,
  filterActivePatterns,
} from "./learning-pattern-engine";
import { suggestBulkAdjustments } from "./confidence-adjustment-engine";
import {
  filterTenantEvents,
  filterTenantPatterns,
  validateCrossTenantIsolation,
} from "./learning-guardrails";

export interface LearningEngineInput {
  readonly orgSlug: string;
  readonly events: LearningEvent[];
  readonly existingPatterns: LearningPattern[];
}

export interface LearningEngineOutput {
  readonly result: LearningResult;
  readonly signals: LearningSignal[];
  readonly outcomes: LearningOutcome[];
  readonly updatedPatterns: LearningPattern[];
  readonly adjustments: LearningAdjustment[];
}

function DEGRADED_RESULT(orgSlug: string, startMs: number): LearningResult {
  return {
    id: generateLearningResultId(),
    orgSlug,
    status: "FAILED",
    eventsProcessed: 0,
    patternsUpdated: 0,
    signalsGenerated: 0,
    adjustmentsSuggested: 0,
    durationMs: Date.now() - startMs,
    completedAt: new Date().toISOString(),
  };
}

export function runLearningEngine(input: LearningEngineInput): LearningEngineOutput {
  const startMs = Date.now();
  const { orgSlug } = input;

  try {
    // Enforce tenant isolation — fail closed
    const isolationCheck = validateCrossTenantIsolation(input.events, orgSlug);
    if (!isolationCheck.passed) {
      return {
        result: DEGRADED_RESULT(orgSlug, startMs),
        signals: [],
        outcomes: [],
        updatedPatterns: [],
        adjustments: [],
      };
    }

    const events = filterTenantEvents(input.events, orgSlug);
    const existingPatterns = filterTenantPatterns(input.existingPatterns, orgSlug);

    // 1. Generate signals from events
    const signals = events.map(eventToLearningSignal);

    // 2. Track outcomes
    const outcomes = events.map((e) => trackOutcome(e));

    // 3. Update patterns based on events
    const patternMap = new Map<string, LearningPattern>();
    for (const p of existingPatterns) {
      patternMap.set(p.id, p);
    }

    // Group events by domain for pattern matching
    const domainEvents = new Map<LearningDomain, LearningEvent[]>();
    for (const event of events) {
      const list = domainEvents.get(event.domain) ?? [];
      list.push(event);
      domainEvents.set(event.domain, list);
    }

    // Reinforce or weaken patterns based on event type
    for (const event of events) {
      const isPositive =
        event.type === "HYPOTHESIS_CONFIRMED" ||
        event.type === "RECOMMENDATION_ACCEPTED" ||
        event.type === "ACTION_SUCCEEDED" ||
        event.type === "USER_FEEDBACK_POSITIVE" ||
        event.type === "PATTERN_REINFORCED";

      const isNegative =
        event.type === "HYPOTHESIS_REJECTED" ||
        event.type === "RECOMMENDATION_REJECTED" ||
        event.type === "ACTION_FAILED" ||
        event.type === "USER_FEEDBACK_NEGATIVE" ||
        event.type === "PATTERN_WEAKENED";

      // Find matching domain pattern
      const domainPattern = Array.from(patternMap.values()).find(
        (p) => p.domain === event.domain && p.orgSlug === orgSlug
      );

      if (domainPattern) {
        if (isPositive) {
          patternMap.set(domainPattern.id, reinforcePattern(domainPattern, event));
        } else if (isNegative) {
          patternMap.set(domainPattern.id, weakenPattern(domainPattern, event));
        }
      } else if (isPositive) {
        // Create new pattern for positive signals without an existing pattern
        const newPattern = createPattern(
          orgSlug,
          event.domain,
          `${event.domain} learning pattern`,
          `Auto-created pattern for ${event.domain.toLowerCase()} domain learning`,
          event.id,
          event.agentId
        );
        patternMap.set(newPattern.id, newPattern);
      }
    }

    const updatedPatterns = Array.from(patternMap.values());

    // 4. Suggest adjustments for active patterns
    const activePatterns = filterActivePatterns(updatedPatterns);
    const adjustments = suggestBulkAdjustments(activePatterns);

    const result: LearningResult = {
      id: generateLearningResultId(),
      orgSlug,
      status: "SUCCESS",
      eventsProcessed: events.length,
      patternsUpdated: updatedPatterns.length,
      signalsGenerated: signals.length,
      adjustmentsSuggested: adjustments.length,
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };

    return { result, signals, outcomes, updatedPatterns, adjustments };
  } catch {
    // Fail closed — never throw
    return {
      result: DEGRADED_RESULT(orgSlug, startMs),
      signals: [],
      outcomes: [],
      updatedPatterns: [],
      adjustments: [],
    };
  }
}
