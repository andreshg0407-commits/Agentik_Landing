// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 30: Repository Interface + In-Memory Impl

import type { BoardSession } from "./board-intelligence-types";

// ── Interface ───────────────────────────────────────────────────────────────

export interface BoardIntelligenceRepository {
  saveSession(session: BoardSession): Promise<void>;
  getSession(orgSlug: string, id: string): Promise<BoardSession | null>;
  querySessions(orgSlug: string, limit?: number): Promise<BoardSession[]>;
  archiveSession(orgSlug: string, id: string): Promise<boolean>;
}

// ── In-memory implementation ────────────────────────────────────────────────

export class InMemoryBoardIntelligenceRepository implements BoardIntelligenceRepository {
  private readonly store = new Map<string, BoardSession>();

  private key(orgSlug: string, id: string): string {
    return `${orgSlug}::${id}`;
  }

  async saveSession(session: BoardSession): Promise<void> {
    this.store.set(this.key(session.orgSlug, session.id), session);
  }

  async getSession(orgSlug: string, id: string): Promise<BoardSession | null> {
    return this.store.get(this.key(orgSlug, id)) ?? null;
  }

  async querySessions(orgSlug: string, limit = 50): Promise<BoardSession[]> {
    const results: BoardSession[] = [];
    for (const session of this.store.values()) {
      if (session.orgSlug === orgSlug) {
        results.push(session);
      }
    }
    return results
      .sort((a, b) => b.conductedAt.localeCompare(a.conductedAt))
      .slice(0, limit);
  }

  async archiveSession(orgSlug: string, id: string): Promise<boolean> {
    return this.store.delete(this.key(orgSlug, id));
  }
}
