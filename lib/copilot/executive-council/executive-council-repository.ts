// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 31: Repository Contract + InMemory Implementation

import type { ExecutiveCouncilSession, CouncilOutcome } from "./executive-council-types";

// ── Repository contract ────────────────────────────────────────────────────────

export interface ExecutiveCouncilRepository {
  saveSession(session: ExecutiveCouncilSession): Promise<void>;
  getSession(orgSlug: string, sessionId: string): Promise<ExecutiveCouncilSession | null>;
  querySessions(orgSlug: string, filters?: { outcome?: CouncilOutcome; limit?: number }): Promise<ExecutiveCouncilSession[]>;
  archiveSession(orgSlug: string, sessionId: string): Promise<void>;
}

// ── In-memory implementation ────────────────────────────────────────────────────

export class InMemoryExecutiveCouncilRepository implements ExecutiveCouncilRepository {
  private readonly _sessions = new Map<string, ExecutiveCouncilSession>();

  private key(orgSlug: string, id: string): string {
    return `${orgSlug}::${id}`;
  }

  async saveSession(session: ExecutiveCouncilSession): Promise<void> {
    this._sessions.set(this.key(session.orgSlug, session.id), session);
  }

  async getSession(orgSlug: string, sessionId: string): Promise<ExecutiveCouncilSession | null> {
    return this._sessions.get(this.key(orgSlug, sessionId)) ?? null;
  }

  async querySessions(
    orgSlug: string,
    filters?: { outcome?: CouncilOutcome; limit?: number }
  ): Promise<ExecutiveCouncilSession[]> {
    let results = [...this._sessions.values()].filter((s) => s.orgSlug === orgSlug);
    if (filters?.outcome) {
      results = results.filter((s) => s.outcome === filters.outcome);
    }
    results = results.sort((a, b) => b.sessionScore - a.sessionScore);
    if (filters?.limit) {
      results = results.slice(0, filters.limit);
    }
    return results;
  }

  async archiveSession(orgSlug: string, sessionId: string): Promise<void> {
    // In-memory: just remove from active store
    this._sessions.delete(this.key(orgSlug, sessionId));
  }
}
