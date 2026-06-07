// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning repository — interface + in-memory implementation

import type {
  LearningEvent,
  LearningPattern,
  LearningOutcome,
  LearningAdjustment,
  LearningResult,
} from "./learning-types";

// ── Repository interface ──────────────────────────────────────────────────────

export interface LearningRepository {
  // Events
  saveEvent(event: LearningEvent): Promise<void>;
  getEvents(orgSlug: string, limit?: number): Promise<LearningEvent[]>;
  getEventById(id: string): Promise<LearningEvent | null>;

  // Patterns
  savePattern(pattern: LearningPattern): Promise<void>;
  updatePattern(pattern: LearningPattern): Promise<void>;
  getPatterns(orgSlug: string): Promise<LearningPattern[]>;
  getPatternById(id: string): Promise<LearningPattern | null>;

  // Outcomes
  saveOutcome(outcome: LearningOutcome): Promise<void>;
  getOutcomes(orgSlug: string, limit?: number): Promise<LearningOutcome[]>;

  // Adjustments
  saveAdjustment(adjustment: LearningAdjustment): Promise<void>;
  updateAdjustment(adjustment: LearningAdjustment): Promise<void>;
  getAdjustments(orgSlug: string): Promise<LearningAdjustment[]>;

  // Results
  saveResult(result: LearningResult): Promise<void>;
  getLatestResult(orgSlug: string): Promise<LearningResult | null>;
}

// ── In-memory implementation (for testing and early development) ──────────────

export class InMemoryLearningRepository implements LearningRepository {
  private events: Map<string, LearningEvent> = new Map();
  private patterns: Map<string, LearningPattern> = new Map();
  private outcomes: Map<string, LearningOutcome> = new Map();
  private adjustments: Map<string, LearningAdjustment> = new Map();
  private results: Map<string, LearningResult[]> = new Map();

  async saveEvent(event: LearningEvent): Promise<void> {
    this.events.set(event.id, event);
  }

  async getEvents(orgSlug: string, limit = 100): Promise<LearningEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.orgSlug === orgSlug)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, limit);
  }

  async getEventById(id: string): Promise<LearningEvent | null> {
    return this.events.get(id) ?? null;
  }

  async savePattern(pattern: LearningPattern): Promise<void> {
    this.patterns.set(pattern.id, pattern);
  }

  async updatePattern(pattern: LearningPattern): Promise<void> {
    this.patterns.set(pattern.id, pattern);
  }

  async getPatterns(orgSlug: string): Promise<LearningPattern[]> {
    return Array.from(this.patterns.values()).filter((p) => p.orgSlug === orgSlug);
  }

  async getPatternById(id: string): Promise<LearningPattern | null> {
    return this.patterns.get(id) ?? null;
  }

  async saveOutcome(outcome: LearningOutcome): Promise<void> {
    this.outcomes.set(outcome.id, outcome);
  }

  async getOutcomes(orgSlug: string, limit = 100): Promise<LearningOutcome[]> {
    return Array.from(this.outcomes.values())
      .filter((o) => o.orgSlug === orgSlug)
      .sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime())
      .slice(0, limit);
  }

  async saveAdjustment(adjustment: LearningAdjustment): Promise<void> {
    this.adjustments.set(adjustment.id, adjustment);
  }

  async updateAdjustment(adjustment: LearningAdjustment): Promise<void> {
    this.adjustments.set(adjustment.id, adjustment);
  }

  async getAdjustments(orgSlug: string): Promise<LearningAdjustment[]> {
    return Array.from(this.adjustments.values()).filter(
      (a) => a.orgSlug === orgSlug
    );
  }

  async saveResult(result: LearningResult): Promise<void> {
    const list = this.results.get(result.orgSlug) ?? [];
    list.push(result);
    this.results.set(result.orgSlug, list);
  }

  async getLatestResult(orgSlug: string): Promise<LearningResult | null> {
    const list = this.results.get(orgSlug) ?? [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  // Test utilities
  clear(): void {
    this.events.clear();
    this.patterns.clear();
    this.outcomes.clear();
    this.adjustments.clear();
    this.results.clear();
  }
}
