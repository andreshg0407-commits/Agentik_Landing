// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 25 — Prisma Executive Brain Repository
import "server-only";

import type {
  ExecutiveBriefing,
  ExecutiveDigest,
  ExecutivePriority,
  ExecutiveFocusArea,
  ExecutiveConflict,
  ExecutiveSnapshot,
} from "../executive-brain-types";
import type { ExecutiveBrainRepository } from "../executive-brain-repository";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapToBriefing(r: Record<string, unknown>): ExecutiveBriefing {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    type: r.type as ExecutiveBriefing["type"],
    title: r.title as string,
    summary: r.summary as string,
    priorities: [],
    concerns: [],
    recommendations: [],
    narratives: [],
    focusAreas: [],
    conflicts: [],
    themes: [],
    executiveScore: r.executiveScore as number,
    confidence: r.confidence as ExecutiveBriefing["confidence"],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    generatedAt: (r.generatedAt as Date).toISOString(),
  };
}

function mapToDigest(r: Record<string, unknown>): ExecutiveDigest {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    period: r.period as ExecutiveDigest["period"],
    title: r.title as string,
    headline: r.headline as string,
    topPriorities: [],
    topRisks: [],
    topOpportunities: [],
    keyNarratives: [],
    focusAreas: [],
    executiveScore: r.executiveScore as number,
    confidence: r.confidence as ExecutiveDigest["confidence"],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    generatedAt: (r.generatedAt as Date).toISOString(),
  };
}

function mapToPriority(r: Record<string, unknown>): ExecutivePriority {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    rank: r.rank as number,
    title: r.title as string,
    description: r.description as string,
    domain: r.domain as ExecutivePriority["domain"],
    level: r.level as ExecutivePriority["level"],
    confidence: r.confidence as ExecutivePriority["confidence"],
    confidenceScore: r.confidenceScore as number,
    impactScore: r.impactScore as number,
    urgencyScore: r.urgencyScore as number,
    strategicAlignmentScore: r.strategicAlignmentScore as number,
    historicalRiskScore: r.historicalRiskScore as number,
    priorityScore: r.priorityScore as number,
    rationale: r.rationale as string,
    evidenceIds: (r.evidenceIds as string[]) ?? [],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    computedAt: (r.computedAt as Date).toISOString(),
  };
}

function mapToFocusArea(r: Record<string, unknown>): ExecutiveFocusArea {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    rank: r.rank as number,
    title: r.title as string,
    rationale: r.rationale as string,
    domain: r.domain as ExecutiveFocusArea["domain"],
    priority: r.priority as ExecutiveFocusArea["priority"],
    confidence: r.confidence as ExecutiveFocusArea["confidence"],
    urgencyScore: r.urgencyScore as number,
    impactScore: r.impactScore as number,
    compositeScore: r.compositeScore as number,
    evidenceIds: (r.evidenceIds as string[]) ?? [],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  };
}

function mapToConflict(r: Record<string, unknown>): ExecutiveConflict {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    type: r.type as ExecutiveConflict["type"],
    title: r.title as string,
    description: r.description as string,
    domain: r.domain as ExecutiveConflict["domain"],
    severity: r.severity as ExecutiveConflict["severity"],
    confidence: r.confidence as ExecutiveConflict["confidence"],
    elementAId: r.elementAId as string,
    elementATitle: r.elementATitle as string,
    elementBId: r.elementBId as string,
    elementBTitle: r.elementBTitle as string,
    rationale: r.rationale as string,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    detectedAt: (r.detectedAt as Date).toISOString(),
  };
}

// ── Repository ─────────────────────────────────────────────────────────────────

export class PrismaExecutiveBrainRepository implements ExecutiveBrainRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveBriefing(briefing: ExecutiveBriefing): Promise<void> {
    await (this.prisma as any).executiveBriefingRecord.upsert({
      where: { id: briefing.id },
      create: {
        id: briefing.id,
        orgSlug: briefing.orgSlug,
        type: briefing.type,
        title: briefing.title,
        summary: briefing.summary,
        executiveScore: briefing.executiveScore,
        confidence: briefing.confidence,
        metadata: briefing.metadata ?? {},
        generatedAt: new Date(briefing.generatedAt),
      },
      update: {
        summary: briefing.summary,
        executiveScore: briefing.executiveScore,
        confidence: briefing.confidence,
        metadata: briefing.metadata ?? {},
      },
    });
  }

  async getBriefingById(id: string, orgSlug: string): Promise<ExecutiveBriefing | null> {
    const r = await (this.prisma as any).executiveBriefingRecord.findFirst({ where: { id, orgSlug } });
    return r ? mapToBriefing(r) : null;
  }

  async getLatestBriefing(orgSlug: string, type: ExecutiveBriefing["type"]): Promise<ExecutiveBriefing | null> {
    const r = await (this.prisma as any).executiveBriefingRecord.findFirst({
      where: { orgSlug, type },
      orderBy: { generatedAt: "desc" },
    });
    return r ? mapToBriefing(r) : null;
  }

  async listBriefings(orgSlug: string, limit = 20): Promise<ExecutiveBriefing[]> {
    const records = await (this.prisma as any).executiveBriefingRecord.findMany({
      where: { orgSlug },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return records.map(mapToBriefing);
  }

  async saveDigest(digest: ExecutiveDigest): Promise<void> {
    await (this.prisma as any).executiveDigestRecord.upsert({
      where: { id: digest.id },
      create: {
        id: digest.id,
        orgSlug: digest.orgSlug,
        period: digest.period,
        title: digest.title,
        headline: digest.headline,
        executiveScore: digest.executiveScore,
        confidence: digest.confidence,
        metadata: digest.metadata ?? {},
        generatedAt: new Date(digest.generatedAt),
      },
      update: {
        headline: digest.headline,
        executiveScore: digest.executiveScore,
        metadata: digest.metadata ?? {},
      },
    });
  }

  async getDigestById(id: string, orgSlug: string): Promise<ExecutiveDigest | null> {
    const r = await (this.prisma as any).executiveDigestRecord.findFirst({ where: { id, orgSlug } });
    return r ? mapToDigest(r) : null;
  }

  async getLatestDigest(orgSlug: string, period: ExecutiveDigest["period"]): Promise<ExecutiveDigest | null> {
    const r = await (this.prisma as any).executiveDigestRecord.findFirst({
      where: { orgSlug, period },
      orderBy: { generatedAt: "desc" },
    });
    return r ? mapToDigest(r) : null;
  }

  async listDigests(orgSlug: string, limit = 20): Promise<ExecutiveDigest[]> {
    const records = await (this.prisma as any).executiveDigestRecord.findMany({
      where: { orgSlug },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return records.map(mapToDigest);
  }

  async savePriority(priority: ExecutivePriority): Promise<void> {
    await (this.prisma as any).executivePriorityRecord.upsert({
      where: { id: priority.id },
      create: {
        id: priority.id,
        orgSlug: priority.orgSlug,
        rank: priority.rank,
        title: priority.title,
        description: priority.description,
        domain: priority.domain,
        level: priority.level,
        confidence: priority.confidence,
        confidenceScore: priority.confidenceScore,
        impactScore: priority.impactScore,
        urgencyScore: priority.urgencyScore,
        strategicAlignmentScore: priority.strategicAlignmentScore,
        historicalRiskScore: priority.historicalRiskScore,
        priorityScore: priority.priorityScore,
        rationale: priority.rationale,
        evidenceIds: priority.evidenceIds,
        metadata: priority.metadata ?? {},
        computedAt: new Date(priority.computedAt),
      },
      update: {
        rank: priority.rank,
        priorityScore: priority.priorityScore,
        level: priority.level,
        metadata: priority.metadata ?? {},
      },
    });
  }

  async listPriorities(orgSlug: string, limit = 20): Promise<ExecutivePriority[]> {
    const records = await (this.prisma as any).executivePriorityRecord.findMany({
      where: { orgSlug },
      orderBy: { priorityScore: "desc" },
      take: limit,
    });
    return records.map(mapToPriority);
  }

  async getTopPriorities(orgSlug: string, n: number): Promise<ExecutivePriority[]> {
    return this.listPriorities(orgSlug, n);
  }

  async saveFocusArea(area: ExecutiveFocusArea): Promise<void> {
    await (this.prisma as any).executiveFocusAreaRecord.upsert({
      where: { id: area.id },
      create: {
        id: area.id,
        orgSlug: area.orgSlug,
        rank: area.rank,
        title: area.title,
        rationale: area.rationale,
        domain: area.domain,
        priority: area.priority,
        confidence: area.confidence,
        urgencyScore: area.urgencyScore,
        impactScore: area.impactScore,
        compositeScore: area.compositeScore,
        evidenceIds: area.evidenceIds,
        metadata: area.metadata ?? {},
      },
      update: {
        rank: area.rank,
        compositeScore: area.compositeScore,
        metadata: area.metadata ?? {},
      },
    });
  }

  async listFocusAreas(orgSlug: string, limit = 10): Promise<ExecutiveFocusArea[]> {
    const records = await (this.prisma as any).executiveFocusAreaRecord.findMany({
      where: { orgSlug },
      orderBy: { compositeScore: "desc" },
      take: limit,
    });
    return records.map(mapToFocusArea);
  }

  async saveConflict(conflict: ExecutiveConflict): Promise<void> {
    await (this.prisma as any).executiveConflictRecord.upsert({
      where: { id: conflict.id },
      create: {
        id: conflict.id,
        orgSlug: conflict.orgSlug,
        type: conflict.type,
        title: conflict.title,
        description: conflict.description,
        domain: conflict.domain,
        severity: conflict.severity,
        confidence: conflict.confidence,
        elementAId: conflict.elementAId,
        elementATitle: conflict.elementATitle,
        elementBId: conflict.elementBId,
        elementBTitle: conflict.elementBTitle,
        rationale: conflict.rationale,
        metadata: conflict.metadata ?? {},
        detectedAt: new Date(conflict.detectedAt),
        resolved: false,
      },
      update: {
        metadata: conflict.metadata ?? {},
      },
    });
  }

  async listConflicts(orgSlug: string, limit = 20): Promise<ExecutiveConflict[]> {
    const records = await (this.prisma as any).executiveConflictRecord.findMany({
      where: { orgSlug, resolved: false },
      orderBy: { detectedAt: "desc" },
      take: limit,
    });
    return records.map(mapToConflict);
  }

  async resolveConflict(id: string, orgSlug: string): Promise<void> {
    await (this.prisma as any).executiveConflictRecord.updateMany({
      where: { id, orgSlug },
      data: { resolved: true },
    });
  }

  async saveSnapshot(snapshot: ExecutiveSnapshot): Promise<void> {
    await (this.prisma as any).executiveSnapshotRecord.create({
      data: {
        id: snapshot.id,
        orgSlug: snapshot.orgSlug,
        executiveScore: snapshot.context.executiveScore,
        priorityCount: snapshot.context.priorities.length,
        riskCount: snapshot.context.concerns.length,
        conflictCount: snapshot.context.conflicts.length,
        metadata: snapshot.metadata ?? {},
        createdAt: new Date(snapshot.createdAt),
      },
    });
  }

  async getLatestSnapshot(orgSlug: string): Promise<ExecutiveSnapshot | null> {
    // Snapshots store minimal data; full reconstruction not supported from DB alone
    return null;
  }
}
