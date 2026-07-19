// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 35: Prisma Repository

import { prisma } from "../../../../lib/prisma";
import type { EnterpriseDirectionResult } from "../enterprise-direction-types";
import type { IEnterpriseDirectionRepository } from "../enterprise-direction-repository";

export class PrismaEnterpriseDirectionRepository implements IEnterpriseDirectionRepository {
  async save(result: EnterpriseDirectionResult): Promise<void> {
    try {
      await (prisma as any).enterpriseDirectionRecord.create({
        data: {
          orgSlug:     result.orgSlug,
          sessionId:   result.sessionId,
          status:      result.status,
          overallScore: result.score.overallScore,
          northStarScore: result.score.northStarScore,
          alignmentScore: result.score.alignmentScore,
          confidence:  result.score.confidence,
          limitations: result.limitations,
          errors:      result.errors,
          payload:     JSON.stringify(result),
          createdAt:   new Date(result.createdAt),
        },
      });
    } catch {
      // fail-closed — do not surface persistence errors to pipeline
    }
  }

  async findLatest(orgSlug: string): Promise<EnterpriseDirectionResult | null> {
    try {
      const record = await (prisma as any).enterpriseDirectionRecord.findFirst({
        where:   { orgSlug },
        orderBy: { createdAt: "desc" },
      });
      if (!record?.payload) return null;
      return JSON.parse(record.payload) as EnterpriseDirectionResult;
    } catch {
      return null;
    }
  }

  async findAll(orgSlug: string, limit = 10): Promise<EnterpriseDirectionResult[]> {
    try {
      const records = await (prisma as any).enterpriseDirectionRecord.findMany({
        where:   { orgSlug },
        orderBy: { createdAt: "desc" },
        take:    limit,
      });
      return records
        .map((r: { payload?: string }) => {
          try { return JSON.parse(r.payload ?? "null"); } catch { return null; }
        })
        .filter(Boolean) as EnterpriseDirectionResult[];
    } catch {
      return [];
    }
  }

  async count(orgSlug: string): Promise<number> {
    try {
      return await (prisma as any).enterpriseDirectionRecord.count({ where: { orgSlug } });
    } catch {
      return 0;
    }
  }
}

export const prismaDirectionRepository = new PrismaEnterpriseDirectionRepository();
