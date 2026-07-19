// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 33: Query Layer
import { prisma } from "../../../lib/prisma";

export interface DirectionQueryFilter {
  orgSlug:    string;
  limit?:     number;
  sessionId?: string;
}

export interface DirectionStats {
  readonly orgSlug:        string;
  readonly recordCount:    number;
  readonly latestScore:    number | null;
  readonly latestStatus:   string | null;
  readonly latestConfidence: string | null;
}

export async function getDirectionStats(orgSlug: string): Promise<DirectionStats> {
  try {
    const records = await (prisma as any).enterpriseDirectionRecord.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  { overallScore: true, status: true, confidence: true },
    });
    if (records.length === 0) {
      return { orgSlug, recordCount: 0, latestScore: null, latestStatus: null, latestConfidence: null };
    }
    const latest = records[0];
    return {
      orgSlug,
      recordCount:       records.length,
      latestScore:       latest.overallScore,
      latestStatus:      latest.status,
      latestConfidence:  latest.confidence,
    };
  } catch {
    return { orgSlug, recordCount: 0, latestScore: null, latestStatus: null, latestConfidence: null };
  }
}

export async function getDirectionRecords(
  filter: DirectionQueryFilter
): Promise<unknown[]> {
  try {
    const { orgSlug, limit = 10, sessionId } = filter;
    const where: Record<string, unknown> = { orgSlug };
    if (sessionId) where["sessionId"] = sessionId;
    return await (prisma as any).enterpriseDirectionRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
  } catch {
    return [];
  }
}

export async function getLatestDirectionRecord(orgSlug: string): Promise<unknown | null> {
  try {
    return await (prisma as any).enterpriseDirectionRecord.findFirst({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return null;
  }
}

export async function getNorthStarRecords(orgSlug: string): Promise<unknown[]> {
  try {
    return await (prisma as any).northStarRecord.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
      take:    5,
    });
  } catch {
    return [];
  }
}

export async function getDirectionReportRecords(orgSlug: string): Promise<unknown[]> {
  try {
    return await (prisma as any).directionReportRecord.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
      take:    5,
    });
  } catch {
    return [];
  }
}
