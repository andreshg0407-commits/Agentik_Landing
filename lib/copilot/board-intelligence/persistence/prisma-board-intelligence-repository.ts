// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 31: Prisma Repository
// Uses (prisma as any) until `prisma generate` runs with the new schema.

import { prisma } from "@/lib/prisma";
import type { BoardSession } from "../board-intelligence-types";
import type { BoardIntelligenceRepository } from "../board-intelligence-repository";

export class PrismaBoardIntelligenceRepository implements BoardIntelligenceRepository {

  async saveSession(session: BoardSession): Promise<void> {
    try {
      await (prisma as any).boardSessionRecord.upsert({
        where: { id: session.id },
        create: {
          id:             session.id,
          orgSlug:        session.orgSlug,
          title:          session.title,
          topic:          session.topic,
          outcome:        session.resolution?.outcome ?? "REVIEW_REQUIRED",
          boardScore:     session.boardScore,
          governanceScore: session.governance.governanceScore,
          strategicScore: session.strategic.strategicScore,
          confidence:     session.confidence,
          riskCount:      session.risks.length,
          findingCount:   session.findings.length,
          payload:        JSON.stringify(session),
          conductedAt:    new Date(session.conductedAt),
        },
        update: {
          boardScore:     session.boardScore,
          governanceScore: session.governance.governanceScore,
          strategicScore: session.strategic.strategicScore,
          confidence:     session.confidence,
          outcome:        session.resolution?.outcome ?? "REVIEW_REQUIRED",
          riskCount:      session.risks.length,
          findingCount:   session.findings.length,
          payload:        JSON.stringify(session),
        },
      });
    } catch (err) {
      // fail-closed: log and swallow
      console.error("[PrismaBoardIntelligenceRepository] saveSession failed", err);
    }
  }

  async getSession(orgSlug: string, id: string): Promise<BoardSession | null> {
    try {
      const record = await (prisma as any).boardSessionRecord.findFirst({
        where: { id, orgSlug },
      });
      if (!record) return null;
      return JSON.parse(record.payload) as BoardSession;
    } catch {
      return null;
    }
  }

  async querySessions(orgSlug: string, limit = 50): Promise<BoardSession[]> {
    try {
      const records = await (prisma as any).boardSessionRecord.findMany({
        where:   { orgSlug },
        orderBy: { conductedAt: "desc" },
        take:    limit,
      });
      return records
        .map((r: { payload: string }) => {
          try { return JSON.parse(r.payload) as BoardSession; } catch { return null; }
        })
        .filter((s: BoardSession | null): s is BoardSession => s !== null);
    } catch {
      return [];
    }
  }

  async archiveSession(orgSlug: string, id: string): Promise<boolean> {
    try {
      await (prisma as any).boardSessionRecord.updateMany({
        where:  { id, orgSlug },
        data:   { archived: true },
      });
      return true;
    } catch {
      return false;
    }
  }
}
