// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 34: In-Memory Repository

import type { EnterpriseDirectionResult } from "./enterprise-direction-types";

export interface IEnterpriseDirectionRepository {
  save(result: EnterpriseDirectionResult): Promise<void>;
  findLatest(orgSlug: string): Promise<EnterpriseDirectionResult | null>;
  findAll(orgSlug: string, limit?: number): Promise<EnterpriseDirectionResult[]>;
  count(orgSlug: string): Promise<number>;
}

export class InMemoryEnterpriseDirectionRepository implements IEnterpriseDirectionRepository {
  private readonly store = new Map<string, EnterpriseDirectionResult[]>();

  async save(result: EnterpriseDirectionResult): Promise<void> {
    try {
      const existing = this.store.get(result.orgSlug) ?? [];
      this.store.set(result.orgSlug, [result, ...existing].slice(0, 50));
    } catch {
      // fail-closed
    }
  }

  async findLatest(orgSlug: string): Promise<EnterpriseDirectionResult | null> {
    try {
      const records = this.store.get(orgSlug);
      return records?.[0] ?? null;
    } catch {
      return null;
    }
  }

  async findAll(orgSlug: string, limit = 10): Promise<EnterpriseDirectionResult[]> {
    try {
      return (this.store.get(orgSlug) ?? []).slice(0, limit);
    } catch {
      return [];
    }
  }

  async count(orgSlug: string): Promise<number> {
    try {
      return this.store.get(orgSlug)?.length ?? 0;
    } catch {
      return 0;
    }
  }
}

// Singleton for in-memory use in tests / non-persistent contexts
export const inMemoryDirectionRepository = new InMemoryEnterpriseDirectionRepository();
