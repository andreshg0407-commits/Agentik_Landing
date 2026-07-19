// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 35: Governance Repository

import type { ExecutiveGovernanceResult } from "./executive-governance-types";

export interface GovernanceStoredEntry {
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly overallScore:     number;
  readonly complianceScore:  number;
  readonly riskScore:        number;
  readonly status:           string;
  readonly violationCount:   number;
  readonly escalationCount:  number;
  readonly findingCount:     number;
  readonly exceptionCount:   number;
  readonly payload:          string; // JSON
  readonly createdAt:        string;
}

export interface IExecutiveGovernanceRepository {
  save(result: ExecutiveGovernanceResult): Promise<GovernanceStoredEntry>;
  findLatest(orgSlug: string): Promise<GovernanceStoredEntry | null>;
  findAll(orgSlug: string, limit?: number): Promise<GovernanceStoredEntry[]>;
  count(orgSlug: string): Promise<number>;
}

class InMemoryExecutiveGovernanceRepository implements IExecutiveGovernanceRepository {
  private readonly store = new Map<string, GovernanceStoredEntry[]>();

  async save(result: ExecutiveGovernanceResult): Promise<GovernanceStoredEntry> {
    try {
      const entry: GovernanceStoredEntry = {
        orgSlug:         result.orgSlug,
        sessionId:       result.sessionId,
        overallScore:    result.score.overallScore,
        complianceScore: result.score.complianceScore,
        riskScore:       result.score.riskScore,
        status:          result.report.status,
        violationCount:  result.report.violations.length,
        escalationCount: result.report.escalations.length,
        findingCount:    result.report.assessment.findingCount,
        exceptionCount:  result.report.exceptions.length,
        payload:         JSON.stringify(result),
        createdAt:       result.createdAt,
      };
      const existing = this.store.get(result.orgSlug) ?? [];
      this.store.set(result.orgSlug, [...existing, entry]);
      return entry;
    } catch {
      throw new Error("Error guardando resultado de gobernanza");
    }
  }

  async findLatest(orgSlug: string): Promise<GovernanceStoredEntry | null> {
    try {
      const entries = this.store.get(orgSlug) ?? [];
      if (entries.length === 0) return null;
      return entries[entries.length - 1] ?? null;
    } catch {
      return null;
    }
  }

  async findAll(orgSlug: string, limit = 10): Promise<GovernanceStoredEntry[]> {
    try {
      const entries = this.store.get(orgSlug) ?? [];
      return entries.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  async count(orgSlug: string): Promise<number> {
    try {
      return (this.store.get(orgSlug) ?? []).length;
    } catch {
      return 0;
    }
  }
}

export const inMemoryGovernanceRepository: IExecutiveGovernanceRepository =
  new InMemoryExecutiveGovernanceRepository();
