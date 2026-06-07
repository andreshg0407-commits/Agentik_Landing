// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Prisma Strategic Memory Repository — server-only persistence
import "server-only";

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicMemorySnapshot,
  StrategicMemoryQuery,
  StrategicMemoryResult,
} from "../strategic-memory-types";
import type { StrategicMemoryRepository } from "../strategic-memory-repository";
import { findStrategicMemory } from "../strategic-memory-query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapRecordToEntry(r: Record<string, unknown>): StrategicMemoryEntry {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    type: r.type as StrategicMemoryEntry["type"],
    priority: r.priority as StrategicMemoryEntry["priority"],
    status: r.status as StrategicMemoryEntry["status"],
    confidence: r.confidence as StrategicMemoryEntry["confidence"],
    confidenceScore: r.confidenceScore as number,
    domain: r.domain as StrategicMemoryEntry["domain"],
    title: r.title as string,
    description: r.description as string,
    rationale: r.rationale as string,
    evidenceIds: (r.evidenceIds as string[]) ?? [],
    relatedIds: (r.relatedIds as string[]) ?? [],
    source: r.source as StrategicMemoryEntry["source"],
    agentId: r.agentId as string | undefined,
    userId: r.userId as string | undefined,
    relevanceScore: r.relevanceScore as number,
    strategicScore: r.strategicScore as number,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    validUntil: r.validUntil ? (r.validUntil as Date).toISOString() : undefined,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

function mapRecordToRelation(r: Record<string, unknown>): StrategicMemoryRelation {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    sourceId: r.sourceId as string,
    targetId: r.targetId as string,
    type: r.type as StrategicMemoryRelation["type"],
    description: r.description as string ?? "",
    strength: r.strength as number,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

function mapRecordToSnapshot(r: Record<string, unknown>): StrategicMemorySnapshot {
  return {
    id: r.id as string,
    orgSlug: r.orgSlug as string,
    period: r.period as StrategicMemorySnapshot["period"],
    strategicScore: r.strategicScore as number,
    activeItems: r.activeItems as number,
    criticalItems: r.criticalItems as number,
    totalItems: r.totalItems as number,
    narrative: r.narrative as string,
    goals: [],
    risks: [],
    opportunities: [],
    decisions: [],
    commitments: [],
    lessons: [],
    policies: [],
    relations: [],
    metadata: {},
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

// ── Prisma Repository ─────────────────────────────────────────────────────────

export class PrismaStrategicMemoryRepository implements StrategicMemoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveMemory(entry: StrategicMemoryEntry): Promise<void> {
    await (this.prisma as any).strategicMemoryRecord.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        orgSlug: entry.orgSlug,
        type: entry.type,
        priority: entry.priority,
        status: entry.status,
        confidence: entry.confidence,
        confidenceScore: entry.confidenceScore,
        domain: entry.domain,
        title: entry.title,
        description: entry.description,
        rationale: entry.rationale,
        evidenceIds: entry.evidenceIds,
        relatedIds: entry.relatedIds,
        source: entry.source,
        agentId: entry.agentId ?? null,
        userId: entry.userId ?? null,
        relevanceScore: entry.relevanceScore,
        strategicScore: entry.strategicScore,
        validUntil: entry.validUntil ? new Date(entry.validUntil) : null,
        metadata: entry.metadata ?? {},
      },
      update: {
        priority: entry.priority,
        status: entry.status,
        confidence: entry.confidence,
        confidenceScore: entry.confidenceScore,
        title: entry.title,
        description: entry.description,
        rationale: entry.rationale,
        evidenceIds: entry.evidenceIds,
        relatedIds: entry.relatedIds,
        relevanceScore: entry.relevanceScore,
        strategicScore: entry.strategicScore,
        validUntil: entry.validUntil ? new Date(entry.validUntil) : null,
        metadata: entry.metadata ?? {},
        updatedAt: new Date(),
      },
    });
  }

  async updateMemory(entry: StrategicMemoryEntry): Promise<void> {
    await this.saveMemory(entry);
  }

  async getMemoryById(id: string): Promise<StrategicMemoryEntry | null> {
    const record = await (this.prisma as any).strategicMemoryRecord.findUnique({ where: { id } });
    return record ? mapRecordToEntry(record) : null;
  }

  async queryMemory(query: StrategicMemoryQuery): Promise<StrategicMemoryEntry[]> {
    const where: Record<string, unknown> = { orgSlug: query.orgSlug };
    if (query.types) where.type = { in: query.types };
    if (query.priorities) where.priority = { in: query.priorities };
    if (query.statuses) where.status = { in: query.statuses };
    if (query.domains) where.domain = { in: query.domains };

    const records = await (this.prisma as any).strategicMemoryRecord.findMany({
      where,
      orderBy: { strategicScore: "desc" },
      take: query.limit ?? 200,
    });

    const entries: StrategicMemoryEntry[] = records.map(mapRecordToEntry);
    return findStrategicMemory(entries, query);
  }

  async saveRelation(relation: StrategicMemoryRelation): Promise<void> {
    await (this.prisma as any).strategicRelationRecord.upsert({
      where: {
        orgSlug_sourceId_targetId_type: {
          orgSlug: relation.orgSlug,
          sourceId: relation.sourceId,
          targetId: relation.targetId,
          type: relation.type,
        },
      },
      create: {
        id: relation.id,
        orgSlug: relation.orgSlug,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        type: relation.type,
        description: relation.description ?? "",
        strength: relation.strength,
        metadata: relation.metadata ?? {},
      },
      update: {
        description: relation.description ?? "",
        strength: relation.strength,
        metadata: relation.metadata ?? {},
      },
    });
  }

  async deleteRelation(id: string, orgSlug: string): Promise<void> {
    await (this.prisma as any).strategicRelationRecord.deleteMany({
      where: { id, orgSlug },
    });
  }

  async queryRelations(orgSlug: string, entryId?: string): Promise<StrategicMemoryRelation[]> {
    const where: Record<string, unknown> = { orgSlug };
    if (entryId) {
      where.OR = [{ sourceId: entryId }, { targetId: entryId }];
    }
    const records = await (this.prisma as any).strategicRelationRecord.findMany({ where });
    return records.map(mapRecordToRelation);
  }

  async saveSnapshot(snapshot: StrategicMemorySnapshot): Promise<void> {
    await (this.prisma as any).strategicSnapshotRecord.create({
      data: {
        id: snapshot.id,
        orgSlug: snapshot.orgSlug,
        period: snapshot.period,
        strategicScore: snapshot.strategicScore,
        activeItems: snapshot.activeItems,
        criticalItems: snapshot.criticalItems,
        totalItems: snapshot.totalItems,
        narrative: snapshot.narrative,
        goalIds: snapshot.goals.map((g) => g.id),
        riskIds: snapshot.risks.map((r) => r.id),
        decisionIds: snapshot.decisions.map((d) => d.id),
        commitmentIds: snapshot.commitments.map((c) => c.id),
        metadata: {},
      },
    });
  }

  async getLatestSnapshot(orgSlug: string): Promise<StrategicMemorySnapshot | null> {
    const record = await (this.prisma as any).strategicSnapshotRecord.findFirst({
      where: { orgSlug },
      orderBy: { createdAt: "desc" },
    });
    return record ? mapRecordToSnapshot(record) : null;
  }

  async querySnapshots(orgSlug: string): Promise<StrategicMemorySnapshot[]> {
    const records = await (this.prisma as any).strategicSnapshotRecord.findMany({
      where: { orgSlug },
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapRecordToSnapshot);
  }

  async saveResult(result: StrategicMemoryResult): Promise<void> {
    // Results are ephemeral — no dedicated table; log to console only
    console.log("[StrategicMemory] result saved", result.id, result.orgSlug, result.status);
  }

  async getLatestResult(_orgSlug: string): Promise<StrategicMemoryResult | null> {
    return null;
  }
}
