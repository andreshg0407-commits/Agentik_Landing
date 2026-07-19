// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 32: Prisma Repository Implementation
// Uses (prisma as any).modelName pattern until prisma generate is run.

import { prisma } from "@/lib/prisma";
import type { ExecutiveCouncilRepository } from "../executive-council-repository";
import type { ExecutiveCouncilSession, CouncilOutcome } from "../executive-council-types";

export class PrismaExecutiveCouncilRepository implements ExecutiveCouncilRepository {

  async saveSession(session: ExecutiveCouncilSession): Promise<void> {
    const opinionIds        = session.opinions.map((o) => o.id);
    const recommendationIds = session.recommendations.map((r) => r.id);
    const disagreementIds   = session.disagreements.map((d) => d.id);

    await (prisma as any).executiveCouncilSessionRecord.upsert({
      where:  { id: session.id },
      create: {
        id:              session.id,
        orgSlug:         session.orgSlug,
        title:           session.title,
        topic:           session.topic,
        perspectives:    session.perspectives,
        opinionIds,
        recommendationIds,
        disagreementIds,
        consensusId:     session.consensus?.id ?? null,
        resolutionId:    session.resolution?.id ?? null,
        sessionScore:    session.sessionScore,
        outcome:         session.outcome,
        limitations:     session.limitations,
        metadata:        session.metadata ?? {},
        conductedAt:     session.conductedAt,
      },
      update: {
        title:           session.title,
        sessionScore:    session.sessionScore,
        outcome:         session.outcome,
        opinionIds,
        recommendationIds,
        disagreementIds,
        limitations:     session.limitations,
        metadata:        session.metadata ?? {},
      },
    });
  }

  async getSession(orgSlug: string, sessionId: string): Promise<ExecutiveCouncilSession | null> {
    const record = await (prisma as any).executiveCouncilSessionRecord.findFirst({
      where: { id: sessionId, orgSlug },
    });
    return record ? (record as ExecutiveCouncilSession) : null;
  }

  async querySessions(
    orgSlug: string,
    filters?: { outcome?: CouncilOutcome; limit?: number }
  ): Promise<ExecutiveCouncilSession[]> {
    const records = await (prisma as any).executiveCouncilSessionRecord.findMany({
      where: {
        orgSlug,
        ...(filters?.outcome ? { outcome: filters.outcome } : {}),
      },
      orderBy: { sessionScore: "desc" },
      take:    filters?.limit ?? 20,
    });
    return records as ExecutiveCouncilSession[];
  }

  async archiveSession(orgSlug: string, sessionId: string): Promise<void> {
    await (prisma as any).executiveCouncilSessionRecord.updateMany({
      where: { id: sessionId, orgSlug },
      data:  { outcome: "NO_CONSENSUS" as const },
    });
  }
}
