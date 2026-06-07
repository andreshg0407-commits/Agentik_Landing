/**
 * lib/copilot/cross-module-reasoning/reasoning-repository.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Repository Contract — CrossModuleReasoningRepository
 *
 * Interface + InMemory implementation. Prisma implementation in persistence/.
 */

import type {
  ReasoningResult,
  ReasoningHypothesis,
  ReasoningEvidence,
  ReasoningRecommendation,
  ReasoningRisk,
  ReasoningOpportunity,
} from "./cross-module-types";

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReasoningResultFilter {
  orgSlug:    string;
  status?:    string;
  fromDate?:  string;
  toDate?:    string;
  limit?:     number;
  offset?:    number;
}

export interface HypothesisFilter {
  orgSlug:     string;
  executionId?: string;
  category?:   string;
  supported?:  boolean;
  limit?:      number;
}

export interface EvidenceFilter {
  orgSlug:      string;
  executionId?: string;
  domain?:      string;
  type?:        string;
  limit?:       number;
}

export interface RecommendationFilter {
  orgSlug:      string;
  executionId?: string;
  priority?:    string;
  type?:        string;
  limit?:       number;
}

export interface RiskFilter {
  orgSlug:      string;
  executionId?: string;
  domain?:      string;
  severity?:    string;
  limit?:       number;
}

export interface OpportunityFilter {
  orgSlug:      string;
  executionId?: string;
  type?:        string;
  urgency?:     string;
  limit?:       number;
}

// ── Repository interface ──────────────────────────────────────────────────────

export interface CrossModuleReasoningRepository {
  // Reasoning results
  saveResult(result: ReasoningResult): Promise<ReasoningResult>;
  getResult(id: string): Promise<ReasoningResult | null>;
  listResults(filter: ReasoningResultFilter): Promise<ReasoningResult[]>;
  deleteResult(id: string): Promise<void>;
  countResults(orgSlug: string): Promise<number>;

  // Hypotheses
  saveHypotheses(executionId: string, hypotheses: ReasoningHypothesis[]): Promise<void>;
  listHypotheses(filter: HypothesisFilter): Promise<ReasoningHypothesis[]>;

  // Evidence
  saveEvidence(executionId: string, evidence: ReasoningEvidence[]): Promise<void>;
  listEvidence(filter: EvidenceFilter): Promise<ReasoningEvidence[]>;

  // Recommendations
  saveRecommendations(executionId: string, recs: ReasoningRecommendation[]): Promise<void>;
  listRecommendations(filter: RecommendationFilter): Promise<ReasoningRecommendation[]>;

  // Risks
  saveRisks(executionId: string, risks: ReasoningRisk[]): Promise<void>;
  listRisks(filter: RiskFilter): Promise<ReasoningRisk[]>;

  // Opportunities
  saveOpportunities(executionId: string, opps: ReasoningOpportunity[]): Promise<void>;
  listOpportunities(filter: OpportunityFilter): Promise<ReasoningOpportunity[]>;
}

// ── InMemory implementation ───────────────────────────────────────────────────

export class InMemoryCrossModuleReasoningRepository
  implements CrossModuleReasoningRepository {

  private readonly _results       = new Map<string, ReasoningResult>();
  private readonly _hypotheses    = new Map<string, ReasoningHypothesis[]>(); // executionId → items
  private readonly _evidence      = new Map<string, ReasoningEvidence[]>();
  private readonly _recommendations = new Map<string, ReasoningRecommendation[]>();
  private readonly _risks         = new Map<string, ReasoningRisk[]>();
  private readonly _opportunities = new Map<string, ReasoningOpportunity[]>();

  async saveResult(result: ReasoningResult): Promise<ReasoningResult> {
    this._results.set(result.id, result);
    return result;
  }

  async getResult(id: string): Promise<ReasoningResult | null> {
    return this._results.get(id) ?? null;
  }

  async listResults(filter: ReasoningResultFilter): Promise<ReasoningResult[]> {
    let items = [...this._results.values()].filter(r => r.orgSlug === filter.orgSlug);
    if (filter.status) items = items.filter(r => r.status === filter.status);
    if (filter.fromDate) items = items.filter(r => r.completedAt >= filter.fromDate!);
    if (filter.toDate)   items = items.filter(r => r.completedAt <= filter.toDate!);
    items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const start = filter.offset ?? 0;
    const end   = start + (filter.limit ?? 50);
    return items.slice(start, end);
  }

  async deleteResult(id: string): Promise<void> {
    this._results.delete(id);
  }

  async countResults(orgSlug: string): Promise<number> {
    return [...this._results.values()].filter(r => r.orgSlug === orgSlug).length;
  }

  async saveHypotheses(executionId: string, hypotheses: ReasoningHypothesis[]): Promise<void> {
    this._hypotheses.set(executionId, hypotheses);
  }

  async listHypotheses(filter: HypothesisFilter): Promise<ReasoningHypothesis[]> {
    const all: ReasoningHypothesis[] = [];
    for (const items of this._hypotheses.values()) {
      all.push(...items.filter(h => h.orgSlug === filter.orgSlug));
    }
    let result = all;
    if (filter.category)  result = result.filter(h => h.category === filter.category);
    if (filter.supported !== undefined) result = result.filter(h => h.supported === filter.supported);
    return result.slice(0, filter.limit ?? 50);
  }

  async saveEvidence(executionId: string, evidence: ReasoningEvidence[]): Promise<void> {
    this._evidence.set(executionId, evidence);
  }

  async listEvidence(filter: EvidenceFilter): Promise<ReasoningEvidence[]> {
    const all: ReasoningEvidence[] = [];
    for (const items of this._evidence.values()) {
      all.push(...items.filter(e => e.orgSlug === filter.orgSlug));
    }
    let result = all;
    if (filter.domain) result = result.filter(e => e.domain === filter.domain);
    if (filter.type)   result = result.filter(e => e.type   === filter.type);
    return result.slice(0, filter.limit ?? 100);
  }

  async saveRecommendations(executionId: string, recs: ReasoningRecommendation[]): Promise<void> {
    this._recommendations.set(executionId, recs);
  }

  async listRecommendations(filter: RecommendationFilter): Promise<ReasoningRecommendation[]> {
    const all: ReasoningRecommendation[] = [];
    for (const items of this._recommendations.values()) {
      all.push(...items.filter(r => r.orgSlug === filter.orgSlug));
    }
    let result = all;
    if (filter.priority) result = result.filter(r => r.priority === filter.priority);
    if (filter.type)     result = result.filter(r => r.type     === filter.type);
    return result.slice(0, filter.limit ?? 50);
  }

  async saveRisks(executionId: string, risks: ReasoningRisk[]): Promise<void> {
    this._risks.set(executionId, risks);
  }

  async listRisks(filter: RiskFilter): Promise<ReasoningRisk[]> {
    const all: ReasoningRisk[] = [];
    for (const items of this._risks.values()) {
      all.push(...items.filter(r => r.orgSlug === filter.orgSlug));
    }
    let result = all;
    if (filter.domain)   result = result.filter(r => r.domain   === filter.domain);
    if (filter.severity) result = result.filter(r => r.severity === filter.severity);
    return result.slice(0, filter.limit ?? 50);
  }

  async saveOpportunities(executionId: string, opps: ReasoningOpportunity[]): Promise<void> {
    this._opportunities.set(executionId, opps);
  }

  async listOpportunities(filter: OpportunityFilter): Promise<ReasoningOpportunity[]> {
    const all: ReasoningOpportunity[] = [];
    for (const items of this._opportunities.values()) {
      all.push(...items.filter(o => o.orgSlug === filter.orgSlug));
    }
    let result = all;
    if (filter.type)   result = result.filter(o => o.type   === filter.type);
    if (filter.urgency) result = result.filter(o => o.urgency === filter.urgency);
    return result.slice(0, filter.limit ?? 50);
  }
}
